import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The landscape designs take a few seconds each to render; on a busy machine that passes the 5 s default.
    testTimeout: 30_000,
    // `npm run coverage`: the generator's own code, as a table in the terminal.
    coverage: { include: ["src/**"], reporter: ["text"] },
  },
});
