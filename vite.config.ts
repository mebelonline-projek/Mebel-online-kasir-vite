import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Mebel Monitor SPA",
        short_name: "MebelSPA",
        description: "Monitoring toko furnitur — offline-capable kasir",
        theme_color: "#78716C",
        background_color: "#FAF5F2",
        display: "standalone",
        start_url: "/kasir",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // Multi-device: jangan sajikan REST usang. Dexie handle offline UI.
            urlPattern: ({ url }) =>
              url.hostname.includes("supabase.co") &&
              url.pathname.includes("/rest/v1/"),
            handler: "NetworkOnly",
            options: {
              cacheName: "supabase-api",
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
