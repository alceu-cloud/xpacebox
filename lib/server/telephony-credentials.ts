import "server-only";

import { createCipheriv, createHash, randomBytes } from "crypto";

function encryptionKey() {
  const value = process.env.BALDUSSI_CREDENTIAL_ENCRYPTION_KEY || "";
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("CRIPTOGRAFIA DA BALDUSSI NAO CONFIGURADA.");
  return key;
}

export function encryptBaldussiCredential(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

export function hashWebhookSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function createWebhookSecret() {
  return randomBytes(32).toString("base64url");
}
