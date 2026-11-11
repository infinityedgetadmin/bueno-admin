import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MotionProvider } from "@/components/admin/MotionProvider";

describe("MotionProvider", () => {
  it("renders its children", () => {
    render(
      <MotionProvider>
        <p>Back office content</p>
      </MotionProvider>,
    );
    expect(screen.getByText("Back office content")).toBeInTheDocument();
  });
});
