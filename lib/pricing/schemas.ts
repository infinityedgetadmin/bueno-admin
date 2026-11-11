import { z } from "zod";
import { AMOUNT_LIMITS, RATE_LIMITS_E4 } from "./constants";
import { isIsoDate } from "./dates";
import type { CurrencyCode } from "./types";

const isoDate = z.string().refine(isIsoDate, "Enter a valid date.");
const slug = z.string().min(1).max(120);
const entityId = z.string().min(1).max(64);
const timestamp = z.string().min(1).max(40);
const email = z.string().min(3).max(254);
/** Stored amount bounds are per currency: USD 1–1,000,000, KES 1–150,000,000. */
const storedAmount = (currency: CurrencyCode) =>
  z.number().int().min(AMOUNT_LIMITS[currency].min).max(AMOUNT_LIMITS[currency].max);
/** Form amounts: null when empty; range and requiredness are checked by domain validation. */
const formAmount = z.number().int().min(0).max(1_000_000_000_000).nullable();

export const currencyCodeSchema = z.enum(["USD", "KES"]);
export const currencyModeSchema = z.enum(["fixed", "converted", "off"]);
export const priceBasisSchema = z.enum(["per_person", "per_person_sharing", "per_couple", "per_group"]);
export const displayModeSchema = z.enum(["price", "enquire"]);
export const featuredRankSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const usdStepSchema = z.union([z.literal(1), z.literal(5), z.literal(10), z.literal(50), z.literal(100)]);
const kesStepSchema = z.union([
  z.literal(1),
  z.literal(10),
  z.literal(50),
  z.literal(100),
  z.literal(500),
  z.literal(1000),
]);

export const currencySettingsSchema = z.object({
  kesPerUsdE4: z.number().int().min(RATE_LIMITS_E4.min).max(RATE_LIMITS_E4.max),
  roundingStep: z.object({ USD: usdStepSchema, KES: kesStepSchema }),
  version: z.number().int().min(1),
  updatedAt: timestamp,
  updatedBy: email,
});

export const seasonSchema = z.object({
  id: entityId,
  name: z.string().min(1).max(80),
  startDate: isoDate,
  endDate: isoDate,
  version: z.number().int().min(1),
});

const storedTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all") }),
  z.object({ kind: z.literal("packages"), slugs: z.array(slug).min(1).max(100) }),
]);

const formTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all") }),
  z.object({ kind: z.literal("packages"), slugs: z.array(slug).max(100) }),
]);

export const promotionSchema = z.object({
  id: entityId,
  name: z.string().min(1).max(120),
  label: z.string().min(1).max(48),
  percentOff: z.number().int().min(1).max(90),
  startDate: isoDate,
  endDate: isoDate,
  appliesTo: storedTargetSchema,
  paused: z.boolean(),
  terms: z.string().max(320).nullable(),
  version: z.number().int().min(1),
});

export const packageCommercialSchema = z.object({
  visible: z.boolean(),
  display: displayModeSchema,
  basis: priceBasisSchema.nullable(),
  currencies: z.object({ USD: currencyModeSchema, KES: currencyModeSchema }),
  base: z.object({ USD: storedAmount("USD").optional(), KES: storedAmount("KES").optional() }),
  seasonPrices: z
    .array(
      z.object({
        seasonId: entityId,
        USD: storedAmount("USD").optional(),
        KES: storedAmount("KES").optional(),
      }),
    )
    .max(200),
  featuredRank: featuredRankSchema.nullable(),
  version: z.number().int().min(1),
  updatedAt: timestamp,
  updatedBy: email,
});

export const pricingCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().min(0),
  currency: currencySettingsSchema.nullable(),
  seasons: z.array(seasonSchema).max(200),
  promotions: z.array(promotionSchema).max(200),
  packages: z.record(slug, packageCommercialSchema),
  updatedAt: timestamp.nullable(),
  updatedBy: email.nullable(),
});

// ─── Admin form payloads (shape only — semantics live in validation.ts) ───

