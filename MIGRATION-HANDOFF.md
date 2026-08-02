# Handoff migrasi SPA — baca dulu sebelum kerja

Dokumen ini untuk AI agent / developer di **chat baru**. Jangan mengulang keputusan yang sudah final.

## Lanjut besok (2 Agu 2026) — baca ini dulu

**Update 2 Agu malam (serah klien):** Register publik dikunci (`/register` → `/login`; user baru via OWNER Pengaturan User). Edge `apply-sale-stock` authz diperketat (SALE/restore) + redeploy. Kode migrasi di-commit; Workers redeploy. Klien pakai `workers.dev` (tanpa domain custom). Next/`vercel.app` = cadangan.

**Update 2 Agu malam (ops + smoke):** Redeploy Workers dengan `VITE_EDGE_MANAGE_USERS_URL` baked; smoke manage-users + transaksi (data uji baru lalu dibersihkan); PWA mobile + SW/offline dicek di Playwright. **DNS cutover tidak relevan** jika klien hanya pakai `*.workers.dev` / `*.vercel.app`. Rollback tag `v1-next-stable` OK.

Jangan ulang port Gudang/Operasional/Piutang/Invoice/Pengaturan-toko/foto/Nota/HPP/dashboard-keuangan/manage-users/UI-parity-batch-1–2/transaksi-detail-list kecuali bug. **Jangan mutasi data toko lama** saat uji — buat data smoke baru lalu hapus.

### Serah klien — URL & residual

- SPA live: https://mebel-online-kasir-vite.mebelonline.workers.dev/
- Cadangan Next: https://mebel-online-monitoring.vercel.app/ + tag `v1-next-stable`
- User baru: OWNER → `/pengaturan/user` (bukan `/register`)
- Residual: audit RLS SQL belum menyeluruh; password min 6 di manage-users; uji PWA HP fisik opsional

### Status Pengaturan + Edge `manage-users` (penting)

- `/pengaturan` toko + logo: **sudah jalan** (anon+RLS + kompres client).
- Upload foto barang: **sudah** di form `/gudang/barang`.
- `.env.local` sudah berisi `VITE_EDGE_MANAGE_USERS_URL=.../manage-users`.
- Function `manage-users` **redeploy 2 Agu malam** project `zmjcdltplreqnsnbaldl` (`--use-api`).
- Auth Edge = pola `apply-sale-stock` (`Authorization` utuh + `getUser()` tanpa arg JWT).
- Client: header `apikey` anon + refresh session jika hampir expired; `listUsers()` tetap RLS langsung.
- ~~BUG 401 Invalid credentials~~ — ditutup; **smoke create/edit/hapus user OK** (user uji lalu dihapus).
- Workers beta **redeploy 2 Agu malam** — URL manage-users sudah di bundle live.
- CLI: **Jangan** suruh `supabase login` berulang. Pakai `SUPABASE_ACCESS_TOKEN` env + `--use-api`. Detail: `supabase/README.md`.

### Antrian prioritas SPA (default jika user bilang “lanjut”)

1. Cutover DNS domain toko → SPA Workers (**hanya jika user minta**); Next = fallback tag `v1-next-stable`.
2. Uji PWA di HP fisik toko (opsional; Playwright mobile/SW sudah OK).

### Fitur klien di Next → roadmap SPA

| Fitur | Status | Masuk SPA kapan |
|-------|--------|-----------------|
| Search Gudang/Stok | Done Next + **ported SPA** `/gudang/stok` | — |
| Varian `parent_id` / `warna` / `ukuran` | SQL applied + **ported SPA** barang/kasir/stok/mutasi | — |
| Tanggal custom transaksi (create only) | Done Next + **ported SPA** kasir | — |
| Upload foto barang | Done Next + **ported SPA** | — |
| Pengaturan toko + logo | **ported SPA** | — |
| Kelola user (create/update/delete) | Edge **redeploy** + smoke create/edit/hapus OK | — |
| Dashboard keuangan (trend/HPP/MTD) | Done Next 2 Agu + **ported SPA** | — |
| Nota/PDF + HPP | Done Next + **ported SPA** | — |
| Transaksi detail/list parity | Done Next + **ported SPA**; smoke fulfillment+hapus pada trx uji | — |

Model: parent shell + child leaf; stok/kasir/Edge tetap per `product_id` leaf. Standalone = `parent_id` null. Jangan pecah skema hanya di satu repo.

