import { NextResponse } from "next/server";
import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

export async function GET(request: Request, context: { params: Promise<{ sampleId: string }> }) {
  try {
    const slug = new URL(request.url).searchParams.get("slug") || "";
    if (!slug) return NextResponse.json({ success: false, message: "EMPRESA NAO INFORMADA." }, { status: 400 });
    const { sampleId } = await context.params;
    const { admin, company } = await requireCompanyAccess(request, slug);
    const { data: sample, error: sampleError } = await admin.from("client_samples").select("id").eq("id", sampleId).eq("tenant_company_id", company.id).maybeSingle();
    if (sampleError) throw sampleError;
    if (!sample) return NextResponse.json({ success: false, message: "AMOSTRA NAO ENCONTRADA." }, { status: 404 });
    const { data, error } = await admin.from("sample_deadline_events")
      .select("id,stage,action,old_due_date,new_due_date,actual_date,reason,changed_by_name,created_at")
      .eq("sample_id", sampleId).eq("tenant_company_id", company.id).order("created_at");
    if (error) throw error;
    return NextResponse.json({ success: true, events: (data || []).map(row => ({
      id: row.id, stage: row.stage, action: row.action, oldDueDate: row.old_due_date || "",
      newDueDate: row.new_due_date || "", actualDate: row.actual_date || "", reason: row.reason || "",
      changedByName: row.changed_by_name || "SISTEMA", createdAt: row.created_at,
    })) });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    console.error("SAMPLE HISTORY API ERROR", error);
    return NextResponse.json({ success: false, message: "NAO FOI POSSIVEL LER O HISTORICO." }, { status: 500 });
  }
}
