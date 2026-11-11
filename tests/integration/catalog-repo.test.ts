import { describe, expect, it } from "vitest";
import { listAudit, writeAudit } from "@/lib/cms/audit";
import { CatalogInvariantError, CatalogReadError, mutateCatalog, readCatalog } from "@/lib/cms/catalog-repo";
import { applyCurrencyUpdate, applyPackageUpdate, VersionConflictError } from "@/lib/pricing/operations";
import type { PackageDraft } from "@/lib/pricing/types";
import { STORE_FILES } from "@/lib/store/store-path";
import { writeRawStoreFile } from "../support/store";
import { makeCatalog, makePackage, makePromotion } from "../unit/pricing/fixtures";

const KNOWN = new Set(["coastal-escape"]);
const actor = { uid: "u1", email: "owner@bueno-test.example.com" };
const now = "2026-09-24T10:00:00.000Z";
const draft: PackageDraft = {
  visible: true,
  display: "price",
  basis: null,
  currencies: { USD: "fixed", KES: "converted" },
  base: { USD: 3000, KES: null },
  seasonPrices: [],
  featuredRank: null,
};

function savePackage(expectedVersion: number) {
  return mutateCatalog({
    actor,
    knownSlugs: KNOWN,
    now,
    mutate: (catalog) =>
      applyPackageUpdate({
        catalog,
        slug: "coastal-escape",
        draft,
        expectedVersion,
        listPriceUsd: 2800,
        titleOf: () => "Coastal Escape",
        ctx: { actor, now },
      }),
  });
}