#### Tanggal custom transaksi — kontrak (sudah di SPA)

Untuk transaksi yang lupa diinput. Aturan:

- Field `transaction_date` (`YYYY-MM-DD`) **hanya di form tambah**; mode edit tidak menampilkan / tidak mengirim.
- Default hari ini WIB; batas `min` = hari ini − 365 hari, `max` = hari ini. Masa depan ditolak Zod (client + create path).
- Kosong / tidak dikirim = hari ini (backward compatible dengan payload lama & antrean offline lama).
- **Tanpa kolom DB baru.** Client menulis `transactions.created_at` dan `transaction_payments.payment_date` (pembayaran awal) = `${tanggal}T12:00:00+07:00`.
- Nomor `TRX-YYYYMMDD-NNN` tetap dari trigger DB (hari input), bukan tanggal jual. Stok tetap dipotong saat create.
- Dashboard mengikuti **periode kalender berjalan**, jadi transaksi mundur bisa muncul di mingguan/tahunan tapi tidak di harian/bulanan (mis. 31 Jul saat hari ini 1 Agu). Ini benar, bukan bug.
- Helper: `wibNoonISO`, `getTransactionDateBounds`, `isWibDateInAllowedRange` di `src/lib/date-utils.ts`; UI di `src/pages/kasir-page.tsx`.

### Opsional smoke (user) — SPA Gudang / Operasional / Piutang / Invoice / Nota / Dashboard

- OWNER/GUDANG: buat lokasi + kategori + barang standalone + parent+2 varian → cek matrix Stok.
- Mutasi Masuk/Keluar/Pindah; riwayat muncul.
- Kasir hanya leaf; ranking nama; jual → stok potong; tanggal custom mundur (opsional).
- Hapus barang dengan stok: diizinkan; hapus kategori terpakai: diblok.
- OWNER/KARYAWAN: `/operasional` — tambah biaya; OWNER edit/hapus; filter bulan + range custom.
- OWNER: `/piutang` — list outstanding; CTA pelunasan jalan.
- OWNER/KASIR: `/invoice` — buat dari trx DP; detail print/PDF; OWNER hapus; pelunasan sync totals.
- OWNER: detail transaksi → Nota (cetak/PDF); Kelola HPP; estimasi laba kotor; Status Pesanan; Edit DP; WhatsApp; Hapus permanen.
- OWNER: `/dashboard` — Omzet “Uang masuk”; Laba Kotor HPP proporsional; trend tidak % ribuan; MTD s/d hari ini.
- List `/transaksi` — filter Pesanan + badge fulfillment; Export CSV (OWNER).

### Preferensi user (sesi 29 Jul – 2 Agu)

- SPA **cepat + multi-device aman** (local-first + Realtime + NetworkOnly SW).
- UI parity dengan Next **wajib** sebelum cutover.
- Fitur klien baru: **Next dulu** (selesai + SQL OK), SPA ikut saat port modul.
- Delay deploy/uji hosting ekstra sampai diminta.
- PowerShell: `;` bukan `&&`.

### Baru selesai (2 Agu malam) — parity transaksi detail + list; jangan ulang kecuali bug

- Detail: layout `lg:grid-cols-3`; Status Pesanan chips → `updateFulfillmentStatus`; WhatsApp reminder; Hapus permanen OWNER (`deleteTransactionPermanent` + Edge restore); Edit DP → `/transaksi/:id/edit`
- Lib: `updateFulfillmentStatus`, `updateTransaction`, `deleteTransactionPermanent`; Zod `fulfillmentUpdateSchema` + `transactionSchema`; `src/lib/export-csv.ts`
- List: filter Pesanan + `FulfillmentBadge`; kolom Aksi Eye; Export CSV OWNER; URL `?q=&status=&fulfillment=` (Dexie local-first tetap)
- **Belum diuji user** — smoke ditunda

### Baru selesai (2 Agu malam) — UI parity batch 2; jangan ulang kecuali bug

- Skeleton loading: `src/components/shared/page-skeleton.tsx` + dipakai dashboard/gudang*/pengaturan*/transaksi list+detail+hpp/pelunasan/customers
- Foto barang: `ProductThumb` hover/ring + Dialog lightbox di `product-inventory-client.tsx`

### Baru selesai (2 Agu malam) — UI parity batch 1; jangan ulang kecuali bug

