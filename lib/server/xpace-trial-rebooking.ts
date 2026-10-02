import "server-only";

import type { createSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { RebookingTrial } from "@/lib/xpace/trial-rebooking";

export async function loadTrialHistory(admin: ReturnType<typeof createSupabaseAdmin>, companyId: string, leadId: string): Promise<RebookingTrial[]> {
  const history: RebookingTrial[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.from("xpace_lead_appointments")
      .select("id,scheduled_on,starts_at,ends_at,attendance_status,modality_name_snapshot")
      .eq("tenant_company_id", companyId).eq("lead_id", leadId).neq("attendance_status", "CANCELADO")
      .order("id").range(offset, offset + 999);
    if (error) throw error;
    history.push(...(data ?? []));
    if (!data || data.length < 1000) return history;
  }
}

export function trialRescheduleError(error: unknown): string | null {
  const value = error as { message?: string; code?: string } | null;
  if (value?.message?.includes("XPACE_TRIAL_IDENTITY_AMBIGUOUS")) return "NÃO FOI POSSÍVEL IDENTIFICAR O CADASTRO COM SEGURANÇA. CONFIRA NOME, TELEFONE E E-MAIL OU FALE COM A EQUIPE XPACE.";
  if (value?.message?.includes("XPACE_TRIAL_RESCHEDULE_") || value?.message?.includes("xpace_trial_reschedule_source_")) return "REAGENDAMENTO EXIGE UMA FALTA ANTERIOR DA MESMA PESSOA E MODALIDADE, SEM OUTRA AULA PENDENTE. ATUALIZE A AGENDA OU FALE COM A EQUIPE XPACE.";
  return null;
}
