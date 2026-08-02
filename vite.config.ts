import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/** Parity Next: maroon brand + cream dari logo aplikasi */
const THEME_COLOR = "#7A1F1F";
const BACKGROUND_COLOR = "#F7F1E8";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon-32.png",
        "logo.png",
        "icons/icon-48.png",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/apple-touch-icon.png",
      ],
      manifest: {
        name: "Mebel Online Monitoring",
        short_name: "MebelMonitor",
        description:
          "Aplikasi manajemen keuangan toko furnitur — kelola transaksi, HPP, biaya operasional, dan pantau omzet",
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        display: "standalone",
        start_url: "/kasir",
        orientation: "any",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icons/apple-touch-icon.png",
            sizes: "180x180",
            type: "image/png",
            purpose: "any",
          },
        ],
        shortcuts: [
          {
            name: "Transaksi Baru",
            short_name: "Baru",
            url: "/kasir",
            icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
          },
          {
            name: "Daftar Transaksi",
            short_name: "Transaksi",
            url: "/transaksi",
            icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
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