- Hapus padding ganda: `dashboard-page` + `gudang-shell` (padding hanya di `AppShell`)
- Nav GUDANG = Next: bottom `grid-cols-5` (Stok/Barang/Mutasi/Gudang + Menu); sidebar + sheet Kategori/Barang/Stok/Mutasi
- HPP: `max-w-3xl` (parity Next)
- Banner Edge manage-users: hanya jika `VITE_EDGE_MANAGE_USERS_URL` kosong

### Baru selesai (2 Agu malam) — Edge `manage-users` 401; jangan ulang kecuali bug

- Auth Edge diselaraskan `apply-sale-stock`: `Authorization` utuh + `auth.getUser()` tanpa arg
- Client `src/lib/users.ts`: header `apikey` + refresh session jika hampir expired
- Deploy: `npx supabase functions deploy manage-users --project-ref zmjcdltplreqnsnbaldl --use-api` **sukses**
- List tetap RLS; mutasi lewat Edge — **smoke create/edit/hapus ditunda user**
- Cloudflare Build var `VITE_EDGE_MANAGE_USERS_URL` mungkin masih perlu di-set untuk beta hosted

### Baru selesai (2 Agu malam) — SPA dashboard keuangan = parity Next; jangan ulang kecuali bug

Sumber: sibling `Aplikasi monitoring` (fix 2 Agu).

**Yang di-port ke SPA:**

1. **Trend** — `DashboardTrend` di `src/lib/dashboard.ts`; label `Naik (dari rugi)` / dari nol / cap `>999`; UI `src/pages/dashboard-page.tsx`.
2. **HPP proporsional** — `(bayar periode / final_price) × total HPP`; fetch HPP juga untuk trx payment-only di luar rentang chart.
3. **Banding MTD/WTD/YTD** — `getWibPeriodBounds` di `src/lib/date-utils.ts` (+ `clampWibDayInMonth`): KPI s/d hari ini vs rentang setara periode lalu.
4. **Label** — Omzet = “Uang masuk”; Margin trend = “poin”; Laba Kotor subtitle proporsional.
5. Cache Dexie: bentuk trend lama (number) diabaikan → refetch.

### Baru selesai (2 Agu) — SPA Nota/PDF + HPP per transaksi; jangan ulang kecuali bug

- `/transaksi/:id/nota`: preview + cetak + PDF client (`buildNotaPdfData` + `@react-pdf/renderer`)
- `/transaksi/:id/hpp`: CRUD OWNER `hpp_items`; ringkasan + estimasi laba di detail transaksi
- Lib: `src/lib/hpp.ts`, `src/lib/pdf-invoice.ts` (`buildNotaPdfData`), `src/components/invoice/nota-document.tsx`
- **Belum diuji user** — smoke ditunda sampai antrian modul selesai

### Baru selesai (2 Agu malam) — Next dashboard keuangan (sumber port SPA di atas)

**Bug yang diperbaiki di Next** (angka aneh “Turun 14208%” di Laba Bersih):

1. **Trend** — arah Naik/Turun dari selisih absolut; rugi→untung = label `Naik (dari rugi)` (bukan % ribuan); dari nol / jadi rugi = label khusus; % di-cap `>999`. Tipe `DashboardTrend` di `lib/transactions.ts`; UI di `app/(app)/dashboard/owner/page.tsx`.
2. **HPP proporsional** — omzet tetap cash basis (`payment_date`); HPP = `(bayar periode / final_price) × total HPP` per transaksi (hindari double-count DP/cicilan). Fetch HPP juga untuk trx yang hanya muncul lewat pembayaran (dibuat di luar rentang chart).
3. **Banding MTD/WTD/YTD** — `getWibPeriodBounds` di `lib/date-utils.ts`: KPI s/d hari ini vs rentang **setara** periode lalu (bukan vs bulan/minggu penuh).
4. **Label** — Omzet = “Uang masuk”; Margin trend = “poin”; subtitle Laba Kotor menyebut proporsional.
5. **Docs** — `docs/verifikasi-seed.md` diselaraskan ke cash basis + HPP proporsional.

### Baru selesai (1 Agu malam) — SPA Pengaturan + foto barang; jangan ulang kecuali bug

- `/pengaturan`: info toko + upload/reset logo (kompres client WebP); logout
- `/pengaturan/user`: list/tambah/edit/hapus KARYAWAN|GUDANG via Edge `manage-users`
- Lib: `src/lib/settings.ts`, `src/lib/users.ts`, `src/lib/image-process.ts`
- Edge kode: `supabase/functions/manage-users/index.ts` — **deploy + `VITE_EDGE_MANAGE_USERS_URL` masih perlu**
- Store context load dari `store_settings` + refresh setelah ubah nama/logo
- Upload foto barang di form `/gudang/barang` (kompres client → bucket `product-photos`); hapus bersihkan storage

