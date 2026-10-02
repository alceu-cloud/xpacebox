import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { accountModeForCompany, CommercialError, emptyPricebook, quoteMonthly, validatePricebook, visiblePricebook } from "@/lib/saas/commercial";
import { rpcRow } from "@/lib/saas/rpc-row";

const headers = { "Cache-Control": "private, no-store" };
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
async function accessFor(request: Request) {
  const slug = new URL(request.url).searchParams.get("company") || "";
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) throw new CommercialError("EMPRESA INVÁLIDA.");
  const access = await requireCompanyAccess(request, slug);
  const { data: settings, error } = await access.admin.from("saas_commercial_settings").select("owner_company_id,phase").eq("singleton", true).maybeSingle();
  if (error) throw error;
  if (!settings) throw new CommercialError("PREPARAÇÃO COMERCIAL AINDA NÃO INSTALADA.", 503);
  return { ...access, settings };
}
function manager(role: string) {
  if (!["platform_owner", "company_manager"].includes(role)) throw new AccessError("SOMENTE GESTORES PODEM PREPARAR CONTRATAÇÕES.", 403);
}
export async function GET(request: Request) {
  try {
    const access = await accessFor(request);
    const { data: book, error } = await access.admin.from("saas_pricebooks").select("id,revision,config,created_at").order("revision", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    const [{ data: drafts, error: draftError }, { data: account, error: accountError }, { data: whatsapp, error: whatsappError }] = await Promise.all([
      access.admin.from("saas_order_drafts").select("id,quote,created_at").eq("tenant_company_id", access.company.id).order("created_at", { ascending: false }).limit(5),
      access.admin.from("saas_payment_account_drafts").select("account_mode,status").eq("tenant_company_id", access.company.id).maybeSingle(),
      access.admin.from("saas_whatsapp_connections").select("created_at").eq("tenant_company_id", access.company.id).maybeSingle(),
    ]);
    if (draftError || accountError || whatsappError) throw draftError || accountError || whatsappError;
    return NextResponse.json({ success: true, company: { name: access.company.name, slug: access.company.slug }, exempt: access.company.id === access.settings.owner_company_id,
      canManage: ["platform_owner", "company_manager"].includes(access.profile.platform_role), canManagePrices: access.profile.platform_role === "platform_owner", phase: "PREPARATION", billingEnabled: false,
      book: book ? { id: book.id, revision: book.revision, config: visiblePricebook(validatePricebook(book.config), access.profile.platform_role === "platform_owner") } : { id: null, revision: 0, config: visiblePricebook(emptyPricebook(), access.profile.platform_role === "platform_owner") },
      account: account ?? { account_mode: accountModeForCompany(access.company.id, access.settings.owner_company_id), status: "NOT_PREPARED" }, whatsappConfigured: Boolean(whatsapp), drafts: drafts ?? [] }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    // Reject unbounded submissions before parsing; all totals are recalculated on server.
    const raw = await request.text();
    if (raw.length > 30_000) throw new CommercialError("FORMULÁRIO MUITO GRANDE.");
    let input: Record<string, unknown>;
    try { input = JSON.parse(raw); } catch { throw new CommercialError("FORMULÁRIO INVÁLIDO."); }
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new CommercialError("FORMULÁRIO INVÁLIDO.");
    const access = await accessFor(request);
    manager(access.profile.platform_role);
    if (input.action === "SAVE_PRICEBOOK") {
      if (access.profile.platform_role !== "platform_owner") throw new AccessError("SOMENTE O DONO DA PLATAFORMA DEFINE OS PREÇOS.", 403);
      if (input.expectedPricebookId !== null && !uuid(input.expectedPricebookId)) throw new CommercialError("ATUALIZE A TABELA ANTES DE SALVAR.", 409);
      const config = validatePricebook(input.config);
      const { data, error } = await access.admin.rpc("saas_save_pricebook", { p_actor: access.user.id, p_expected: input.expectedPricebookId, p_config: config });
      if (error) throw error;
      const saved = rpcRow<{ id: string; revision: number }>(data);
      return NextResponse.json({ success: true, book: { id: saved.id, revision: saved.revision } }, { headers });
    }
    if (input.action === "PREPARE_ACCOUNT") {
      const account_mode = accountModeForCompany(access.company.id, access.settings.owner_company_id);
      const { error } = await access.admin.from("saas_payment_account_drafts").upsert({ tenant_company_id: access.company.id, created_by: access.user.id, account_mode }, { onConflict: "tenant_company_id", ignoreDuplicates: true });
      if (error) throw error;
      return NextResponse.json({ success: true, accountMode: account_mode, message: "PREPARAÇÃO SALVA. NENHUMA CONTA CRIADA NO ASAAS." }, { headers });
    }
    if (["QUOTE", "SAVE_DRAFT"].includes(String(input.action))) {
      // Pin an immutable version, including on retry after another owner edits prices.
      if (!uuid(input.pricebookId)) throw new CommercialError("SALVE UMA TABELA DE PREÇOS ANTES DE SIMULAR.", 409);
      const { data: book, error } = await access.admin.from("saas_pricebooks").select("id,config").eq("id", input.pricebookId).maybeSingle();
      if (error) throw error;
      if (!book) throw new CommercialError("TABELA DE PREÇOS NÃO ENCONTRADA.", 404);
      const quote = quoteMonthly(validatePricebook(book.config), access.company.id, access.settings.owner_company_id, input.studentCount as number, input.addons);
      if (input.action === "QUOTE") return NextResponse.json({ success: true, quote }, { headers });
      if (!uuid(input.requestId)) throw new CommercialError("IDENTIFICADOR DA OPERAÇÃO INVÁLIDO.");
      const fingerprint = createHash("sha256").update(JSON.stringify({ pricebookId: book.id, studentCount: quote.studentCount, addons: [...quote.addons].sort() })).digest("hex");
      const { data: draft, error: draftError } = await access.admin.rpc("saas_save_order_draft", { p_company: access.company.id, p_actor: access.user.id, p_request: input.requestId, p_fingerprint: fingerprint, p_pricebook: book.id, p_quote: quote });
      if (draftError) throw draftError;
      const saved = rpcRow<{ id: string; quote: typeof quote }>(draft);
      return NextResponse.json({ success: true, draft: { id: saved.id, quote: saved.quote } }, { headers });
    }
    throw new CommercialError("AÇÃO NÃO DISPONÍVEL NA PREPARAÇÃO. COBRANÇAS REAIS CONTINUAM DESLIGADAS.", 409);
  } catch (error) { return failure(error); }
}
function failure(error: unknown) {
  if (error instanceof AccessError || error instanceof CommercialError) return NextResponse.json({ success: false, message: error.message }, { status: error.status, headers });
  const code = (error as { code?: string })?.code;
  if (["42P01", "PGRST205", "PGRST202"].includes(code || "")) return NextResponse.json({ success: false, message: "PREPARAÇÃO COMERCIAL AINDA NÃO INSTALADA. A OPERAÇÃO ATUAL CONTINUA NORMAL." }, { status: 503, headers });
  if (String((error as { message?: string })?.message).includes("SAAS_IDEMPOTENCY_CONFLICT")) return NextResponse.json({ success: false, message: "ESTE IDENTIFICADOR JÁ FOI USADO EM OUTRA SIMULAÇÃO." }, { status: 409, headers });
  if (String((error as { message?: string })?.message).includes("SAAS_PRICEBOOK_CONFLICT")) return NextResponse.json({ success: false, message: "A TABELA MUDOU EM OUTRA SESSÃO. RECARREGUE E CONFIRA ANTES DE SALVAR.", }, { status: 409, headers });
  // Never log request/config/credentials or raw provider/database errors.
  return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL CONCLUIR A PREPARAÇÃO." }, { status: 500, headers });
}