export const packageFormSchema = z.object({
  slug,
  expectedVersion: z.number().int().min(0),
  confirmed: z.boolean(),
  visible: z.boolean(),
  display: displayModeSchema,
  basis: priceBasisSchema.nullable(),
  currencies: z.object({ USD: currencyModeSchema, KES: currencyModeSchema }),
  base: z.object({ USD: formAmount, KES: formAmount }),
  seasonPrices: z.array(z.object({ seasonId: entityId, USD: formAmount, KES: formAmount })).max(200),
  featuredRank: featuredRankSchema.nullable(),
});
export type PackageFormInput = z.infer<typeof packageFormSchema>;

export const seasonFormSchema = z.object({
  id: entityId.nullable(),
  expectedVersion: z.number().int().min(0),
  name: z.string().max(200),
  startDate: z.string().max(20),
  endDate: z.string().max(20),
});
export type SeasonFormInput = z.infer<typeof seasonFormSchema>;

export const entityVersionSchema = z.object({
  id: entityId,
  expectedVersion: z.number().int().min(1),
});
export type EntityVersionInput = z.infer<typeof entityVersionSchema>;

export const promotionFormSchema = z.object({
  id: entityId.nullable(),
  expectedVersion: z.number().int().min(0),
  name: z.string().max(300),
  label: z.string().max(100),
  // Any number (or null when blank): whole-number and 1–90 checks are domain rules, so an
  // out-of-range value such as 150 gets validation.ts's specific message, not a generic one.
  percentOff: z.number().nullable(),
  startDate: z.string().max(20),
  endDate: z.string().max(20),
  appliesTo: formTargetSchema,
  terms: z.string().max(1000),
  confirmed: z.boolean(),
});
export type PromotionFormInput = z.infer<typeof promotionFormSchema>;

export const promotionPauseSchema = entityVersionSchema.extend({ paused: z.boolean() });
export type PromotionPauseInput = z.infer<typeof promotionPauseSchema>;

export const currencyFormSchema = z.object({
  expectedVersion: z.number().int().min(0),
  rate: z.string().max(20),
  roundingStep: z.object({ USD: z.number().int(), KES: z.number().int() }),
  confirmed: z.boolean(),
});
export type CurrencyFormInput = z.infer<typeof currencyFormSchema>;

// ─── Admin users, sessions, audit ───

export const adminRoleSchema = z.enum(["admin", "editor", "viewer"]);

export const adminUserSchema = z.object({
  email,
  role: adminRoleSchema,
  active: z.boolean(),
  addedAt: timestamp,
  addedBy: z.string().min(1).max(254),
  lastSignInAt: timestamp.nullable(),
});

export const teamAddSchema = z.object({
  email: z.string().max(254),
  role: adminRoleSchema,
  // Length and content rules live in lib/admin/password.ts so the form gets a specific message.
  password: z.string().max(1000),
});
export type TeamAddInput = z.infer<typeof teamAddSchema>;

export const teamUpdateSchema = z.object({
  email: z.string().max(254),
  role: adminRoleSchema,
  active: z.boolean(),
});
export type TeamUpdateInput = z.infer<typeof teamUpdateSchema>;

export const sessionRequestSchema = z.object({ email: z.string().min(3).max(254), password: z.string().min(1).max(1000) });

export const auditEntityTypeSchema = z.enum(["package", "season", "promotion", "currency", "team", "auth"]);

export const auditActionSchema = z.enum([
  "package.update",
  "package.featured_moved",
  "package.delete",
  "season.create",
  "season.update",
  "season.delete",
  "promotion.create",
  "promotion.update",
  "promotion.pause",
  "promotion.resume",
  "promotion.delete",
  "currency.update",
  "team.add",
  "team.update",
  "auth.sign_in",
]);

export const auditRecordSchema = z.object({
  at: timestamp,
  actor: z.object({ uid: z.string().min(1).max(128), email }),
  action: auditActionSchema,
  entity: z.object({ type: auditEntityTypeSchema, id: z.string().min(1).max(254) }),
  summary: z.string().max(2000),
  before: z.unknown(),
  after: z.unknown(),
  revision: z.number().int().min(0).nullable(),
});

export const auditEntrySchema = auditRecordSchema.extend({ id: z.string().min(1).max(64) });