describe("catalog repository", () => {
  it("returns null when no catalog has been saved", async () => {
    await expect(readCatalog()).resolves.toBeNull();
  });

  it("creates the catalog on first write and records an audit entry", async () => {
    const saved = await savePackage(0);
    expect(saved.revision).toBe(1);
    const stored = await readCatalog();
    expect(stored?.packages["coastal-escape"]?.base).toEqual({ USD: 3000 });
    const audit = await listAudit({ limit: 10 });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "package.update",
      entity: { type: "package", id: "coastal-escape" },
      actor,
      revision: 1,
      summary: "Coastal Escape: dollar base $2,800 → $3,000",
    });
    expect(audit[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects stale versions without writing anything", async () => {
    await savePackage(0);
    await expect(savePackage(0)).rejects.toBeInstanceOf(VersionConflictError);
    expect((await readCatalog())?.revision).toBe(1);
    expect(await listAudit({ limit: 10 })).toHaveLength(1);
  });

  it("refuses to write a catalog that breaks invariants", async () => {
    const attempt = mutateCatalog({
      actor,
      knownSlugs: new Set<string>(),
      now,
      mutate: (catalog) =>
        applyPackageUpdate({
          catalog,
          slug: "coastal-escape",
          draft,
          expectedVersion: 0,
          listPriceUsd: 2800,
          titleOf: () => "Coastal Escape",
          ctx: { actor, now },
        }),
    });
    await expect(attempt).rejects.toBeInstanceOf(CatalogInvariantError);
    await expect(readCatalog()).resolves.toBeNull();
    expect(await listAudit({ limit: 10 })).toHaveLength(0);
  });

  it("throws a read error for a catalog that fails validation or is not JSON", async () => {
    await writeRawStoreFile(STORE_FILES.catalog, { schemaVersion: 99 });
    await expect(readCatalog()).rejects.toBeInstanceOf(CatalogReadError);
    await writeRawStoreFile(STORE_FILES.catalog, "{ not json");
    await expect(readCatalog()).rejects.toBeInstanceOf(CatalogReadError);
  });

  it("serialises concurrent saves so neither is lost", async () => {
    await savePackage(0);
    const currency = (expectedVersion: number, rate: number) =>
      mutateCatalog({
        actor,
        knownSlugs: KNOWN,
        now,
        mutate: (catalog) =>
          applyCurrencyUpdate({
            catalog,
            kesPerUsdE4: rate,
            roundingStep: { USD: 1, KES: 500 },
            expectedVersion,
            ctx: { actor, now },
          }),
      });
    const [first, second] = await Promise.allSettled([currency(0, 1_295_000), currency(0, 1_300_000)]);
    expect([first.status, second.status].sort()).toEqual(["fulfilled", "rejected"]);
    expect((await readCatalog())?.revision).toBe(2);
    expect(await listAudit({ limit: 10 })).toHaveLength(2);
  });

  it("lists audit entries newest first, filtered by entity", async () => {
    await savePackage(0);
    await mutateCatalog({
      actor,
      knownSlugs: KNOWN,
      now: "2026-09-24T11:00:00.000Z",
      mutate: (catalog) =>
        applyCurrencyUpdate({
          catalog,
          kesPerUsdE4: 1_295_000,
          roundingStep: { USD: 1, KES: 500 },
          expectedVersion: 0,
          ctx: { actor, now: "2026-09-24T11:00:00.000Z" },
        }),
    });
    await writeAudit({
      draft: { action: "auth.sign_in", entity: { type: "auth", id: actor.email }, summary: "Signed in", before: null, after: null },
      actor,
      now: "2026-09-24T12:00:00.000Z",
    });
    const all = await listAudit({ limit: 10 });
    expect(all.map((entry) => entry.action)).toEqual(["auth.sign_in", "currency.update", "package.update"]);
    const packageOnly = await listAudit({ entity: { type: "package", id: "coastal-escape" }, limit: 10 });
    expect(packageOnly.map((entry) => entry.action)).toEqual(["package.update"]);
    expect(await listAudit({ limit: 1 })).toHaveLength(1);
  });

  it("lists entries written in the same instant with the later write first", async () => {
    for (const summary of ["first", "second", "third"]) {
      await writeAudit({
        draft: { action: "auth.sign_in", entity: { type: "auth", id: actor.email }, summary, before: null, after: null },
        actor,
        now,
      });
    }
    expect((await listAudit({ limit: 10 })).map((entry) => entry.summary)).toEqual(["third", "second", "first"]);
  });

  it("prunes a retired package inside the save, so it no longer blocks unrelated changes", async () => {
    const retired = makePackage({ base: { USD: 3100 }, version: 2 });
    const onlyRetired = makePromotion({
      id: "promo-retired",
      name: "Retired only",
      appliesTo: { kind: "packages", slugs: ["retired-tour"] },
    });
    const mixed = makePromotion({
      id: "promo-mixed",
      name: "Mixed",
      appliesTo: { kind: "packages", slugs: ["coastal-escape", "retired-tour"] },
    });
    const everywhere = makePromotion({ id: "promo-all", name: "Everywhere" });
    await writeRawStoreFile(
      STORE_FILES.catalog,
      makeCatalog({
        revision: 4,
        promotions: [onlyRetired, mixed, everywhere],
        packages: { "retired-tour": retired, "coastal-escape": makePackage() },
      }),
    );

    const saved = await mutateCatalog({
      actor,
      knownSlugs: KNOWN,
      now,
      mutate: (catalog) =>
        applyCurrencyUpdate({
          catalog,
          kesPerUsdE4: 1_300_000,
          roundingStep: { USD: 1, KES: 500 },
          expectedVersion: 1,
          ctx: { actor, now },
        }),
    });
    expect(saved.revision).toBe(5);

    const narrowed = { ...mixed, appliesTo: { kind: "packages", slugs: ["coastal-escape"] } };
    const stored = await readCatalog();
    expect(stored?.currency?.kesPerUsdE4).toBe(1_300_000);
    expect(stored?.packages).toEqual({ "coastal-escape": makePackage() });
    expect(stored?.promotions).toEqual([narrowed, everywhere]);

    const audit = await listAudit({ limit: 10 });
    expect(audit).toHaveLength(4);
    const byEntity = new Map(audit.map((entry) => [`${entry.entity.type}:${entry.entity.id}`, entry]));
    expect(byEntity.get("package:retired-tour")).toMatchObject({
      action: "package.delete",
      actor,
      at: now,
      revision: 5,
      summary: "Automatically removed the pricing for package “retired-tour” because it is no longer on the website",
      before: retired,
      after: null,
    });
    expect(byEntity.get("promotion:promo-retired")).toMatchObject({
      action: "promotion.delete",
      actor,
      revision: 5,
      summary:
        "Automatically deleted promotion “Retired only” because every package it applied to (“retired-tour”) is no longer on the website",
      before: onlyRetired,
      after: null,
    });
    expect(byEntity.get("promotion:promo-mixed")).toMatchObject({
      action: "promotion.update",
      actor,
      revision: 5,
      summary: "Automatically removed “retired-tour” from promotion “Mixed” because that package is no longer on the website",
      before: mixed,
      after: narrowed,
    });
    expect(byEntity.get("currency:settings")).toMatchObject({ action: "currency.update", actor, revision: 5 });
  });

  it("skips malformed audit entries instead of failing the listing", async () => {
    await writeRawStoreFile(STORE_FILES.audit, [{ at: "2026-09-24T13:00:00.000Z", junk: true }]);
    await savePackage(0);
    expect((await listAudit({ limit: 10 })).map((entry) => entry.action)).toEqual(["package.update"]);
  });

  it("treats a non-array audit file as empty", async () => {
    await writeRawStoreFile(STORE_FILES.audit, { not: "an array" });
    expect(await listAudit({ limit: 10 })).toEqual([]);
  });
});
