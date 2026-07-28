# Mebel Monitor SPA (beta)

Vite + React 19 + Tailwind 4 + shadcn + Cloudflare Pages + Supabase Free + offline Dexie.

Repo ini **paralel** dengan aplikasi Next.js produksi. Rollback = tetap pakai Next (`v1-next-stable`).

## Stack constraints (jangan dilanggar)

- Hosting: **Cloudflare Pages Free** (static). Jangan taruh logic berat di Workers Free (CPU 10ms).
- Secret `service_role`: **hanya** di Supabase Edge Functions, tidak pernah di `VITE_*`.
- SPA routing: `public/_redirects` → `/* /index.html 200`.
- Supabase Free akun klien: **2 project aktif sudah penuh** (1 website + 1 app monitoring). Tidak bisa buat project ketiga di akun yang sama.

## Strategi database (pilih satu)

### Opsi B — disarankan (tetap gratis, isolasi aman)

Buat **akun/org Supabase baru** (email lain) khusus staging SPA.

1. Daftar Supabase baru → 1 Free project staging.
2. Jalankan SQL dari repo Next (`migration.sql`, inventori, fix linter).
3. Seed user uji Owner/Karyawan (bukan data produksi).
4. Isi `.env.local` SPA dengan URL + anon key **akun staging**.

Produksi Next + website klien **tidak tersentuh**.

### Opsi C — DB produksi yang sama (hanya jika B tidak memungkinkan)

SPA beta memakai project Supabase **aplikasi monitoring** yang sama dengan Next.

Aturan wajib:
- Domain beta terpisah (`*.pages.dev`) — jangan ganti DNS produksi.
- Uji hanya dengan akun uji / transaksi uji yang jelas.
- Jangan deploy Edge Function eksperimen ke produksi tanpa review.
- Offline sync hanya di device penguji.
- Next tetap jadi app harian sampai cutover.

Risiko: bug SPA bisa menulis data toko nyata.

### Opsi A — pause project

Tidak berlaku: kedua project sedang dipakai.

### Opsi D — Supabase Pro

Hanya jika klien mau bayar untuk project staging di akun yang sama.

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
