import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  root: "src",
  plugins: [viteSingleFile()],
  esbuild: {
    // @ts-expect-error: esbuild 'drop' not yet typed in Vite
    drop: ["console", "debugger"],
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
  },
});
