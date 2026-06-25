import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/__tests__/**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    setupFiles: ["./src/test-setup.ts"],

    coverage: {
      provider: "v8",
      include: [
        "src/lib/github/profile.ts",
        "src/lib/github/star-gate.ts",
        "src/lib/auth.ts",
        "src/lib/ai.ts",
        "src/lib/db.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
