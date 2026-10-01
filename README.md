# Mebel Monitor SPA (beta)

Vite + React 19 + Tailwind 4 + shadcn + Cloudflare Workers (static SPA) + Supabase Free + offline Dexie.

**Baca dulu:** [MIGRATION-HANDOFF.md](./MIGRATION-HANDOFF.md) · [AGENTS.md](./AGENTS.md)

Repo ini **paralel** dengan aplikasi Next.js produksi. Rollback Next = tag `v1-next-stable`.

**Syarat cutover:** UI SPA **sama persis** dengan Next (port tema/layout/halaman dari `Aplikasi monitoring`).

## Stack constraints (jangan dilanggar)

- Hosting: **Cloudflare Workers** (static assets / SPA). Jangan taruh logic berat di Worker Free (CPU 10ms).
- Secret `service_role`: **hanya** di Supabase Edge Functions, tidak pernah di `VITE_*`.
- SPA routing: `wrangler.jsonc` → `assets.not_found_handling = single-page-application` (jangan pakai `_redirects /* /index.html`).
- Supabase Free akun klien: **2 project aktif sudah penuh** (1 website + 1 app monitoring). Tidak bisa buat project ketiga di akun yang sama.

## Strategi database (aktif: Opsi C)

Akun Supabase klien sudah 2/2 Free project. **SPA memakai DB monitoring yang sama dengan Next.**

Aturan:
- Domain beta Workers terpisah — jangan ganti DNS produksi sebelum cutover.
- Uji dengan label `TEST-...` bila menulis data.
- Next tetap app harian sampai UI + fitur kritis setara.

## Setup lokal

```powershell
copy .env.example .env.local
# isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY
# (staging akun baru = Opsi B, atau project monitoring = Opsi C)
npm install
npm run dev
```

## Deploy Cloudflare Pages

- Build command: `npm run build`
- Output directory: `dist`
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Pastikan `_redirects` ikut ter-copy ke `dist`

## Fase saat ini

- [x] Fase 0: scaffold, PWA, `_redirects`, offline DB
- [x] Fase 1: Auth + role shell
- [x] Fase 2 (awal): Kasir cepat + antrian offline idempoten (`client_id`)
- [ ] Fase 3: Edge Functions (user admin, apply_stock_change) — deploy ke project yang dipilih di atas
- [ ] Fase 4–5: modul sisa + cutover

## Offline — perilaku

- Offline: kasir menyimpan ke Dexie (`pending` / `failed`).
- Online: flush otomatis + tombol di banner; insert memakai `client_id` (anti-duplikat).
- Item katalog + potong stok: menunggu Edge Function (tanpa itu, transaksi deskripsi/harga tetap aman).

## Rollback

1. Produksi tetap di repo Next (tag `v1-next-stable`).
2. Beta hanya di `*.pages.dev` / subdomain `beta`.
3. Cutover = DNS ke Pages. Gagal = DNS balik ke Next.

## APK Android (cetak nota Bluetooth)

SPA yang sama dibungkus **Capacitor** supaya HP Android bisa mencetak nota **langsung** ke printer thermal Bluetooth Classic (teks ESC/POS, tanpa Thermer/PNG). Aset web **dibundel di dalam APK** (bukan memuat situs live) — buka app tetap jalan tanpa internet; update tampilan = build & pasang APK baru.

- `appId` permanen: `com.mebelonline.monitor` (ganti = dianggap aplikasi lain).
- Build web untuk APK **wajib** `npm run build:android` (mode `android` → tanpa service worker; SW di WebView bisa menyajikan versi lama setelah update APK). `npm run build`/`deploy` untuk Workers tidak berubah.
- Plugin `@nosslabs/bluetooth-classic` ditambal (`patches/`, dijalankan otomatis oleh `postinstall`): daftar printer yang sudah di-pairing (`bondedDevices`), connect hentikan discovery + fallback socket insecure, socket gagal ditutup. **Jangan hapus patch-nya.**
- Kode: `src/lib/bluetooth-printer.ts` (izin, cari/pairing, antrean cetak, sambung ulang), `src/lib/thermal-escpos.ts` (isi nota 58/80mm, mode teks/gambar), `src/components/invoice/printer-settings-dialog.tsx` (Atur Printer di halaman Nota), `src/lib/save-file.ts` (PDF/CSV di APK → menu Bagikan Android).
- Pengaturan printer (alamat, lebar kertas, mode) disimpan per HP di `localStorage`, bukan di Supabase.

### Kunci rilis (wajib, sekali seumur aplikasi)

Disimpan **di luar repo**: `C:\Users\USER\kunci-rilis-mebel\` (`mebel-rilis.jks` + `keystore.properties`; bisa diganti lewat env `MEBEL_KEYSTORE_PROPERTIES`). Build rilis **sengaja gagal** kalau kunci tidak ada. Semua APK yang dipasang di HP toko wajib ditandatangani kunci yang sama selamanya — kunci hilang = APK tidak bisa di-update (harus uninstall). **Backup folder itu ke minimal 2 tempat + catat kata sandinya terpisah.**

Membuat kunci (oleh pemilik, kata sandi diketik sendiri):

```
keytool -genkeypair -v -keystore "C:\Users\USER\kunci-rilis-mebel\mebel-rilis.jks" -alias mebel -keyalg RSA -keysize 4096 -validity 36500
```

lalu ganti `GANTI_DENGAN_KATA_SANDI` di `keystore.properties` dengan kata sandi tersebut (dua baris, sama).

### Build & pasang

1. Naikkan `versionCode` (+1) dan `versionName` di `android/app/build.gradle` untuk tiap rilis baru.
2. `npm run apk:release` → `android/app/build/outputs/apk/release/app-release.apk`.
3. Pasang **menimpa** versi lama (jangan uninstall dulu): kirim file APK ke HP lalu buka, atau `adb install -r app-release.apk`.
4. Jangan pasang build debug di HP toko (tanda tangan beda → update rilis ditolak).

### Pemakaian printer (sekali per HP)

Halaman Nota → **Atur Printer** → pilih printer (yang sudah dipasangkan langsung tampil; printer baru: **Cari Printer** lalu ketuk, isi PIN 0000/1234 bila diminta) → pilih lebar kertas → **Tes Cetak**. Jika tes keluar kosong/huruf aneh → mode **Gambar**. Setelah itu cukup tombol **Cetak Nota**.
