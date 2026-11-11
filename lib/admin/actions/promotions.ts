"use server";

import { randomUUID } from "node:crypto";
import { mutateCatalog } from "@/lib/cms/catalog-repo";
import { KNOWN_TOUR_SLUGS } from "@/lib/cms/known-slugs";
import { todayInNairobi } from "@/lib/pricing/dates";
import { deletePromotion, setPromotionPaused, upsertPromotion } from "@/lib/pricing/operations";
import {
  entityVersionSchema,
  promotionFormSchema,
  promotionPauseSchema,
  type EntityVersionInput,
  type PromotionFormInput,
  type PromotionPauseInput,
} from "@/lib/pricing/schemas";
import { hasErrors, validatePromotionDraft } from "@/lib/pricing/validation";
import { MESSAGES, invalid, needsConfirmation, succeed, type ActionResult } from "../action-result";
import { runAdminAction } from "../action-runtime";
import { loadAdminCatalog } from "../catalog-loader";
import { revalidateSite } from "../revalidate";

export async function savePromotionAction(input: PromotionFormInput): Promise<ActionResult<{ id: string }>> {
  return runAdminAction({ context: "admin.promotions.save", permission: "catalog.write" }, async (actor) => {
    const parsed = promotionFormSchema.safeParse(input);
    if (!parsed.success) return invalid({}, MESSAGES.invalidRequest);
    const { expectedVersion, confirmed, ...draft } = parsed.data;
    const catalog = await loadAdminCatalog();
    const outcome = validatePromotionDraft({ draft, catalog, today: todayInNairobi(), knownSlugs: KNOWN_TOUR_SLUGS });
    if (hasErrors(outcome)) return invalid(outcome.errors, MESSAGES.fixFields);
    if (outcome.warnings.length > 0 && !confirmed) return needsConfirmation(outcome.warnings);
    const percentOff = draft.percentOff;
    if (percentOff === null) return invalid({ percentOff: "Enter a discount percentage." }, MESSAGES.fixFields);

    const now = new Date().toISOString();
    const id = draft.id ?? `promo-${randomUUID()}`;
    await mutateCatalog({
      actor,
      knownSlugs: KNOWN_TOUR_SLUGS,
      now,
      mutate: (current) =>
        upsertPromotion({ catalog: current, draft: { ...draft, percentOff }, expectedVersion, ctx: { actor, now }, newId: () => id }),
    });
    revalidateSite();
    return succeed({ id }, draft.id === null ? "Promotion created. It shows on the website within about a minute." : MESSAGES.savedLive);
  });
}

export async function setPromotionPausedAction(input: PromotionPauseInput): Promise<ActionResult<null>> {
  return runAdminAction({ context: "admin.promotions.pause", permission: "catalog.write" }, async (actor) => {
    const parsed = promotionPauseSchema.safeParse(input);
    if (!parsed.success) return invalid({}, MESSAGES.invalidRequest);
    const now = new Date().toISOString();
    await mutateCatalog({
      actor,
      knownSlugs: KNOWN_TOUR_SLUGS,
      now,
      mutate: (current) =>
        setPromotionPaused({
          catalog: current,
          id: parsed.data.id,
          paused: parsed.data.paused,
          expectedVersion: parsed.data.expectedVersion,
          ctx: { actor, now },
        }),
    });
    revalidateSite();
    return succeed(null, parsed.data.paused ? "Promotion paused." : "Promotion resumed.");
  });
}

export async function deletePromotionAction(input: EntityVersionInput): Promise<ActionResult<null>> {
  return runAdminAction({ context: "admin.promotions.delete", permission: "catalog.write" }, async (actor) => {
    const parsed = entityVersionSchema.safeParse(input);
    if (!parsed.success) return invalid({}, MESSAGES.invalidRequest);
    const now = new Date().toISOString();
    await mutateCatalog({
      actor,
      knownSlugs: KNOWN_TOUR_SLUGS,
      now,
      mutate: (current) =>
        deletePromotion({ catalog: current, id: parsed.data.id, expectedVersion: parsed.data.expectedVersion, ctx: { actor, now } }),
    });
    revalidateSite();
    return succeed(null, "Promotion deleted.");
  });
}
