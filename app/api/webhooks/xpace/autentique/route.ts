import { createHmac, timingSafeEqual } from "crypto";

import { NextResponse } from "next/server";

import { ensureContractCharges, todayIso } from "@/lib/xpace/billing";
import { ensureContractEnrollment } from "@/lib/xpace/enrollment";
import { createSupabaseAdmin } from "@/lib/server/supabase-admin";

type WebhookEvent = { event?: { id?: string; type?: string; data?: Record<string, unknown> } };

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = process.env.AUTENTIQUE_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ success: false, message: "WEBHOOK NÃO CONFIGURADO." }, { status: 503 });
  const provided = (request.headers.get("x-autentique-signature") ?? "").replace(/^sha256=/i, "").trim();
  if (!provided || !validSignature(rawBody, secret, provided)) return NextResponse.json({ success: false, message: "ASSINATURA DO WEBHOOK INVÁLIDA." }, { status: 401 });

  let payload: WebhookEvent;
  try { payload = JSON.parse(rawBody) as WebhookEvent; } catch { return NextResponse.json({ success: false, message: "PAYLOAD JSON INVÁLIDO." }, { status: 400 }); }
  const eventId = payload.event?.id?.trim() ?? "";
  const eventType = payload.event?.type?.trim() ?? "";
  if (!eventId || !eventType) return NextResponse.json({ success: false, message: "EVENTO AUTENTIQUE INVÁLIDO." }, { status: 400 });

  const admin = createSupabaseAdmin();
  const data = objectPayload(payload.event?.data);
  const documentId = extractDocumentId(data);
  const { data: existing, error: existingError } = await admin.from("xpace_signature_webhook_events").select("id,processed_at").eq("provider", "AUTENTIQUE").eq("external_event_id", eventId).maybeSingle();
  if (existingError) return fail(existingError);
  if (existing?.processed_at) return NextResponse.json({ success: true, duplicate: true });
  const { data: sale, error: saleError } = documentId ? await admin.from("xpace_contract_sales").select("id,tenant_company_id,contract_id").eq("signature_provider", "AUTENTIQUE").eq("signature_envelope_id", documentId).maybeSingle() : { data: null, error: null };
  if (saleError) return fail(saleError);
  let eventRecord = existing;
  if (!eventRecord) {
    const { data: inserted, error: insertError } = await admin.from("xpace_signature_webhook_events").insert({ tenant_company_id: sale?.tenant_company_id ?? null, contract_sale_id: sale?.id ?? null, provider: "AUTENTIQUE", external_event_id: eventId, event_type: eventType, payload }).select("id,processed_at").single();
    if (insertError?.code === "23505") return NextResponse.json({ success: true, duplicate: true });
    if (insertError) return fail(insertError);
    eventRecord = inserted;
  }
  try {
    if (sale) await applySignatureEvent(admin, sale, eventType, data);
    const { error: doneError } = await admin.from("xpace_signature_webhook_events").update({ processed_at: new Date().toISOString(), processing_error: null, tenant_company_id: sale?.tenant_company_id ?? null, contract_sale_id: sale?.id ?? null }).eq("id", eventRecord.id);
    if (doneError) throw doneError;
    return NextResponse.json({ success: true });
  } catch (error) {
    await admin.from("xpace_signature_webhook_events").update({ processing_error: error instanceof Error ? error.message.slice(0, 500) : "ERRO DESCONHECIDO" }).eq("id", eventRecord.id);
    return fail(error);
  }
}

