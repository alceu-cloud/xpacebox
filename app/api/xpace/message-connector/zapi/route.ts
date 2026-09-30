import { randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { encryptIntegrationCredential } from "@/lib/server/telephony-credentials";
import { validateZapiCredentials } from "@/lib/server/zapi-client";
import { checkCloudConnection, cloudCredentials, sendCloudMessage, type CloudConnection } from "@/lib/server/xpace-zapi";

const headers = { "Cache-Control": "no-store" };
async function manager(request: Request) {
  const access = await requireCompanyAccess(request, "xpace");
  if (!["platform_owner", "company_manager"].includes(access.profile.platform_role)) throw new AccessError("APENAS GESTORES PODEM CONFIGURAR A Z-API.", 403);
  return access;
}
function failure(error: unknown) {
  return NextResponse.json({ success: false, message: error instanceof AccessError ? error.message : "NÃO FOI POSSÍVEL CONCLUIR A OPERAÇÃO DA Z-API. CONFIGURAÇÃO E FILA NÃO DEVEM SER REENVIADAS ÀS CEGAS." }, { status: error instanceof AccessError ? error.status : 503, headers });
}
export async function GET(request: Request) {
  try {
    const { admin, company } = await manager(request);
    const { data: cloud, error } = await admin.from("xpace_zapi_connections").select("*").eq("tenant_company_id", company.id).maybeSingle();
    if (error) throw error;
    if (!cloud) return NextResponse.json({ success: true, configured: false }, { headers });
    const credentials = cloudCredentials(cloud as CloudConnection);
    return NextResponse.json({ success: true, configured: true, instanceId: cloud.instance_id, enabled: cloud.enabled, paused: cloud.paused, connected: cloud.connected, lastCheckedAt: cloud.last_checked_at, lastError: cloud.last_error,
      webhookUrl: `${new URL(request.url).origin}/api/xpace/message-connector/zapi/webhook/${credentials.webhookSecret}` }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const { admin, company, user } = await manager(request);
    const input = await request.json() as { action?: string; instanceId?: string; instanceToken?: string; clientToken?: string; testPhone?: string; requestId?: string; confirmReceived?: boolean };
    const { data: connector, error: connectorError } = await admin.from("xpace_message_connectors").select("id").eq("tenant_company_id", company.id).maybeSingle();
    if (connectorError || !connector) throw new AccessError("CONECTOR DA ESCOLA NÃO ENCONTRADO. NÃO GERE UMA NOVA CHAVE.", 409);
    const { data: existing, error: cloudError } = await admin.from("xpace_zapi_connections").select("*").eq("connector_id", connector.id).eq("tenant_company_id", company.id).maybeSingle();
    if (cloudError) throw cloudError;
    if (input.action === "SAVE") {
      if (existing?.enabled || (existing?.lease_until && Date.parse(existing.lease_until) > Date.now())) throw new AccessError("PAUSE E DESATIVE A OPERAÇÃO ANTES DE TROCAR CREDENCIAIS.", 409);
      const credentials = validateZapiCredentials({ instanceId: input.instanceId?.trim() || "", instanceToken: input.instanceToken?.trim() || "", clientToken: input.clientToken?.trim() || "" });
      if (existing && existing.instance_id !== credentials.instanceId) throw new AccessError("TROCA DE INSTÂNCIA EXIGE MIGRAÇÃO DO HISTÓRICO. MANTENHA A INSTÂNCIA DA ESCOLA.", 409);
      const webhookSecret = existing ? cloudCredentials(existing as CloudConnection).webhookSecret : randomBytes(32).toString("base64url");
      const encrypted = encryptIntegrationCredential(JSON.stringify({ ...credentials, webhookSecret }));
      const { error } = await admin.from("xpace_zapi_connections").upsert({ connector_id: connector.id, tenant_company_id: company.id, instance_id: credentials.instanceId, credential_ciphertext: encrypted.ciphertext, credential_iv: encrypted.iv, credential_auth_tag: encrypted.authTag, webhook_secret_hash: createHash("sha256").update(webhookSecret).digest("hex"), enabled: false, paused: true, updated_at: new Date().toISOString() });
      if (error) throw error;
      return NextResponse.json({ success: true }, { headers });
    }
    if (!existing) throw new AccessError("CONFIGURE A Z-API PRIMEIRO.", 409);
    const connection = existing as CloudConnection;
    if (input.action === "CHECK") return NextResponse.json({ success: true, connected: await checkCloudConnection(admin, connection) }, { headers });
    if (input.action === "PAUSE") {
      const { error } = await admin.from("xpace_zapi_connections").update({ paused: true, updated_at: new Date().toISOString() }).eq("connector_id", connector.id).eq("tenant_company_id", company.id);
      if (error) throw error;
      return NextResponse.json({ success: true }, { headers });
    }
    if (input.action === "TEST") {
      if (!connection.paused) throw new AccessError("PAUSE A FILA PARA FAZER O TESTE ISOLADO.", 409);
      if (!/^[0-9a-f-]{36}$/i.test(input.requestId ?? "")) throw new AccessError("IDENTIFICADOR DO TESTE INVÁLIDO.", 400);
      const phone = input.testPhone?.replace(/\D/g, "") ?? "";
      if (!/^55\d{10,11}$/.test(phone)) throw new AccessError("INFORME O WHATSAPP DO ALCEU COM 55 E DDD.", 400);
      const { data: prior, error: priorError } = await admin.from("xpace_message_outbox").select("id,status,delivered_at,read_at").eq("id", input.requestId).eq("tenant_company_id", company.id).maybeSingle();
      if (priorError) throw priorError;
      if (prior) return NextResponse.json({ success: true, state: prior.status, delivered: Boolean(prior.delivered_at || prior.read_at) }, { headers });
      if (!await checkCloudConnection(admin, connection)) throw new AccessError("Z-API DESCONECTADA. NENHUM TESTE FOI ENVIADO.", 409);
      const message = { id: input.requestId!, destination_phone: phone, body: "✅ Teste de conexão XPACEBOX pela Z-API. Alceu, confirme o recebimento para liberar os avisos da escola." };
      const { error: insertError } = await admin.from("xpace_message_outbox").insert({ ...message, tenant_company_id: company.id, connector_id: connector.id, kind: "TESTE", contact_name: "ALCEU · TESTE Z-API", status: "SENDING", claimed_at: new Date().toISOString(), created_by: user.id });
      if (insertError) throw new AccessError("TESTE JÁ EXISTE OU NÃO PÔDE SER REGISTRADO. NÃO REPITA SEM CONFERIR.", 409);
      const result = await sendCloudMessage(admin, connection, message);
      return NextResponse.json({ success: true, accepted: result.accepted, code: result.code }, { headers });
    }
    if (input.action === "SCHEDULER") {
      const { data: ready, error } = await admin.rpc("xpace_prepare_zapi_scheduler");
      if (error || !ready) throw new AccessError("NÃO FOI POSSÍVEL PREPARAR O AGENDAMENTO NA NUVEM. MANTENHA A FILA PAUSADA.", 503);
      return NextResponse.json({ success: true }, { headers });
    }
    if (input.action === "ACTIVATE") {
      const { data: schedulerReady, error: schedulerError } = await admin.rpc("xpace_zapi_scheduler_ready");
      if (schedulerError || !schedulerReady) throw new AccessError("PREPARE O AGENDAMENTO AUTOMÁTICO NA NUVEM ANTES DE LIBERAR.", 409);
      if (!input.confirmReceived) throw new AccessError("CONFIRME O RECEBIMENTO REAL DO TESTE.", 400);
      const { data: tested, error: testError } = await admin.from("xpace_zapi_attempts").select("message_id,xpace_message_outbox!inner(kind,tenant_company_id,delivered_at,read_at)").eq("connector_id", connector.id).gte("started_at", new Date(Date.now() - 30 * 60_000).toISOString());
      if (testError) throw testError;
      const proven = (tested ?? []).some(row => {
        const message = row.xpace_message_outbox as unknown as { kind: string; tenant_company_id: string; delivered_at: string | null; read_at: string | null };
        return message.kind === "TESTE" && message.tenant_company_id === company.id && Boolean(message.delivered_at || message.read_at);
      });
      if (!proven) throw new AccessError("FALTA O RECIBO REAL DE ENTREGA DO TESTE. NÃO LIBERE A FILA APENAS POR UM ID.", 409);
      const { count, error: pendingError } = await admin.from("xpace_message_outbox").select("id", { count: "exact", head: true }).eq("connector_id", connector.id).eq("tenant_company_id", company.id).eq("status", "SENDING");
      if (pendingError || count) throw new AccessError("HÁ ENVIO EM ANDAMENTO. AGUARDE ANTES DA TROCA.", 409);
      if (!await checkCloudConnection(admin, connection)) throw new AccessError("Z-API DESCONECTADA.", 409);
      const { error } = await admin.from("xpace_zapi_connections").update({ enabled: true, paused: false, updated_at: new Date().toISOString() }).eq("connector_id", connector.id).eq("tenant_company_id", company.id);
      if (error) throw error;
      return NextResponse.json({ success: true }, { headers });
    }
    throw new AccessError("AÇÃO INVÁLIDA.", 400);
  } catch (error) { return failure(error); }
}
