import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const userIdSchema = z.uuid();

interface FeedTokenParts {
  userId: string;
  signature: Buffer;
}

function encodeBase64Url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url");
}

function buildSignature({
  userId,
  version,
  hmacKey,
}: {
  userId: string;
  version: number;
  hmacKey: string;
}) {
  return createHmac("sha256", hmacKey)
    .update(`${userId}:${version}`)
    .digest()
    .subarray(0, 16);
}

function parseFeedToken(token: string): FeedTokenParts | null {
  const [encodedUserId, encodedSignature] = token.split(".");
  if (!encodedUserId || !encodedSignature) {
    return null;
  }

  try {
    const userId = userIdSchema.parse(decodeBase64Url(encodedUserId).toString("utf8"));
    return {
      userId,
      signature: decodeBase64Url(encodedSignature),
    };
  } catch {
    return null;
  }
}

export function createCalendarFeedToken({
  userId,
  version,
  hmacKey,
}: {
  userId: string;
  version: number;
  hmacKey: string;
}) {
  const normalizedUserId = userIdSchema.parse(userId);
  if (!Number.isInteger(version) || version <= 0) {
    throw new Error("Feed token version must be a positive integer.");
  }
  const signature = buildSignature({ userId: normalizedUserId, version, hmacKey });
  return `${encodeBase64Url(normalizedUserId)}.${encodeBase64Url(signature)}`;
}

export function readCalendarFeedTokenUserId(token: string) {
  const parsed = parseFeedToken(token);
  return parsed?.userId ?? null;
}

export function verifyCalendarFeedToken({
  token,
  version,
  hmacKey,
}: {
  token: string;
  version: number;
  hmacKey: string;
}) {
  const parsed = parseFeedToken(token);
  if (!parsed) {
    return null;
  }
  const expected = buildSignature({
    userId: parsed.userId,
    version,
    hmacKey,
  });
  if (parsed.signature.length !== expected.length) {
    return null;
  }
  if (!timingSafeEqual(parsed.signature, expected)) {
    return null;
  }
  return parsed.userId;
}
