import type { CapacitorConfig } from "@capacitor/cli";

/**
 * APK Android = SPA yang sama, aset dibundel di dalam APK (bukan memuat situs
 * live). Alasan utama: cetak nota langsung ke printer thermal Bluetooth
 * Classic lewat plugin native — browser tidak bisa bicara ke printer jenis ini.
 *
 * appId permanen: mengganti appId = Android menganggapnya aplikasi lain.
 * Build web untuk APK wajib `npm run build:android` (tanpa service worker).
 */
const config: CapacitorConfig = {
  appId: "com.mebelonline.monitor",
  appName: "Mebel Monitor",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  android: {
    backgroundColor: "#FFFFFF",
  },
};

export default config;
