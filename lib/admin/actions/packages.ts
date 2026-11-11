"use server";

import { getTourBySlug } from "@/data/cms";
import { mutateCatalog } from "@/lib/cms/catalog-repo";
import { KNOWN_TOUR_SLUGS, tourTitleOf } from "@/lib/cms/known-slugs";
import { resolvePackageCommercial } from "@/lib/pricing/defaults";
import { applyPackageUpdate } from "@/lib/pricing/operations";
import { packageFormSchema, type PackageFormInput } from "@/lib/pricing/schemas";
import { hasErrors, validatePackageDraft } from "@/lib/pricing/validation";
import { MESSAGES, invalid, needsConfirmation, succeed, type ActionResult } from "../action-result";
import { runAdminAction } from "../action-runtime";
import { loadAdminCatalog } from "../catalog-loader";
import { revalidateSite } from "../revalidate";

export async function savePackageAction(input: PackageFormInput): Promise<ActionResult<{ version: number }>> {
  return runAdminAction({ context: "admin.packages.save", permission: "catalog.write" }, async (actor) => {
    const parsed = packageFormSchema.safeParse(input);
    if (!parsed.success) return invalid({}, MESSAGES.invalidRequest);
    const { slug, expectedVersion, confirmed, ...draft } = parsed.data;
    const tour = getTourBySlug(slug);
    if (tour === undefined) return invalid({ slug: "This package no longer exists on the website." }, MESSAGES.fixFields);

    const catalog = await loadAdminCatalog();
    const outcome = validatePackageDraft({
      slug,
      draft,
      current: resolvePackageCommercial(catalog, slug, tour.listPriceUsd),
      catalog,
      knownSlugs: KNOWN_TOUR_SLUGS,
    });
    if (hasErrors(outcome)) return invalid(outcome.errors, MESSAGES.fixFields);
    if (outcome.warnings.length > 0 && !confirmed) return needsConfirmation(outcome.warnings);

    const now = new Date().toISOString();
    const saved = await mutateCatalog({
      actor,
      knownSlugs: KNOWN_TOUR_SLUGS,
      now,
      mutate: (current) =>
        applyPackageUpdate({
          catalog: current,
          slug,
          draft,
          expectedVersion,
          listPriceUsd: tour.listPriceUsd,
          titleOf: tourTitleOf,
          ctx: { actor, now },
        }),
    });
    revalidateSite();
    return succeed({ version: saved.packages[slug]?.version ?? expectedVersion + 1 }, MESSAGES.savedLive);
  });
}
