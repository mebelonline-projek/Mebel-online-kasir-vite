# Handoff migrasi SPA — baca dulu sebelum kerja

Dokumen ini untuk AI agent / developer di **chat baru**. Jangan mengulang keputusan yang sudah final.

## Tujuan produk

Ganti stack hosting Next/Vercel-berat dengan **Vite SPA** di Cloudflare Workers (static) + Supabase, tetap offline-capable, **gratis**, tanpa merusak produksi Next sampai cutover.

## Path & URL penting

| Item | Nilai |
|------|--------|
| Kode SPA lokal | `C:\Users\USER\projek real\aplikasi-monitoring-spa` |
| Repo SPA | https://github.com/mebelonline-projek/Mebel-online-kasir-vite |
| Beta live | https://mebel-online-kasir-vite.mebelonline.workers.dev/ |
| Kode Next (produksi harian) | `C:\Users\USER\projek real\Aplikasi monitoring` |
| Repo Next | https://github.com/mebelonline-projek/Mebel-Online-Monitoring |
| Rollback Next | git tag `v1-next-stable` |

## Keputusan yang sudah final (jangan dibalik tanpa minta user)

1. **Repo terpisah** untuk SPA (bukan rewrite in-place di Next).
2. **Bertahap**: Auth/Kasir/offline dulu → Edge Functions → modul sisa → UI parity → cutover.
3. **Database = Opsi C**: SPA memakai **project Supabase yang sama** dengan Next (akun Free klien sudah 2/2: website + monitoring). Tidak buat project ketiga di akun itu.
4. **Hosting**: Cloudflare **Workers** + static assets (Pages digabung ke Workers). Bukan Next di Workers Free (CPU 10ms).
5. **`service_role`**: hanya Edge Functions Supabase, tidak pernah di `VITE_*` / bundle browser.
6. **UI harus sama persis dengan Next** sebelum cutover — ini **syarat wajib user**. Jangan anggap UI minimal “cukup untuk production”. Port token CSS, layout sidebar, komponen, dan pola halaman dari Next.

## Status tahap (per 28 Jul 2026)

### Selesai
- [x] Arsitektur & rollback tag Next `v1-next-stable`
- [x] Scaffold Vite + React 19 + Tailwind 4 + shadcn + PWA
- [x] Auth login/register + role shell
- [x] Kasir cepat + Dexie offline queue + sync idempoten (`client_id`)
- [x] Fix Next dashboard stale cache (KPI update setelah tulis dari SPA)
- [x] Fix parsing harga integer SPA
- [x] Deploy Cloudflare Workers + Build variables `VITE_SUPABASE_*`
- [x] Login di URL Workers berhasil (hard refresh jika SW cache lama)

### Belum
- [ ] Uji menyeluruh di hosting (online/offline/sync vs Next) — **lanjut uji berikutnya**
- [ ] **UI parity penuh dengan Next** (wajib sebelum cutover)
- [ ] Edge Functions: `apply-sale-stock`, user admin
- [ ] Modul: pelanggan, produk, pelunasan, void, nota/PDF, dashboard KPI, gudang, operasional, piutang, invoice, pengaturan
- [ ] Uji PWA di HP toko / jaringan jelek
- [ ] Cutover domain; Next jadi fallback

## Cara kerja UI parity (wajib)

Sumber kebenaran visual = app Next di `Aplikasi monitoring`:

- Token & tema: `app/globals.css`
- Layout: `components/layout/`, sidebar, mobile nav
- Transaksi: `components/transactions/`
- Dashboard: `app/(app)/dashboard/`
- Komponen UI shadcn yang sudah dikustom

Target SPA: **terasa dan terlihat app yang sama** (bukan skin generik nova). Kerjakan setelah uji hosting dasar, sebelum cutover. Boleh bertahap per halaman, tapi kriteria “selesai UI” = Owner/Karyawan tidak merasa ganti aplikasi.

## Larangan

- Jangan hapus/rewrite Next di `main` produksi untuk migrasi.
- Jangan taruh Next SSR / Server Actions berat di Workers Free.
- Jangan commit `.env.local` (ada di `*.local` gitignore).
- Jangan pakai lagi `public/_redirects` `/* /index.html 200` (bentrok Workers SPA; pakai `wrangler.jsonc` `not_found_handling`).
- Jangan expose `SUPABASE_SERVICE_ROLE_KEY` ke frontend.
- Jangan cutover DNS sebelum UI + fitur kritis setara.

## Env Cloudflare

Worker static-only **tidak** bisa Variables runtime. Pakai **Settings → Build → Build variables**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

(sama nilai `NEXT_PUBLIC_*` di Next). Setelah ubah env → Redeploy. Jika UI bilang “Konfigurasi diperlukan”, hard refresh / clear SW.

## Prompt singkat untuk chat baru

```
Lanjut migrasi SPA kasir.
Baca MIGRATION-HANDOFF.md dan AGENTS.md di repo aplikasi-monitoring-spa / Mebel-online-kasir-vite.
DB shared Opsi C dengan Next. Produksi harian masih Next.
Wajib: UI akhir harus sama persis dengan Next (port dari Aplikasi monitoring).
Berikutnya: uji hosting, lalu UI parity / Edge Function sesuai prioritas user.
```
