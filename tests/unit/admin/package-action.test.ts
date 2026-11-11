import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeCatalog, makeCurrency, makePackage } from "../pricing/fixtures";
import type { PricingCatalog } from "@/lib/pricing/types";
import type { OperationResult } from "@/lib/pricing/operations";

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
import { savePackageAction } from "@/lib/admin/actions/packages";
import { AdminAuthError } from "@/lib/admin/session";

const input = {
  slug: "coastal-escape",
  expectedVersion: 0,
  confirmed: false,
  visible: true,
  display: "price" as const,
  basis: null,
  currencies: { USD: "fixed" as const, KES: "converted" as const },
  base: { USD: 3000, KES: null },
  seasonPrices: [],
  featuredRank: null,
};

describe("savePackageAction", () => {
  let stored: PricingCatalog;

  beforeEach(() => {
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

  it("requires catalog.write and refuses viewers", async () => {
    requireAdminAction.mockRejectedValue(new AdminAuthError("not_authorized"));
    expect(await savePackageAction(input)).toEqual({ ok: false, kind: "auth", formError: MESSAGES.forbidden });
    expect(requireAdminAction).toHaveBeenCalledWith("catalog.write");
    expect(readCatalog).not.toHaveBeenCalled();
  });

  it("rejects malformed payloads and unknown packages", async () => {
    expect(await savePackageAction({ ...input, expectedVersion: -1 })).toEqual({
      ok: false,
      kind: "validation",
      fieldErrors: {},
      formError: MESSAGES.invalidRequest,
    });
    expect(await savePackageAction({ ...input, slug: "retired-tour" })).toMatchObject({
      kind: "validation",
      fieldErrors: { slug: "This package no longer exists on the website." },
    });
  });

  it("returns field errors from validation", async () => {
    expect(await savePackageAction({ ...input, base: { USD: null, KES: null } })).toMatchObject({
      kind: "validation",
      fieldErrors: { "base.USD": "Enter a US dollar price." },
      formError: MESSAGES.fixFields,
    });
    expect(mutateCatalog).not.toHaveBeenCalled();
  });

  it("asks for confirmation on large changes, then saves once confirmed", async () => {
    const warned = await savePackageAction({ ...input, base: { USD: 9000, KES: null } });
    expect(warned).toMatchObject({ ok: false, kind: "confirm" });
    expect(mutateCatalog).not.toHaveBeenCalled();
    const saved = await savePackageAction({ ...input, base: { USD: 9000, KES: null }, confirmed: true });
    expect(saved).toEqual({ ok: true, data: { version: 1 }, message: MESSAGES.savedLive });
    expect(stored.packages["coastal-escape"]?.base).toEqual({ USD: 9000 });
    expect(revalidateSite).toHaveBeenCalledTimes(1);
  });

  it("asks for confirmation before hiding a package that still holds a featured slot (W8)", async () => {
    const hidden = { ...input, visible: false, featuredRank: 2 as const };
    const warned = await savePackageAction(hidden);
    expect(warned).toMatchObject({
      ok: false,
      kind: "confirm",
      warnings: [
        { id: "W8", message: "This package is hidden, so it won't appear in featured slot 2 on the homepage." },
      ],
    });
    expect(mutateCatalog).not.toHaveBeenCalled();
    const saved = await savePackageAction({ ...hidden, confirmed: true });
    expect(saved).toEqual({ ok: true, data: { version: 1 }, message: MESSAGES.savedLive });
    expect(stored.packages["coastal-escape"]).toMatchObject({ visible: false, featuredRank: 2 });
  });

  it("asks for confirmation when a converted price would be over its limit (W9), then saves once confirmed", async () => {
    // KSh 500 per dollar: $300,001 would be KSh 150,000,500, over the KSh 150,000,000 limit.
    stored = makeCatalog({
      currency: makeCurrency({ kesPerUsdE4: 5_000_000 }),
      packages: { "coastal-escape": makePackage({ base: { USD: 300_000 }, version: 1 }) },
    });
    const overLimit = { ...input, expectedVersion: 1, base: { USD: 300_001, KES: null } };
    const warned = await savePackageAction(overLimit);
    expect(warned).toEqual({
      ok: false,
      kind: "confirm",
      warnings: [
        {
          id: "W9",
          message:
            "At the current exchange rate, a price here converts above the KSh 150,000,000 limit, so visitors will only see this package in dollars.",
        },
      ],
    });
    expect(mutateCatalog).not.toHaveBeenCalled();
    const saved = await savePackageAction({ ...overLimit, confirmed: true });
    expect(saved).toEqual({ ok: true, data: { version: 2 }, message: MESSAGES.savedLive });
    expect(stored.packages["coastal-escape"]?.base).toEqual({ USD: 300_001 });
  });

  it("reports conflicts when someone else saved first", async () => {
    await savePackageAction(input);
    expect(await savePackageAction(input)).toEqual({ ok: false, kind: "conflict", formError: MESSAGES.conflict });
  });
});
