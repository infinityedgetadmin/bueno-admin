"use server";

import { randomUUID } from "node:crypto";
import { mutateCatalog } from "@/lib/cms/catalog-repo";
import { KNOWN_TOUR_SLUGS } from "@/lib/cms/known-slugs";
import { todayInNairobi } from "@/lib/pricing/dates";
import { deleteSeason, upsertSeason } from "@/lib/pricing/operations";
import {
  entityVersionSchema,
  seasonFormSchema,
  type EntityVersionInput,
  type SeasonFormInput,
} from "@/lib/pricing/schemas";
import { hasErrors, validateSeasonDraft } from "@/lib/pricing/validation";
import { MESSAGES, invalid, succeed, type ActionResult } from "../action-result";
import { runAdminAction } from "../action-runtime";
import { loadAdminCatalog } from "../catalog-loader";
import { revalidateSite } from "../revalidate";

export async function saveSeasonAction(input: SeasonFormInput): Promise<ActionResult<{ id: string }>> {
  return runAdminAction({ context: "admin.seasons.save", permission: "catalog.write" }, async (actor) => {
    const parsed = seasonFormSchema.safeParse(input);
    if (!parsed.success) return invalid({}, MESSAGES.invalidRequest);
    const { expectedVersion, ...draft } = parsed.data;
    const catalog = await loadAdminCatalog();
    const outcome = validateSeasonDraft({ draft, catalog, today: todayInNairobi() });
    if (hasErrors(outcome)) return invalid(outcome.errors, MESSAGES.fixFields);

    const now = new Date().toISOString();
    const id = draft.id ?? `season-${randomUUID()}`;
    await mutateCatalog({
      actor,
      knownSlugs: KNOWN_TOUR_SLUGS,
      now,
      mutate: (current) => upsertSeason({ catalog: current, draft, expectedVersion, ctx: { actor, now }, newId: () => id }),
    });
    revalidateSite();
    return succeed({ id }, draft.id === null ? "Season created." : "Season updated.");
  });
}

export async function deleteSeasonAction(input: EntityVersionInput): Promise<ActionResult<null>> {
  return runAdminAction({ context: "admin.seasons.delete", permission: "catalog.write" }, async (actor) => {
    const parsed = entityVersionSchema.safeParse(input);
    if (!parsed.success) return invalid({}, MESSAGES.invalidRequest);
    const now = new Date().toISOString();
    await mutateCatalog({
      actor,
      knownSlugs: KNOWN_TOUR_SLUGS,
      now,
      mutate: (current) =>
        deleteSeason({ catalog: current, id: parsed.data.id, expectedVersion: parsed.data.expectedVersion, ctx: { actor, now } }),
    });
    revalidateSite();
    return succeed(null, "Season deleted. Its prices were removed from the packages that used it.");
  });
}
