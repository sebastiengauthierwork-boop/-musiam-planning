-- ============================================================
-- MIGRATION V2 — Musiam Planning
-- À exécuter dans l'éditeur SQL Supabase (une seule fois)
-- ============================================================


-- ============================================================
-- 1. COLONNES MANQUANTES SUR employees
-- ============================================================
ALTER TABLE employees ADD COLUMN IF NOT EXISTS matricule          TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS fonction           TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_days_per_week INTEGER;


-- ============================================================
-- 2. COLONNES MANQUANTES SUR users
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_teams UUID[] DEFAULT '{}';


-- ============================================================
-- 3. COLONNES MANQUANTES SUR shift_codes
-- ============================================================
ALTER TABLE shift_codes ADD COLUMN IF NOT EXISTS team_id          UUID REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE shift_codes ADD COLUMN IF NOT EXISTS arrival_time     TIME;
ALTER TABLE shift_codes ADD COLUMN IF NOT EXISTS departure_time   TIME;
ALTER TABLE shift_codes ADD COLUMN IF NOT EXISTS pause_minutes    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shift_codes ADD COLUMN IF NOT EXISTS dressing_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shift_codes ADD COLUMN IF NOT EXISTS target_hours     NUMERIC(4,2);
ALTER TABLE shift_codes ADD COLUMN IF NOT EXISTS paid_hours       NUMERIC(4,2);
ALTER TABLE shift_codes ADD COLUMN IF NOT EXISTS meal_included    BOOLEAN NOT NULL DEFAULT FALSE;


-- ============================================================
-- 4. TABLE job_functions
-- ============================================================
CREATE TABLE IF NOT EXISTS job_functions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE job_functions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_functions_select" ON job_functions;
DROP POLICY IF EXISTS "job_functions_insert" ON job_functions;
DROP POLICY IF EXISTS "job_functions_update" ON job_functions;
DROP POLICY IF EXISTS "job_functions_delete" ON job_functions;

CREATE POLICY "job_functions_select" ON job_functions FOR SELECT TO anon USING (true);
CREATE POLICY "job_functions_insert" ON job_functions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "job_functions_update" ON job_functions FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "job_functions_delete" ON job_functions FOR DELETE TO anon USING (true);


-- ============================================================
-- 5. TABLE planning_archives
-- ============================================================
CREATE TABLE IF NOT EXISTS planning_archives (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  month       INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year        INTEGER NOT NULL,
  archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  archived_by TEXT,
  status      TEXT NOT NULL DEFAULT 'archived'
                CHECK (status IN ('draft', 'published', 'validated', 'archived')),
  pdf_url     TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE planning_archives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "planning_archives_select" ON planning_archives;
DROP POLICY IF EXISTS "planning_archives_insert" ON planning_archives;
DROP POLICY IF EXISTS "planning_archives_update" ON planning_archives;
DROP POLICY IF EXISTS "planning_archives_delete" ON planning_archives;

CREATE POLICY "planning_archives_select" ON planning_archives FOR SELECT TO anon USING (true);
CREATE POLICY "planning_archives_insert" ON planning_archives FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "planning_archives_update" ON planning_archives FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "planning_archives_delete" ON planning_archives FOR DELETE TO anon USING (true);


-- ============================================================
-- 6. TABLE staffing_structures
-- ============================================================
CREATE TABLE IF NOT EXISTS staffing_structures (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE staffing_structures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staffing_structures_select" ON staffing_structures;
DROP POLICY IF EXISTS "staffing_structures_insert" ON staffing_structures;
DROP POLICY IF EXISTS "staffing_structures_update" ON staffing_structures;
DROP POLICY IF EXISTS "staffing_structures_delete" ON staffing_structures;

CREATE POLICY "staffing_structures_select" ON staffing_structures FOR SELECT TO anon USING (true);
CREATE POLICY "staffing_structures_insert" ON staffing_structures FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "staffing_structures_update" ON staffing_structures FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "staffing_structures_delete" ON staffing_structures FOR DELETE TO anon USING (true);


-- ============================================================
-- 7. TABLE staffing_structure_positions
-- ============================================================
CREATE TABLE IF NOT EXISTS staffing_structure_positions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  structure_id   UUID NOT NULL REFERENCES staffing_structures(id) ON DELETE CASCADE,
  position_name  TEXT NOT NULL,
  required_count INTEGER NOT NULL DEFAULT 1,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE staffing_structure_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ssp_select" ON staffing_structure_positions;
DROP POLICY IF EXISTS "ssp_insert" ON staffing_structure_positions;
DROP POLICY IF EXISTS "ssp_update" ON staffing_structure_positions;
DROP POLICY IF EXISTS "ssp_delete" ON staffing_structure_positions;

CREATE POLICY "ssp_select" ON staffing_structure_positions FOR SELECT TO anon USING (true);
CREATE POLICY "ssp_insert" ON staffing_structure_positions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "ssp_update" ON staffing_structure_positions FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "ssp_delete" ON staffing_structure_positions FOR DELETE TO anon USING (true);


-- ============================================================
-- 8. TABLE annual_calendar
-- ============================================================
CREATE TABLE IF NOT EXISTS annual_calendar (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date         DATE NOT NULL,
  team_id      UUID REFERENCES teams(id) ON DELETE CASCADE,
  structure_id UUID REFERENCES staffing_structures(id) ON DELETE SET NULL,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (date, team_id)
);

ALTER TABLE annual_calendar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "annual_calendar_select" ON annual_calendar;
DROP POLICY IF EXISTS "annual_calendar_insert" ON annual_calendar;
DROP POLICY IF EXISTS "annual_calendar_update" ON annual_calendar;
DROP POLICY IF EXISTS "annual_calendar_delete" ON annual_calendar;

CREATE POLICY "annual_calendar_select" ON annual_calendar FOR SELECT TO anon USING (true);
CREATE POLICY "annual_calendar_insert" ON annual_calendar FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "annual_calendar_update" ON annual_calendar FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "annual_calendar_delete" ON annual_calendar FOR DELETE TO anon USING (true);


-- ============================================================
-- 9. TABLE cycle_schedules
-- ============================================================
CREATE TABLE IF NOT EXISTS cycle_schedules (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  team_id      UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  week_number  INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 6),
  day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  code         VARCHAR(10) NOT NULL,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (employee_id, team_id, week_number, day_of_week)
);

ALTER TABLE cycle_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cycle_schedules_select" ON cycle_schedules;
DROP POLICY IF EXISTS "cycle_schedules_insert" ON cycle_schedules;
DROP POLICY IF EXISTS "cycle_schedules_update" ON cycle_schedules;
DROP POLICY IF EXISTS "cycle_schedules_delete" ON cycle_schedules;

CREATE POLICY "cycle_schedules_select" ON cycle_schedules FOR SELECT TO anon USING (true);
CREATE POLICY "cycle_schedules_insert" ON cycle_schedules FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "cycle_schedules_update" ON cycle_schedules FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "cycle_schedules_delete" ON cycle_schedules FOR DELETE TO anon USING (true);
