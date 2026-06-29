import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/database.module.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "es2022",
  sourcemap: true,
});
