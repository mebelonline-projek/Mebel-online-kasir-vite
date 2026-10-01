# AGENTS.md — Konstitusi SPA Mebel Monitor

Baca juga: [MIGRATION-HANDOFF.md](./MIGRATION-HANDOFF.md) — **bagian “Keputusan produksi”** dan **“Lanjut besok”** dulu.

## Prioritas

1. Jangan rusak data toko / produksi SPA.
2. Fitur kasir + offline benar.
3. Hosting tetap gratis (Cloudflare Workers static + Supabase Free).

## Stack

- Vite + React 19 + TypeScript + Tailwind 4 + shadcn + React Router
- Supabase JS client (anon) + RLS
- Dexie offline
- Deploy: `wrangler.jsonc` assets SPA → Cloudflare Workers
- Edge privileged ops: Supabase Edge Functions saja

## Produksi = SPA saja (6 Agu 2026)

Klien sudah fully on SPA. **Jangan** update / port fitur ke repo Next.

- Live: Workers SPA
- Next = arsip/cadangan darurat saja — bukan jalur pengembangan
- Referensi UI/bisnis lama di `../Aplikasi monitoring` boleh dibaca untuk konteks historis, bukan untuk sync dua arah
- Entitas: Transaksi ≠ Nota ≠ Invoice

## Aturan kode

- Validasi Zod; toast sonner; dark mode support
- Harga rupiah = integer (`src/lib/money.ts`)
- Offline sync idempoten via `client_id`
- Minimal over-engineering; jangan install dep baru tanpa perlu

## Windows PowerShell

Jangan `&&`. Pakai `;` atau perintah terpisah.

## APK Android (Capacitor)

- Detail lengkap: README bagian **"APK Android"**. Build APK **hanya** lewat `npm run build:android` / `npm run apk:release` (tanpa service worker), bukan `npm run build`.
- Jangan hapus `patches/@nosslabs+bluetooth-classic+*.patch` (dipakai `bondedDevices` & connect yang tahan gagal).
- Kunci rilis di luar repo (`C:\Users\USER\kunci-rilis-mebel\`) — jangan pernah commit `*.jks` / `keystore.properties`; tiap rilis naikkan `versionCode`.
- Fitur yang memakai `<a download>`, `window.print()` atau `navigator.share` tidak jalan di WebView APK — simpan file lewat `saveBlob()` (`src/lib/save-file.ts`), cek APK dengan `Capacitor.isNativePlatform()`.
