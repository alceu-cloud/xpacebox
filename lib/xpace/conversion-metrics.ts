import { rate } from "./report-metrics";

export type ConversionLead = {
  id: string;
  full_name: string;
  mobile: string | null;
  pipeline_stage: string;
  linked_student_id: string | null;
  converted_person_id: string | null;
  assigned_to: string | null;
  loss_reason_id: string | null;
  loss_note: string | null;
};
export type ConversionTrial = {
  id: string;
  lead_id: string;
  scheduled_on: string;
  starts_at: string | null;
  class_name_snapshot: string | null;
  modality_name_snapshot: string | null;
  instructor_name_snapshot: string | null;
  actual_instructor_name_snapshot: string | null;
  attendance_status: string;
  enrollment_outcome: string;
  survey_status: string;
  whatsapp_opt_in: boolean | null;
  whatsapp_legacy_allowed_at: string | null;
};
export type ConversionActivity = {
  id: string;
  lead_id: string;
  appointment_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};
export type FollowUp = {
  action: string;
  dueOn: string;
  responsibleId: string;
  status: "PENDENTE" | "CONCLUIDA";
  result: string;
};
export type SurveyResponse = {
  response: "POSITIVA" | "NEUTRA" | "NEGATIVA" | "SEM_RESPOSTA";
  note: string;
  reviewed: boolean;
};
export function latestActivity<T>(
  activities: ConversionActivity[],
  kind: string,
  id: string,
): T | null {
  const rows = activities.filter(
    (a) =>
      a.payload.kind === kind &&
      (kind === "conversion_followup"
        ? a.lead_id === id
        : a.appointment_id === id),
  );
  rows.sort(
    (a, b) =>
      b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
  );
  return rows[0] ? (rows[0].payload as unknown as T) : null;
}
const personKey = (l: ConversionLead) =>
  l.linked_student_id || l.converted_person_id
    ? `person:${l.linked_student_id || l.converted_person_id}`
    : `lead:${l.id}`;
