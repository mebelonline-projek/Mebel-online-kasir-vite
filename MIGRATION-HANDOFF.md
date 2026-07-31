# Handoff migrasi SPA — baca dulu sebelum kerja

Dokumen ini untuk AI agent / developer di **chat baru**. Jangan mengulang keputusan yang sudah final.

## Lanjut besok (31 Jul 2026 / lanjut malam) — baca ini dulu

**SQL varian sudah dijalankan** di Supabase project monitoring (user: *Success. No rows returned* — normal untuk `ALTER`/`CREATE INDEX`). File: `Aplikasi monitoring/supabase/migrate_product_variants.sql`.

**Next (produksi):** search Gudang/Stok + UI varian parent/child **sudah di kode** (31 Jul). Jangan ulang SQL / jangan ulang fitur Next kecuali bug.

**SPA berikut (default “lanjut”):** void transaksi. Jangan kerjakan search/varian di SPA sekarang.

### Antrian prioritas SPA (default jika user bilang “lanjut”)

1. **Void transaksi** — port logika Next; stok restore lewat Edge `apply-sale-stock` action restore (sudah live).
2. Modul sisa: gudang/mutasi → operasional → piutang → invoice → pengaturan.
3. Saat port gudang/produk/kasir: ikut **search matrix** + **varian parent/child** + UX 31 Jul malam dari Next (ranking nama produk, satu Simpan+stok, Mutasi ID, kartu grup mobile, hapus barang dengan stok) — parity wajib; kolom DB sudah ada.
4. Nota/PDF + HPP (boleh belakangan).
5. Uji PWA HP toko / jaringan jelek (tawarkan lagi).
6. Cutover domain **terakhir**; Next = fallback tag `v1-next-stable`.

### Fitur klien di Next → roadmap SPA

| Fitur | Status | Masuk SPA kapan |
|-------|--------|-----------------|
| Search Gudang/Stok | Done di Next `/gudang/stok` | Saat port `/gudang/stok` |
| Varian `parent_id` / `warna` / `ukuran` | **SQL applied** + UI Next barang/kasir/stok/mutasi | Saat port produk + kasir picker + cache katalog |

Model: parent shell + child leaf; stok/kasir/Edge tetap per `product_id` leaf. Standalone = `parent_id` null. Jangan pecah skema hanya di satu repo.

### Opsional smoke (user) — Next + SPA

- Next: buat barang dengan/tanpa varian → search stok → jual leaf di kasir → cek stok.
- SPA beta: clear SW jika UI lama; jual 1 item → stok terpotong (Edge).

### Preferensi user (sesi 29–31 Jul)

- SPA **cepat + multi-device aman** (local-first + Realtime + NetworkOnly SW).
- UI parity dengan Next **wajib** sebelum cutover.
- Fitur klien baru: **Next dulu** (selesai + SQL OK), SPA ikut saat port modul.
- Delay deploy/uji hosting ekstra sampai diminta.
- PowerShell: `;` bukan `&&`.

### Baru selesai (31 Jul malam) — Next UX polish; jangan ulang di Next kecuali bug

- Kartu stok mobile: satu kartu produk + baris varian ringkas
- Ranking cari (barang/stok/kasir): nama produk → warna/ukuran → kategori
- Edit barang/varian: **satu Simpan** (qty stok opsional → Mutasi IN/OUT); tanpa Terapkan stok
- Mutasi label ID: Masuk / Keluar / Pindah
- Subnav: tab **Lokasi**; subtitle Kelola barang dan stok
- Hapus barang boleh meski ada stok; kategori/gudang tetap diblokir jika dipakai
- Detail: `Aplikasi monitoring/CHANGELOG.md` `[8.1.0]`

### Baru selesai (31 Jul) — Next + SQL; jangan ulang

- Search `/gudang/stok` + filter Stok Menipis
- SQL `migrate_product_variants.sql` **dijalankan sukses** di shared DB (Success, no rows)
- UI barang: toggle varian; kasir/mutasi/stok pakai leaf saja

### Baru selesai (30 Jul) — jangan kerjakan ulang

- Dashboard KPI OWNER SPA; Edge `apply-sale-stock` deploy + Build var; push `e292e27` Cloudflare hijau

### Baru selesai (29 Jul malam) — jangan kerjakan ulang

- Detail transaksi + pelunasan; list klikable; katalog kasir; CRUD pelanggan/produk; skin shell

### Prompt tempel chat baru (besok — migrasi SPA)

```
Lanjut migrasi SPA kasir (repo aplikasi-monitoring-spa).
Baca MIGRATION-HANDOFF.md bagian "Lanjut besok" + AGENTS.md.
DB Opsi C shared; SQL varian parent_id/warna/ukuran sudah dijalankan (Success).
Produksi harian masih Next. Search stok + UI varian sudah di Next — jangan ulang.
Edge apply-sale-stock + Cloudflare Build var OK.
Berikutnya default: void transaksi (+ restore stok via Edge).
UI harus sama persis dengan Next (folder sibling Aplikasi monitoring).
```

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

