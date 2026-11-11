import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PricingCatalog } from "@/lib/pricing/types";
import type { OperationResult } from "@/lib/pricing/operations";
import { makeCatalog, makeCurrency } from "../pricing/fixtures";

const requireAdminAction = vi.hoisted(() => vi.fn());
const readCatalog = vi.hoisted(() => vi.fn());
const mutateCatalog = vi.hoisted(() => vi.fn());
const revalidateSite = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin/session", () => {
  class AdminAuthError extends Error {
    constructor(readonly reason: "unauthenticated" | "not_authorized") {
      super(reason);
    }
  }
  return { requireAdminAction, AdminAuthError };
});
vi.mock("@/lib/cms/catalog-repo", () => ({ readCatalog, mutateCatalog }));
vi.mock("@/lib/admin/revalidate", () => ({ revalidateSite }));

import { MESSAGES } from "@/lib/admin/action-result";
import { saveCurrencyAction } from "@/lib/admin/actions/currency";

// "Today" pinned to the plan's reference date so nothing here can depend on the real clock.
const FAKE_NOW = new Date("2026-09-24T09:00:00.000Z");

describe("saveCurrencyAction", () => {
  let stored: PricingCatalog;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_NOW);
    stored = makeCatalog({ currency: null });
    requireAdminAction.mockReset().mockResolvedValue({ uid: "u", email: "a@b.example.com", role: "admin" });
    readCatalog.mockReset().mockImplementation(async () => stored);
    revalidateSite.mockReset();
    mutateCatalog.mockReset().mockImplementation(async (params: { mutate: (c: PricingCatalog) => OperationResult }) => {
      stored = params.mutate(stored).catalog;
      return stored;
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets the rate the first time", async () => {
    const result = await saveCurrencyAction({ expectedVersion: 0, rate: "129.5", roundingStep: { USD: 1, KES: 500 }, confirmed: false });
    expect(result).toEqual({ ok: true, data: { version: 1 }, message: MESSAGES.savedLive });
    expect(stored.currency?.kesPerUsdE4).toBe(1_295_000);
    expect(revalidateSite).toHaveBeenCalled();
    expect(requireAdminAction).toHaveBeenCalledWith("catalog.write");
  });

  it("validates input and asks before large changes", async () => {
    expect(await saveCurrencyAction({ expectedVersion: 0, rate: "12", roundingStep: { USD: 1, KES: 500 }, confirmed: false })).toMatchObject({
      kind: "validation",
      fieldErrors: { rate: "Enter a rate between 50 and 500 shillings per dollar." },
    });
    await saveCurrencyAction({ expectedVersion: 0, rate: "129.5", roundingStep: { USD: 1, KES: 500 }, confirmed: false });
    expect(await saveCurrencyAction({ expectedVersion: 1, rate: "160", roundingStep: { USD: 1, KES: 500 }, confirmed: false })).toMatchObject({
      kind: "confirm",
    });
    expect(await saveCurrencyAction({ expectedVersion: 1, rate: "160", roundingStep: { USD: 1, KES: 500 }, confirmed: true })).toMatchObject({
      ok: true,
      data: { version: 2 },
    });
  });

  it("rejects malformed payloads", async () => {
    expect(
      await saveCurrencyAction({ expectedVersion: -3, rate: "129", roundingStep: { USD: 1, KES: 500 }, confirmed: false }),
    ).toEqual({ ok: false, kind: "validation", fieldErrors: {}, formError: MESSAGES.invalidRequest });
  });

  it("reports a conflict when the expected version is stale", async () => {
    stored.currency = makeCurrency({ version: 2 });
    const result = await saveCurrencyAction({
      expectedVersion: 1,
      rate: "129.5",
      roundingStep: { USD: 1, KES: 500 },
      confirmed: false,
    });
    expect(result).toEqual({ ok: false, kind: "conflict", formError: MESSAGES.conflict });
    expect(revalidateSite).not.toHaveBeenCalled();
  });
});
