import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function encryptionKey() {
  const key = Buffer.from(process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY || process.env.BALDUSSI_CREDENTIAL_ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32) throw new Error("CRIPTOGRAFIA DAS INTEGRACOES NAO CONFIGURADA.");
  return key;
}

function decryptionKeys() {
  const values = [
    process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY,
    process.env.BALDUSSI_CREDENTIAL_ENCRYPTION_KEY,
  ].filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);
  const keys = values.map((value) => Buffer.from(value, "base64")).filter((key) => key.length === 32);
  if (!keys.length) throw new Error("CRIPTOGRAFIA DAS INTEGRACOES NAO CONFIGURADA.");
  return keys;
}

export function encryptIntegrationCredential(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

export function decryptIntegrationCredential({ ciphertext, iv, authTag }: { ciphertext: string; iv: string; authTag: string }) {
  if (!ciphertext || !iv || !authTag) throw new Error("CREDENCIAL DA INTEGRACAO INCOMPLETA.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}

export function encryptBaldussiCredential(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

export function decryptBaldussiCredential({ ciphertext, iv, authTag }: { ciphertext: string; iv: string; authTag: string }) {
  if (!ciphertext || !iv || !authTag) throw new Error("CREDENCIAL DA BALDUSSI INCOMPLETA.");
  let lastError: unknown;
  for (const key of decryptionKeys()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
      decipher.setAuthTag(Buffer.from(authTag, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export function hashWebhookSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function createWebhookSecret() {
  return randomBytes(32).toString("base64url");
}
