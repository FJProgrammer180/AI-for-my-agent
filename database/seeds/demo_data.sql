-- Seed FINOVA: tarif contoh untuk simulasi internal.
-- PENTING: ini BUKAN tarif resmi bank manapun — hanya asumsi perencanaan.
INSERT INTO interest_rates (product_code, name, rate_annual, method, effective_from, notes)
VALUES
  ('SAVINGS_GOAL_PLAN', 'Asumsi perencanaan tabungan (contoh)', 3.0000, 'SIMPLE_DAILY', '2026-01-01',
   'Tarif contoh untuk estimasi internal — bukan tarif resmi bank.'),
  ('INSTALLMENT_PLAN', 'Asumsi bunga cicilan (contoh)', 6.0000, 'MONTHLY', '2026-01-01',
   'Tarif contoh untuk simulasi angsuran — bukan tarif resmi lembaga keuangan.')
ON CONFLICT DO NOTHING;
