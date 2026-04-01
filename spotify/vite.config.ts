import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Build deterministic widget assets for inline embedding into the MCP resource:
//   - web/dist/app.js
//   - web/dist/style.css
export default defineConfig({
  root: "./web",
  build: {
    // Place compiled assets in web/dist
    outDir: "dist",
    emptyOutDir: true,
    // Prevent CSS from being split across chunks — all CSS goes to style.css
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        app: "./web/src/component.tsx",
      },
      output: {
        entryFileNames: "app.js",
        assetFileNames: "[name].[ext]",
        format: "es",
      },
    },
  },
  plugins: [tailwindcss(), react()],
});
