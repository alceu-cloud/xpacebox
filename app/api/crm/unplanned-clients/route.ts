import { NextResponse } from "next/server";

import { isPendingCrmAgenda } from "@/lib/crm-agenda";
import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const pageSize = 500;

export async function GET(request: Request) {
  try {
    const { admin, company, profile } = await requireCompanyAccess(request, "dawos");
    const activities: Array<{ id: string; client_id: string | null; opportunity_id: string | null; agenda_kind: string | null; next_action_at: string | null }> = [];
    const blockedClientIds = new Set<string>();

    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await admin.from("crm_activities")
        .select("id,client_id,opportunity_id,agenda_kind,next_action_at")
        .eq("tenant_company_id", company.id)
        .not("next_action_at", "is", null)
        .order("id").range(offset, offset + pageSize - 1);
      if (error) throw error;
      activities.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
    }

    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await admin.from("crm_customer_profiles")
        .select("client_id")
        .eq("tenant_company_id", company.id)
        .eq("relationship_status", "BLOCKED")
        .order("client_id").range(offset, offset + pageSize - 1);
      if (error) throw error;
      for (const row of data ?? []) blockedClientIds.add(row.client_id);
      if (!data || data.length < pageSize) break;
    }

    const opportunityIds = [...new Set(activities.map((activity) => activity.opportunity_id).filter((id): id is string => Boolean(id)))];
    const stages = new Map<string, string>();
    for (let start = 0; start < opportunityIds.length; start += 80) {
      const { data, error } = await admin.from("crm_opportunities")
        .select("id,stage")
        .eq("tenant_company_id", company.id)
        .in("id", opportunityIds.slice(start, start + 80));
      if (error) throw error;
      for (const opportunity of data ?? []) stages.set(opportunity.id, opportunity.stage);
    }

    const scheduledClientIds = new Set<string>();
    for (const activity of activities) {
      if (!activity.client_id) continue;
      if (isPendingCrmAgenda({ nextActionAt: activity.next_action_at, opportunityId: activity.opportunity_id, agendaKind: activity.agenda_kind }, stages)) {
        scheduledClientIds.add(activity.client_id);
      }
    }

    return NextResponse.json({ success: true, profileId: profile.id, scheduledClientIds: [...scheduledClientIds], blockedClientIds: [...blockedClientIds] });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    console.error("DAWOS UNPLANNED CLIENTS ERROR", error);
    return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL CONFERIR A AGENDA DOS CLIENTES." }, { status: 500 });
  }
}
