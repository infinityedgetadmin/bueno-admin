import { describe, expect, it } from "vitest";
import { formatTimestamp } from "@/lib/admin/format";

describe("formatTimestamp", () => {
  it("formats in East Africa Time", () => {
    expect(formatTimestamp("2026-09-24T10:05:00.000Z")).toMatch(/^24 Sept? 2026, 13:05 EAT$/);
  });

  it("handles missing and invalid values", () => {
    expect(formatTimestamp(null)).toBe("Never");
    expect(formatTimestamp("nonsense")).toBe("Unknown");
  });
});
