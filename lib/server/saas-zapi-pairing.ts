import "server-only";
import { validateZapiCredentials, type ZapiCredentials, ZapiError } from "@/lib/server/zapi-client";

// Request is server-only, read-only and opt-in; no reset/reconnect/received callback change.
export async function pairingImage(credentials: ZapiCredentials, fetcher: typeof fetch = fetch) {
  validateZapiCredentials(credentials);
  let response: Response;
  try {
    response = await fetcher(`https://api.z-api.io/instances/${credentials.instanceId}/token/${credentials.instanceToken}/qr-code/image`, {
      method: "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12_000), headers: { "Client-Token": credentials.clientToken },
    });
  } catch { throw new ZapiError("ZAPI_PAIRING_UNAVAILABLE"); }
  if (!response.ok) throw new ZapiError("ZAPI_PAIRING_UNAVAILABLE");
  const payload = await response.json().catch(() => null);
  if (payload?.challenge) throw new ZapiError("ZAPI_PAIRING_CHALLENGE_REQUIRED");
  const image = typeof payload === "string" ? payload : payload?.value;
  if (typeof image !== "string" || image.length > 2_000_000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(image)) throw new ZapiError("ZAPI_PAIRING_IMAGE_INVALID");
  const bytes = Buffer.from(image.split(",")[1], "base64");
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new ZapiError("ZAPI_PAIRING_IMAGE_INVALID");
  return image;
}
