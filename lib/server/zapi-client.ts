// No credentials, request URLs, recipient or message content may be logged by callers.
export type ZapiCredentials = { instanceId: string; instanceToken: string; clientToken: string };
export type ZapiEvent = { ids: string[]; phone: string; state: "ACCEPTED" | "DELIVERED" | "READ" | "ERROR"; occurredAt: string; errorCode: string | null };
export class ZapiError extends Error {
  constructor(public code: string, public ambiguous = false) { super(code); }
}
// PN only: never turn an opaque @lid identifier into a telephone number.
export function canonicalZapiPhone(phone: string) {
  if (!/^\d{12,15}$/.test(phone)) throw new ZapiError("ZAPI_PHONE_INVALID");
  // Brazilian mobile PNs may omit the ninth digit in callbacks. Keep landlines distinct.
  return /^55\d{2}9[6-9]\d{7}$/.test(phone) ? phone.slice(0, 4) + phone.slice(5) : phone;
}
export function validateZapiCredentials(value: ZapiCredentials) {
  if (![value.instanceId, value.instanceToken, value.clientToken].every(item => typeof item === "string" && /^[A-Za-z0-9_-]{16,200}$/.test(item))) throw new ZapiError("ZAPI_CREDENTIALS_INVALID");
  return value;
}
export function createZapiClient(credentials: ZapiCredentials, fetcher: typeof fetch = fetch) {
  validateZapiCredentials(credentials);
  async function call(endpoint: "status" | "send-text" | "send-video", body?: object) {
    let response: Response;
    try {
      response = await fetcher(`https://api.z-api.io/instances/${credentials.instanceId}/token/${credentials.instanceToken}/${endpoint}`, {
        method: body ? "POST" : "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12_000),
        headers: { "Client-Token": credentials.clientToken, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw new ZapiError("ZAPI_NETWORK_OR_TIMEOUT", Boolean(body)); }
    if (!response.ok) throw new ZapiError(`ZAPI_HTTP_${response.status}`, Boolean(body));
    try { return await response.json() as Record<string, unknown>; }
    catch { throw new ZapiError("ZAPI_INVALID_RESPONSE", Boolean(body)); }
  }
  return {
    async status() { const result = await call("status"); return result.connected === true; },
    async send(message: { destination_phone: string; body: string; mediaUrl?: string | null }) {
      if (!/^\d{12,15}$/.test(message.destination_phone) || !message.body || message.body.length > 2000) throw new ZapiError("ZAPI_MESSAGE_INVALID");
      if (message.mediaUrl) {
        const url = new URL(message.mediaUrl);
        if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || url.username || url.password || !/^\/[^/]+\/video\/upload\/.+\.mp4$/i.test(url.pathname)) throw new ZapiError("ZAPI_MEDIA_INVALID");
      }
      const result = await call(message.mediaUrl ? "send-video" : "send-text", message.mediaUrl
        ? { phone: message.destination_phone, video: message.mediaUrl, caption: message.body, async: false, delayMessage: 15 }
        : { phone: message.destination_phone, message: message.body, delayMessage: 15 });
      // A returned ID only proves provider acceptance, not delivery to the phone.
      const messageId = result.messageId ?? result.id;
      if (typeof messageId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(messageId) || result.error) throw new ZapiError("ZAPI_NO_CONFIRMATION", true);
      const aliases = [...new Set([messageId, result.zaapId, result.id].filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(id)))];
      return { messageId, aliases };
    },
  };
}

export function parseZapiEvent(payload: Record<string, unknown>, instanceId: string, now = Date.now()): ZapiEvent | null {
  if (payload.instanceId !== instanceId || payload.isGroup === true || typeof payload.phone !== "string" || !/^\d{12,15}$/.test(payload.phone)) return null;
  let state: ZapiEvent["state"];
  let errorCode: string | null = null;
  if (payload.type === "MessageStatusCallback") {
    // READ_BY_ME is the school's own read event; it must never turn a customer card green.
    const mapped = ({ SENT: "ACCEPTED", RECEIVED: "DELIVERED", READ: "READ", PLAYED: "READ" } as const)[String(payload.status) as "SENT" | "RECEIVED" | "READ" | "PLAYED"];
    if (!mapped) return null;
    state = mapped;
  } else if (payload.type === "DeliveryCallback") {
    state = payload.error ? "ERROR" : "ACCEPTED";
    if (payload.error) errorCode = payload.errorCode === "SHADOW_BAN" ? "ZAPI_SHADOW_BAN" : "ZAPI_ASYNC_SEND_ERROR";
  } else return null;
  const candidates = Array.isArray(payload.ids) ? payload.ids : [payload.messageId, payload.zaapId];
  const ids = [...new Set(candidates.filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(id)))].slice(0, 100);
  const moment = Number(payload.momment);
  if (!ids.length || !Number.isFinite(moment) || moment < 1_500_000_000_000 || moment > now + 300_000) return null;
  return { ids, phone: payload.phone, state, occurredAt: new Date(moment).toISOString(), errorCode };
}
