import { describe, expect, it } from "vitest";
import { MESSAGES, fail, invalid, needsConfirmation, resultErrorMessage, succeed } from "@/lib/admin/action-result";

describe("action results", () => {
  it("builds each result shape", () => {
    expect(succeed({ version: 2 }, MESSAGES.savedLive)).toEqual({ ok: true, data: { version: 2 }, message: MESSAGES.savedLive });
    expect(invalid({ name: "Too short" })).toEqual({ ok: false, kind: "validation", fieldErrors: { name: "Too short" }, formError: null });
    expect(needsConfirmation([{ id: "W1", message: "Big change" }])).toEqual({
      ok: false,
      kind: "confirm",
      warnings: [{ id: "W1", message: "Big change" }],
    });
    expect(fail("conflict", MESSAGES.conflict)).toEqual({ ok: false, kind: "conflict", formError: MESSAGES.conflict });
  });

  it("picks the message to show for a result", () => {
    expect(resultErrorMessage(null)).toBeNull();
    expect(resultErrorMessage(succeed(1, "ok"))).toBeNull();
    expect(resultErrorMessage(needsConfirmation([{ id: "W1", message: "x" }]))).toBeNull();
    expect(resultErrorMessage(invalid({ name: "Too short" }))).toBe(MESSAGES.fixFields);
    expect(resultErrorMessage(invalid({}, MESSAGES.invalidRequest))).toBe(MESSAGES.invalidRequest);
    expect(resultErrorMessage(fail("auth", MESSAGES.forbidden))).toBe(MESSAGES.forbidden);
  });
});
