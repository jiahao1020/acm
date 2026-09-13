import { defineConfig } from "tsup";

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
});
