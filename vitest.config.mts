import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// `.mts` so Vite loads it as ESM (the package has no "type": "module"); tsconfig `paths` are resolved natively.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(new URL("./tests/setup/server-only.ts", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "components",
          environment: "jsdom",
          include: ["tests/components/**/*.test.{ts,tsx}"],
          setupFiles: ["./tests/setup/components.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: [
        "lib/pricing/**/*.ts",
        "lib/admin/team-rules.ts",
        "lib/admin/session-rules.ts",
        "lib/admin/session-token.ts",
        "lib/admin/password.ts",
        "lib/admin/login-errors.ts",
        "lib/admin/permissions.ts",
        "lib/admin/package-form.ts",
        "lib/admin/season-view.ts",
        "lib/admin/promotion-view.ts",
        "lib/admin/attention.ts",
        "scripts/admin/grant-args.ts",
      ],
      exclude: ["lib/pricing/types.ts"],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
