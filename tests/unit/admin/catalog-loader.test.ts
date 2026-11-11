import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCatalog } from "@/lib/pricing/defaults";
import type { PricingCatalog } from "@/lib/pricing/types";
import { makeCatalog, makePackage, makePromotion } from "../pricing/fixtures";

const readCatalog = vi.hoisted(() => vi.fn<() => Promise<PricingCatalog | null>>());
vi.mock("@/lib/cms/catalog-repo", () => ({ readCatalog }));

import { loadAdminCatalog } from "@/lib/admin/catalog-loader";

describe("loadAdminCatalog", () => {
  beforeEach(() => {
    readCatalog.mockReset();
  });

  it("starts from an empty catalog when nothing is stored yet", async () => {
    readCatalog.mockResolvedValue(null);
    await expect(loadAdminCatalog()).resolves.toEqual(emptyCatalog());
  });

  it("leaves out packages that are no longer on the website, as the website and the next save do", async () => {
    const mixed = makePromotion({ id: "mixed", appliesTo: { kind: "packages", slugs: ["coastal-escape", "retired-tour"] } });
    readCatalog.mockResolvedValue(
      makeCatalog({
        promotions: [makePromotion({ id: "orphan", appliesTo: { kind: "packages", slugs: ["retired-tour"] } }), mixed],
        packages: { "retired-tour": makePackage(), "coastal-escape": makePackage({ version: 2 }) },
      }),
    );
    const catalog = await loadAdminCatalog();
    expect(catalog.packages).toEqual({ "coastal-escape": makePackage({ version: 2 }) });
    expect(catalog.promotions).toEqual([{ ...mixed, appliesTo: { kind: "packages", slugs: ["coastal-escape"] } }]);
  });
});
