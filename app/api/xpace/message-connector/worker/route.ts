import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/server/supabase-admin";
import { processMessageWorker, type WorkerBody } from "@/lib/server/xpace-message-worker";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const rawToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const fail = (message: string, status: number) => NextResponse.json({ success: false, message }, { status, headers: { "Cache-Control": "no-store" } });
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(rawToken)) return fail("TOKEN INVÁLIDO.", 401);
  const admin = createSupabaseAdmin();
  const { data: connector, error } = await admin.from("xpace_message_connectors").select("id,tenant_company_id,disconnect_requested").eq("token_hash", createHash("sha256").update(rawToken).digest("hex")).maybeSingle();
  if (error || !connector) return fail("CONECTOR NÃO AUTORIZADO.", 401);
  let body: WorkerBody;
  try { body = await request.json() as WorkerBody; } catch { return fail("REQUISIÇÃO INVÁLIDA.", 400); }
  return processMessageWorker(admin, connector, body);
}
