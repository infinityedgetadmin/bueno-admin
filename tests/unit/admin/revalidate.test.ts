import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.hoisted(() => vi.fn());
const logErrorMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/logger", () => ({ logError: logErrorMock }));

import { revalidateSite } from "@/lib/admin/revalidate";

describe("revalidateSite", () => {
  beforeEach(() => {
    revalidatePathMock.mockReset();
    logErrorMock.mockReset();
  });

  it("revalidates the whole site layout", () => {
    revalidateSite();
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it("never throws, and logs instead, when revalidatePath fails", () => {
    revalidatePathMock.mockImplementation(() => {
      throw new Error("stale build id");
    });
    expect(() => revalidateSite()).not.toThrow();
    expect(logErrorMock).toHaveBeenCalledWith("admin.revalidate", expect.any(Error));
  });
});
