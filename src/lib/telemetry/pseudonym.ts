import { createHmac } from "node:crypto";

interface OwnerPseudonymInput {
  ownerId: string;
  environment: "development" | "test" | "preview" | "production";
  hmacKey: string;
  keyVersion: number;
}

export function createOwnerPseudonym({
  ownerId,
  environment,
  hmacKey,
  keyVersion,
}: OwnerPseudonymInput) {
  if (ownerId.length === 0) {
    throw new Error("ownerId is required.");
  }
  if (hmacKey.length < 32) {
    throw new Error("Telemetry HMAC keys must contain at least 32 characters.");
  }
  if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) {
    throw new Error("Telemetry HMAC keyVersion must be a positive integer.");
  }

  return {
    ownerPseudonym: createHmac("sha256", hmacKey)
      .update(`${environment}\0${keyVersion}\0${ownerId}`)
      .digest("hex"),
    ownerPseudonymKeyVersion: keyVersion,
  };
}
