import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  dts: true,
  outDir: "dist",
  noExternal: ["@openfga/sdk"],
  external: ["axios"],
  sourcemap: true,
  clean: true,
});
