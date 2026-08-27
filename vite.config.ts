// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Fix: TanStack Start + Cloudflare Workers circular dependency (GitHub #7459).
// The cloudflare-module preset hardcodes inlineDynamicImports:false in its
// rollupConfig, causing Rollup to split createMiddleware and createCsrfMiddleware
// into separate chunks with a circular import. At module init on Workers,
// createMiddleware is still undefined when called → TypeError.
//
// rolldownConfig has higher defu merge priority than rollupConfig, so setting
// inlineDynamicImports:true here overrides the preset's false.
// Lovable's nitro type doesn't expose rolldownConfig, hence the cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nitroFix = { rolldownConfig: { output: { inlineDynamicImports: true } } } as any;

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  nitro: nitroFix,
});
