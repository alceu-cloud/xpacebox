import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

export async function POST(request: Request, context: { params: Promise<{ sampleId: string }> }) {
  try {
    const body = (await request.json()) as { slug?: string };
    const slug = body.slug?.trim() ?? "";
    const { sampleId } = await context.params;
    if (!slug || !sampleId) return failure("AMOSTRA NAO INFORMADA.", 400);

    const { admin, company, profile } = await requireCompanyAccess(request, slug);
    const { data: sample, error: sampleError } = await admin
      .from("client_samples")
      .select("id,responsible_profile_id,closed_at")
      .eq("id", sampleId)
      .eq("tenant_company_id", company.id)
      .maybeSingle();
    if (sampleError) throw sampleError;
    if (!sample) return failure("AMOSTRA NAO ENCONTRADA.", 404);

    const isManager = ["platform_owner", "company_manager"].includes(profile.platform_role);
    if (!isManager && sample.responsible_profile_id && sample.responsible_profile_id !== profile.id) {
      return failure("VOCE NAO PODE BAIXAR ESTA AMOSTRA.", 403);
    }

    const closedAt = String(sample.closed_at || saoPauloDate());
    if (!sample.closed_at) {
      const { error } = await admin
        .from("client_samples")
        .update({ closed_at: closedAt, updated_at: new Date().toISOString() })
        .eq("id", sample.id)
        .eq("tenant_company_id", company.id);
      if (error) throw error;
    }

    return NextResponse.json({ success: true, closedAt });
  } catch (error) {
    if (error instanceof AccessError) return failure(error.message, error.status);
    console.error("SAMPLE CLOSURE API ERROR", error);
    return failure("NAO FOI POSSIVEL DAR BAIXA NA AMOSTRA.", 500);
  }
}

function saoPauloDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function failure(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}
