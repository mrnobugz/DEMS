import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function resolveSrcDir() {
  const candidates = [
    path.resolve(process.cwd(), "src"),
    path.resolve(process.cwd(), "frontend", "src"),
    typeof __dirname !== "undefined" ? path.resolve(__dirname, "src") : "",
    fileURLToPath(new URL("./src", import.meta.url)),
  ];
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, "App.tsx"))) {
      return dir.replace(/\\/g, "/");
    }
  }
  throw new Error(
    `Could not locate frontend src (cwd=${process.cwd()}). Tried: ${candidates.filter(Boolean).join(", ")}`,
  );
}

const srcDir = resolveSrcDir();

export default defineConfig({
  root: path.dirname(srcDir),
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["logo.png", "favicon.svg"],
      manifest: {
        name: "DEMSTA — Dental Clinic Management",
        short_name: "DEMSTA",
        description: "Dental Electronic Management System for Treatment & Administration",
        theme_color: "#0B5FFF",
        background_color: "#F5F9FF",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/logo.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "demsta-api",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${srcDir}/` },
    ],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/health": "http://127.0.0.1:8000",
    },
  },
});
