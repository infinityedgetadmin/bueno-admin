"use server";

import { mutateCatalog } from "@/lib/cms/catalog-repo";
import { KNOWN_TOUR_SLUGS } from "@/lib/cms/known-slugs";
import { applyCurrencyUpdate } from "@/lib/pricing/operations";
import { currencyFormSchema, type CurrencyFormInput } from "@/lib/pricing/schemas";
import { validateCurrencyDraft } from "@/lib/pricing/validation";
import { MESSAGES, invalid, needsConfirmation, succeed, type ActionResult } from "../action-result";
import { runAdminAction } from "../action-runtime";
import { loadAdminCatalog } from "../catalog-loader";
import { revalidateSite } from "../revalidate";

export async function saveCurrencyAction(input: CurrencyFormInput): Promise<ActionResult<{ version: number }>> {
  return runAdminAction({ context: "admin.currency.save", permission: "catalog.write" }, async (actor) => {
    const parsed = currencyFormSchema.safeParse(input);
    if (!parsed.success) return invalid({}, MESSAGES.invalidRequest);
    const { expectedVersion, confirmed, ...draft } = parsed.data;
    const catalog = await loadAdminCatalog();
    const outcome = validateCurrencyDraft({ draft, current: catalog.currency });
    if (outcome.parsed === null) return invalid(outcome.errors, MESSAGES.fixFields);
    if (outcome.warnings.length > 0 && !confirmed) return needsConfirmation(outcome.warnings);

    const settings = outcome.parsed;
    const now = new Date().toISOString();
    const saved = await mutateCatalog({
      actor,
      knownSlugs: KNOWN_TOUR_SLUGS,
      now,
      mutate: (current) =>
        applyCurrencyUpdate({
          catalog: current,
          kesPerUsdE4: settings.kesPerUsdE4,
          roundingStep: settings.roundingStep,
          expectedVersion,
          ctx: { actor, now },
        }),
    });
    revalidateSite();
    return succeed({ version: saved.currency?.version ?? expectedVersion + 1 }, MESSAGES.savedLive);
  });
}
