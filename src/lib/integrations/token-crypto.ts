import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getServerEnv } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";

function readEncryptionKey() {
  const key = getServerEnv().INTEGRATIONS_TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("INTEGRATIONS_TOKEN_ENCRYPTION_KEY is required.");
  }
  const decoded = Buffer.from(key, "base64");
  if (decoded.length !== 32) {
    throw new Error("INTEGRATIONS_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.");
  }
  return decoded;
}

export function encryptIntegrationToken(plainText: string) {
  const iv = randomBytes(12);
  const key = readEncryptionKey();
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptIntegrationToken(cipherText: string) {
  const payload = Buffer.from(cipherText, "base64");
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const key = readEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
