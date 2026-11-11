import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCatalog, makePackage, makeSeason } from "../pricing/fixtures";
import type { OperationResult } from "@/lib/pricing/operations";
import type { EntityVersionInput, SeasonFormInput } from "@/lib/pricing/schemas";
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
import { deleteSeasonAction, saveSeasonAction } from "@/lib/admin/actions/seasons";
import { AdminAuthError } from "@/lib/admin/session";

// "Today" for todayInNairobi() (Africa/Nairobi, UTC+3): 2026-09-24T12:00 local.
const FAKE_NOW = new Date("2026-09-24T09:00:00.000Z");

const createInput: SeasonFormInput = {
  id: null,
  expectedVersion: 0,
  name: "Long rains 2027",
  startDate: "2027-04-01",
  endDate: "2027-06-15",
};

describe("season Server Actions", () => {
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

  describe("saveSeasonAction", () => {
    it("requires catalog.write and refuses viewers", async () => {
      requireAdminAction.mockRejectedValue(new AdminAuthError("not_authorized"));
      expect(await saveSeasonAction(createInput)).toEqual({ ok: false, kind: "auth", formError: MESSAGES.forbidden });
      expect(requireAdminAction).toHaveBeenCalledWith("catalog.write");
      expect(readCatalog).not.toHaveBeenCalled();
      expect(mutateCatalog).not.toHaveBeenCalled();
    });

    it("rejects a malformed payload", async () => {
      expect(await saveSeasonAction({ ...createInput, expectedVersion: -1 })).toEqual({
        ok: false,
        kind: "validation",
        fieldErrors: {},
        formError: MESSAGES.invalidRequest,
      });
      expect(mutateCatalog).not.toHaveBeenCalled();
    });

    it("returns field errors from validation", async () => {
      stored.seasons = [makeSeason()];

      expect(
        await saveSeasonAction({ ...createInput, startDate: "2026-12-20", endDate: "2027-01-10" }),
      ).toEqual({
        ok: false,
        kind: "validation",
        fieldErrors: { dates: "Overlaps with “High season” (15 Dec 2026 – 5 Jan 2027)." },
        formError: MESSAGES.fixFields,
      });

      expect(await saveSeasonAction({ ...createInput, name: "A" })).toEqual({
        ok: false,
        kind: "validation",
        fieldErrors: { name: "Name must be 2–40 characters." },
        formError: MESSAGES.fixFields,
      });

      expect(mutateCatalog).not.toHaveBeenCalled();
    });

    it("creates a season and returns its generated id", async () => {
      const result = await saveSeasonAction(createInput);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.data.id).toMatch(/^season-[0-9a-f-]{36}$/);
      expect(result.message).toBe("Season created.");
      expect(stored.seasons).toEqual([
        { id: result.data.id, name: "Long rains 2027", startDate: "2027-04-01", endDate: "2027-06-15", version: 1 },
      ]);
      expect(revalidateSite).toHaveBeenCalledTimes(1);
    });

    it("updates an existing season, keeping its id and bumping the version", async () => {
      stored.seasons = [makeSeason()];
      const result = await saveSeasonAction({
        id: "season-high",
        expectedVersion: 1,
        name: "High season",
        startDate: "2026-12-10",
        endDate: "2027-01-10",
      });
      expect(result).toEqual({ ok: true, data: { id: "season-high" }, message: "Season updated." });
      expect(stored.seasons).toEqual([
        { id: "season-high", name: "High season", startDate: "2026-12-10", endDate: "2027-01-10", version: 2 },
      ]);
      expect(revalidateSite).toHaveBeenCalledTimes(1);
    });

    it("reports a conflict when the expected version is stale", async () => {
      stored.seasons = [makeSeason()];
      const result = await saveSeasonAction({
        id: "season-high",
        expectedVersion: 2,
        name: "High season",
        startDate: "2026-12-15",
        endDate: "2027-01-05",
      });
      expect(result).toEqual({ ok: false, kind: "conflict", formError: MESSAGES.conflict });
      expect(revalidateSite).not.toHaveBeenCalled();
    });
  });

  describe("deleteSeasonAction", () => {
    const validDelete: EntityVersionInput = { id: "season-high", expectedVersion: 1 };

    it("rejects a malformed payload", async () => {
      expect(await deleteSeasonAction({ id: "season-high", expectedVersion: 0 })).toEqual({
        ok: false,
        kind: "validation",
        fieldErrors: {},
        formError: MESSAGES.invalidRequest,
      });
      expect(mutateCatalog).not.toHaveBeenCalled();
    });

    it("deletes a season and cascades its prices out of packages", async () => {
      stored.seasons = [makeSeason()];
      stored.packages = {
        "coastal-escape": makePackage({ seasonPrices: [{ seasonId: "season-high", USD: 5000 }] }),
      };
      const result = await deleteSeasonAction(validDelete);
      expect(result).toEqual({
        ok: true,
        data: null,
        message: "Season deleted. Its prices were removed from the packages that used it.",
      });
      expect(stored.seasons).toEqual([]);
      expect(stored.packages["coastal-escape"]?.seasonPrices).toEqual([]);
      expect(revalidateSite).toHaveBeenCalledTimes(1);
    });

    it("reports a conflict for an unknown season id", async () => {
      stored.seasons = [];
      const result = await deleteSeasonAction({ id: "does-not-exist", expectedVersion: 1 });
      expect(result).toEqual({ ok: false, kind: "conflict", formError: MESSAGES.conflict });
      expect(revalidateSite).not.toHaveBeenCalled();
    });
  });
});
