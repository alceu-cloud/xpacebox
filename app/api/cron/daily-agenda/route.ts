import { NextResponse } from "next/server";

import { sendScheduledAgendaEmails } from "@/lib/server/daily-agenda-email";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, message: "NAO AUTORIZADO." }, { status: 401 });
  }

  try {
    const result = await sendScheduledAgendaEmails();
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("DAILY AGENDA CRON ERROR", error);
    const message = error instanceof Error ? error.message : "NAO FOI POSSIVEL ENVIAR A AGENDA DIARIA.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
