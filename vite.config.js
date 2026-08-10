import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@vietmap/vietmap-gl-js/vietmap-gl.css", replacement: resolve(import.meta.dirname, "node_modules/@vietmap/vietmap-gl-js/dist/vietmap-gl.css") },
      { find: "@vietmap/vietmap-gl-js", replacement: resolve(import.meta.dirname, "node_modules/@vietmap/vietmap-gl-js/dist/vietmap-gl.js") }
    ]
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: false,
        xfwd: true
      }
    }
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        code: resolve(import.meta.dirname, "code.html")
      }
    }
  }
});
