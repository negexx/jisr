import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@scripts": fileURLToPath(new URL("./scripts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next resolves `server-only` to its "react-server" export (an empty module) in server
      // bundles; tests run server modules in plain node, so point them at that same module.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    globalSetup: ["./tests/setup/cn-tables.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",
    // next-intl's ESM build imports "next/navigation" without an extension; inlining lets Vite resolve it.
    server: { deps: { inline: ["next-intl"] } },
  },
});
