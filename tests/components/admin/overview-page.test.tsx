import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeCatalog } from "../../unit/pricing/fixtures";

const mocks = vi.hoisted(() => ({
  actor: { uid: "u1", email: "owner@bueno.example.com", role: "admin" as const },
  listAudit: vi.fn(async () => {
    throw new Error("index building");
  }),
  logError: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ requireAdminPage: vi.fn(async () => mocks.actor) }));
vi.mock("@/lib/admin/catalog-loader", () => ({ loadAdminCatalog: vi.fn(async () => makeCatalog()) }));
vi.mock("@/lib/cms/audit", () => ({ listAudit: mocks.listAudit }));
vi.mock("@/lib/logger", () => ({ logError: mocks.logError }));

import OverviewPage from "@/app/(admin)/admin/(console)/page";

describe("OverviewPage", () => {
  it("tolerates a failed activity query instead of crashing the page", async () => {
    render(await OverviewPage());
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText("The activity log can't be shown right now.")).toBeInTheDocument();
    expect(mocks.logError).toHaveBeenCalledWith("admin.overview.activity", expect.any(Error));
  });
});
