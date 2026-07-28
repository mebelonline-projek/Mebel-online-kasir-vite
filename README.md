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
