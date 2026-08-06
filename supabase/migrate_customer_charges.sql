-- ============================================================
-- MIGRASI: biaya dibebankan ke pembeli (ongkir & sejenis)
-- ============================================================
-- Jalankan sekali di Supabase SQL Editor (project bersama SPA/Next).
-- Nominal ini masuk nota + total tagihan, TIDAK masuk omzet dashboard.

CREATE TABLE IF NOT EXISTS public.transaction_customer_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transaction_customer_charges_tx
  ON public.transaction_customer_charges (transaction_id);

ALTER TABLE public.transaction_customer_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner full access on transaction_customer_charges"
  ON public.transaction_customer_charges;
DROP POLICY IF EXISTS "Karyawan select transaction_customer_charges"
  ON public.transaction_customer_charges;
DROP POLICY IF EXISTS "Karyawan insert transaction_customer_charges"
  ON public.transaction_customer_charges;
DROP POLICY IF EXISTS "Karyawan update transaction_customer_charges"
  ON public.transaction_customer_charges;
DROP POLICY IF EXISTS "Karyawan delete transaction_customer_charges"
  ON public.transaction_customer_charges;

CREATE POLICY "Owner full access on transaction_customer_charges"
  ON public.transaction_customer_charges
  FOR ALL USING (get_user_role() = 'OWNER');

CREATE POLICY "Karyawan select transaction_customer_charges"
  ON public.transaction_customer_charges
  FOR SELECT USING (get_user_role() = 'KARYAWAN');

CREATE POLICY "Karyawan insert transaction_customer_charges"
  ON public.transaction_customer_charges
  FOR INSERT WITH CHECK (get_user_role() = 'KARYAWAN');

CREATE POLICY "Karyawan update transaction_customer_charges"
  ON public.transaction_customer_charges
  FOR UPDATE USING (get_user_role() = 'KARYAWAN');

CREATE POLICY "Karyawan delete transaction_customer_charges"
  ON public.transaction_customer_charges
  FOR DELETE USING (get_user_role() = 'KARYAWAN');

COMMENT ON TABLE public.transaction_customer_charges IS
  'Biaya dibebankan ke pembeli (ongkir dll). Masuk nota/tagihan, bukan omzet.';
