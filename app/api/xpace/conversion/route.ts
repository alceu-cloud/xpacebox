import { NextResponse } from "next/server";
import {
  AccessError,
  requireCompanyAccess,
  requireCompanyProfile,
} from "@/lib/server/company-access";
import { dateInSaoPaulo, validDay } from "@/lib/xpace/dashboard-metrics";
import {
  buildConversionOverview,
  type ConversionLead,
  type ConversionTrial,
  type ConversionActivity,
} from "@/lib/xpace/conversion-metrics";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const uuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
type Access = Awaited<ReturnType<typeof requireCompanyAccess>>;
async function load<T>(
  access: Access,
  table: string,
  columns: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = access.admin
      .from(table)
      .select(columns)
      .eq("tenant_company_id", access.company.id);
    if (table === "xpace_lead_activities")
      query = query.in("payload->>kind", [
        "conversion_followup",
        "conversion_survey",
      ]);
    const { data, error } = await query.order("id").range(offset, offset + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}
async function attendants(access: Access) {
  const { data, error } = await access.admin
    .from("company_members")
    .select("profile_id")
    .eq("company_id", access.company.id)
    .eq("active", true);
  if (error) throw error;
  const ids = [
    ...new Set([access.profile.id, ...(data ?? []).map((m) => m.profile_id)]),
  ];
  const { data: profiles, error: profileError } = await access.admin
    .from("profiles")
    .select("id,full_name")
    .in("id", ids)
    .eq("active", true);
  if (profileError) throw profileError;
  return profiles ?? [];
}
export async function GET(request: Request) {
  try {
    const access = await requireCompanyAccess(request, "xpace");
    const params = new URL(request.url).searchParams;
    const today = dateInSaoPaulo(new Date().toISOString());
    const from = params.get("from") ?? `${today.slice(0, 7)}-01`;
    const to = params.get("to") ?? today;
    if (
      !validDay(from) ||
      !validDay(to) ||
      from > to ||
      Number(to.slice(0, 4)) * 12 +
        Number(to.slice(5, 7)) -
        Number(from.slice(0, 4)) * 12 -
        Number(from.slice(5, 7)) >
        23
    )
      throw new AccessError("Escolha um período válido de até 24 meses.", 400);
    const [leads, trials, activities, reasons, team] = await Promise.all([
      load<ConversionLead>(
        access,
        "xpace_leads",
        "id,full_name,mobile,pipeline_stage,linked_student_id,converted_person_id,assigned_to,loss_reason_id,loss_note",
      ),
      load<ConversionTrial>(
        access,
        "xpace_lead_appointments",
        "id,lead_id,scheduled_on,starts_at,class_name_snapshot,modality_name_snapshot,instructor_name_snapshot,actual_instructor_name_snapshot,attendance_status,enrollment_outcome,survey_status,whatsapp_opt_in,whatsapp_legacy_allowed_at",
      ),
      load<ConversionActivity>(
        access,
        "xpace_lead_activities",
        "id,lead_id,appointment_id,payload,created_at",
      ),
      load<{ id: string; name: string }>(
        access,
        "xpace_lead_loss_reasons",
        "id,name",
      ),
      attendants(access),
    ]);
    return NextResponse.json(
      {
        success: true,
        from,
        to,
        today,
        overview: buildConversionOverview(
          leads,
          trials,
          activities,
          reasons,
          from,
          to,
          today,
        ),
        attendants: team,
      },
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const access = await requireCompanyAccess(request, "xpace");
    const raw = await request.json().catch(() => null);
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new AccessError("Dados inválidos.", 400);
    const leadId = clean(raw.leadId);
    if (!uuid(leadId)) throw new AccessError("Lead inválido.", 400);
    const { data: lead, error } = await access.admin
      .from("xpace_leads")
      .select("id")
      .eq("id", leadId)
      .eq("tenant_company_id", access.company.id)
      .maybeSingle();
    if (error) throw error;
    if (!lead) throw new AccessError("Lead não encontrado.", 404);
    let appointmentId: string | null = null;
    let payload: Record<string, unknown>;
    let body: string;
    if (raw.action === "SAVE_FOLLOWUP") {
      const action = clean(raw.nextAction),
        dueOn = clean(raw.dueOn),
        responsibleId = clean(raw.responsibleId),
        result = clean(raw.result);
      if (
        action.length < 3 ||
        action.length > 500 ||
        !validDay(dueOn) ||
        !uuid(responsibleId) ||
        !["PENDENTE", "CONCLUIDA"].includes(raw.status) ||
        result.length > 2000 ||
        (raw.status === "CONCLUIDA" && !result)
      )
        throw new AccessError(
          "Informe ação, data, responsável e o resultado ao concluir.",
          400,
        );
      await requireCompanyProfile(
        access.admin,
        access.company.id,
        responsibleId,
      );
      payload = {
        kind: "conversion_followup",
        action,
        dueOn,
        responsibleId,
        status: raw.status,
        result,
      };
      body = `ACOMPANHAMENTO: ${action} · ${dueOn} · ${raw.status}${result ? ` · ${result}` : ""}`;
    } else if (raw.action === "SAVE_SURVEY") {
      appointmentId = clean(raw.appointmentId);
      const note = clean(raw.note);
      if (
        !uuid(appointmentId) ||
        !["POSITIVA", "NEUTRA", "NEGATIVA", "SEM_RESPOSTA"].includes(
          raw.response,
        ) ||
        note.length > 2000 ||
        typeof raw.reviewed !== "boolean" ||
        (raw.response === "NEGATIVA" && note.length < 3) ||
        (raw.reviewed && note.length < 3)
      )
        throw new AccessError(
          "Informe uma resposta válida e descreva a avaliação negativa ou o atendimento realizado.",
          400,
        );
      const { data: trial, error: trialError } = await access.admin
        .from("xpace_lead_appointments")
        .select("id,attendance_status")
        .eq("id", appointmentId)
        .eq("lead_id", leadId)
        .eq("tenant_company_id", access.company.id)
        .maybeSingle();
      if (trialError) throw trialError;
      if (!trial)
        throw new AccessError("Aula não encontrada para este lead.", 404);
      if (trial.attendance_status !== "COMPARECEU")
        throw new AccessError(
          "Registre a presença antes de registrar a avaliação.",
          409,
        );
      payload = {
        kind: "conversion_survey",
        response: raw.response,
        note,
        reviewed: raw.response === "NEGATIVA" && raw.reviewed,
      };
      body = `PESQUISA: ${raw.response}${raw.reviewed ? " · ATENDIMENTO REGISTRADO" : ""}${note ? ` · ${note}` : ""}`;
    } else {
      throw new AccessError("Ação inválida.", 400);
    }
    const { error: insertError } = await access.admin
      .from("xpace_lead_activities")
      .insert({
        tenant_company_id: access.company.id,
        lead_id: leadId,
        appointment_id: appointmentId,
        activity_type: "CONTATO",
        body,
        payload,
        created_by: access.profile.id,
      });
    if (insertError) throw insertError;
    return NextResponse.json({ success: true }, { headers });
  } catch (error) {
    return failure(error);
  }
}
function failure(error: unknown) {
  if (error instanceof AccessError)
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status, headers },
    );
  console.error(
    "XPACE CONVERSION ERROR",
    error instanceof Error ? error.message : "Unexpected error",
  );
  return NextResponse.json(
    {
      success: false,
      message: "Não foi possível carregar ou salvar o acompanhamento.",
    },
    { status: 500, headers },
  );
}
