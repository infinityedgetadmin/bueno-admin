/** CSRF guard for JSON endpoints: the browser's Origin must match the host serving the request. */
export function isSameOriginRequest(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (origin === null) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const forwarded = headers.get("x-forwarded-host");
  const host = forwarded !== null ? forwarded.split(",")[0].trim() : headers.get("host");
  return host !== null && host.length > 0 && originHost === host;
}
