import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCatalog, makePromotion } from "../pricing/fixtures";
import type { OperationResult } from "@/lib/pricing/operations";
import type { PromotionFormInput } from "@/lib/pricing/schemas";
import type { PricingCatalog } from "@/lib/pricing/types";

const requireAdminAction = vi.hoisted(() => vi.fn());
const readCatalog = vi.hoisted(() => vi.fn<() => Promise<PricingCatalog | null>>());
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
import { deletePromotionAction, savePromotionAction, setPromotionPausedAction } from "@/lib/admin/actions/promotions";
import { AdminAuthError } from "@/lib/admin/session";

// "Today" for todayInNairobi() (Africa/Nairobi, UTC+3): 2026-09-24T12:00 local.
const FAKE_NOW = new Date("2026-09-24T09:00:00.000Z");

const createInput: PromotionFormInput = {
  id: null,
  expectedVersion: 0,
  confirmed: false,
  name: "Honeymoon flash sale",
  label: "Flash Sale",
  percentOff: 20,
  startDate: "2026-09-24",
  endDate: "2026-10-15",
  appliesTo: { kind: "all" },
  terms: "",
};

describe("promotion Server Actions", () => {
  let stored: PricingCatalog;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FAKE_NOW);
    stored = makeCatalog();
    requireAdminAction.mockReset().mockResolvedValue({ uid: "u1", email: "editor@bueno.example.com", role: "editor" });
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

  describe("savePromotionAction", () => {
    it("requires catalog.write and refuses viewers", async () => {
      requireAdminAction.mockRejectedValue(new AdminAuthError("not_authorized"));
      expect(await savePromotionAction(createInput)).toEqual({ ok: false, kind: "auth", formError: MESSAGES.forbidden });
      expect(requireAdminAction).toHaveBeenCalledWith("catalog.write");
      expect(readCatalog).not.toHaveBeenCalled();
      expect(mutateCatalog).not.toHaveBeenCalled();
    });

    it("rejects a malformed payload", async () => {
      expect(await savePromotionAction({ ...createInput, expectedVersion: -1 })).toEqual({
        ok: false,
        kind: "validation",
        fieldErrors: {},
        formError: MESSAGES.invalidRequest,
      });
      expect(mutateCatalog).not.toHaveBeenCalled();
    });

    it("returns exact field errors from validation", async () => {
      expect(await savePromotionAction({ ...createInput, percentOff: 95 })).toEqual({
        ok: false,
        kind: "validation",
        fieldErrors: { percentOff: "Enter a whole percentage from 1 to 90." },
        formError: MESSAGES.fixFields,
      });
      expect(await savePromotionAction({ ...createInput, appliesTo: { kind: "packages", slugs: [] } })).toEqual({
        ok: false,
        kind: "validation",
        fieldErrors: { appliesTo: "Choose at least one package." },
        formError: MESSAGES.fixFields,
      });
      expect(mutateCatalog).not.toHaveBeenCalled();
    });

    it("answers an out-of-range percentage with the range rule, not a request to enter one", async () => {
      for (const percentOff of [150, 0, 12.5]) {
        expect(await savePromotionAction({ ...createInput, percentOff }), String(percentOff)).toEqual({
          ok: false,
          kind: "validation",
          fieldErrors: { percentOff: "Enter a whole percentage from 1 to 90." },
          formError: MESSAGES.fixFields,
        });
      }
      expect(await savePromotionAction({ ...createInput, percentOff: null })).toEqual({
        ok: false,
        kind: "validation",
        fieldErrors: { percentOff: "Enter a discount percentage." },
        formError: MESSAGES.fixFields,
      });
      expect(mutateCatalog).not.toHaveBeenCalled();
    });

    it("asks for confirmation on a large discount (W4), then saves once confirmed", async () => {
      const warned = await savePromotionAction({ ...createInput, percentOff: 60 });
      expect(warned).toEqual({
        ok: false,
        kind: "confirm",
        warnings: [{ id: "W4", message: "This is a large discount (60% off). Double-check it before it goes live." }],
      });
      expect(mutateCatalog).not.toHaveBeenCalled();

      const saved = await savePromotionAction({ ...createInput, percentOff: 60, confirmed: true });
      expect(saved.ok).toBe(true);
      if (!saved.ok) throw new Error("expected success");
      expect(saved.data.id).toMatch(/^promo-[0-9a-f-]{36}$/);
      expect(revalidateSite).toHaveBeenCalledTimes(1);
    });

    it("creates a promotion, returning the brief's message and a generated id", async () => {
      const result = await savePromotionAction(createInput);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.data.id).toMatch(/^promo-[0-9a-f-]{36}$/);
      expect(result.message).toBe("Promotion created. It shows on the website within about a minute.");
      expect(stored.promotions).toEqual([
        {
          id: result.data.id,
          name: "Honeymoon flash sale",
          label: "Flash Sale",
          percentOff: 20,
          startDate: "2026-09-24",
          endDate: "2026-10-15",
          appliesTo: { kind: "all" },
          paused: false,
          terms: null,
          version: 1,
        },
      ]);
      expect(revalidateSite).toHaveBeenCalledTimes(1);
    });

    it("updates an existing promotion, keeping its id and bumping the version", async () => {
      stored.promotions = [makePromotion()];
      const result = await savePromotionAction({
        id: "promo-early",
        expectedVersion: 1,
        confirmed: false,
        name: "Early bird Q4",
        label: "Early Bird",
        percentOff: 15,
        startDate: "2026-09-01",
        endDate: "2026-10-31",
        appliesTo: { kind: "all" },
        terms: "Book by 31 Oct.",
      });
      expect(result).toEqual({ ok: true, data: { id: "promo-early" }, message: MESSAGES.savedLive });
      expect(stored.promotions[0]).toMatchObject({ version: 2, terms: "Book by 31 Oct." });
      expect(revalidateSite).toHaveBeenCalledTimes(1);
    });

    it("checks overlaps against the catalog without retired packages, like the website", async () => {
      // A live promotion whose only package has left the website applies to nothing, so it must
      // not trigger the overlap warning (W5) for a new promotion covering every package.
      stored.promotions = [
        makePromotion({ id: "promo-orphan", name: "Orphaned deal", appliesTo: { kind: "packages", slugs: ["retired-tour"] } }),
      ];
      const result = await savePromotionAction(createInput);
      expect(result.ok).toBe(true);
    });

    it("reports a conflict when the expected version is stale", async () => {
      stored.promotions = [makePromotion()];
      const result = await savePromotionAction({
        id: "promo-early",
        expectedVersion: 2,
        confirmed: false,
        name: "Early bird Q4",
        label: "Early Bird",
        percentOff: 15,
        startDate: "2026-09-01",
        endDate: "2026-10-31",
        appliesTo: { kind: "all" },
        terms: "",
      });
      expect(result).toEqual({ ok: false, kind: "conflict", formError: MESSAGES.conflict });
      expect(revalidateSite).not.toHaveBeenCalled();
    });
  });

  describe("setPromotionPausedAction", () => {
    it("requires catalog.write and refuses viewers", async () => {
      requireAdminAction.mockRejectedValue(new AdminAuthError("not_authorized"));
      const result = await setPromotionPausedAction({ id: "promo-early", expectedVersion: 1, paused: true });
      expect(result).toEqual({ ok: false, kind: "auth", formError: MESSAGES.forbidden });
      expect(mutateCatalog).not.toHaveBeenCalled();
    });

    it("rejects a malformed payload", async () => {
      expect(await setPromotionPausedAction({ id: "promo-early", expectedVersion: 0, paused: true })).toEqual({
        ok: false,
        kind: "validation",
        fieldErrors: {},
        formError: MESSAGES.invalidRequest,
      });
      expect(mutateCatalog).not.toHaveBeenCalled();
    });

    it("pauses and resumes, returning the right message and storing the paused flag", async () => {
      stored.promotions = [makePromotion()];
      const paused = await setPromotionPausedAction({ id: "promo-early", expectedVersion: 1, paused: true });
      expect(paused).toEqual({ ok: true, data: null, message: "Promotion paused." });
      expect(stored.promotions[0]?.paused).toBe(true);

      const resumed = await setPromotionPausedAction({ id: "promo-early", expectedVersion: 2, paused: false });
      expect(resumed).toEqual({ ok: true, data: null, message: "Promotion resumed." });
      expect(stored.promotions[0]?.paused).toBe(false);
      expect(revalidateSite).toHaveBeenCalledTimes(2);
    });

    it("reports a conflict for a stale version", async () => {
      stored.promotions = [makePromotion()];
      const result = await setPromotionPausedAction({ id: "promo-early", expectedVersion: 5, paused: true });
      expect(result).toEqual({ ok: false, kind: "conflict", formError: MESSAGES.conflict });
      expect(revalidateSite).not.toHaveBeenCalled();
    });
  });

  describe("deletePromotionAction", () => {
    it("requires catalog.write and refuses viewers", async () => {
      requireAdminAction.mockRejectedValue(new AdminAuthError("not_authorized"));
      const result = await deletePromotionAction({ id: "promo-early", expectedVersion: 1 });
      expect(result).toEqual({ ok: false, kind: "auth", formError: MESSAGES.forbidden });
      expect(mutateCatalog).not.toHaveBeenCalled();
    });

    it("rejects a malformed payload", async () => {
      expect(await deletePromotionAction({ id: "promo-early", expectedVersion: 0 })).toEqual({
        ok: false,
        kind: "validation",
        fieldErrors: {},
        formError: MESSAGES.invalidRequest,
      });
      expect(mutateCatalog).not.toHaveBeenCalled();
    });

    it("removes the promotion on success", async () => {
      stored.promotions = [makePromotion()];
      const result = await deletePromotionAction({ id: "promo-early", expectedVersion: 1 });
      expect(result).toEqual({ ok: true, data: null, message: "Promotion deleted." });
      expect(stored.promotions).toEqual([]);
      expect(revalidateSite).toHaveBeenCalledTimes(1);
    });

    it("reports a conflict for an unknown id", async () => {
      stored.promotions = [];
      const result = await deletePromotionAction({ id: "does-not-exist", expectedVersion: 1 });
      expect(result).toEqual({ ok: false, kind: "conflict", formError: MESSAGES.conflict });
      expect(revalidateSite).not.toHaveBeenCalled();
    });
  });
});
