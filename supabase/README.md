# Database untuk SPA beta

Akun Supabase klien sudah **2/2 Free project aktif** (website + aplikasi monitoring).
Tidak bisa menambah project ketiga di akun yang sama.

## Pilih jalur

### B — Akun Supabase baru (disarankan)
1. Daftar org/akun baru khusus staging.
2. Buat 1 Free project.
3. Jalankan SQL dari repo Next:
   - `../Aplikasi monitoring/supabase/migration.sql`
   - `../Aplikasi monitoring/supabase/migrate_inventory.sql`
   - `../Aplikasi monitoring/supabase/fix_*.sql` (yang relevan)
4. Isi `.env.local` SPA dengan URL + anon key staging.

### C — Pakai project monitoring yang sama dengan Next
- Tidak perlu project baru.
- Isi `.env.local` dengan URL + anon key **project aplikasi monitoring**.
- Uji sangat hati-hati (data produksi).
- Jangan eksperimen destruktif di SQL produksi.

### Biaya dibebankan ke pembeli (`transaction_customer_charges`)

Jalankan sekali di SQL Editor (project bersama):

- File: `supabase/migrate_customer_charges.sql`

Ongkir & biaya serupa masuk nota + total tagihan, **tidak** masuk omzet dashboard.

### Kategori biaya operasional bebas

- File: `supabase/migrate_operational_cost_category.sql`
- **Status 6 Agu 2026:** sudah dijalankan (DROP `operational_costs_category_check`).
- Dropdown: Listrik, Gaji, Bahan baku, Sewa, Utang dengan sales, Lainnya, + Kustom.


```sql
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.transaction_payments;
```

**Status 29 Jul 2026:** sudah dijalankan.

### Edge Function potong stok (`apply-sale-stock`)

RPC `apply_stock_change` hanya boleh `service_role` → wajib Edge Function (bukan di browser).

Mendukung:
- SALE: `{ productId, warehouseId, qty, transactionId }`
- restore: `{ action: "restore", transactionId }`
- move (IN/OUT/TRANSFER, role OWNER|GUDANG): `{ action: "move", type, productId, qty, fromWarehouseId?, toWarehouseId?, note? }`

```bash
npx supabase functions deploy apply-sale-stock --project-ref zmjcdltplreqnsnbaldl --use-api
```

### Deploy CLI: setup sekali, jangan ulang login tiap sesi

`npx supabase login` menyimpan token di credential store yang sering tidak terbaca lagi
(hasilnya `401 Unauthorized` berulang tiap chat/sesi baru). Solusi permanen: simpan
Personal Access Token sebagai **environment variable Windows** milik user.

1. Buat token di https://supabase.com/dashboard/account/tokens (Generate new token).
2. Simpan permanen di PowerShell (ganti `TOKEN_ANDA`; cukup **sekali** di PC ini):

```powershell
[Environment]::SetEnvironmentVariable("SUPABASE_ACCESS_TOKEN", "TOKEN_ANDA", "User")
```

3. **Tutup lalu buka PowerShell baru** (env var hanya terbaca di sesi baru).
4. Deploy tanpa perlu `login` dan tanpa Docker:

```powershell
npx supabase functions deploy <nama-function> --project-ref zmjcdltplreqnsnbaldl --use-api
```

`--use-api` melewati Docker, jadi peringatan "Docker is not running" boleh diabaikan.
Token disimpan di env user, **bukan** di repo. Jangan commit token.

Pastikan secret `SUPABASE_SERVICE_ROLE_KEY` ada di project (dashboard → Edge Functions → Secrets).

Lalu di `.env.local` / Cloudflare **Build variables**:

```
VITE_EDGE_APPLY_SALE_STOCK_URL=https://zmjcdltplreqnsnbaldl.supabase.co/functions/v1/apply-sale-stock
```

Redeploy SPA setelah set env. Tanpa URL ini, kasir tetap simpan transaksi + item, tapi stok katalog tidak terpotong; mutasi gudang juga gagal.

### Edge Function kelola user (`manage-users`)

Auth Admin API (`createUser` / `updateUserById` / `deleteUser`) butuh `service_role` → wajib Edge Function.

Body JSON (Bearer JWT user OWNER):

- `list`
- `create`: `{ email, password, name, role: "KARYAWAN"|"GUDANG" }`
- `update`: `{ id, name, role, password? }`
- `delete`: `{ id }`

```powershell
npx supabase functions deploy manage-users --project-ref zmjcdltplreqnsnbaldl --use-api
```

(Jika kena `401 Unauthorized`, ikuti bagian **Deploy CLI: setup sekali** di atas.)

Lalu di `.env.local` / Cloudflare **Build variables**:

```
VITE_EDGE_MANAGE_USERS_URL=https://zmjcdltplreqnsnbaldl.supabase.co/functions/v1/manage-users
```

Tanpa URL ini, halaman `/pengaturan/user` tetap terbuka tapi tambah/edit/hapus user dinonaktifkan.

Jangan pause website atau app monitoring hanya demi staging.
