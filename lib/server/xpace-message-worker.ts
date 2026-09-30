import "server-only";
import { NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/server/supabase-admin";
import { trialInstructorNoticeAt, whatsappPhone } from "@/lib/server/xpace-automatic-messages";

const headers = { "Cache-Control": "no-store" };
export type WorkerBody = { action?: string; status?: string; phone?: string; qrDataUrl?: string; error?: string; messageId?: string; success?: boolean; providerMessageId?: string; receiptStatus?: "DELIVERED" | "READ" };
type Connector = { id: string; tenant_company_id: string; disconnect_requested: boolean };

// Only authenticated server callers may supply this context.
export async function processMessageWorker(admin: ReturnType<typeof createSupabaseAdmin>, connector: Connector, body: WorkerBody, provider: "LOCAL" | "ZAPI" = "LOCAL") {
  const now = new Date().toISOString();
  try {
    if (["CLAIM", "HEARTBEAT"].includes(body.action ?? "")) {
      const { data: cloud, error } = await admin.from("xpace_zapi_connections").select("enabled,paused").eq("connector_id", connector.id).eq("tenant_company_id", connector.tenant_company_id).maybeSingle();
      if (error) throw error;
      if ((provider === "LOCAL" && cloud?.enabled) || (provider === "ZAPI" && (!cloud?.enabled || cloud.paused))) {
        return NextResponse.json({ success: true, message: null, cloudManaged: Boolean(cloud?.enabled) }, { headers });
      }
    }
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
        .select("id,kind,appointment_id,appointment_scheduled_on,appointment_starts_at,instructor_id,student_id,destination_phone,charge_id,expires_at").eq("tenant_company_id", connector.tenant_company_id).eq("connector_id", connector.id)
        .eq("status", "QUEUED").lte("scheduled_at", now).order("scheduled_at", { ascending: true }).limit(1).maybeSingle();
      if (queueError) throw queueError;
      if (!queued) return NextResponse.json({ success: true, message: null }, { headers });
      let cancelReason = queued.expires_at && queued.expires_at <= now ? "PRAZO DA MENSAGEM EXPIRADO." : "";
      let mediaUrl: string | null = null;
      if (!cancelReason && queued.appointment_id) {
        const { data: appointment, error: appointmentError } = await admin.from("xpace_lead_appointments")
          .select("id,class_schedule_id,scheduled_on,starts_at,attendance_status,confirmation_status,whatsapp_opt_in,whatsapp_legacy_allowed_at,welcome_video_url")
          .eq("id", queued.appointment_id).eq("tenant_company_id", connector.tenant_company_id).maybeSingle();
        if (appointmentError) throw appointmentError;
        if (!appointment || (queued.kind !== "AVISO_PROFESSOR" && !appointment.whatsapp_opt_in && !appointment.whatsapp_legacy_allowed_at) || appointment.attendance_status === "CANCELADO" || (queued.kind !== "PESQUISA_SATISFACAO" && appointment.confirmation_status === "NAO_CONFIRMADO") || appointment.scheduled_on !== queued.appointment_scheduled_on || appointment.starts_at?.slice(0, 5) !== queued.appointment_starts_at?.slice(0, 5)) cancelReason = "AGENDAMENTO ALTERADO, CANCELADO OU SEM AUTORIZAÇÃO.";
        if (!cancelReason && queued.kind === "PESQUISA_SATISFACAO" && appointment!.attendance_status !== "COMPARECEU") cancelReason = "PESQUISA SEM AUTORIZAÇÃO OU PRESENÇA NÃO CONFIRMADA.";
        if (!cancelReason && queued.kind === "VIDEO_BOAS_VINDAS") {
          mediaUrl = cloudinaryVideoUrl(appointment!.welcome_video_url);
          if (!mediaUrl) cancelReason = "VÍDEO NÃO ESTÁ EM FORMATO DE MÍDIA COMPATÍVEL PARA ENVIO.";
        }
        if (!cancelReason && queued.kind === "AVISO_PROFESSOR") {
          const [{ data: instructor, error: instructorError }, { data: schedule, error: scheduleError }] = await Promise.all([
            admin.from("xpace_instructors").select("id,mobile,active").eq("id", queued.instructor_id).eq("tenant_company_id", connector.tenant_company_id).maybeSingle(),
            admin.from("xpace_class_schedules").select("instructor_id").eq("id", appointment!.class_schedule_id).eq("tenant_company_id", connector.tenant_company_id).maybeSingle(),
          ]);
          if (instructorError || scheduleError) throw instructorError ?? scheduleError;
          if (!instructor?.active || whatsappPhone(instructor.mobile ?? "") !== queued.destination_phone || schedule?.instructor_id !== queued.instructor_id) cancelReason = "PROFESSOR OU CELULAR DO HORÁRIO FOI ALTERADO.";
          if (!cancelReason) {
            const noticeAt = trialInstructorNoticeAt(appointment!.scheduled_on, appointment!.starts_at);
            if (noticeAt > Date.parse(now)) {
              // Also protect previously queued notices created with the immediate-send rule.
              const { error: deferError } = await admin.from("xpace_message_outbox")
                .update({ scheduled_at: new Date(noticeAt).toISOString(), updated_at: now })
                .eq("id", queued.id).eq("tenant_company_id", connector.tenant_company_id)
                .eq("connector_id", connector.id).eq("status", "QUEUED");
              if (deferError) throw deferError;
              return NextResponse.json({ success: true, message: null }, { headers });
            }
          }
        }
      }
      if (!cancelReason && ["VIDEO_BOAS_VINDAS", "LEMBRETE_VESPERA", "CONFIRMACAO_DIA", "AVISO_PROFESSOR", "PESQUISA_SATISFACAO"].includes(queued.kind) && !queued.appointment_id) {
        cancelReason = "AGENDAMENTO NÃO ENCONTRADO; ENVIO BLOQUEADO.";
      }
      // Recheck consent at dispatch, including links queued before permission was withdrawn.
      if (!cancelReason && ["ASSINATURA", "COBRANCA", "COBRANCA_PIX_AUTOMATICA"].includes(queued.kind)) {
        const { data: recipient, error: recipientError } = await admin.from("xpace_people")
          .select("whatsapp_opt_in,mobile").eq("id", queued.student_id).eq("tenant_company_id", connector.tenant_company_id).maybeSingle();
        if (recipientError) throw recipientError;
        if (!recipient?.whatsapp_opt_in || whatsappPhone(recipient.mobile ?? "") !== queued.destination_phone) cancelReason = "WHATSAPP NÃO AUTORIZADO OU CONTATO ALTERADO.";
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
        if (queued.kind === "PESQUISA_SATISFACAO" && queued.appointment_id) {
          const { error: surveyError } = await admin.from("xpace_lead_appointments")
            .update({ survey_status: "NAO_ENVIADA" }).eq("id", queued.appointment_id)
            .eq("tenant_company_id", connector.tenant_company_id).neq("survey_status", "ENVIADA");
          if (surveyError) throw surveyError;
        }
        return NextResponse.json({ success: true, message: null }, { headers });
      }
      const { data: claimed, error } = await admin.rpc("xpace_claim_provider_message", { p_id: queued.id, p_tenant: connector.tenant_company_id, p_connector: connector.id, p_provider: provider });
      if (error) throw error;
      const message = claimed?.[0] as { id: string; destination_phone: string; body: string } | undefined;
      const caption = message?.body.replace(/🎬 \*Seu vídeo de boas-vindas:\* https?:\/\/\S+\n?/u, "🎬 Seu vídeo de boas-vindas está aqui. ");
      return NextResponse.json({ success: true, message: message ? { ...message, body: caption, mediaUrl } : null }, { headers });
    }
    if (body.action === "RECEIPT") {
      const providerMessageId = body.providerMessageId?.trim();
      if (!providerMessageId || providerMessageId.length > 200 || !["DELIVERED", "READ"].includes(body.receiptStatus ?? "")) return fail("RECIBO INVÁLIDO.", 400);
      const { data: message, error: lookupError } = await admin.from("xpace_message_outbox")
        .select("id,kind,appointment_id,status,delivered_at,read_at")
        .eq("tenant_company_id", connector.tenant_company_id).eq("connector_id", connector.id)
        .eq("provider_message_id", providerMessageId).in("status", ["SENT", "UNKNOWN"])
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (lookupError) throw lookupError;
      if (!message) return NextResponse.json({ success: true, recorded: false }, { headers });
      const deliveredAt = message.delivered_at ?? now;
      const readAt = body.receiptStatus === "READ" ? (message.read_at ?? now) : message.read_at;
      const { error: receiptError } = await admin.from("xpace_message_outbox").update({
        delivered_at: deliveredAt, read_at: readAt, status: "SENT", error_message: null, updated_at: now,
      }).eq("id", message.id).eq("tenant_company_id", connector.tenant_company_id).eq("connector_id", connector.id);
      if (receiptError) throw receiptError;
      if (message.kind === "VIDEO_BOAS_VINDAS" && message.appointment_id) {
        const { error: videoError } = await admin.from("xpace_lead_appointments")
          .update({ welcome_delivery_status: "ENVIADO", welcome_delivered_at: deliveredAt })
          .eq("id", message.appointment_id).eq("tenant_company_id", connector.tenant_company_id);
        if (videoError) console.error("XPACE VIDEO RECEIPT ERROR", videoError);
      }
      if (message.kind === "PESQUISA_SATISFACAO" && message.appointment_id) {
        const { error: surveyError } = await admin.from("xpace_lead_appointments")
          .update({ survey_status: "ENVIADA", updated_at: now })
          .eq("id", message.appointment_id).eq("tenant_company_id", connector.tenant_company_id);
        if (surveyError) throw surveyError;
      }
      return NextResponse.json({ success: true, recorded: true }, { headers });
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
          .update({ welcome_delivery_status: body.success ? "ENVIADO" : "FALHOU", welcome_delivered_at: null })
          .eq("id", data.appointment_id).eq("tenant_company_id", connector.tenant_company_id);
        if (videoError) console.error("XPACE VIDEO STATUS ERROR", videoError);
        if (body.success && data.lead_id) {
          const { error: activityError } = await admin.from("xpace_lead_activities").insert({ tenant_company_id: connector.tenant_company_id, lead_id: data.lead_id, appointment_id: data.appointment_id, activity_type: "VIDEO_ENVIADO", body: "VÍDEO PROCESSADO PELO CONECTOR; ENTREGA NO WHATSAPP AINDA NÃO CONFIRMADA.", payload: { messageId: data.id } });
          if (activityError) console.error("XPACE VIDEO ACTIVITY ERROR", activityError);
        }
      }
      if (data.kind === "PESQUISA_SATISFACAO" && data.appointment_id) {
        const { error: surveyError } = await admin.from("xpace_lead_appointments")
          .update({ survey_status: body.success ? "ENVIADA" : "NAO_ENVIADA", updated_at: now })
          .eq("id", data.appointment_id).eq("tenant_company_id", connector.tenant_company_id);
        if (surveyError) console.error("XPACE SATISFACTION STATUS ERROR", surveyError);
      }
      if (body.success && data.kind === "AVISO_PROFESSOR" && data.appointment_id && data.lead_id) {
        const { error: activityError } = await admin.from("xpace_lead_activities").insert({ tenant_company_id: connector.tenant_company_id, lead_id: data.lead_id, appointment_id: data.appointment_id, activity_type: "NOTA", body: "AVISO DA AULA AO PROFESSOR ACEITO PELO WHATSAPP; ENTREGA E LEITURA NÃO CONFIRMADAS.", payload: { messageId: data.id } });
        if (activityError) console.error("XPACE TEACHER NOTICE ACTIVITY ERROR", activityError);
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

function cloudinaryVideoUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || url.username || url.password) return null;
    if (!/^\/[^/]+\/video\/upload\/.+\.(mp4|mov)$/i.test(url.pathname)) return null;
    if (/\.mov$/i.test(url.pathname)) {
      url.pathname = url.pathname.replace("/video/upload/", "/video/upload/vc_h264:baseline:3.1/").replace(/\.mov$/i, ".mp4");
    }
    return url.toString();
  } catch { return null; }
}
