import { defineConfig } from "vitest/config";
import { worldApi } from "./server/world.js";

export default defineConfig({
  plugins: [worldApi()],
  // The browser imports the shared block model from `../generator/src`.
  server: { fs: { allow: [".."] } },
  worker: { format: "es" },
  test: { include: ["test/**/*.test.ts"] },
});
