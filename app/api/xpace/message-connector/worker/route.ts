import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
type WorkerBody = { action?: string; status?: string; phone?: string; qrDataUrl?: string; error?: string; messageId?: string; success?: boolean; providerMessageId?: string };

export async function POST(request: Request) {
  const rawToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(rawToken)) return fail("TOKEN INVÁLIDO.", 401);
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const admin = createSupabaseAdmin();
  const { data: connector, error: lookupError } = await admin.from("xpace_message_connectors")
    .select("id,tenant_company_id,disconnect_requested")
    .eq("token_hash", tokenHash).maybeSingle();
  if (lookupError || !connector) return fail("CONECTOR NÃO AUTORIZADO.", 401);
  let body: WorkerBody;
  try { body = await request.json() as WorkerBody; } catch { return fail("REQUISIÇÃO INVÁLIDA.", 400); }
  const now = new Date().toISOString();
  try {
    if (body.action === "HEARTBEAT") {
      if (!["OFFLINE", "WAITING_QR", "CONNECTED", "ERROR"].includes(body.status ?? "")) return fail("STATUS INVÁLIDO.", 400);
      if (body.qrDataUrl && (body.qrDataUrl.length > 100_000 || !body.qrDataUrl.startsWith("data:image/png;base64,"))) return fail("QR INVÁLIDO.", 400);
      const status = body.status as string;
      const { error } = await admin.from("xpace_message_connectors").update({
        status, phone: status === "CONNECTED" ? (body.phone ?? "").replace(/\D/g, "").slice(0, 15) || null : null,
        ...(status === "WAITING_QR" ? (body.qrDataUrl ? { qr_data_url: body.qrDataUrl, qr_updated_at: now } : {}) : { qr_data_url: null, qr_updated_at: null }),
        last_error: status === "ERROR" ? (body.error ?? "ERRO DE CONEXÃO").slice(0, 400) : null,
        last_seen_at: now, updated_at: now,
        ...(status === "OFFLINE" && connector.disconnect_requested ? { disconnect_requested: false } : {}),
      }).eq("id", connector.id).eq("tenant_company_id", connector.tenant_company_id);
      if (error) throw error;
      return NextResponse.json({ success: true, disconnectRequested: connector.disconnect_requested }, { headers });
    }
    if (body.action === "CLAIM") {
      if (connector.disconnect_requested) return NextResponse.json({ success: true, disconnectRequested: true, message: null }, { headers });
      const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
      await admin.from("xpace_message_outbox")
        .update({ status: "UNKNOWN", error_message: "A conexão caiu durante o envio. Verifique no WhatsApp antes de reenviar.", updated_at: now })
        .eq("tenant_company_id", connector.tenant_company_id).eq("connector_id", connector.id)
        .eq("status", "SENDING").lt("claimed_at", staleBefore);
      const { data: queued, error: queueError } = await admin.from("xpace_message_outbox")
        .select("id,kind,appointment_id,appointment_scheduled_on,appointment_starts_at,charge_id,expires_at").eq("tenant_company_id", connector.tenant_company_id).eq("connector_id", connector.id)
        .eq("status", "QUEUED").lte("scheduled_at", now).order("scheduled_at", { ascending: true }).limit(1).maybeSingle();
      if (queueError) throw queueError;
      if (!queued) return NextResponse.json({ success: true, message: null }, { headers });
      let cancelReason = queued.expires_at && queued.expires_at <= now ? "PRAZO DA MENSAGEM EXPIRADO." : "";
      if (!cancelReason && queued.appointment_id) {
        const { data: appointment, error: appointmentError } = await admin.from("xpace_lead_appointments")
          .select("id,scheduled_on,starts_at,attendance_status,confirmation_status,whatsapp_opt_in")
          .eq("id", queued.appointment_id).eq("tenant_company_id", connector.tenant_company_id).maybeSingle();
        if (appointmentError) throw appointmentError;
        if (!appointment || !appointment.whatsapp_opt_in || appointment.attendance_status === "CANCELADO" || appointment.confirmation_status === "NAO_CONFIRMADO" || appointment.scheduled_on !== queued.appointment_scheduled_on || appointment.starts_at?.slice(0, 5) !== queued.appointment_starts_at?.slice(0, 5)) cancelReason = "AGENDAMENTO ALTERADO, CANCELADO OU SEM AUTORIZAÇÃO.";
      }
      if (!cancelReason && queued.kind === "COBRANCA_PIX_AUTOMATICA") {
        const { data: charge, error: chargeError } = await admin.from("xpace_contract_charges")
          .select("id,status,student_id,provider_payment_id")
          .eq("id", queued.charge_id).eq("tenant_company_id", connector.tenant_company_id).maybeSingle();
        if (chargeError) throw chargeError;
        const { data: student, error: studentError } = charge ? await admin.from("xpace_people")
          .select("whatsapp_opt_in").eq("id", charge.student_id).eq("tenant_company_id", connector.tenant_company_id).maybeSingle() : { data: null, error: null };
        if (studentError) throw studentError;
        if (!charge || charge.status !== "ABERTO" || !charge.provider_payment_id || !student?.whatsapp_opt_in) cancelReason = "COBRANÇA NÃO ESTÁ ABERTA OU SEM AUTORIZAÇÃO DE WHATSAPP.";
      }
      if (cancelReason) {
        const { error: cancelError } = await admin.from("xpace_message_outbox")
          .update({ status: "CANCELLED", error_message: cancelReason, updated_at: now })
          .eq("id", queued.id).eq("tenant_company_id", connector.tenant_company_id).eq("status", "QUEUED");
        if (cancelError) throw cancelError;
        return NextResponse.json({ success: true, message: null }, { headers });
      }
      const { data: message, error } = await admin.from("xpace_message_outbox")
        .update({ status: "SENDING", claimed_at: now, updated_at: now })
        .eq("id", queued.id).eq("tenant_company_id", connector.tenant_company_id).eq("connector_id", connector.id)
        .eq("status", "QUEUED").select("id,destination_phone,body").maybeSingle();
      if (error) throw error;
      return NextResponse.json({ success: true, message }, { headers });
    }
    if (body.action === "RESULT") {
      if (!body.messageId || typeof body.success !== "boolean") return fail("RESULTADO INVÁLIDO.", 400);
      const { data, error } = await admin.from("xpace_message_outbox")
        .update({ status: body.success ? "SENT" : "UNKNOWN", provider_message_id: body.providerMessageId?.slice(0, 200) || null, error_message: body.success ? null : (body.error ?? "ENVIO NÃO CONFIRMADO. VERIFIQUE O WHATSAPP.").slice(0, 400), sent_at: body.success ? now : null, updated_at: now })
        .eq("id", body.messageId).eq("tenant_company_id", connector.tenant_company_id).eq("connector_id", connector.id)
        .eq("status", "SENDING").select("id,kind,appointment_id,lead_id").maybeSingle();
      if (error) throw error;
      if (!data) return fail("MENSAGEM NÃO ESTÁ EM ENVIO.", 409);
      if (data.kind === "VIDEO_BOAS_VINDAS" && data.appointment_id) {
        const { error: videoError } = await admin.from("xpace_lead_appointments")
          .update({ welcome_delivery_status: body.success ? "ENVIADO" : "FALHOU", welcome_delivered_at: body.success ? now : null })
          .eq("id", data.appointment_id).eq("tenant_company_id", connector.tenant_company_id);
        if (videoError) console.error("XPACE VIDEO STATUS ERROR", videoError);
        if (body.success && data.lead_id) {
          const { error: activityError } = await admin.from("xpace_lead_activities").insert({ tenant_company_id: connector.tenant_company_id, lead_id: data.lead_id, appointment_id: data.appointment_id, activity_type: "VIDEO_ENVIADO", body: "VÍDEO DE BOAS-VINDAS ENVIADO PELO CONECTOR WHATSAPP.", payload: { messageId: data.id } });
          if (activityError) console.error("XPACE VIDEO ACTIVITY ERROR", activityError);
        }
      }
      return NextResponse.json({ success: true }, { headers });
    }
    return fail("AÇÃO INVÁLIDA.", 400);
  } catch (error) {
    console.error("XPACE CONNECTOR WORKER ERROR", error);
    return fail("FALHA TEMPORÁRIA NO CONECTOR.", 500);
  }
}

function fail(message: string, status: number) { return NextResponse.json({ success: false, message }, { status, headers }); }
