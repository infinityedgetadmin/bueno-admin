import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: { uid: "u1", email: "owner@bueno.example.com", role: "admin" as const },
  listAudit: vi.fn(async () => {
    throw new Error("index building");
  }),
  logError: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ requireAdminPage: vi.fn(async () => mocks.actor) }));
vi.mock("@/lib/cms/audit", () => ({ listAudit: mocks.listAudit }));
vi.mock("@/lib/logger", () => ({ logError: mocks.logError }));

import ActivityPage from "@/app/(admin)/admin/(console)/activity/page";

describe("ActivityPage", () => {
  it("tolerates a failed activity query instead of crashing the page", async () => {
    render(await ActivityPage());
    expect(screen.getByRole("heading", { name: "Activity" })).toBeInTheDocument();
    expect(screen.getByText("The activity log can't be shown right now.")).toBeInTheDocument();
    expect(mocks.logError).toHaveBeenCalledWith("admin.activity.list", expect.any(Error));
  });
});
