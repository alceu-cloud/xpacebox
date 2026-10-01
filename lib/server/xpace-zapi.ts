import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/server/supabase-admin";
import { decryptIntegrationCredential } from "@/lib/server/telephony-credentials";
import { canonicalZapiPhone, createZapiClient, isZapiLid, ZapiError, type ZapiCredentials } from "@/lib/server/zapi-client";
import { processMessageWorker } from "@/lib/server/xpace-message-worker";

type Admin = ReturnType<typeof createSupabaseAdmin>;
export type CloudConnection = {
  connector_id: string; tenant_company_id: string; instance_id: string; enabled: boolean; paused: boolean;
  credential_ciphertext: string; credential_iv: string; credential_auth_tag: string;
  webhook_secret_hash: string; connected: boolean; last_checked_at: string | null; last_error: string | null;
  config_version: string;
};
export function cloudCredentials(connection: CloudConnection) {
  return JSON.parse(decryptIntegrationCredential({ ciphertext: connection.credential_ciphertext, iv: connection.credential_iv, authTag: connection.credential_auth_tag })) as ZapiCredentials & { webhookSecret: string };
}
export const recipientHash = (phone: string) => createHash("sha256").update(isZapiLid(phone) ? `LID:${phone}` : canonicalZapiPhone(phone)).digest("hex");

async function reconcileVerifiedLids(admin: Admin, connection: CloudConnection) {
  const { data: attempts, error } = await admin.from("xpace_zapi_attempts")
    .select("message_id,aliases,started_at,xpace_message_outbox!inner(destination_phone,tenant_company_id,status)")
    .eq("connector_id", connection.connector_id).is("recipient_lid_hash", null)
    .eq("xpace_message_outbox.tenant_company_id", connection.tenant_company_id)
    .in("xpace_message_outbox.status", ["SENT", "UNKNOWN", "FAILED"])
    .gte("started_at", new Date(Date.now() - 3 * 86_400_000).toISOString()).order("started_at", { ascending: false }).limit(3);
  if (error) throw new Error("ZAPI_LID_LOOKUP_FAILED");
  for (const attempt of attempts ?? []) {
    const message = attempt.xpace_message_outbox as unknown as { destination_phone: string; tenant_company_id: string };
    if (!attempt.aliases?.length || !message?.destination_phone || message.tenant_company_id !== connection.tenant_company_id) continue;
    const { data: pending, error: eventError } = await admin.from("xpace_zapi_events").select("recipient_hash")
      .eq("connector_id", connection.connector_id).in("provider_id", attempt.aliases)
      .gte("occurred_at", attempt.started_at).neq("recipient_hash", recipientHash(message.destination_phone)).limit(1);
    if (eventError) throw new Error("ZAPI_LID_EVENTS_LOOKUP_FAILED");
    if (!pending?.length) continue;
    // One read-only provider lookup per reconciliation. An opaque LID is never stripped into a phone.
    try {
      const lid = await createZapiClient(cloudCredentials(connection)).recipientLid(message.destination_phone);
      if (lid) {
        const { error: saveError } = await admin.from("xpace_zapi_attempts").update({ recipient_lid_hash: recipientHash(lid) })
          .eq("message_id", attempt.message_id).eq("connector_id", connection.connector_id).is("recipient_lid_hash", null);
        if (saveError) throw new Error("ZAPI_LID_BINDING_SAVE_FAILED");
      }
    } catch { console.error("ZAPI_LID_VERIFICATION_PENDING"); }
    break;
  }
}

export async function reconcileCloudEvents(admin: Admin, connection: Pick<CloudConnection, "connector_id" | "tenant_company_id">) {
  // A crashed request must not leave a paused isolated test permanently SENDING.
  // Never retry it: an ambiguous external POST may already have reached WhatsApp.
  const { error: staleError } = await admin.from("xpace_message_outbox")
    .update({ status: "UNKNOWN", error_message: "ENVIO SEM RESULTADO HÁ MAIS DE CINCO MINUTOS. CONFIRA A CONVERSA ANTES DE REENVIAR.", updated_at: new Date().toISOString() })
    .eq("connector_id", connection.connector_id).eq("tenant_company_id", connection.tenant_company_id)
    .eq("status", "SENDING").lt("claimed_at", new Date(Date.now() - 300_000).toISOString()).is("delivered_at", null).is("read_at", null);
  if (staleError) throw new Error("ZAPI_STALE_RESULT_SAVE_FAILED");
  if ("credential_ciphertext" in connection) await reconcileVerifiedLids(admin, connection as CloudConnection);
  const { error } = await admin.rpc("xpace_reconcile_zapi_events", { p_connector: connection.connector_id });
  if (error) throw new Error("ZAPI_RECEIPT_RECONCILIATION_FAILED");
}

