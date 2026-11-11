import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MESSAGES, succeed } from "@/lib/admin/action-result";
import { useServerAction } from "@/lib/admin/use-server-action";

describe("useServerAction", () => {
  it("stores and returns the action result", async () => {
    const action = vi.fn(async (input: number) => succeed(input * 2, "done"));
    const { result } = renderHook(() => useServerAction(action));
    let returned: unknown;
    await act(async () => {
      returned = await result.current.run(21);
    });
    expect(returned).toEqual({ ok: true, data: 42, message: "done" });
    expect(result.current.result).toEqual({ ok: true, data: 42, message: "done" });
    act(() => result.current.clear());
    expect(result.current.result).toBeNull();
  });

  it("turns thrown errors into a generic failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const action = vi.fn(async () => {
      throw new Error("network down");
    });
    const { result } = renderHook(() => useServerAction(action));
    await act(async () => {
      await result.current.run(undefined);
    });
    expect(result.current.result).toEqual({ ok: false, kind: "error", formError: MESSAGES.generic });
    consoleError.mockRestore();
  });
});
