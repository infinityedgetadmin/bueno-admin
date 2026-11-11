import "server-only";
import { emptyCatalog } from "@/lib/pricing/defaults";
import { pruneRetiredPackages, type Actor, type OperationResult } from "@/lib/pricing/operations";
import { pricingCatalogSchema } from "@/lib/pricing/schemas";
import type { PricingCatalog } from "@/lib/pricing/types";
import { catalogInvariantProblems } from "@/lib/pricing/validation";
import { STORE_FILES, StoreFormatError, readStoreFile, withStoreLock, writeStoreFile } from "@/lib/store/json-store";
import { appendAuditEntries, buildAuditRecord, newAuditEntry, plainJson } from "./audit";

export class CatalogReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogReadError";
  }
}

export class CatalogInvariantError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Pricing catalog invariants violated: ${problems.join(" | ")}`);
    this.name = "CatalogInvariantError";
  }
}

export function parseCatalog(data: unknown): PricingCatalog {
  const result = pricingCatalogSchema.safeParse(data);
  if (!result.success) {
    const where = result.error.issues
      .slice(0, 3)
      .map((issue) => issue.path.map(String).join(".") || "(root)")
      .join(", ");
    throw new CatalogReadError(`Pricing catalog failed validation at: ${where}.`);
  }
  return result.data;
}

/** The stored catalog, or null before the first save. Throws CatalogReadError for a corrupt file. */
export async function readCatalog(): Promise<PricingCatalog | null> {
  let raw: unknown;
  try {
    raw = await readStoreFile(STORE_FILES.catalog);
  } catch (error) {
    if (error instanceof StoreFormatError) throw new CatalogReadError("The pricing catalog file is not valid JSON.");
    throw error;
  }
  return raw === undefined ? null : parseCatalog(raw);
}

/**
 * Reads the catalog, prunes packages that are no longer in the tour data, applies a pure
 * operation, checks every invariant and writes the catalog plus its audit entries. The whole
 * sequence runs under the store lock, so two saves can never interleave; `mutate` must be pure
 * so a failed invariant check leaves nothing behind.
 */
export async function mutateCatalog(params: {
  actor: Actor;
  knownSlugs: ReadonlySet<string>;
  now: string;
  mutate: (catalog: PricingCatalog) => OperationResult;
}): Promise<PricingCatalog> {
  return withStoreLock(async () => {
    const stored = (await readCatalog()) ?? emptyCatalog();
    const pruned = pruneRetiredPackages(stored, params.knownSlugs);
    const { catalog, audits } = params.mutate(pruned.catalog);
    const problems = catalogInvariantProblems(catalog, params.knownSlugs);
    if (problems.length > 0) throw new CatalogInvariantError(problems);
    await writeStoreFile(STORE_FILES.catalog, plainJson(catalog));
    await appendAuditEntries(
      [...pruned.audits, ...audits].map((audit) =>
        newAuditEntry(buildAuditRecord(audit, params.actor, params.now, catalog.revision)),
      ),
    );
    return catalog;
  });
}
