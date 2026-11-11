import { expect, test } from "@playwright/test";
import { OWNER_EMAIL, addMember, freshState, seedPassword, signInAs, signInThroughForm } from "./support";

test.beforeEach(async () => {
  await freshState({ withRate: true });
});

test("signed-out visitors go to sign-in, and signing in returns them to the page they wanted", async ({ page }) => {
  await page.goto("/admin/packages");
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fpackages$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

  await signInThroughForm(page, OWNER_EMAIL, seedPassword(OWNER_EMAIL));

  await expect(page).toHaveURL(/\/admin\/packages$/);
  await expect(page.getByRole("heading", { name: "Packages", level: 1 })).toBeVisible();
  await expect(page.getByText(OWNER_EMAIL)).toBeVisible();
});

test("a wrong password is refused without saying which part was wrong", async ({ page }) => {
  await page.goto("/admin/login");
  await signInThroughForm(page, OWNER_EMAIL, "definitely-not-the-password");
  await expect(page.getByText("That email and password don't match. Check them and try again.")).toBeVisible();
  await expect(page.getByLabel("Password")).toHaveValue("");
  await expect(page).toHaveURL(/\/admin\/login/);

  await signInThroughForm(page, "stranger@example.com", "definitely-not-the-password");
  await expect(page.getByText("That email and password don't match. Check them and try again.")).toBeVisible();
});

test("people whose access was removed are turned away even with the right password", async ({ page }) => {
  await addMember("former@bueno-test.example.com", "editor", "former-password-1", false);
  await page.goto("/admin/login");
  await signInThroughForm(page, "former@bueno-test.example.com", "former-password-1");
  await expect(
    page.getByText("This account doesn't have access to the Bueno back office. Ask an admin to add you."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("the root of the site leads to the back office", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin$/);
});

test("signing out ends the session", async ({ page }) => {
  await signInAs(page, OWNER_EMAIL);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.goto("/admin/packages");
  await expect(page).toHaveURL(/\/admin\/login\?next=/);
});
