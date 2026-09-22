import { createHash } from "node:crypto";
import webPush from "web-push";

import { createSupabaseAdmin } from "@/lib/server/supabase-admin";

export function pushConfiguration() {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT;
  if (process.env.WEB_PUSH_ENABLED !== "true" || !publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export function endpointHash(endpoint: string) {
  return createHash("sha256").update(endpoint).digest("hex");
}

// This release targets iPhone Home Screen apps. Reject arbitrary URLs so an
// authenticated user cannot turn our server into an outbound HTTP proxy.
export function validApplePushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".push.apple.com") && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

export async function sendNewAppointmentPush(companyId: string, appointmentId: string, scheduledOn: string) {
  const config = pushConfiguration();
  if (!config) return;
  try {
    const admin = createSupabaseAdmin();
    const [{ data: subscriptions, error }, { data: members, error: membersError }] = await Promise.all([
      admin.from("xpace_web_push_subscriptions").select("id,profile_id,endpoint,p256dh,auth_secret").eq("tenant_company_id", companyId).limit(200),
      admin.from("company_members").select("profile_id").eq("company_id", companyId).eq("active", true),
    ]);
    if (error || membersError) throw error ?? membersError;
    if (!subscriptions?.length) return;
    const memberIds = new Set((members ?? []).map((member) => member.profile_id));
    const profileIds = [...new Set(subscriptions.map((item) => item.profile_id))];
    const { data: profiles, error: profilesError } = await admin.from("profiles").select("id,active,platform_role").in("id", profileIds);
    if (profilesError) throw profilesError;
    const eligibleIds = new Set((profiles ?? []).filter((profile) => profile.active && (profile.platform_role === "platform_owner" || memberIds.has(profile.id))).map((profile) => profile.id));
    webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    const payload = JSON.stringify({
      title: "Nova aula experimental",
      body: "Uma aula experimental foi agendada. Abra a agenda para ver os detalhes.",
      tag: `xpace-booking-${appointmentId}`,
      url: `/xpace/app?tab=agenda&date=${encodeURIComponent(scheduledOn)}`,
    });
    await Promise.allSettled(subscriptions.filter((item) => eligibleIds.has(item.profile_id) && validApplePushEndpoint(item.endpoint)).map(async (item) => {
      try {
        await webPush.sendNotification({ endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth_secret } }, payload, { TTL: 600, timeout: 8000, urgency: "normal" });
      } catch (cause) {
        const status = (cause as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from("xpace_web_push_subscriptions").delete().eq("id", item.id).eq("tenant_company_id", companyId);
        } else {
          console.error("XPACE WEB PUSH DELIVERY FAILED", { status: status ?? "network" });
        }
      }
    }));
  } catch (cause) {
    // A notification can never roll back an already confirmed booking.
    console.error("XPACE WEB PUSH FAILED", cause);
  }
}