export function daysSince(on: string, today: string) {
  return Math.max(
    0,
    Math.floor(
      (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${on}T12:00:00Z`)) /
        86400000,
    ),
  );
}

export function buildConversionOverview(
  leads: ConversionLead[],
  trials: ConversionTrial[],
  activities: ConversionActivity[],
  reasons: Array<{ id: string; name: string }>,
  from: string,
  to: string,
  today: string,
) {
  const activeTrials = trials.filter(
    (t) => t.attendance_status !== "CANCELADO",
  );
  const selected = activeTrials.filter(
    (t) => t.scheduled_on >= from && t.scheduled_on <= to,
  );
  const selectedIds = new Set(selected.map((t) => t.lead_id));
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const people = new Map<string, ConversionLead[]>();
  for (const lead of leads) {
    const key = personKey(lead);
    people.set(key, [...(people.get(key) ?? []), lead]);
  }
  const historyByPerson = new Map<string, ConversionTrial[]>();
  for (const trial of activeTrials) {
    const lead = leadById.get(trial.lead_id);
    if (!lead) continue;
    const key = personKey(lead);
    const bucket = historyByPerson.get(key) ?? [];
    bucket.push(trial);
    historyByPerson.set(key, bucket);
  }
  const followUpsByPerson = new Map<string, ConversionActivity>();
  const surveysByAppointment = new Map<string, ConversionActivity>();
  for (const event of activities) {
    const lead = leadById.get(event.lead_id);
    if (!lead) continue;
    const map =
      event.payload.kind === "conversion_followup"
        ? followUpsByPerson
        : event.payload.kind === "conversion_survey"
          ? surveysByAppointment
          : null;
    const key =
      event.payload.kind === "conversion_followup"
        ? personKey(lead)
        : event.appointment_id;
    if (!map || !key) continue;
    const previous = map.get(key);
    if (
      !previous ||
      event.created_at > previous.created_at ||
      (event.created_at === previous.created_at && event.id > previous.id)
    )
      map.set(key, event);
  }
  const selectedKeys = new Set(
    leads.filter((l) => selectedIds.has(l.id)).map(personKey),
  );
  const prospects = [...selectedKeys].filter(
    (key) => !people.get(key)!.some((l) => l.linked_student_id),
  );
  const historyFor = (members: ConversionLead[]) =>
    historyByPerson.get(personKey(members[0])) ?? [];
  const hasAttendance = (members: ConversionLead[]) =>
    historyFor(members).some(
      (t) =>
        selectedIds.has(t.lead_id) &&
        t.scheduled_on >= from &&
        t.scheduled_on <= to &&
        t.attendance_status === "COMPARECEU",
    );
  const hasEnrollment = (members: ConversionLead[]) =>
    historyFor(members).some((t) => t.enrollment_outcome === "MATRICULOU");
  const attended = prospects.filter((key) => hasAttendance(people.get(key)!));
  const enrolled = prospects.filter((key) => hasEnrollment(people.get(key)!));
  const attendedEnrolled = attended.filter((key) =>
    hasEnrollment(people.get(key)!),
  );
  const won = prospects.filter((key) =>
    people.get(key)!.some((l) => l.pipeline_stage === "GANHO"),
  );
  const mismatches = prospects.filter(
    (key) =>
      hasEnrollment(people.get(key)!) !==
      people.get(key)!.some((l) => l.pipeline_stage === "GANHO"),
  ).length;
  const queue = attended
    .filter(
      (key) =>
        !hasEnrollment(people.get(key)!) &&
        !people.get(key)!.every((l) => l.pipeline_stage === "PERDIDO"),
    )
    .map((key) => {
      const members = people.get(key)!;
      const visits = historyFor(members)
        .filter((t) => t.attendance_status === "COMPARECEU")
        .sort(
          (a, b) =>
            b.scheduled_on.localeCompare(a.scheduled_on) ||
            (b.starts_at ?? "").localeCompare(a.starts_at ?? ""),
        );
      const last = visits[0];
      const lead = leadById.get(last.lead_id)!;
      const followUp =
        (followUpsByPerson.get(key)?.payload as unknown as FollowUp) ?? null;
      return {
        leadId: lead.id,
        name: lead.full_name,
        phone: lead.mobile,
        assignedTo: lead.assigned_to,
        stage: lead.pipeline_stage,
        lastTrial: last,
        days: daysSince(last.scheduled_on, today),
        visits: visits.length,
        followUp,
        overdue: followUp?.status === "PENDENTE" && followUp.dueOn < today,
        needsAction: !followUp || followUp.status === "CONCLUIDA",
      };
    })
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        Number(b.needsAction) - Number(a.needsAction) ||
        b.days - a.days ||
        a.name.localeCompare(b.name, "pt-BR"),
    );
  const reasonNames = new Map(reasons.map((r) => [r.id, r.name]));
  const lossCounts = new Map<string, number>();
  for (const key of prospects) {
    const members = people.get(key)!;
    if (!members.every((l) => l.pipeline_stage === "PERDIDO")) continue;
    const lead = members.find((l) => selectedIds.has(l.id)) ?? members[0];
    const name =
      (lead.loss_reason_id && reasonNames.get(lead.loss_reason_id)) ||
      (lead.loss_note?.trim()
        ? "Só observação · classificar motivo"
        : "Não informado");
    lossCounts.set(name, (lossCounts.get(name) ?? 0) + 1);
  }
  const losses = [...lossCounts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"));
  const surveys = selected
    .filter((t) => t.attendance_status === "COMPARECEU")
    .map((trial) => {
      const lead = leadById.get(trial.lead_id);
      return {
        trial,
        name: lead?.full_name ?? "Lead não encontrado",
        response:
          (surveysByAppointment.get(trial.id)
            ?.payload as unknown as SurveyResponse) ?? null,
      };
    });
  const instructors = new Map<string, Map<string, ConversionTrial[]>>();
  for (const trial of selected.filter(
    (t) => t.attendance_status === "COMPARECEU",
  )) {
    const lead = leadById.get(trial.lead_id);
    if (!lead || lead.linked_student_id) continue;
    const teacher =
      trial.actual_instructor_name_snapshot ||
      trial.instructor_name_snapshot ||
      "Sem professor";
    const bucket =
      instructors.get(teacher) ?? new Map<string, ConversionTrial[]>();
    const key = personKey(lead);
    bucket.set(key, [...(bucket.get(key) ?? []), trial]);
    instructors.set(teacher, bucket);
  }
  const teachers = [...instructors]
    .map(([name, bucket]) => {
      const rows = [...bucket.values()];
      const converted = rows.filter((r) =>
        r.some((t) => t.enrollment_outcome === "MATRICULOU"),
      ).length;
      const known = rows.filter((r) =>
        r.some((t) =>
          ["MATRICULOU", "NAO_MATRICULOU"].includes(t.enrollment_outcome),
        ),
      ).length;
      return {
        name,
        attended: rows.length,
        converted,
        known,
        pending: rows.length - known,
        rate: rate(converted, known),
        sample:
          known < 5
            ? "Baixa · coletar dados"
            : known < 10
              ? "Média · acompanhar"
              : "Maior · acompanhar",
      };
    })
    .sort(
      (a, b) =>
        b.attended - a.attended || a.name.localeCompare(b.name, "pt-BR"),
    );
  return {
    funnel: {
      scheduled: prospects.length,
      attended: attended.length,
      enrolled: enrolled.length,
      attendedEnrolled: attendedEnrolled.length,
      won: won.length,
      mismatches,
      existingClients: selectedKeys.size - prospects.length,
      attendanceRate: rate(attended.length, prospects.length),
      attendedConversionRate: rate(attendedEnrolled.length, attended.length),
      generalConversionRate: rate(enrolled.length, prospects.length),
    },
    queue,
    losses,
    teachers,
    surveys,
    surveyTotals: {
      eligible: surveys.length,
      sent: surveys.filter((s) => s.trial.survey_status === "ENVIADA").length,
      responded: surveys.filter(
        (s) => s.response && s.response.response !== "SEM_RESPOSTA",
      ).length,
      negative: surveys.filter(
        (s) => s.response?.response === "NEGATIVA" && !s.response.reviewed,
      ).length,
    },
  };
}
export type ConversionOverview = ReturnType<typeof buildConversionOverview>;
