import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { E2E_DATA_DIR } from "../support/store";
import { EDITOR_EMAIL, SAVED_LIVE, freshState, signInAs } from "./support";

test.beforeEach(async ({ page }) => {
  await freshState({ withRate: true });
  await signInAs(page, EDITOR_EMAIL);
});

test("saving a package price lands in catalog.json and in the activity log", async ({ page }) => {
  await page.goto("/admin/packages/coastal-escape");
  await page.getByLabel("Standard price (USD)").fill("3200");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(SAVED_LIVE)).toBeVisible();

  const catalog = JSON.parse(await readFile(path.join(E2E_DATA_DIR, "catalog.json"), "utf8")) as {
    packages: Record<string, { base: { USD?: number } }>;
  };
  expect(catalog.packages["coastal-escape"]?.base.USD).toBe(3200);

  await page.goto("/admin/activity");
  await expect(page.getByText(/dollar base/).first()).toBeVisible();
  await expect(page.getByText(EDITOR_EMAIL).first()).toBeVisible();
});
