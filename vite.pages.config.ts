import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(projectRoot, "github-pages"),
  base: "./",
  publicDir: resolve(projectRoot, "public"),
  plugins: [react()],
  resolve: {
    alias: { "@": projectRoot },
  },
  build: {
    outDir: resolve(projectRoot, "pages-dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(projectRoot, "github-pages/index.html"),
    },
  },
});