export async function checkCloudConnection(admin: Admin, connection: CloudConnection) {
  let connected = false;
  let errorCode: string | null = null;
  try { connected = await createZapiClient(cloudCredentials(connection)).status(); if (!connected) errorCode = "ZAPI_DISCONNECTED"; }
  catch (error) { errorCode = error instanceof ZapiError ? error.code : "ZAPI_CONFIGURATION_ERROR"; }
  const now = new Date().toISOString();
  const { error } = await admin.from("xpace_zapi_connections").update({ connected, last_checked_at: now, last_error: errorCode, updated_at: now }).eq("connector_id", connection.connector_id).eq("tenant_company_id", connection.tenant_company_id);
  if (error) throw new Error("ZAPI_STATUS_SAVE_FAILED");
  return connected;
}

export async function sendCloudMessage(admin: Admin, connection: CloudConnection, message: { id: string; destination_phone: string; body: string; mediaUrl?: string | null }, reservedTest = false) {
  const connector = { id: connection.connector_id, tenant_company_id: connection.tenant_company_id, disconnect_requested: false };
  // Unique message_id is an idempotency barrier before any external POST. Never retry an ambiguous attempt.
  if (!reservedTest) {
    const { error: attemptError } = await admin.from("xpace_zapi_attempts").insert({ message_id: message.id, connector_id: connection.connector_id, config_version: connection.config_version });
    if (attemptError) throw new Error("ZAPI_ATTEMPT_ALREADY_EXISTS_OR_UNSAVED");
  }
  let accepted: Awaited<ReturnType<ReturnType<typeof createZapiClient>["send"]>>;
  try { accepted = await createZapiClient(cloudCredentials(connection)).send(message); }
  catch (error) {
    const code = error instanceof ZapiError ? error.code : "ZAPI_SEND_UNCONFIRMED";
    await admin.from("xpace_zapi_attempts").update({ error_code: code }).eq("message_id", message.id).eq("connector_id", connection.connector_id);
    const result = await processMessageWorker(admin, connector, { action: "RESULT", messageId: message.id, success: false, error: `${code}. VERIFIQUE A CONVERSA ANTES DE REENVIAR.` }, "ZAPI");
    if (!result.ok) throw new Error("ZAPI_RESULT_SAVE_FAILED");
    await reconcileCloudEvents(admin, connection);
    return { accepted: false, code };
  }
  const { error: aliasError } = await admin.from("xpace_zapi_attempts").update({ aliases: accepted.aliases, accepted_at: new Date().toISOString() }).eq("message_id", message.id).eq("connector_id", connection.connector_id);
  if (aliasError) throw new Error("ZAPI_ACCEPTANCE_SAVE_FAILED_NO_RETRY");
  const result = await processMessageWorker(admin, connector, { action: "RESULT", messageId: message.id, success: true, providerMessageId: accepted.messageId }, "ZAPI");
  if (!result.ok) throw new Error("ZAPI_RESULT_SAVE_FAILED_NO_RETRY");
  await reconcileCloudEvents(admin, connection);
  return { accepted: true, code: null };
}

export async function dispatchCloudQueue(admin: Admin, connection: CloudConnection) {
  const lease = randomUUID();
  const now = new Date().toISOString();
  const { data: locked, error } = await admin.from("xpace_zapi_connections")
    .update({ lease_id: lease, lease_until: new Date(Date.now() + 120_000).toISOString() })
    .eq("connector_id", connection.connector_id).eq("tenant_company_id", connection.tenant_company_id).eq("enabled", true).eq("paused", false)
    .or(`lease_until.is.null,lease_until.lt.${now}`).select("*").maybeSingle();
  if (error) throw new Error("ZAPI_LEASE_FAILED");
  if (!locked) return { processed: 0, skipped: true };
  connection = locked as CloudConnection;
  try {
    await reconcileCloudEvents(admin, connection);
    if (!await checkCloudConnection(admin, connection)) return { processed: 0, offline: true };
    const { data: connector, error: connectorError } = await admin.from("xpace_message_connectors").select("id,tenant_company_id,disconnect_requested").eq("id", connection.connector_id).eq("tenant_company_id", connection.tenant_company_id).single();
    if (connectorError || !connector) throw new Error("ZAPI_CONNECTOR_NOT_FOUND");
    const response = await processMessageWorker(admin, connector, { action: "CLAIM" }, "ZAPI");
    if (!response.ok) throw new Error("ZAPI_CLAIM_FAILED");
    const claim = await response.json() as { message: { id: string; destination_phone: string; body: string; mediaUrl: string | null } | null };
    if (!claim.message) return { processed: 0 };
    const result = await sendCloudMessage(admin, connection, claim.message);
    return { processed: 1, accepted: result.accepted, code: result.code };
  } finally {
    const { error: releaseError } = await admin.from("xpace_zapi_connections").update({ lease_id: null, lease_until: null }).eq("connector_id", connection.connector_id).eq("lease_id", lease);
    if (releaseError) console.error("ZAPI_LEASE_RELEASE_FAILED");
  }
}