### Baru selesai (1 Agu malam) — SPA Invoice + tanggal custom; jangan ulang kecuali bug

- `/invoice`, `/invoice/buat`, `/invoice/:id`: list + filter + pagination; buat dari trx DP/menunggu; detail preview + print + unduh PDF client; hapus OWNER
- Lib: `src/lib/invoices.ts`, `src/lib/pdf-invoice.ts`, `src/components/invoice/invoice-document.tsx`
- Dep: `@react-pdf/renderer` (PDF blob di browser)
- Kasir: field tanggal transaksi create-only + Zod + `created_at`/`payment_date` noon WIB + offline payload

### Baru selesai (1 Agu) — SPA Piutang; jangan ulang kecuali bug

- `/piutang`: list transaksi DP/MENUNGGU_PELUNASAN dengan remaining > 0 (OWNER)
- KPI total piutang; CTA ke pelunasan SPA yang sudah ada
- Lib: `src/lib/piutang.ts`

### Baru selesai (1 Agu) — SPA Operasional; jangan ulang kecuali bug

- `/operasional`: CRUD biaya operasional (list + filter bulan/custom + pagination)
- OWNER edit/hapus; OWNER/KARYAWAN tambah; Zod `operationalCostSchema`
- Lib anon+RLS: `src/lib/operational-costs.ts`

### Baru selesai (1 Agu) — SPA Gudang; jangan ulang kecuali bug

- 5 tab: `/gudang`, `/gudang/kategori`, `/gudang/barang`, `/gudang/stok`, `/gudang/mutasi`
- Varian parent/child; search ranking; Stok Menipis; Mutasi label ID
- Edge kode `action: "move"`; client `moveStock` / `createStockMovement`
- Kasir cache + picker leaf + `productDisplayName`
- `/produk` redirect ke `/gudang/barang`
- Edge `action: "move"` **redeploy sukses**; upload foto barang **ported** (1 Agu malam)

### Baru selesai (31 Jul malam) — SPA void; jangan ulang kecuali bug

