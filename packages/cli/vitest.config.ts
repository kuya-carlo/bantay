import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    alias: {
      "@bantay/core": path.resolve(__dirname, "../core/src/index.ts"),
    },
  },
});
