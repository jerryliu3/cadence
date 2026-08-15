import {
  redirectHealthPrivacySystemPath,
} from "../src/features/health/privacy-policy-intent";

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  return redirectHealthPrivacySystemPath(path);
}
