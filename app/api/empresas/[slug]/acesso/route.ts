import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const { company } = await requireCompanyAccess(request, slug);
    return NextResponse.json({ success: true, company: { id: company.id, slug: company.slug } });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    }
    console.error("COMPANY ACCESS CHECK ERROR", error);
    return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL VERIFICAR O ACESSO." }, { status: 500 });
  }
}
