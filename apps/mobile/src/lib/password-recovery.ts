export function buildPasswordRecoveryRedirect(apiBaseUrl: string) {
  const url = new URL(apiBaseUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Password recovery requires an HTTP(S) app URL.");
  }
  const localHttpHost =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "10.0.2.2" ||
    url.hostname.startsWith("10.") ||
    url.hostname.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname);
  if (url.protocol === "http:" && !localHttpHost) {
    throw new Error(
      "Password recovery requires HTTPS outside local development."
    );
  }
  return new URL("/reset-password", url.origin).toString();
}
