import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname),
  base: "/admin/",
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    modulePreload: { polyfill: false },
    sourcemap: false,
  },
  server: {
    port: 5174,
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
});
