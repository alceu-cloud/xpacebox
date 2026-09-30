import { NextResponse } from "next/server";

import { inspectSampleEmailCredentials, sendScheduledSampleOverdueEmails } from "@/lib/server/daily-agenda-email";
import { recordCronResult } from "@/lib/server/automation-issues";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, message: "NAO AUTORIZADO." }, { status: 401 });
  }

  try {
    if (new URL(request.url).searchParams.get("diagnostics") === "credentials") return NextResponse.json({ success: true, diagnostics: await inspectSampleEmailCredentials() });
    const result = await sendScheduledSampleOverdueEmails();
    await recordCronResult("dawos", "sample-overdue-email", false, "EMAIL", "Rotina de avisos de amostras interrompida");
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("SAMPLE OVERDUE EMAIL CRON ERROR", error);
    await recordCronResult("dawos", "sample-overdue-email", true, "EMAIL", "Rotina de avisos de amostras interrompida");
    const message = error instanceof Error ? error.message : "NAO FOI POSSIVEL ENVIAR OS ALERTAS DE AMOSTRAS ATRASADAS.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
