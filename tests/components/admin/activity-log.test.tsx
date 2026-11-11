import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import ActivityLog from "@/components/admin/ActivityLog";

const entries = [
  { id: "1", type: "package" as const, when: "24 Sept 2026, 10:00 EAT", who: "editor@bueno.example.com", summary: "Coastal Escape: dollar base $2,800 → $3,000" },
  { id: "2", type: "currency" as const, when: "24 Sept 2026, 09:00 EAT", who: "owner@bueno.example.com", summary: "Exchange rate set to KSh 129.5 per dollar" },
  { id: "3", type: "auth" as const, when: "24 Sept 2026, 08:00 EAT", who: "owner@bueno.example.com", summary: "owner@bueno.example.com signed in" },
];

describe("ActivityLog", () => {
  it("shows every entry and filters by type", async () => {
    render(<ActivityLog entries={entries} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    await userEvent.click(screen.getByRole("radio", { name: "Currency" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Exchange rate set to KSh 129.5 per dollar")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Promotions" }));
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
  });
});
