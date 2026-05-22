-- ============================================================
-- MIGRATION — Postes à pourvoir (recrutement)
-- ============================================================

ALTER TABLE employees ADD COLUMN IF NOT EXISTS recruitment_status TEXT NOT NULL DEFAULT 'active';
