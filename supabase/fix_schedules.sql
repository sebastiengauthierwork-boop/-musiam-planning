-- ============================================================
-- FIX — Persistance des saisies dans schedules
-- À exécuter dans l'éditeur SQL Supabase
-- ============================================================

-- 1. Ajouter la colonne code (si absente)
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS code VARCHAR(10);

-- 2. Supprimer les doublons (employee_id, date) avant la contrainte unique
DELETE FROM schedules a USING schedules b
  WHERE a.created_at < b.created_at
    AND a.employee_id = b.employee_id
    AND a.date = b.date;

-- 3. Contrainte unique nécessaire pour les upserts
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_emp_date_unique;
ALTER TABLE schedules ADD CONSTRAINT schedules_emp_date_unique UNIQUE (employee_id, date);

-- 4. Politiques RLS — SELECT / INSERT / UPDATE / DELETE pour anon
DROP POLICY IF EXISTS "schedules_select" ON schedules;
DROP POLICY IF EXISTS "schedules_insert" ON schedules;
DROP POLICY IF EXISTS "schedules_update" ON schedules;
DROP POLICY IF EXISTS "schedules_delete" ON schedules;

CREATE POLICY "schedules_select" ON schedules FOR SELECT TO anon USING (true);
CREATE POLICY "schedules_insert" ON schedules FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "schedules_update" ON schedules FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "schedules_delete" ON schedules FOR DELETE TO anon USING (true);

-- Vérification : doit retourner les colonnes id, employee_id, date, code, type…
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'schedules' ORDER BY ordinal_position;
