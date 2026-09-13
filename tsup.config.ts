import { defineConfig } from "tsup";
import pkg from "./package.json";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  // Dependencies stay external and are ESM-only (chalk, commander,
  // @clack/prompts), so they are require()d at runtime and need Node >= 22.12.
  target: "node22",
  clean: true,
  sourcemap: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
  // Bake the version in at build time. Resolving package.json at runtime broke
  // when it sat outside the package (e.g. running from src/), and the silent
  // "0.0.0" fallback put a wrong version into bug reports.
  define: {
    "process.env.ACM_VERSION": JSON.stringify(pkg.version),
  },
});
