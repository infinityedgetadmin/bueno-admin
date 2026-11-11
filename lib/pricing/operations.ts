import { CURRENCY_CODES, CURRENCY_SHORT_NAMES, PRICE_BASIS_LABELS } from "./constants";
import { compareIsoDates, formatDateRange } from "./dates";
import { resolvePackageCommercial } from "./defaults";
import { formatMoney, formatRate } from "./money";
import type {
  CurrencyAmounts,
  CurrencyCode,
  CurrencyMode,
  PackageCommercial,
  PackageDraft,
  PricingCatalog,
  Promotion,
  PromotionDraft,
  RoundingSteps,
  Season,
  SeasonDraft,
  SeasonPrice,
} from "./types";

export interface Actor {
  uid: string;
  email: string;
}

export type AuditEntityType = "package" | "season" | "promotion" | "currency" | "team" | "auth";

export type AuditAction =
  | "package.update"
  | "package.featured_moved"
  | "package.delete"
  | "season.create"
  | "season.update"
  | "season.delete"
  | "promotion.create"
  | "promotion.update"
  | "promotion.pause"
  | "promotion.resume"
  | "promotion.delete"
  | "currency.update"
  | "team.add"
  | "team.update"
  | "auth.sign_in";

export interface AuditDraft {
  action: AuditAction;
  entity: { type: AuditEntityType; id: string };
  summary: string;
  before: unknown;
  after: unknown;
}

export interface OperationResult {
  catalog: PricingCatalog;
  audits: AuditDraft[];
}

export interface MutationContext {
  actor: Actor;
  now: string;
}

export class VersionConflictError extends Error {
  constructor(entity: string) {
    super(`${entity} was changed by someone else.`);
    this.name = "VersionConflictError";
  }
}

export class EntityNotFoundError extends Error {
  constructor(entity: string) {
    super(`${entity} no longer exists.`);
    this.name = "EntityNotFoundError";
  }
}

function stamp(catalog: PricingCatalog, ctx: MutationContext): PricingCatalog {
  return { ...catalog, revision: catalog.revision + 1, updatedAt: ctx.now, updatedBy: ctx.actor.email };
}

function fixedAmounts(
  modes: Record<CurrencyCode, CurrencyMode>,
  amounts: Record<CurrencyCode, number | null>,
): CurrencyAmounts {
  const result: CurrencyAmounts = {};
  for (const currency of CURRENCY_CODES) {
    const value = amounts[currency];
    if (modes[currency] === "fixed" && value !== null) result[currency] = value;
  }
  return result;
}

