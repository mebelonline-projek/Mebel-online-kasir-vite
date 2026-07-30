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

### Realtime multi-device (wajib untuk SPA kencang antar HP/PC)

Jalankan sekali di SQL Editor project shared:

```sql
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.transaction_payments;
```

**Status 29 Jul 2026:** sudah dijalankan.

### Edge Function potong stok (`apply-sale-stock`)

RPC `apply_stock_change` hanya boleh `service_role` → wajib Edge Function (bukan di browser).

```bash
# dari repo SPA, login CLI lalu:
# Jika 401 Unauthorized: refresh Access Token di Supabase Account → Access Tokens
supabase functions deploy apply-sale-stock --project-ref zmjcdltplreqnsnbaldl
```

Pastikan secret `SUPABASE_SERVICE_ROLE_KEY` ada di project (dashboard → Edge Functions → Secrets).

Lalu di `.env.local` / Cloudflare **Build variables**:

```
VITE_EDGE_APPLY_SALE_STOCK_URL=https://zmjcdltplreqnsnbaldl.supabase.co/functions/v1/apply-sale-stock
```

Redeploy SPA setelah set env. Tanpa URL ini, kasir tetap simpan transaksi + item, tapi stok katalog tidak terpotong.

Jangan pause website atau app monitoring hanya demi staging.
