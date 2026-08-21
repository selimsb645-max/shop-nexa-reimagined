import { defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsConfigPaths()],
  test: {
    setupFiles: ["src/lib/__tests__/setup.ts"],
    globals: true,
  },
});
