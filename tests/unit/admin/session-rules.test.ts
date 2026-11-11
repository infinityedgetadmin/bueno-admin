import { describe, expect, it } from "vitest";
import { safeAdminPath } from "@/lib/admin/session-rules";

describe("safeAdminPath", () => {
  it("keeps admin paths and rejects everything else", () => {
    expect(safeAdminPath("/admin/packages?x=1")).toBe("/admin/packages?x=1");
    expect(safeAdminPath("/admin")).toBe("/admin");
    expect(safeAdminPath("/admin?tab=1")).toBe("/admin?tab=1");
    expect(safeAdminPath("/administrator")).toBe("/admin");
    expect(safeAdminPath("//evil.com/admin")).toBe("/admin");
    expect(safeAdminPath("https://evil.com")).toBe("/admin");
    expect(safeAdminPath("/admin/..//evil")).toBe("/admin");
    expect(safeAdminPath("/admin\\..\\x")).toBe("/admin");
    // Single dot-segment, no doubled slash: browsers still collapse this via the Location header.
    expect(safeAdminPath("/admin/../evil")).toBe("/admin");
    expect(safeAdminPath(null)).toBe("/admin");
    expect(safeAdminPath(undefined)).toBe("/admin");
  });

  it("resolves encoded and mixed-case dot-segments the same way a browser would", () => {
    // "%2e%2e" and ".%2E" are both "double-dot path segments" per the URL spec, collapsed by
    // the parser itself — a string-only check (no literal "..", no "//") would miss both.
    expect(safeAdminPath("/admin/%2e%2e/evil")).toBe("/admin");
    expect(safeAdminPath("/admin/.%2E/x")).toBe("/admin");
    // A tab elsewhere in the path (not between the dots) doesn't stop normal ".." collapsing —
    // this string already contains a literal ".."; the real tab-split case is below.
    expect(safeAdminPath("/admin\t/../evil")).toBe("/admin");
    // The actual tab-split-dot case: no literal ".." substring exists at all (the tab sits
    // between the two dots), yet the parser strips the tab first and collapses it just the same.
    expect(safeAdminPath("/admin/.\t./evil")).toBe("/admin");
  });

  it("rejects a tab-obfuscated protocol-relative URL that a string-only '//' check would miss", () => {
    // "/\t/evil.com/admin" does not literally start with "//" — but the URL parser strips the
    // tab first, so it resolves as a network-path reference to a different origin entirely.
    expect(safeAdminPath("/\t/evil.com/admin")).toBe("/admin");
  });

  it("only rejects '..' as a path segment, not as literal text inside a query", () => {
    expect(safeAdminPath("/admin/packages?q=a..b")).toBe("/admin/packages?q=a..b");
  });

  it("falls back to /admin instead of throwing when tab-stripping leaves an unparseable host", () => {
    // Stripping the tab/newline turns each of these into a "//..." network-path reference with
    // a host the URL parser itself refuses: empty, an unclosed "[", and an out-of-range port.
    // The login page calls safeAdminPath(params.next) directly in a server
    // component, so a crash here would be a public, unauthenticated denial-of-service — this is
    // the regression the try/catch removal in fix round 1 introduced.
    expect(safeAdminPath("/\t/")).toBe("/admin");
    expect(safeAdminPath("/\n/")).toBe("/admin");
    expect(safeAdminPath("/\t/[")).toBe("/admin");
    expect(safeAdminPath("/\t/a:99999")).toBe("/admin");
  });
});
