-- ============================================================
-- MIGRASI: kategori biaya operasional bebas (dropdown + custom)
-- ============================================================
-- Jalankan sekali di Supabase SQL Editor (project bersama SPA/Next).
--
-- Sebelumnya CHECK hanya izinkan:
--   LISTRIK, GAJI, BAHAN_BAKU, SEWA, LAINNYA
-- UI sudah mendukung kategori bebas + "Utang dengan sales",
-- jadi constraint enum harus dilepas.

ALTER TABLE public.operational_costs
  DROP CONSTRAINT IF EXISTS operational_costs_category_check;

-- Pastikan kolom tetap NOT NULL dengan default aman
ALTER TABLE public.operational_costs
  ALTER COLUMN category SET DEFAULT 'LAINNYA';

ALTER TABLE public.operational_costs
  ALTER COLUMN category SET NOT NULL;
