import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE } from "@/lib/admin/session-constants";
import { config, proxy } from "@/proxy";

describe("admin proxy", () => {
  it("redirects visitors without a session cookie to the login page", () => {
    const response = proxy(new NextRequest("http://localhost/admin/packages?tab=all"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/admin/login");
    expect(location.searchParams.get("next")).toBe("/admin/packages?tab=all");
  });

  it("lets the login page, the session API and signed-in visitors through", () => {
    expect(proxy(new NextRequest("http://localhost/admin/login")).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(new NextRequest("http://localhost/admin/api/session")).headers.get("x-middleware-next")).toBe("1");
    const signedIn = new NextRequest("http://localhost/admin", { headers: { cookie: `${SESSION_COOKIE}=abc` } });
    expect(proxy(signedIn).headers.get("x-middleware-next")).toBe("1");
  });

  it("only runs on admin routes", () => {
    expect(config.matcher).toEqual(["/admin", "/admin/:path*"]);
  });
});
