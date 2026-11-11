import { describe, expect, it } from "vitest";
import { GRANT_USAGE, parseGrantArgs } from "@/scripts/admin/grant-args";

describe("parseGrantArgs", () => {
  it("reads a normalised email, the role and the password", () => {
    expect(parseGrantArgs(["--email", " Owner@bueno.example.com ", "--role", "editor", "--password", "s3cret-passw0rd"])).toEqual({
      ok: true,
      options: { email: "owner@bueno.example.com", role: "editor", password: "s3cret-passw0rd" },
    });
  });

  it("defaults the role to admin and the password to none", () => {
    expect(parseGrantArgs(["--email", "a@b.example.com"])).toEqual({
      ok: true,
      options: { email: "a@b.example.com", role: "admin", password: null },
    });
  });

  it("explains what is missing or wrong", () => {
    expect(parseGrantArgs([])).toEqual({ ok: false, message: "Pass the person's email with --email." });
    expect(parseGrantArgs(["--email", "not-an-email"])).toEqual({ ok: false, message: "Pass the person's email with --email." });
    expect(parseGrantArgs(["--email", "a@b.example.com", "--role", "owner"])).toEqual({
      ok: false,
      message: "--role must be admin, editor or viewer.",
    });
    expect(parseGrantArgs(["--email", "a@b.example.com", "--password", ""])).toEqual({ ok: false, message: "--password can't be empty." });
    expect(parseGrantArgs(["--email", "a@b.example.com", "--force"])).toEqual({ ok: false, message: "Unrecognised arguments." });
    expect(parseGrantArgs(["a@b.example.com"])).toEqual({ ok: false, message: "Unrecognised arguments." });
  });

  it("documents the flags in the usage line", () => {
    expect(GRANT_USAGE).toContain("--email");
    expect(GRANT_USAGE).toContain("--password");
  });
});
