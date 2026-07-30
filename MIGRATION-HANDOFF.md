# Handoff migrasi SPA — baca dulu sebelum kerja

Dokumen ini untuk AI agent / developer di **chat baru**. Jangan mengulang keputusan yang sudah final.

## Lanjut besok (30 Jul 2026 malam) — baca ini dulu

30 Jul: dashboard KPI OWNER di-port + Edge `apply-sale-stock` **sudah deploy** ke project `zmjcdltplreqnsnbaldl` + Cloudflare Build var + Redeploy Workers **sudah OK**.

### Antrian prioritas (default jika user bilang “lanjut”)

1. **Void transaksi** — port logika Next; stok restore lewat Edge `apply-sale-stock` action restore (sudah live).
2. Modul sisa: gudang/mutasi → operasional → piutang → invoice → pengaturan.
3. Nota/PDF + HPP (boleh belakangan).
4. Uji PWA HP toko / jaringan jelek (tawarkan lagi).
5. Cutover domain **terakhir**; Next = fallback tag `v1-next-stable`.

### Opsional smoke (user)

- Hard refresh / clear SW di beta → kasir tanpa peringatan “Potong stok belum aktif” → jual 1 item → stok berkurang.

### Preferensi user (sesi 29 Jul)

- SPA **cepat + multi-device aman** (local-first + Realtime + NetworkOnly SW).
- UI parity dengan Next **wajib** sebelum cutover; jangan klaim “selesai” dengan UI generik.
- Delay deploy/uji hosting ekstra sampai diminta.
- PowerShell: `;` bukan `&&`.

### Baru selesai (30 Jul) — jangan kerjakan ulang

- Dashboard KPI OWNER: `src/lib/date-utils.ts`, `src/lib/dashboard.ts` (anon+RLS), Dexie cache, UI parity Next (period tabs, 4 KPI + sparkline, recharts, transaksi terbaru)
- `recharts` + shadcn `tabs`; live refresh via `useLiveData` + Realtime existing
- Edge `apply-sale-stock` **deployed** (project `zmjcdltplreqnsnbaldl`); `.env.local` sudah isi URL Edge. `SUPABASE_SERVICE_ROLE_KEY` otomatis tersedia di runtime Edge — tidak perlu set secret manual.

### Baru selesai (29 Jul malam) — jangan kerjakan ulang

- Detail transaksi `/transaksi/:id` + pelunasan `/transaksi/:id/pelunasan`
- List transaksi klikable ke detail (skip id `offline:` / pending)
- `getTransactionById` + `addPayment` di `src/lib/transactions.ts`
- Skin + katalog kasir + CRUD pelanggan/produk
- Fondasi UI: tokens `index.css`, shell, Inter/Playfair

### Prompt tempel chat baru

```
Lanjut migrasi SPA kasir (repo aplikasi-monitoring-spa).
Baca MIGRATION-HANDOFF.md bagian "Lanjut besok" + AGENTS.md.
DB Opsi C shared dengan Next; produksi harian masih Next.
Edge apply-sale-stock + Build var Cloudflare sudah OK. Berikutnya default: void transaksi.
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

## Status tahap (per 30 Jul 2026)

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

### Belum
- [ ] Void transaksi (+ restore stok via Edge)
- [ ] Void transaksi (+ restore stok via Edge)
- [ ] Gudang / mutasi, operasional, piutang, invoice, pengaturan
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

```sql
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.transaction_payments;
```

**Status 29 Jul 2026:** publication sudah dijalankan (Success).

### Utang teknis
- `payment_date` transaksi offline = waktu sync, bukan waktu jual (lintas hari → bucket dashboard salah).

## Cara kerja UI parity (wajib)

Sumber kebenaran visual = app Next di `Aplikasi monitoring`:

- Token & tema: `app/globals.css` → SPA `src/index.css` (**ported**)
- Layout: `components/layout/` → SPA shell (**ported**)
- Transaksi list/kasir/detail/pelunasan: skin dasar **ported**; void/nota belum
- Dashboard: `app/(app)/dashboard/` → SPA `/dashboard` (**ported** KPI OWNER)
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
