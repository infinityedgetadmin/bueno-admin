import { expect, test } from "@playwright/test";
import { EDITOR_EMAIL, OWNER_EMAIL, VIEWER_EMAIL, freshState, signInAs } from "./support";

test.beforeEach(async () => {
  await freshState({ withRate: true });
});

test("viewers can see everything but change nothing", async ({ page }) => {
  await signInAs(page, VIEWER_EMAIL);
  await page.goto("/admin/packages/coastal-escape");
  await expect(page.getByText("View only").first()).toBeVisible();
  await expect(page.getByLabel("Standard price (USD)")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  await page.goto("/admin/promotions");
  // Confirm the page itself rendered before trusting the button's absence — otherwise an
  // errored or blank page would satisfy the same toHaveCount(0) check.
  await expect(page.getByRole("heading", { name: "Promotions", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "New promotion" })).toHaveCount(0);
  await page.goto("/admin/seasons");
  await expect(page.getByRole("heading", { name: "Seasons", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "New season" })).toHaveCount(0);
  await page.goto("/admin/settings");
  await expect(page.getByLabel("Shillings per US dollar")).toBeDisabled();
  await expect(page.getByRole("link", { name: "Team" })).toHaveCount(0);
});

test("editors manage pricing but not the team", async ({ page }) => {
  await signInAs(page, EDITOR_EMAIL);
  await page.goto("/admin");
  await expect(page.getByRole("link", { name: "Team" })).toHaveCount(0);
  await page.goto("/admin/team");
  await expect(page.getByText("Only admins can manage who has access to the back office.")).toBeVisible();
});

test("an admin's access changes apply on the person's next page load", async ({ page, browser, baseURL }) => {
  const person = "new.editor@bueno-test.example.com";
  const temporaryPassword = "welcome-new-editor-1";
  await signInAs(page, OWNER_EMAIL);
  await page.goto("/admin/team");
  await page.getByLabel("Email").fill(person);
  await page.getByLabel("Temporary password").fill(temporaryPassword);
  await page.getByLabel("Role", { exact: true }).selectOption("editor");
  await page.getByRole("button", { name: "Give access" }).click();
  await expect(page.getByText(`${person} can now sign in as Editor.`)).toBeVisible();

  const otherBrowser = await browser.newContext({ baseURL });
  const colleague = await otherBrowser.newPage();
  await signInAs(colleague, person, temporaryPassword);
  await colleague.goto("/admin/packages/coastal-escape");
  await expect(colleague.getByLabel("Standard price (USD)")).toBeEnabled();

  await page.getByLabel(`Role for ${person}`).selectOption("viewer");
  await expect(page.getByText(`Access updated for ${person}.`)).toBeVisible();
  await colleague.reload();
  await expect(colleague.getByLabel("Standard price (USD)")).toBeDisabled();

  await page.getByRole("switch", { name: new RegExp(`Access for ${person.replace(/\./g, "\\.")}`) }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove access" }).click();
  await expect(page.getByText(`${person} can no longer sign in.`)).toBeVisible();
  await colleague.reload();
  await expect(colleague).toHaveURL(/\/admin\/login\?error=not_authorized/);
  await otherBrowser.close();
});
