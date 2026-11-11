export type SessionFailure = "unauthenticated" | "not_authorized" | "invalid_credentials";

const REDIRECT_BASE = "https://placeholder.invalid";

/**
 * Post-login redirect target: only same-site /admin paths are allowed.
 *
 * Guarantees:
 *   - never throws, for any input;
 *   - on success, always returns a same-origin path equal to "/admin" or under "/admin/", with
 *     the original query and hash preserved verbatim;
 *   - anything else becomes exactly "/admin".
 *
 * Resolution is done via WHATWG URL parsing (the same algorithm browsers use to interpret a
 * redirect's Location header), not string matching, because that is what a browser will
 * actually navigate to:
 *   - any encoded, mixed-case, or whitespace-obfuscated ".." (e.g. "%2e%2e", ".%2E", a tab
 *     between two dots) is collapsed by the parser itself before the pathname check runs;
 *   - a tab or newline hidden inside what looks like a single "/" (e.g. "/\t/evil.com") is
 *     stripped by the parser first, which can turn the input into a network-path reference to
 *     a different host — caught by the origin check;
 *   - that same stripping can also turn the input into a network-path reference with a host the
 *     parser itself refuses to accept (empty, an unclosed "[", an invalid port) — the URL
 *     constructor throws a `TypeError` for these, which is exactly why the parse is wrapped in
 *     try/catch below rather than assumed to always succeed;
 *   - a literal ".." inside the query or hash (not a path segment) is left untouched.
 */
export function safeAdminPath(next: string | null | undefined): string {
  if (typeof next !== "string") return "/admin";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/admin";
  let url: URL;
  try {
    url = new URL(next, REDIRECT_BASE);
  } catch {
    return "/admin";
  }
  if (url.origin !== REDIRECT_BASE) return "/admin";
  if (url.pathname !== "/admin" && !url.pathname.startsWith("/admin/")) return "/admin";
  return url.pathname + url.search + url.hash;
}
