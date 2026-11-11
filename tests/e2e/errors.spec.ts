import { expect, test } from "@playwright/test";
import { OWNER_EMAIL, freshState, seedExchangeRate, seedMalformedCatalog, signInAs } from "./support";

test("a console page that can't read the catalog shows the branded error in the shell, and Try again recovers", async ({
  page,
}) => {
  await freshState({ withRate: false });
  await seedMalformedCatalog();
  await signInAs(page, OWNER_EMAIL);

  await page.goto("/admin/packages");
  await expect(page.getByRole("heading", { name: "Something went wrong", level: 1 })).toBeVisible();
  // (Not getByRole("alert"): Next's route announcer is an alert too.)
  await expect(page.getByText("This page couldn't load. It's usually temporary, so please try again.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/admin/login");
  // The shell stays usable around the error, and nothing internal leaks into the page.
  await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Seasons" })).toBeVisible();
  await expect(page.getByText(/schemaVersion|failed validation|CatalogReadError/)).toHaveCount(0);

  // Fix the data, then retry: the segment is fetched again rather than re-rendered from the failure.
  await seedExchangeRate();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Packages", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);
});
