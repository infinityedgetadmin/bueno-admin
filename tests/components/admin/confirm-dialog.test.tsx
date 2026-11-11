import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/admin/ui/ConfirmDialog";

function renderDialog(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      open
      title="Delete “Festive”?"
      confirmLabel="Delete season"
      tone="danger"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    >
      Its prices will be removed from 2 packages.
    </ConfirmDialog>,
  );
  return { onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  it("renders an accessible alert dialog and focuses Cancel", () => {
    renderDialog();
    const dialog = screen.getByRole("alertdialog", { name: "Delete “Festive”?" });
    expect(dialog).toHaveAccessibleDescription("Its prices will be removed from 2 packages.");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("confirms and cancels", async () => {
    const { onConfirm, onCancel } = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Delete season" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and keeps Tab inside the dialog", async () => {
    const { onCancel } = renderDialog();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Delete season" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Delete season" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape and backdrop clicks while busy", async () => {
    const { onCancel } = renderDialog({ busy: true });
    await userEvent.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("renders nothing when closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("keeps focus trapped in the panel when busy starts mid-dialog", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <ConfirmDialog
        open
        title="Delete “Festive”?"
        confirmLabel="Delete season"
        tone="danger"
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        Its prices will be removed from 2 packages.
      </ConfirmDialog>,
    );
    const dialog = screen.getByRole("alertdialog");

    rerender(
      <ConfirmDialog
        open
        title="Delete “Festive”?"
        confirmLabel="Delete season"
        tone="danger"
        busy
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        Its prices will be removed from 2 packages.
      </ConfirmDialog>,
    );

    // Both buttons are disabled while busy, so focus must have moved onto the panel itself
    // rather than escape to <body>.
    expect(dialog).toContainElement(document.activeElement as HTMLElement | null);

    await userEvent.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement | null);

    await userEvent.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("does not move focus when onCancel's identity changes", () => {
    const onConfirm = vi.fn();
    const { rerender } = render(
      <ConfirmDialog open title="Delete “Festive”?" confirmLabel="Delete season" onConfirm={onConfirm} onCancel={vi.fn()}>
        Its prices will be removed from 2 packages.
      </ConfirmDialog>,
    );
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveFocus();

    rerender(
      <ConfirmDialog open title="Delete “Festive”?" confirmLabel="Delete season" onConfirm={onConfirm} onCancel={vi.fn()}>
        Its prices will be removed from 2 packages.
      </ConfirmDialog>,
    );

    expect(cancel).toHaveFocus();
  });

  it("returns focus to the previously focused element when it closes", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    function Harness({ open }: { open: boolean }) {
      return (
        <div>
          <button type="button">Open dialog</button>
          <ConfirmDialog open={open} title="Delete “Festive”?" confirmLabel="Delete season" onConfirm={onConfirm} onCancel={onCancel}>
            Its prices will be removed from 2 packages.
          </ConfirmDialog>
        </div>
      );
    }

    const { rerender } = render(<Harness open={false} />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });
    trigger.focus();
    expect(trigger).toHaveFocus();

    rerender(<Harness open />);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    rerender(<Harness open={false} />);
    expect(trigger).toHaveFocus();
  });
});
