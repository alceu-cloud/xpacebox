import { NextResponse } from "next/server";
import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { encryptIntegrationCredential, decryptIntegrationCredential } from "@/lib/server/telephony-credentials";
import { validateZapiCredentials, ZapiError } from "@/lib/server/zapi-client";
import { pairingImage } from "@/lib/server/saas-zapi-pairing";

const headers = { "Cache-Control": "private, no-store", "Pragma": "no-cache" };
export async function POST(request: Request) {
  try {
    const company = new URL(request.url).searchParams.get("company") || "";
    if (!/^[a-z0-9-]{1,80}$/.test(company)) throw new AccessError("EMPRESA INVÁLIDA.", 400);
    const access = await requireCompanyAccess(request, company);
    if (!["platform_owner", "company_manager"].includes(access.profile.platform_role)) throw new AccessError("SOMENTE GESTORES PODEM CONECTAR WHATSAPP.", 403);
    const raw = await request.text();
    if (raw.length > 4000) throw new AccessError("FORMULÁRIO MUITO GRANDE.", 400);
    let input;
    try { input = JSON.parse(raw); } catch { throw new AccessError("FORMULÁRIO INVÁLIDO.", 400); }
    if (input?.action === "SAVE") {
      // Platform owner provisions dedicated instances manually during preparation.
      if (access.profile.platform_role !== "platform_owner") throw new AccessError("A INSTÂNCIA É PREPARADA PELO DONO DA PLATAFORMA.", 403);
      const credentials = validateZapiCredentials({ instanceId: input.instanceId, instanceToken: input.instanceToken, clientToken: input.clientToken });
      const { data: legacy, error: legacyError } = await access.admin.from("xpace_zapi_connections").select("tenant_company_id").eq("instance_id", credentials.instanceId).maybeSingle();
      if (legacyError) throw legacyError;
      if (legacy) throw new AccessError("ESSA INSTÂNCIA JÁ ESTÁ EM OPERAÇÃO. NÃO RECONFIGURE O WHATSAPP ATUAL.", 409);
      const encrypted = encryptIntegrationCredential(JSON.stringify(credentials));
      const { error } = await access.admin.from("saas_whatsapp_connections").insert({ tenant_company_id: access.company.id, instance_id: credentials.instanceId, credential_ciphertext: encrypted.ciphertext, credential_iv: encrypted.iv, credential_auth_tag: encrypted.authTag, created_by: access.user.id });
      if (error) throw error;
      return NextResponse.json({ success: true, message: "INSTÂNCIA SEPARADA REGISTRADA. NENHUMA MENSAGEM ENVIADA." }, { headers });
    }
    if (input?.action === "PAIR") {
      if (process.env.SAAS_ZAPI_PAIRING_ENABLED !== "true") throw new AccessError("PAREAMENTO ADIADO ATÉ AUTORIZAÇÃO DO TESTE.", 409);
      // Existing XPACE account is intentionally excluded from the new pairing flow.
      const { data: settings, error: settingsError } = await access.admin.from("saas_commercial_settings").select("owner_company_id").eq("singleton", true).single();
      if (settingsError) throw settingsError;
      if (settings.owner_company_id === access.company.id) throw new AccessError("PRESERVE O WHATSAPP XPACE ATUAL.", 409);
      const { data: connection, error } = await access.admin.from("saas_whatsapp_connections").select("credential_ciphertext,credential_iv,credential_auth_tag").eq("tenant_company_id", access.company.id).maybeSingle();
      if (error) throw error;
      if (!connection) throw new AccessError("SOLICITE A PREPARAÇÃO DA INSTÂNCIA À PLATAFORMA.", 409);
      const credentials = JSON.parse(decryptIntegrationCredential({ ciphertext: connection.credential_ciphertext, iv: connection.credential_iv, authTag: connection.credential_auth_tag }));
      return NextResponse.json({ success: true, image: await pairingImage(credentials) }, { headers });
    }
    throw new AccessError("AÇÃO INVÁLIDA.", 400);
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ success: false, message: error.message }, { status: error.status, headers });
    if (error instanceof ZapiError) return NextResponse.json({ success: false, message: error.code === "ZAPI_PAIRING_CHALLENGE_REQUIRED" ? "WHATSAPP EXIGE AUTENTICAÇÃO ADICIONAL. CONCLUA NO PAINEL DO PROVEDOR." : "NÃO FOI POSSÍVEL PREPARAR O QR WHATSAPP." }, { status: 409, headers });
    return NextResponse.json({ success: false, message: (error as { code?: string })?.code === "23505" ? "INSTÂNCIA OU EMPRESA JÁ CONFIGURADA. NÃO FOI SUBSTITUÍDA." : "NÃO FOI POSSÍVEL PREPARAR O WHATSAPP." }, { status: 409, headers });
  }
}
