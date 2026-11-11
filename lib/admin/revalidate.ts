import "server-only";
import { revalidatePath } from "next/cache";
import { logError } from "@/lib/logger";

/**
 * Public pricing pages are ISR; mark every site page stale after any catalog change.
 * Never throws: it runs after the catalog write has already committed, so a failure here must
 * not turn into a false "nothing was saved" for the admin.
 */
export function revalidateSite(): void {
  try {
    revalidatePath("/", "layout");
  } catch (error) {
    logError("admin.revalidate", error);
  }
}
