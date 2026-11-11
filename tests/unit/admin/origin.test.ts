import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "@/lib/admin/origin";

function headers(values: Record<string, string>): Headers {
  return new Headers(values);
}

describe("isSameOriginRequest", () => {
  it("accepts matching origin and host", () => {
    expect(isSameOriginRequest(headers({ origin: "https://bueno.example.com", host: "bueno.example.com" }))).toBe(true);
  });

  it("prefers the forwarded host behind a proxy", () => {
    expect(
      isSameOriginRequest(
        headers({ origin: "https://bueno.example.com", host: "internal:8080", "x-forwarded-host": "bueno.example.com, cdn" }),
      ),
    ).toBe(true);
  });

  it("rejects missing, malformed or foreign origins", () => {
    expect(isSameOriginRequest(headers({ host: "bueno.example.com" }))).toBe(false);
    expect(isSameOriginRequest(headers({ origin: "not a url", host: "bueno.example.com" }))).toBe(false);
    expect(isSameOriginRequest(headers({ origin: "https://evil.test", host: "bueno.example.com" }))).toBe(false);
    expect(isSameOriginRequest(headers({ origin: "https://bueno.example.com" }))).toBe(false);
  });
});
