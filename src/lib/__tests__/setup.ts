/**
 * Vitest setup — polyfill Deno.env.get to read from Node process.env.
 *
 * The server-side modules use Deno.env.get() to access environment
 * variables. In the test environment (Node.js), we polyfill Deno to
 * delegate to process.env so tests can control env vars dynamically.
 */

// Only polyfill if Deno is not already defined
if (typeof (globalThis as Record<string, unknown>).Deno === "undefined") {
  (globalThis as Record<string, unknown>).Deno = {
    env: {
      get(key: string): string | undefined {
        return process.env[key];
      },
    },
  };
}