- Void transaksi SPA: tombol Batalkan (OWNER) + dialog alasan ≥ 3 di detail
- Status `BATAL` + `void_reason` / `void_at` / `void_by`; restore stok via Edge `action: "restore"`
- Sync totals invoice linked (exclude BATAL); soft-fail jika restore gagal setelah status BATAL

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
DB Opsi C shared. Modul + smoke + redeploy manage-users + PWA Playwright sudah.
Default berikutnya: cutover DNS domain toko HANYA jika user minta (Next = fallback v1-next-stable).
Jangan mutasi data toko lama saat uji; buat smoke baru lalu hapus.
Jangan ulang siklus supabase login 401.
UI harus sama persis dengan Next (folder sibling Aplikasi monitoring).
```

### Baru selesai (2 Agu malam) — smoke + redeploy + PWA; jangan ulang kecuali bug

- Workers redeploy: `VITE_EDGE_MANAGE_USERS_URL` baked di bundle live
- Smoke manage-users: create/edit/hapus user uji lalu dibersihkan
- Smoke transaksi: buat trx free-text `SMOKE SPA TEST`, update fulfillment, hapus permanen
- Trx lama NURHAYATI sempat ikut berubah status → **dikembalikan ke Selesai**
- PWA: SW + manifest + mobile 390×844 + reload offline shell
- `v1-next-stable` di repo Next terverifikasi; **DNS cutover belum**

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

## Status tahap (per 2 Agu 2026 malam — smoke + redeploy manage-users + PWA check; DNS cutover ditunda)

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
- [x] Deploy Edge `apply-sale-stock` ke project `zmjcdltplreqnsnbaldl` *(SALE/restore + move)*
- [x] Cloudflare Build var `VITE_EDGE_APPLY_SALE_STOCK_URL` + Redeploy Workers
- [x] Next: search Gudang/Stok + varian UI + SQL `migrate_product_variants.sql` **applied** (shared DB)
- [x] Next UX 31 Jul malam: ranking cari, satu Simpan+stok, Mutasi ID, kartu grup, hapus barang dgn stok (`CHANGELOG` 8.1.0)
- [x] Void transaksi SPA (+ restore stok via Edge; sync invoice linked)
- [x] Next 1 Agu: tanggal custom transaksi (create only, tanpa SQL)
- [x] SPA Gudang: Lokasi/Kategori/Barang(+varian)/Stok(+search)/Mutasi + kasir leaf/ranking
- [x] Edge `action: "move"` + `moveStock` client — **redeploy sukses**
- [x] SPA Operasional: `/operasional` CRUD biaya + filter periode
- [x] SPA Piutang: `/piutang` list AR OWNER + CTA pelunasan
- [x] SPA Invoice: list / buat / detail + PDF client + print; hapus OWNER
- [x] SPA tanggal custom transaksi di kasir (create only + offline)
- [x] SPA Pengaturan: toko + logo (anon+RLS); user via Edge `manage-users`
- [x] SPA upload foto barang (kompres client → Storage `product-photos`)
- [x] Next 2 Agu: dashboard keuangan — trend aman, HPP proporsional, MTD vs MTD (`CHANGELOG` / handoff di atas)
- [x] SPA Nota/PDF + HPP per transaksi (`/transaksi/:id/nota`, `/transaksi/:id/hpp`)
- [x] SPA port fix dashboard keuangan (trend/HPP proporsional/MTD) — parity Next 2 Agu
- [x] Edge `manage-users` auth parity + redeploy `--use-api` (fix 401)
- [x] UI parity batch 1: padding AppShell, nav GUDANG, HPP `max-w-3xl`
- [x] UI parity batch 2: skeleton loading + foto barang lightbox
- [x] Parity transaksi detail/list: fulfillment update, WA, hapus permanen, edit DP, filter/badge/CSV
- [x] Redeploy Workers dengan `VITE_EDGE_MANAGE_USERS_URL` baked (build lokal + `wrangler deploy`)
- [x] Smoke manage-users create/edit/hapus (user uji lalu dihapus)
- [x] Smoke transaksi baru: fulfillment update + hapus permanen (trx uji lalu dihapus; data lama tidak diubah)
- [x] PWA: manifest + SW precache; viewport mobile; reload offline shell OK (Playwright)
- [x] Rollback Next tag `v1-next-stable` terverifikasi

### Belum
- [ ] Cutover DNS domain custom → SPA (hanya jika klien punya/mau domain; sekarang cukup `workers.dev`)
- [x] Kunci register publik + commit migrasi + redeploy (serah klien 2 Agu malam)

### Catatan di luar scope
- Cache dashboard Next 60s stale dari SPA — **sudah dihapus di Next** (force-dynamic / no unstable_cache dashboard); abaikan kecuali muncul lagi.

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
- ~~`payment_date` transaksi offline = waktu sync~~ — tertutup lewat `transaction_date` di payload (SPA + Next).

## Cara kerja UI parity (wajib)

Sumber kebenaran visual = app Next di `Aplikasi monitoring`:

- Token & tema: `app/globals.css` → SPA `src/index.css` (**ported**)
- Layout: `components/layout/` → SPA shell (**ported**)
- Transaksi list/kasir/detail/pelunasan/void: skin dasar **ported**; nota **ported** (`/transaksi/:id/nota`); detail/list parity (edit DP, fulfillment, hapus, WA, CSV) **ported**
- Dashboard: `app/(app)/dashboard/` → SPA `/dashboard` (**ported** KPI OWNER + logika keuangan 2 Agu: trend/HPP proporsional/MTD)
- Gudang/stok: **ported** SPA `/gudang/*` (search matrix + varian + mutasi)
- Operasional: **ported** SPA `/operasional`
- Piutang: **ported** SPA `/piutang`
- Invoice: **ported** SPA `/invoice` (+ PDF client)
- HPP: **ported** SPA `/transaksi/:id/hpp`
- Pengaturan: **ported** SPA `/pengaturan` + `/pengaturan/user` (Edge `manage-users` redeploy OK; uji mutasi ditunda)
- Produk/varian: CRUD inventori di `/gudang/barang` (+ upload foto); `/produk` redirect ke sana
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
- `VITE_EDGE_MANAGE_USERS_URL` *(setelah Edge `manage-users` di-deploy)*

(sama nilai `NEXT_PUBLIC_*` / URL Edge di Next). Setelah ubah env → Redeploy. Jika UI bilang “Konfigurasi diperlukan”, hard refresh / clear SW.
