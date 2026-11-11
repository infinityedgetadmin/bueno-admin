import { expect, type Page } from "@playwright/test";
import {
  E2E_DATA_DIR,
  resetStore,
  seedExchangeRate,
  seedPassword,
  seedTeam,
  setSeedPassword,
  upsertMember,
} from "../support/store";

export { EDITOR_EMAIL, OWNER_EMAIL, VIEWER_EMAIL, seedExchangeRate, seedMalformedCatalog, seedPassword } from "../support/store";

// The web server (see playwright.config.ts) reads the same folder this process writes to.
process.env.BUENO_DATA_DIR = E2E_DATA_DIR;

export const SAVED_LIVE = "Saved. The website updates within about a minute.";

/** An empty data folder plus the seeded team, and the house exchange rate unless a test sets it itself. */
export async function freshState(options: { withRate: boolean }): Promise<void> {
  await resetStore();
  await seedTeam();
  if (options.withRate) await seedExchangeRate();
}

/** Adds someone to the team with a known password, bypassing the UI. */
export async function addMember(email: string, role: "admin" | "editor" | "viewer", password: string, active = true): Promise<void> {
  await upsertMember({ email, role, active });
  await setSeedPassword(email, password);
}

/** Signs in through the real session route without driving the form. */
export async function signInAs(page: Page, email: string, password: string = seedPassword(email)): Promise<void> {
  await page.goto("/admin/login");
  const status = await page.evaluate(
    async (credentials) => {
      const response = await fetch("/admin/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      return response.status;
    },
    { email, password },
  );
  expect(status).toBe(200);
}

/** Fills and submits the login form like a person would. */
export async function signInThroughForm(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
