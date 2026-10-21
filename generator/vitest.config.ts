import { defineConfig } from "vitest/config";

export default defineConfig({
  // The landscape designs take a few seconds each to render; on a busy machine that passes the 5 s default.
  test: { testTimeout: 30_000 },
});
