import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

function failure(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

export async function GET(request: Request, { params }: { params: Promise<{ callId: string }> }) {
  try {
    const slug = new URL(request.url).searchParams.get("slug")?.trim() || "";
    const { callId } = await params;
    if (!slug || !callId) return failure("CHAMADA NAO INFORMADA.", 400);

    const { admin, company, profile } = await requireCompanyAccess(request, slug);
    const { data: call, error } = await admin
      .from("telephony_call_events")
      .select("representative_profile_id,audio_url")
      .eq("id", callId)
      .eq("tenant_company_id", company.id)
      .maybeSingle();
    if (error) throw error;
    if (!call?.audio_url) return failure("AUDIO INDISPONIVEL PARA ESTA CHAMADA.", 404);

    const isManager = ["platform_owner", "company_manager"].includes(profile.platform_role);
    if (!isManager && call.representative_profile_id !== profile.id) {
      throw new AccessError("SEM PERMISSAO PARA OUVIR ESTA CHAMADA.", 403);
    }

    const range = request.headers.get("range");
    const audioResponse = await fetch(call.audio_url, { headers: range ? { Range: range } : undefined });
    if (!audioResponse.ok && audioResponse.status !== 206) {
      return failure("NAO FOI POSSIVEL OBTER O AUDIO NO METRICX.", 502);
    }

    const headers = new Headers();
    for (const name of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const value = audioResponse.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set("cache-control", "private, max-age=300");
    return new Response(audioResponse.body, { status: audioResponse.status, headers });
  } catch (error) {
    if (error instanceof AccessError) return failure(error.message, error.status);
    console.error("METRICX AUDIO PROXY ERROR", error);
    return failure("NAO FOI POSSIVEL CARREGAR O AUDIO DA CHAMADA.", 500);
  }
}
