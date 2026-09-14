import { NextResponse } from "next/server";

import { sendScheduledSampleOverdueEmails } from "@/lib/server/daily-agenda-email";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, message: "NAO AUTORIZADO." }, { status: 401 });
  }

  try {
    return NextResponse.json({ success: true, result: await sendScheduledSampleOverdueEmails() });
  } catch (error) {
    console.error("SAMPLE OVERDUE EMAIL CRON ERROR", error);
    const message = error instanceof Error ? error.message : "NAO FOI POSSIVEL ENVIAR OS ALERTAS DE AMOSTRAS ATRASADAS.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
