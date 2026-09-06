import { defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsConfigPaths()],
  test: {
    setupFiles: ["src/lib/__tests__/setup.ts"],
    globals: true,
    // Emulator-backed suites (finance, campaigns) share process.env
    // (FIRESTORE_EMULATOR_HOST) — running test files in parallel makes
    // their emulators race. Sequential file execution keeps every
    // suite's emulator isolated and deterministic.
    fileParallelism: false,
  },
});