async function applySignatureEvent(admin: ReturnType<typeof createSupabaseAdmin>, sale: { id: string; tenant_company_id: string; contract_id: string }, eventType: string, data: Record<string, unknown>) {
  const now = new Date().toISOString();
  if (eventType === "document.finished") {
    const { data: contract, error: contractError } = await admin.from("xpace_student_contracts").select("id,student_id,class_group_id,starts_on,first_due_on,ends_on,billing_interval_snapshot,duration_months_snapshot,base_amount_cents,amount_cents,benefit_name_snapshot,discount_type_snapshot,discount_value_snapshot,enrollment_service_snapshot,renews_automatically,status,cancel_effective_on").eq("id", sale.contract_id).eq("tenant_company_id", sale.tenant_company_id).maybeSingle();
    if (contractError) throw contractError;
    if (!contract) throw new Error("CONTRATO NÃO ENCONTRADO PARA A ASSINATURA.");
    const nextStatus = contract.starts_on > todayIso() ? "AGENDADO" : "ATIVO";
    const { error: saleUpdateError } = await admin.from("xpace_contract_sales").update({ status: "CONCLUIDA", signature_status: "ASSINADA", signed_at: now, signed_document_url: nestedString(data, "files", "signed") || null, signature_error: null, updated_at: now }).eq("id", sale.id).eq("tenant_company_id", sale.tenant_company_id);
    if (saleUpdateError) throw saleUpdateError;
    const { error: contractUpdateError } = await admin.from("xpace_student_contracts").update({ status: nextStatus, status_note: null, updated_at: now }).eq("id", contract.id).eq("tenant_company_id", sale.tenant_company_id);
    if (contractUpdateError) throw contractUpdateError;
    const { error: eventError } = await admin.from("xpace_contract_events").insert({ tenant_company_id: sale.tenant_company_id, contract_id: contract.id, event_type: "ASSINATURA_CONCLUIDA", previous_status: contract.status, next_status: nextStatus, note: "CONTRATO ASSINADO VIA AUTENTIQUE.", created_by: null });
    if (eventError) throw eventError;
    await ensureContractCharges(admin, sale.tenant_company_id, { ...contract, status: nextStatus });
    if (nextStatus === "ATIVO") {
      const { data: classGroups, error: classGroupsError } = await admin.from("xpace_contract_class_groups").select("class_group_id").eq("tenant_company_id", sale.tenant_company_id).eq("contract_id", contract.id);
      if (classGroupsError) throw classGroupsError;
      const groupIds = (classGroups ?? []).map((group) => group.class_group_id).filter(Boolean);
      await Promise.all((groupIds.length ? groupIds : [contract.class_group_id]).map((classGroupId) => ensureContractEnrollment(admin, { tenant_company_id: sale.tenant_company_id, student_id: contract.student_id, class_group_id: classGroupId, starts_on: contract.starts_on })));
    }
    return;
  }
  if (eventType === "signature.rejected" || eventType === "signature.delivery_failed") {
    const reason = typeof data.reason === "string" && data.reason.trim() ? data.reason.trim().slice(0, 500) : eventType === "signature.rejected" ? "ASSINATURA RECUSADA PELO ALUNO." : "A AUTENTIQUE NÃO CONSEGUIU ENTREGAR A SOLICITAÇÃO DE ASSINATURA.";
    const { error: saleError } = await admin.from("xpace_contract_sales").update({ status: "ERRO", signature_status: eventType === "signature.rejected" ? "RECUSADA" : "ERRO", signature_error: reason, updated_at: now }).eq("id", sale.id).eq("tenant_company_id", sale.tenant_company_id);
    if (saleError) throw saleError;
    const { error: eventError } = await admin.from("xpace_contract_events").insert({ tenant_company_id: sale.tenant_company_id, contract_id: sale.contract_id, event_type: eventType === "signature.rejected" ? "ASSINATURA_RECUSADA" : "ASSINATURA_FALHOU", note: reason, created_by: null });
    if (eventError) throw eventError;
  }
}

function validSignature(payload: string, secret: string, provided: string) { const expected = createHmac("sha256", secret).update(payload).digest("hex"); const received = Buffer.from(provided, "hex"); const expectedBuffer = Buffer.from(expected, "hex"); return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer); }
function objectPayload(value: unknown) { return value && typeof value === "object" ? ((value as Record<string, unknown>).object && typeof (value as Record<string, unknown>).object === "object" ? (value as Record<string, unknown>).object as Record<string, unknown> : value as Record<string, unknown>) : {}; }
function extractDocumentId(data: Record<string, unknown>) { return typeof data.document === "string" ? data.document : typeof data.id === "string" ? data.id : ""; }
function nestedString(value: Record<string, unknown>, key: string, nested: string) { const object = value[key]; return object && typeof object === "object" && typeof (object as Record<string, unknown>)[nested] === "string" ? (object as Record<string, unknown>)[nested] as string : ""; }
function fail(error: unknown) { console.error("XPACE AUTENTIQUE WEBHOOK ERROR", error); return NextResponse.json({ success: false }, { status: 500 }); }