## Status tahap (per 31 Jul 2026 malam)

### Selesai
- [x] Arsitektur & rollback tag Next `v1-next-stable`
- [x] Scaffold Vite + React 19 + Tailwind 4 + shadcn + PWA
- [x] Auth login/register + role shell
- [x] Kasir cepat + Dexie offline queue + sync idempoten (`client_id`)
- [x] Fix parsing harga integer SPA
- [x] Deploy Cloudflare Workers + Build variables `VITE_SUPABASE_*`
- [x] Uji kasir online + offline + sync di hosting (user OK)
- [x] SPA local-first list + Realtime multi-device + refetch focus/online
- [x] Skin login/register/kasir/list transaksi (parity visual dasar)
- [x] Kasir katalog: SearchablePicker + LineItemsEditor + cache gudang/stok
- [x] Modul pelanggan + produk (CRUD dasar, refresh cache kasir)
- [x] Detail transaksi + pelunasan (direct Supabase; tanpa void/nota)
- [x] Kode Edge `apply-sale-stock` di repo + client call di `createTransaction`
- [x] Dashboard KPI (OWNER) + parity Next (anon+RLS; Dexie + useLiveData)
- [x] Deploy Edge `apply-sale-stock` ke project `zmjcdltplreqnsnbaldl`
- [x] Cloudflare Build var `VITE_EDGE_APPLY_SALE_STOCK_URL` + Redeploy Workers
- [x] Next: search Gudang/Stok + varian UI + SQL `migrate_product_variants.sql` **applied** (shared DB)
- [x] Next UX 31 Jul malam: ranking cari, satu Simpan+stok, Mutasi ID, kartu grup, hapus barang dgn stok (`CHANGELOG` 8.1.0)

### Belum
- [ ] Void transaksi SPA (+ restore stok via Edge)
- [ ] Gudang / mutasi, operasional, piutang, invoice, pengaturan (SPA)
- [ ] Port search + varian + UX inventori 8.1.0 ke SPA (parity; kolom DB sudah ada)
- [ ] Nota/PDF, HPP
- [ ] **UI parity penuh** sisa modul
- [ ] Uji PWA di HP toko / jaringan jelek (tawarkan; user boleh delay)
- [ ] Cutover domain; Next jadi fallback

### Catatan di luar scope
- Cache dashboard Next 60s stale dari SPA — **abaikan** kecuali user minta.

## Performa & multi-device (SPA)

Prioritas: UI kencang (paint dari Dexie) + data benar antar perangkat (shared Supabase).

| Lapisan | Peran |
|---------|--------|
| Dexie cache list + pending | Paint instan di device ini; antrean offline |
| Network fetch | Sumber kebenaran saat online |
| Supabase Realtime | Device lain tulis → refetch otomatis |
| focus / online / visibility | Fallback jika Realtime putus |
| `client_id` | Sync offline idempoten (tidak dobel) |
| SW REST = NetworkOnly | Jangan sajikan baris usang antar device |

### SQL sekali (Supabase → SQL Editor, project monitoring)

Realtime (sudah):

```sql
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.transaction_payments;
```

**Status 29 Jul 2026:** publication Success.

Varian produk (sudah):

- File: `../Aplikasi monitoring/supabase/migrate_product_variants.sql`
- **Status 31 Jul 2026 malam:** dijalankan user — *Success. No rows returned* (OK untuk DDL).

### Utang teknis
- `payment_date` transaksi offline = waktu sync, bukan waktu jual (lintas hari → bucket dashboard salah).

## Cara kerja UI parity (wajib)

Sumber kebenaran visual = app Next di `Aplikasi monitoring`:

- Token & tema: `app/globals.css` → SPA `src/index.css` (**ported**)
- Layout: `components/layout/` → SPA shell (**ported**)
- Transaksi list/kasir/detail/pelunasan: skin dasar **ported**; void/nota belum
- Dashboard: `app/(app)/dashboard/` → SPA `/dashboard` (**ported** KPI OWNER)
- Gudang/stok: belum di SPA; saat port wajib ikut **search matrix** dari Next
- Produk/varian: CRUD dasar SPA ada; saat port penuh wajib ikut **parent+child** (`parent_id`/`warna`/`ukuran`) dari Next
- Komponen UI shadcn yang sudah dikustom (bertahap)

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
- `VITE_EDGE_APPLY_SALE_STOCK_URL` *(setelah Edge di-deploy)*

(sama nilai `NEXT_PUBLIC_*` / URL Edge di Next). Setelah ubah env → Redeploy. Jika UI bilang “Konfigurasi diperlukan”, hard refresh / clear SW.
