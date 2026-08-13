export function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }

  const [scheme, ...valueParts] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  const token = valueParts.join(" ").trim();
  return token.length > 0 ? token : null;
}
