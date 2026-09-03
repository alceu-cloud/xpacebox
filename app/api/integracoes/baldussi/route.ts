import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess, requireCompanyProfile } from "@/lib/server/company-access";
import { createWebhookSecret, encryptBaldussiCredential, hashWebhookSecret } from "@/lib/server/telephony-credentials";

type ExtensionInput = { profileId?: string; extension?: string };

function failure(message: string, status: number) { return NextResponse.json({ success: false, message }, { status }); }

async function requireManager(request: Request, slug: string) {
  const access = await requireCompanyAccess(request, slug);
  if (!["platform_owner", "company_manager"].includes(access.profile.platform_role)) throw new AccessError("APENAS GERENTES PODEM CONFIGURAR A TELEFONIA.", 403);
  return access;
}

async function connectionForCompany(admin: Awaited<ReturnType<typeof requireCompanyAccess>>["admin"], companyId: string) {
  const { data: existing, error } = await admin.from("telephony_connections").select("*").eq("tenant_company_id", companyId).maybeSingle();
  if (error) throw error;
  if (existing) return existing;
  const { data, error: insertError } = await admin.from("telephony_connections").insert({ tenant_company_id: companyId }).select("*").single();
  if (insertError) throw insertError;
  return data;
}

function webhookUrl(request: Request, key: string) {
  return `${new URL(request.url).origin}/api/integracoes/baldussi/webhook/${key}`;
}

export async function GET(request: Request) {
  try {
    const slug = new URL(request.url).searchParams.get("slug")?.trim() || "";
    if (!slug) return failure("EMPRESA NAO INFORMADA.", 400);
    const { admin, company, user } = await requireManager(request, slug);
    const connection = await connectionForCompany(admin, company.id);
    const [membersResult, profilesResult, extensionsResult] = await Promise.all([
      admin.from("company_members").select("profile_id").eq("company_id", company.id).eq("active", true),
      admin.from("profiles").select("id,full_name,email").eq("active", true),
      admin.from("telephony_user_extensions").select("profile_id,extension").eq("connection_id", connection.id),
    ]);
    for (const result of [membersResult, profilesResult, extensionsResult]) if (result.error) throw result.error;
    const memberIds = new Set([user.id, ...(membersResult.data ?? []).map((item) => item.profile_id)]);
    const representatives = (profilesResult.data ?? []).filter((item) => memberIds.has(item.id)).map((item) => ({ id: item.id, name: item.full_name || item.email || "USUARIO" })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return NextResponse.json({ success: true, connection: {
      status: connection.status,
      keyConfigured: Boolean(connection.api_key_ciphertext),
      webhookUrl: webhookUrl(request, connection.webhook_key),
      webhookHeader: "X-Xpacebox-Webhook-Secret",
      webhookConfigured: Boolean(connection.webhook_secret_hash),
      audioRetentionDays: connection.audio_retention_days,
      transcriptRetentionDays: connection.transcript_retention_days,
    }, representatives, extensions: extensionsResult.data ?? [] });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { slug?: string; apiKey?: string; generateWebhookSecret?: boolean; audioRetentionDays?: number; transcriptRetentionDays?: number; extensions?: ExtensionInput[] };
    const slug = body.slug?.trim() || "";
    if (!slug) return failure("EMPRESA NAO INFORMADA.", 400);
    const { admin, company } = await requireManager(request, slug);
    const connection = await connectionForCompany(admin, company.id);
    const audioRetentionDays = Number(body.audioRetentionDays ?? connection.audio_retention_days);
    const transcriptRetentionDays = Number(body.transcriptRetentionDays ?? connection.transcript_retention_days);
    if (!Number.isInteger(audioRetentionDays) || audioRetentionDays < 30 || audioRetentionDays > 3650) return failure("RETENCAO DE AUDIO INVALIDA.", 400);
    if (!Number.isInteger(transcriptRetentionDays) || transcriptRetentionDays < 30 || transcriptRetentionDays > 3650) return failure("RETENCAO DE TRANSCRICAO INVALIDA.", 400);

    const update: Record<string, unknown> = { audio_retention_days: audioRetentionDays, transcript_retention_days: transcriptRetentionDays, updated_at: new Date().toISOString() };
    if (body.apiKey?.trim()) {
      const credential = encryptBaldussiCredential(body.apiKey.trim());
      Object.assign(update, { api_key_ciphertext: credential.ciphertext, api_key_iv: credential.iv, api_key_auth_tag: credential.authTag, status: "PENDING" });
    }
    let webhookSecret = "";
    if (body.generateWebhookSecret) {
      webhookSecret = createWebhookSecret();
      update.webhook_secret_hash = hashWebhookSecret(webhookSecret);
    }
    const { error: updateError } = await admin.from("telephony_connections").update(update).eq("id", connection.id);
    if (updateError) throw updateError;

    if (body.extensions) {
      const entries = body.extensions.map((item) => ({ profileId: item.profileId?.trim() || "", extension: item.extension?.trim().toUpperCase() || "" })).filter((item) => item.profileId && item.extension);
      const uniqueProfiles = new Set(entries.map((item) => item.profileId));
      const uniqueExtensions = new Set(entries.map((item) => item.extension));
      if (uniqueProfiles.size !== entries.length || uniqueExtensions.size !== entries.length) return failure("CADA USUARIO E RAMAL DEVEM SER UNICOS.", 400);
      await Promise.all(entries.map((item) => requireCompanyProfile(admin, company.id, item.profileId)));
      const { error: deleteError } = await admin.from("telephony_user_extensions").delete().eq("connection_id", connection.id);
      if (deleteError) throw deleteError;
      if (entries.length) {
        const { error: extensionsError } = await admin.from("telephony_user_extensions").insert(entries.map((item) => ({ connection_id: connection.id, tenant_company_id: company.id, profile_id: item.profileId, extension: item.extension })));
        if (extensionsError) throw extensionsError;
      }
    }
    return NextResponse.json({ success: true, webhookSecret });
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown) {
  if (error instanceof AccessError) return failure(error.message, error.status);
  const message = String((error as { message?: string })?.message || "");
  if (message.includes("telephony_")) return failure("A ESTRUTURA DA INTEGRACAO METRICX AINDA NAO FOI APLICADA NO SUPABASE.", 503);
  if (message.includes("CRIPTOGRAFIA")) return failure("A CHAVE SEGURA DO METRICX AINDA NAO FOI CONFIGURADA.", 503);
  console.error("METRICX CONFIG ERROR", error);
  return failure("NAO FOI POSSIVEL SALVAR A CONFIGURACAO DO METRICX.", 500);
}
