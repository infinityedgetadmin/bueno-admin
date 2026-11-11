import { afterEach, describe, expect, it, vi } from "vitest";
import { logError } from "@/lib/logger";

describe("logError", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes one structured JSON line for Error values", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logError("pricing.save", new TypeError("boom"), { slug: "coastal-escape" });
    expect(spy).toHaveBeenCalledTimes(1);
    const payload: unknown = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(payload).toMatchObject({
      severity: "ERROR",
      context: "pricing.save",
      errorName: "TypeError",
      errorMessage: "boom",
      slug: "coastal-escape",
    });
  });

  it("handles non-Error values", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logError("x", "plain string");
    expect(JSON.parse(String(spy.mock.calls[0]?.[0]))).toMatchObject({ context: "x", errorMessage: "plain string" });
  });
});
