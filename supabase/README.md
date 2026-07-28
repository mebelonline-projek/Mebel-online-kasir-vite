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

Jangan pause website atau app monitoring hanya demi staging.