function seasonPricesEqual(a: SeasonPrice[], b: SeasonPrice[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function describePackageChange(title: string, before: PackageCommercial, after: PackageCommercial): string {
  const changes: string[] = [];
  if (before.visible !== after.visible) {
    changes.push(after.visible ? "published on the website" : "hidden from the website");
  }
  if (before.display !== after.display) {
    changes.push(after.display === "price" ? "shows its price" : "shows “Chat with an agent” instead of a price");
  }
  if (before.basis !== after.basis) {
    changes.push(after.basis === null ? "price basis removed" : `price basis ${PRICE_BASIS_LABELS[after.basis]}`);
  }
  for (const currency of CURRENCY_CODES) {
    const name = CURRENCY_SHORT_NAMES[currency];
    if (before.currencies[currency] !== after.currencies[currency]) {
      changes.push(`${name} price ${before.currencies[currency]} → ${after.currencies[currency]}`);
    }
    const previous = before.base[currency];
    const next = after.base[currency];
    if (previous !== next && next !== undefined) {
      changes.push(
        previous === undefined
          ? `${name} base ${formatMoney(next, currency)}`
          : `${name} base ${formatMoney(previous, currency)} → ${formatMoney(next, currency)}`,
      );
    }
  }
  if (!seasonPricesEqual(before.seasonPrices, after.seasonPrices)) changes.push("season prices updated");
  if (before.featuredRank !== after.featuredRank) {
    changes.push(after.featuredRank === null ? "removed from featured" : `featured in slot ${after.featuredRank}`);
  }
  return `${title}: ${changes.length > 0 ? changes.join("; ") : "saved without changes"}`;
}

export function applyPackageUpdate(params: {
  catalog: PricingCatalog;
  slug: string;
  draft: PackageDraft;
  expectedVersion: number;
  listPriceUsd: number;
  titleOf: (slug: string) => string;
  ctx: MutationContext;
}): OperationResult {
  const { catalog, slug, draft, expectedVersion, listPriceUsd, titleOf, ctx } = params;
  const current = resolvePackageCommercial(catalog, slug, listPriceUsd);
  if (current.version !== expectedVersion) throw new VersionConflictError(`Package ${slug}`);

  const seasonPrices = draft.seasonPrices
    .map((row): SeasonPrice => ({ seasonId: row.seasonId, ...fixedAmounts(draft.currencies, row) }))
    .filter((row) => CURRENCY_CODES.some((currency) => row[currency] !== undefined))
    .sort((a, b) => compareIsoDates(a.seasonId, b.seasonId));

  const next: PackageCommercial = {
    visible: draft.visible,
    display: draft.display,
    basis: draft.basis,
    currencies: { USD: draft.currencies.USD, KES: draft.currencies.KES },
    base: fixedAmounts(draft.currencies, draft.base),
    seasonPrices,
    featuredRank: draft.featuredRank,
    version: current.version + 1,
    updatedAt: ctx.now,
    updatedBy: ctx.actor.email,
  };

  const packages: Record<string, PackageCommercial> = { ...catalog.packages, [slug]: next };
  const audits: AuditDraft[] = [
    {
      action: "package.update",
      entity: { type: "package", id: slug },
      summary: describePackageChange(titleOf(slug), current, next),
      before: current,
      after: next,
    },
  ];

  if (next.featuredRank !== null) {
    for (const [otherSlug, other] of Object.entries(catalog.packages)) {
      if (otherSlug === slug || other.featuredRank !== next.featuredRank) continue;
      const moved: PackageCommercial = {
        ...other,
        featuredRank: null,
        version: other.version + 1,
        updatedAt: ctx.now,
        updatedBy: ctx.actor.email,
      };
      packages[otherSlug] = moved;
      audits.push({
        action: "package.featured_moved",
        entity: { type: "package", id: otherSlug },
        summary: `${titleOf(otherSlug)}: left featured slot ${next.featuredRank} (now ${titleOf(slug)})`,
        before: other,
        after: moved,
      });
    }
  }

  return { catalog: stamp({ ...catalog, packages }, ctx), audits };
}

function sortSeasons(seasons: Season[]): Season[] {
  return [...seasons].sort((a, b) => compareIsoDates(a.startDate, b.startDate));
}

function findVersioned<T extends { id: string; version: number }>(
  items: readonly T[],
  id: string,
  expectedVersion: number,
  label: string,
): T {
  const item = items.find((candidate) => candidate.id === id);
  if (item === undefined) throw new EntityNotFoundError(`${label} ${id}`);
  if (item.version !== expectedVersion) throw new VersionConflictError(`${label} ${id}`);
  return item;
}

export function upsertSeason(params: {
  catalog: PricingCatalog;
  draft: SeasonDraft;
  expectedVersion: number;
  ctx: MutationContext;
  newId: () => string;
}): OperationResult {
  const { catalog, draft, expectedVersion, ctx, newId } = params;
  const fields = { name: draft.name.trim(), startDate: draft.startDate, endDate: draft.endDate };
  const range = formatDateRange(fields.startDate, fields.endDate);

  if (draft.id === null) {
    const created: Season = { id: newId(), ...fields, version: 1 };
    return {
      catalog: stamp({ ...catalog, seasons: sortSeasons([...catalog.seasons, created]) }, ctx),
      audits: [
        {
          action: "season.create",
          entity: { type: "season", id: created.id },
          summary: `Season “${created.name}” created (${range})`,
          before: null,
          after: created,
        },
      ],
    };
  }

  const existing = findVersioned(catalog.seasons, draft.id, expectedVersion, "Season");
  const updated: Season = { ...existing, ...fields, version: existing.version + 1 };
  return {
    catalog: stamp(
      { ...catalog, seasons: sortSeasons(catalog.seasons.map((s) => (s.id === updated.id ? updated : s))) },
      ctx,
    ),
    audits: [
      {
        action: "season.update",
        entity: { type: "season", id: updated.id },
        summary: `Season “${updated.name}” updated (${range})`,
        before: existing,
        after: updated,
      },
    ],
  };
}

export function deleteSeason(params: {
  catalog: PricingCatalog;
  id: string;
  expectedVersion: number;
  ctx: MutationContext;
}): OperationResult {
  const { catalog, id, expectedVersion, ctx } = params;
  const existing = findVersioned(catalog.seasons, id, expectedVersion, "Season");
  let affected = 0;
  const packages = Object.fromEntries(
    Object.entries(catalog.packages).map(([slug, pkg]): [string, PackageCommercial] => {
      if (!pkg.seasonPrices.some((price) => price.seasonId === id)) return [slug, pkg];
      affected += 1;
      return [
        slug,
        {
          ...pkg,
          seasonPrices: pkg.seasonPrices.filter((price) => price.seasonId !== id),
          version: pkg.version + 1,
          updatedAt: ctx.now,
          updatedBy: ctx.actor.email,
        },
      ];
    }),
  );
  return {
    catalog: stamp({ ...catalog, seasons: catalog.seasons.filter((s) => s.id !== id), packages }, ctx),
    audits: [
      {
        action: "season.delete",
        entity: { type: "season", id },
        summary: `Season “${existing.name}” deleted; its prices were removed from ${affected} package${affected === 1 ? "" : "s"}`,
        before: existing,
        after: null,
      },
    ],
  };
}

function describeTarget(promotion: Promotion): string {
  if (promotion.appliesTo.kind === "all") return "all packages";
  const count = promotion.appliesTo.slugs.length;
  return `${count} package${count === 1 ? "" : "s"}`;
}

function describePromotion(promotion: Promotion): string {
  return `${promotion.percentOff}% off, ${formatDateRange(promotion.startDate, promotion.endDate)}, ${describeTarget(promotion)}`;
}

export function upsertPromotion(params: {
  catalog: PricingCatalog;
  draft: PromotionDraft & { percentOff: number };
  expectedVersion: number;
  ctx: MutationContext;
  newId: () => string;
}): OperationResult {
  const { catalog, draft, expectedVersion, ctx, newId } = params;
  const terms = draft.terms.trim();
  const fields = {
    name: draft.name.trim(),
    label: draft.label.trim(),
    percentOff: draft.percentOff,
    startDate: draft.startDate,
    endDate: draft.endDate,
    appliesTo:
      draft.appliesTo.kind === "all"
        ? ({ kind: "all" } as const)
        : ({ kind: "packages", slugs: [...new Set(draft.appliesTo.slugs)].sort() } as const),
    terms: terms.length > 0 ? terms : null,
  };

  if (draft.id === null) {
    const created: Promotion = { id: newId(), ...fields, paused: false, version: 1 };
    return {
      catalog: stamp({ ...catalog, promotions: [...catalog.promotions, created] }, ctx),
      audits: [
        {
          action: "promotion.create",
          entity: { type: "promotion", id: created.id },
          summary: `Promotion “${created.name}” created: ${describePromotion(created)}`,
          before: null,
          after: created,
        },
      ],
    };
  }

  const existing = findVersioned(catalog.promotions, draft.id, expectedVersion, "Promotion");
  const updated: Promotion = { ...existing, ...fields, version: existing.version + 1 };
  return {
    catalog: stamp({ ...catalog, promotions: catalog.promotions.map((p) => (p.id === updated.id ? updated : p)) }, ctx),
    audits: [
      {
        action: "promotion.update",
        entity: { type: "promotion", id: updated.id },
        summary: `Promotion “${updated.name}” updated: ${describePromotion(updated)}`,
        before: existing,
        after: updated,
      },
    ],
  };
}

export function setPromotionPaused(params: {
  catalog: PricingCatalog;
  id: string;
  paused: boolean;
  expectedVersion: number;
  ctx: MutationContext;
}): OperationResult {
  const { catalog, id, paused, expectedVersion, ctx } = params;
  const existing = findVersioned(catalog.promotions, id, expectedVersion, "Promotion");
  const updated: Promotion = { ...existing, paused, version: existing.version + 1 };
  return {
    catalog: stamp({ ...catalog, promotions: catalog.promotions.map((p) => (p.id === id ? updated : p)) }, ctx),
    audits: [
      {
        action: paused ? "promotion.pause" : "promotion.resume",
        entity: { type: "promotion", id },
        summary: `Promotion “${existing.name}” ${paused ? "paused" : "resumed"}`,
        before: existing,
        after: updated,
      },
    ],
  };
}

export function deletePromotion(params: {
  catalog: PricingCatalog;
  id: string;
  expectedVersion: number;
  ctx: MutationContext;
}): OperationResult {
  const { catalog, id, expectedVersion, ctx } = params;
  const existing = findVersioned(catalog.promotions, id, expectedVersion, "Promotion");
  return {
    catalog: stamp({ ...catalog, promotions: catalog.promotions.filter((p) => p.id !== id) }, ctx),
    audits: [
      {
        action: "promotion.delete",
        entity: { type: "promotion", id },
        summary: `Promotion “${existing.name}” deleted`,
        before: existing,
        after: null,
      },
    ],
  };
}

export function applyCurrencyUpdate(params: {
  catalog: PricingCatalog;
  kesPerUsdE4: number;
  roundingStep: RoundingSteps;
  expectedVersion: number;
  ctx: MutationContext;
}): OperationResult {
  const { catalog, kesPerUsdE4, roundingStep, expectedVersion, ctx } = params;
  const current = catalog.currency;
  const currentVersion = current === null ? 0 : current.version;
  if (currentVersion !== expectedVersion) throw new VersionConflictError("Currency settings");
  const next = {
    kesPerUsdE4,
    roundingStep: { USD: roundingStep.USD, KES: roundingStep.KES },
    version: currentVersion + 1,
    updatedAt: ctx.now,
    updatedBy: ctx.actor.email,
  };
  const rounding = `rounding: ${formatMoney(roundingStep.USD, "USD")}, ${formatMoney(roundingStep.KES, "KES")}`;
  const summary =
    current === null
      ? `Exchange rate set to KSh ${formatRate(kesPerUsdE4)} per dollar (${rounding})`
      : `Exchange rate KSh ${formatRate(current.kesPerUsdE4)} → KSh ${formatRate(kesPerUsdE4)} per dollar (${rounding})`;
  return {
    catalog: stamp({ ...catalog, currency: next }, ctx),
    audits: [{ action: "currency.update", entity: { type: "currency", id: "settings" }, summary, before: current, after: next }],
  };
}

function quotedList(values: readonly string[]): string {
  return values.map((value) => `“${value}”`).join(", ");
}

/**
 * Drops what still points at packages that are no longer in `data/cms.ts`: their stored
 * records, and their slugs in promotions scoped to packages (a promotion left with no known
 * package is removed). The website and the back office read the pruned catalog, and every write
 * prunes the stored catalog first and saves these audits with it, so a retired tour never blocks
 * a save. The audits are attributed to the admin whose save persisted the prune, so each summary
 * starts "Automatically". Versions and the revision are left alone: every reader already sees the
 * pruned catalog, so nobody holds a copy this makes stale, and the write that persists it stamps
 * the revision.
 */
export function pruneRetiredPackages(catalog: PricingCatalog, knownSlugs: ReadonlySet<string>): OperationResult {
  const audits: AuditDraft[] = [];
  const packages: Record<string, PackageCommercial> = {};
  for (const [slug, pkg] of Object.entries(catalog.packages)) {
    if (knownSlugs.has(slug)) {
      packages[slug] = pkg;
      continue;
    }
    audits.push({
      action: "package.delete",
      entity: { type: "package", id: slug },
      summary: `Automatically removed the pricing for package “${slug}” because it is no longer on the website`,
      before: pkg,
      after: null,
    });
  }

  const promotions = catalog.promotions.flatMap((promotion): Promotion[] => {
    if (promotion.appliesTo.kind === "all") return [promotion];
    const retired = promotion.appliesTo.slugs.filter((slug) => !knownSlugs.has(slug));
    if (retired.length === 0) return [promotion];
    const slugs = promotion.appliesTo.slugs.filter((slug) => knownSlugs.has(slug));
    if (slugs.length === 0) {
      audits.push({
        action: "promotion.delete",
        entity: { type: "promotion", id: promotion.id },
        summary: `Automatically deleted promotion “${promotion.name}” because every package it applied to (${quotedList(retired)}) is no longer on the website`,
        before: promotion,
        after: null,
      });
      return [];
    }
    const narrowed: Promotion = { ...promotion, appliesTo: { kind: "packages", slugs } };
    audits.push({
      action: "promotion.update",
      entity: { type: "promotion", id: promotion.id },
      summary: `Automatically removed ${quotedList(retired)} from promotion “${promotion.name}” because ${retired.length === 1 ? "that package is" : "those packages are"} no longer on the website`,
      before: promotion,
      after: narrowed,
    });
    return [narrowed];
  });

  return { catalog: { ...catalog, packages, promotions }, audits };
}
