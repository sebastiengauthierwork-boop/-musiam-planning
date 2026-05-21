-- ============================================================
-- MIGRATION — Colonne color sur shift_codes et absence_codes
-- ============================================================

ALTER TABLE shift_codes   ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE absence_codes ADD COLUMN IF NOT EXISTS color TEXT;
