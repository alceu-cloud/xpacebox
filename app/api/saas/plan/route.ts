import { NextResponse } from "next/server";
import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { CommercialError, quoteMonthly, validatePricebook } from "@/lib/saas/commercial";
import { validateBillingPreferences } from "@/lib/saas/billing-preferences";
const headers = { "Cache-Control": "private, no-store" };
async function accessFor(request: Request) {
  const slug = new URL(request.url).searchParams.get("company") || "";
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) throw new CommercialError("EMPRESA INVÁLIDA.");
  const access = await requireCompanyAccess(request, slug);
  if (!["platform_owner", "company_manager"].includes(access.profile.platform_role)) throw new AccessError("SOMENTE GESTORES ACESSAM PLANOS E PAGAMENTOS.", 403);
  return access;
}
export async function GET(request: Request) {
  try {
    const a = await accessFor(request);
    const page = Number(new URL(request.url).searchParams.get("page") || "0");
    if (!Number.isSafeInteger(page) || page < 0 || page > 10000) throw new CommercialError("PÁGINA INVÁLIDA.");
    const [settings, book, preferences, students, invoices] = await Promise.all([
      a.admin.from("saas_commercial_settings").select("owner_company_id").eq("singleton", true).maybeSingle(),
      a.admin.from("saas_pricebooks").select("id,revision,config").order("revision", { ascending: false }).limit(1).maybeSingle(),
      a.admin.from("saas_billing_preferences").select("payment_method,addons,status").eq("tenant_company_id", a.company.id).maybeSingle(),
      a.admin.from("xpace_people").select("id", { count: "exact", head: true }).eq("tenant_company_id", a.company.id).eq("active", true).eq("is_student", true),
      a.admin.from("saas_billing_invoices").select("id,period_start,due_on,total_cents,payment_method,status,lines", { count: "exact" }).eq("tenant_company_id", a.company.id).order("due_on", { ascending: false }).order("id").range(page * 10, page * 10 + 9),
    ]);
    for (const result of [settings,book,preferences,students,invoices]) if (result.error) throw result.error;
    if (!settings.data || !book.data) throw new CommercialError("PREPARAÇÃO COMERCIAL AINDA NÃO INSTALADA.", 503);
    const config = validatePricebook(book.data.config);
    const pref = preferences.data || { payment_method: null, addons: [], status: "NOT_PREPARED" };
    const preview = quoteMonthly(config,a.company.id,settings.data.owner_company_id,students.count ?? 0,pref.addons);
    return NextResponse.json({ success: true, company: { name: a.company.name }, exempt: preview.exempt, billingEnabled: false,
      preferences: pref, activeStudents: students.count ?? 0, measurement: config.studentMetric, preview, bands: config.bands,
      addonMonthlyCents: config.addons.WHATSAPP, billingTiming: "MONTH_END", card: null,
      invoices: invoices.data ?? [], page, total: invoices.count ?? 0, pageSize: 10 }, { headers });
  } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  try {
    const a = await accessFor(request);
    const raw = await request.text();
    if (raw.length > 2000) throw new CommercialError("FORMULÁRIO MUITO GRANDE.");
    let input: unknown; try { input = JSON.parse(raw); } catch { throw new CommercialError("FORMULÁRIO INVÁLIDO."); }
    const pref = validateBillingPreferences(input);
    const { error } = await a.admin.from("saas_billing_preferences").upsert({ tenant_company_id: a.company.id, payment_method: pref.paymentMethod, addons: pref.addons, updated_by: a.user.id, updated_at: new Date().toISOString() }, { onConflict: "tenant_company_id" });
    if (error) throw error;
    return NextResponse.json({ success: true, message: "PREFERÊNCIA SALVA EM PREPARAÇÃO. NÃO ATIVA SERVIÇOS NEM COBRANÇAS." }, { headers });
  } catch (e) { return failure(e); }
}
function failure(e: unknown) {
  if (e instanceof AccessError || e instanceof CommercialError) return NextResponse.json({ success: false, message: e.message }, { status: e.status, headers });
  const missing = ["42P01", "PGRST205"].includes((e as { code?: string })?.code || "");
  return NextResponse.json({ success: false, message: missing ? "PREPARAÇÃO COMERCIAL AINDA NÃO INSTALADA." : "NÃO FOI POSSÍVEL CARREGAR OU SALVAR O PLANO." }, { status: missing ? 503 : 500, headers });
}
