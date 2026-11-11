import "server-only";
import { readCatalog } from "@/lib/cms/catalog-repo";
import { KNOWN_TOUR_SLUGS } from "@/lib/cms/known-slugs";
import { emptyCatalog } from "@/lib/pricing/defaults";
import { pruneRetiredPackages } from "@/lib/pricing/operations";
import type { PricingCatalog } from "@/lib/pricing/types";

/**
 * The back office always reads the live document (never ISR-cached), without packages that are
 * no longer on the website: the same catalog the site shows and the next save starts from.
 */
export async function loadAdminCatalog(): Promise<PricingCatalog> {
  return pruneRetiredPackages((await readCatalog()) ?? emptyCatalog(), KNOWN_TOUR_SLUGS).catalog;
}
