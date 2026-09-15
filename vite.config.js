import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import { normalizeBasePath } from "./build/vite/base-path.js";

function emitPlayweftPackage(base, outDir) {
  const files = [
    "playweft.json",
    "game.lua",
    "icon.svg",
    "data/README.md",
    "data/poetry-curated.json",
    "data/poetry-README.md",
    "data/poetry-LICENSE.txt",
    "data/idioms_top4500.txt",
  ];
  return {
    name: "emit-playweft-package",
    async generateBundle() {
      for (const fileName of files) {
        let source = await readFile(new URL(`./public/${fileName}`, import.meta.url));
        if (fileName === "playweft.json") {
          const manifest = JSON.parse(source.toString());
          manifest.id = base;
          source = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
        }
        this.emitFile({
          type: "asset",
          fileName,
          source,
        });
      }
    },
    async closeBundle() {
      await writeFile(
        resolve(outDir, "..", "_headers"),
        await readFile(new URL("./public/_headers", import.meta.url)),
      );
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const base = command === "build"
    ? normalizeBasePath(loadEnv(mode, import.meta.dirname, "BASE_PATH").BASE_PATH)
    : "/";
  const outDir = base === "/" ? "dist" : `dist/${base.slice(1, -1)}`;
  return {
    base,
    publicDir: false,
    plugins: [emitPlayweftPackage(base, outDir)],
    build: { outDir },
  };
});
