import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/admin/ui/Button";
import { Field, FieldGroup } from "@/components/admin/ui/Field";
import { MoneyInput } from "@/components/admin/ui/MoneyInput";
import { Notice } from "@/components/admin/ui/Notice";
import { SegmentedControl } from "@/components/admin/ui/SegmentedControl";
import { Switch } from "@/components/admin/ui/Switch";
import { WarningsPanel } from "@/components/admin/ui/WarningsPanel";

describe("Button", () => {
  it("defaults to type=button and calls onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save changes</Button>);
    const button = screen.getByRole("button", { name: "Save changes" });
    expect(button).toHaveAttribute("type", "button");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled and busy while loading", async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save changes</Button>);
    const button = screen.getByRole("button", { name: "Save changes" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Field", () => {
  it("leaves a control with no hint or error undescribed and valid", () => {
    render(
      <Field id="name" label="Name">
        <input id="name" />
      </Field>,
    );
    const input = screen.getByLabelText("Name");
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("describes a control with the hint without the call site wiring it", () => {
    render(
      <Field id="name" label="Name" hint="As on the passport">
        <input id="name" />
      </Field>,
    );
    const input = screen.getByLabelText("Name");
    expect(input).toHaveAttribute("aria-describedby", "name-hint");
    expect(input).toHaveAccessibleDescription("As on the passport");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("marks the control invalid, describes it with the error and announces the error", () => {
    render(
      <Field id="name" label="Name" hint="As on the passport" error="Enter a name.">
        <input id="name" />
      </Field>,
    );
    const input = screen.getByLabelText("Name");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "name-error");
    expect(input).toHaveAccessibleDescription("Enter a name.");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Enter a name.");
    expect(alert).toHaveAttribute("id", "name-error");
    expect(screen.queryByText("As on the passport")).toBeNull();
  });

  it("merges an aria-describedby the control already has instead of replacing or repeating it", () => {
    render(
      <>
        <p id="name-counter">12 of 60 characters</p>
        <Field id="name" label="Name" error="Enter a name.">
          <input id="name" aria-describedby="name-counter name-error" />
        </Field>
      </>,
    );
    const input = screen.getByLabelText("Name");
    expect(input).toHaveAttribute("aria-describedby", "name-error name-counter");
    expect(input).toHaveAccessibleDescription("Enter a name. 12 of 60 characters");
  });

  it("keeps the control's own aria-describedby and aria-invalid when there is nothing to add", () => {
    render(
      <>
        <p id="elsewhere">Checked elsewhere</p>
        <Field id="name" label="Name">
          <input id="name" aria-describedby="elsewhere" aria-invalid />
        </Field>
      </>,
    );
    const input = screen.getByLabelText("Name");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Checked elsewhere");
  });

  it("wires a select the same way", () => {
    render(
      <Field id="step" label="Round to" error="Choose a rounding step.">
        <select id="step">
          <option value="1">1</option>
        </select>
      </Field>,
    );
    const select = screen.getByLabelText("Round to");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveAccessibleDescription("Choose a rounding step.");
  });
});

describe("FieldGroup", () => {
  const options = [
    { value: "fixed", label: "Fixed" },
    { value: "off", label: "Off" },
  ] as const;

  it("leaves the group undescribed and its members valid with no hint or error", () => {
    render(
      <FieldGroup id="scope" label="Applies to">
        <SegmentedControl label="Applies to" value="fixed" options={options} onChange={vi.fn()} />
      </FieldGroup>,
    );
    const group = screen.getByRole("radiogroup", { name: "Applies to" });
    expect(group).not.toHaveAttribute("aria-describedby");
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).not.toHaveAttribute("aria-invalid");
    }
  });

  it("describes the group with the hint, on the group container", () => {
    render(
      <FieldGroup id="scope" label="Applies to" hint="Choose who this applies to.">
        <SegmentedControl label="Applies to" value="fixed" options={options} onChange={vi.fn()} />
      </FieldGroup>,
    );
    const group = screen.getByRole("radiogroup", { name: "Applies to" });
    expect(group).toHaveAttribute("aria-describedby", "scope-hint");
    expect(group).toHaveAccessibleDescription("Choose who this applies to.");
  });

  it("marks the member controls invalid and announces the error, without the hint", () => {
    render(
      <FieldGroup id="scope" label="Applies to" hint="Choose who this applies to." error="Choose at least one package.">
        <SegmentedControl label="Applies to" value="fixed" options={options} onChange={vi.fn()} />
      </FieldGroup>,
    );
    const group = screen.getByRole("radiogroup", { name: "Applies to" });
    expect(group).toHaveAttribute("aria-describedby", "scope-error");
    expect(group).not.toHaveAttribute("aria-invalid");
    expect(group).toHaveAccessibleDescription("Choose at least one package.");
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toHaveAttribute("aria-invalid", "true");
    }
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Choose at least one package.");
    expect(alert).toHaveAttribute("id", "scope-error");
    expect(screen.queryByText("Choose who this applies to.")).toBeNull();
  });

  it("merges an aria-describedby the group's control already has instead of replacing or repeating it", () => {
    render(
      <>
        <p id="scope-note">Applies to every future booking.</p>
        <FieldGroup id="scope" label="Applies to" error="Choose at least one package.">
          <SegmentedControl
            label="Applies to"
            value="fixed"
            options={options}
            onChange={vi.fn()}
            aria-describedby="scope-note"
          />
        </FieldGroup>
      </>,
    );
    const group = screen.getByRole("radiogroup", { name: "Applies to" });
    expect(group).toHaveAttribute("aria-describedby", "scope-error scope-note");
    expect(group).toHaveAccessibleDescription("Choose at least one package. Applies to every future booking.");
  });

  it("keeps the control's own aria-invalid when there is no error to add", () => {
    render(
      <FieldGroup id="scope" label="Applies to">
        <SegmentedControl label="Applies to" value="fixed" options={options} onChange={vi.fn()} aria-invalid />
      </FieldGroup>,
    );
    const group = screen.getByRole("radiogroup", { name: "Applies to" });
    expect(group).not.toHaveAttribute("aria-describedby");
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toHaveAttribute("aria-invalid", "true");
    }
  });
});

describe("MoneyInput", () => {
  it("reports typed text and shows the currency prefix", async () => {
    const onChange = vi.fn();
    render(<MoneyInput id="usd" label="Price" currency="KES" value="" onChange={onChange} hint="Whole shillings" />);
    expect(screen.getByText("KSh")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Price"), "5");
    expect(onChange).toHaveBeenLastCalledWith("5");
    expect(screen.getByLabelText("Price")).toHaveAccessibleDescription("Whole shillings");
    expect(screen.getByLabelText("Price")).not.toHaveAttribute("aria-invalid");
  });

  it("forwards the error wiring to the real input, not its wrapper", () => {
    const { container } = render(
      <MoneyInput id="usd" label="Price" currency="USD" value="" onChange={vi.fn()} hint="Whole dollars" error="Enter a price." />,
    );
    expect(screen.getByText("$")).toBeInTheDocument();
    const input = screen.getByLabelText("Price");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter a price.");
    const wrapper = container.querySelector(".adm-money");
    expect(wrapper).not.toHaveAttribute("aria-describedby");
    expect(wrapper).not.toHaveAttribute("aria-invalid");
  });

  it("can be disabled", () => {
    render(<MoneyInput id="usd" label="Price" currency="USD" value="10" onChange={vi.fn()} disabled />);
    expect(screen.getByLabelText("Price")).toBeDisabled();
  });
});

describe("SegmentedControl", () => {
  const options = [
    { value: "fixed", label: "Fixed" },
    { value: "converted", label: "Converted" },
    { value: "off", label: "Off" },
  ] as const;

  it("selects on click and exposes radio semantics", async () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Dollar price" value="fixed" options={options} onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "Fixed" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "Off" }));
    expect(onChange).toHaveBeenCalledWith("off");
  });

  it("moves with the arrow keys and wraps", async () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Dollar price" value="fixed" options={options} onChange={onChange} />);
    screen.getByRole("radio", { name: "Fixed" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("converted");
    await userEvent.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("off");
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe("Switch", () => {
  it("toggles", async () => {
    const onChange = vi.fn();
    render(<Switch id="visible" checked={false} onChange={onChange} label="Visible on the website" description="Shown in listings" />);
    const control = screen.getByRole("switch", { name: /Visible on the website/ });
    expect(control).toHaveAttribute("aria-checked", "false");
    await userEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("can be described by, and flagged for, an error rendered elsewhere", () => {
    render(
      <>
        <p id="row-error">This season is listed twice.</p>
        <Switch id="custom" checked onChange={vi.fn()} label="Custom price" aria-describedby="row-error" aria-invalid />
      </>,
    );
    const control = screen.getByRole("switch", { name: "Custom price" });
    expect(control).toHaveAccessibleDescription("This season is listed twice.");
    expect(control).toHaveAttribute("aria-invalid", "true");
  });
});

describe("Notice and WarningsPanel", () => {
  it("uses alert semantics for errors and status otherwise", () => {
    const { rerender } = render(<Notice tone="error">Broken</Notice>);
    expect(screen.getByRole("alert")).toHaveTextContent("Broken");
    rerender(<Notice tone="success" title="Saved">All good</Notice>);
    expect(screen.getByRole("status")).toHaveTextContent("SavedAll good");
  });

  it("lists warnings and confirms or cancels", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <WarningsPanel
        warnings={[{ id: "W1", message: "The dollar base price changes by 79%." }]}
        busy={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText("The dollar base price changes by 79%.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save anyway" }));
    await userEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders nothing without warnings", () => {
    const { container } = render(<WarningsPanel warnings={[]} busy={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
