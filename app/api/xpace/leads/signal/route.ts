import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await requireCompanyAccess(request, "xpace");
    const { data, error } = await access.admin.from("xpace_leads")
      .select("id,created_at")
      .eq("tenant_company_id", access.company.id)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .limit(1).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ success: true, latest: data ? { id: data.id, createdAt: data.created_at } : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    console.error("XPACE LEAD SIGNAL ERROR", error);
    return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL CONSULTAR NOVOS LEADS." }, { status: 500 });
  }
}
