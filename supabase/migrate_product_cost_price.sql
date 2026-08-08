-- ============================================================
-- MIGRASI: harga modal produk + RLS INSERT hpp_items (seed kasir)
-- ============================================================
-- Jalankan sekali di Supabase SQL Editor (project bersama SPA).
-- cost_price = harga modal (opsional, default 0). Auto-seed HPP
-- saat create transaksi: amount = qty × cost_price per baris barang.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_cost_price_nonneg'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_cost_price_nonneg CHECK (cost_price >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.products.cost_price IS
  'Harga modal (COGS unit). Opsional; 0 = tidak auto-isi HPP saat jual.';

-- Izinkan role yang membuat transaksi ikut INSERT hpp_items (auto-seed).
-- Update/delete HPP tetap lewat policy OWNER yang sudah ada + enforce app.
DROP POLICY IF EXISTS "Staff insert hpp_items on create"
  ON public.hpp_items;

CREATE POLICY "Staff insert hpp_items on create"
  ON public.hpp_items
  FOR INSERT
  WITH CHECK (get_user_role() IN ('OWNER', 'KASIR', 'KARYAWAN'));
