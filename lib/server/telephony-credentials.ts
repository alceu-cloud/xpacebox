import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

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

export function decryptBaldussiCredential({ ciphertext, iv, authTag }: { ciphertext: string; iv: string; authTag: string }) {
  if (!ciphertext || !iv || !authTag) throw new Error("CREDENCIAL DA BALDUSSI INCOMPLETA.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}

export function hashWebhookSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function createWebhookSecret() {
  return randomBytes(32).toString("base64url");
}
