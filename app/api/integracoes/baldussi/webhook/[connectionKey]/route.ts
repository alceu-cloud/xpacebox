import { NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/server/supabase-admin";
import { hashWebhookSecret } from "@/lib/server/telephony-credentials";

type BaldussiPayload = {
  id_chamada?: string | number;
  ramal?: string;
  nome_ramal?: string;
  origem?: string;
  destino?: string;
  status?: string;
  data?: string;
  hora?: string;
  url_audio?: string;
  transcricao?: Array<{ timestamp?: string; fala_transcrita?: string; speaker?: string }>;
  nota?: number;
  resumo?: string;
  metadados?: { duracao_segundos?: number };
};

function response(message: string, status: number) { return NextResponse.json({ success: false, message }, { status }); }
function digits(value?: string) { return String(value || "").replace(/\D/g, ""); }
function isExtension(value?: string) { return /^(SIP|PJSIP|IAX|LOCAL)[-/]/i.test(String(value || "")); }
function externalPhone(payload: BaldussiPayload) { return isExtension(payload.origem) ? digits(payload.destino) : isExtension(payload.destino) ? digits(payload.origem) : digits(payload.destino || payload.origem); }
function formatTranscript(items?: BaldussiPayload["transcricao"]) { return (items || []).map((item) => [item.timestamp, item.speaker, item.fala_transcrita].filter(Boolean).join(" | ")).filter(Boolean).join("\n"); }

export async function POST(request: Request, { params }: { params: Promise<{ connectionKey: string }> }) {
  try {
    const { connectionKey } = await params;
    const secret = request.headers.get("x-xpacebox-webhook-secret") || "";
    if (!connectionKey || !secret) return response("WEBHOOK NAO AUTORIZADO.", 401);

    const admin = createSupabaseAdmin();
    const { data: connection, error: connectionError } = await admin.from("telephony_connections").select("id,tenant_company_id,webhook_secret_hash").eq("webhook_key", connectionKey).maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection?.webhook_secret_hash || hashWebhookSecret(secret) !== connection.webhook_secret_hash) return response("WEBHOOK NAO AUTORIZADO.", 401);

    const payload = await request.json() as BaldussiPayload;
    const providerCallId = String(payload.id_chamada || "").trim();
    if (!providerCallId) return response("ID DA CHAMADA AUSENTE.", 400);
    const { data: existing, error: existingError } = await admin.from("telephony_call_events").select("id").eq("connection_id", connection.id).eq("provider_call_id", providerCallId).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return NextResponse.json({ success: true, duplicated: true });

    const extension = String(payload.ramal || "").trim().toUpperCase();
    const [extensionResult, clientsResult] = await Promise.all([
      admin.from("telephony_user_extensions").select("profile_id").eq("connection_id", connection.id).eq("extension", extension).maybeSingle(),
      admin.from("clients").select("id,phone,whatsapp").eq("tenant_company_id", connection.tenant_company_id).eq("active", true).limit(5000),
    ]);
    if (extensionResult.error) throw extensionResult.error;
    if (clientsResult.error) throw clientsResult.error;
    const remotePhone = externalPhone(payload);
    const client = (clientsResult.data || []).find((item) => {
      const candidate = digits(item.phone) || digits(item.whatsapp);
      return candidate.length >= 10 && (candidate.endsWith(remotePhone.slice(-11)) || remotePhone.endsWith(candidate.slice(-11)));
    });
    const direction = isExtension(payload.origem) ? "OUTBOUND" : isExtension(payload.destino) ? "INBOUND" : "UNKNOWN";
    const startedAt = payload.data && payload.hora ? `${payload.data}T${payload.hora}-03:00` : null;
    const transcript = formatTranscript(payload.transcricao);
    const duration = Number(payload.metadados?.duracao_segundos || 0) || 0;
    const { data: call, error: callError } = await admin.from("telephony_call_events").insert({
      tenant_company_id: connection.tenant_company_id,
      connection_id: connection.id,
      provider_call_id: providerCallId,
      client_id: client?.id || null,
      representative_profile_id: extensionResult.data?.profile_id || null,
      extension: extension || null,
      representative_name: payload.nome_ramal?.trim() || null,
      direction,
      remote_phone: remotePhone || null,
      status: payload.status?.trim().toUpperCase() || "UNKNOWN",
      started_at: startedAt,
      duration_seconds: duration,
      audio_url: payload.url_audio?.trim() || null,
      transcript: transcript || null,
      summary: payload.resumo?.trim() || null,
      quality_score: Number.isFinite(Number(payload.nota)) ? Number(payload.nota) : null,
    }).select("id").single();
    if (callError) throw callError;

    if (client?.id) {
      const attended = /ATENDIDA|ATENDIDO|COMPLETA|SUCESSO/.test(String(payload.status || "").toUpperCase());
      const { data: activity, error: activityError } = await admin.from("crm_activities").insert({
        tenant_company_id: connection.tenant_company_id,
        client_id: client.id,
        representative_profile_id: extensionResult.data?.profile_id || null,
        activity_type: "CALL",
        outcome: attended ? "CONTACTED" : "NO_RESPONSE",
        subject: `LIGACAO BALDUSSI - ${payload.status?.trim().toUpperCase() || "SEM STATUS"}`,
        notes: [payload.resumo?.trim(), duration ? `DURACAO: ${duration} SEGUNDOS.` : "", payload.nota ? `NOTA: ${payload.nota}.` : ""].filter(Boolean).join("\n"),
        occurred_at: startedAt || new Date().toISOString(),
      }).select("id").single();
      if (activityError) throw activityError;
      const { error: callUpdateError } = await admin.from("telephony_call_events").update({ activity_id: activity.id }).eq("id", call.id);
      if (callUpdateError) throw callUpdateError;
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = String((error as { message?: string })?.message || "");
    if (message.includes("telephony_")) return response("INTEGRACAO BALDUSSI AINDA NAO DISPONIVEL.", 503);
    console.error("BALDUSSI WEBHOOK ERROR", error);
    return response("NAO FOI POSSIVEL PROCESSAR A CHAMADA.", 500);
  }
}
