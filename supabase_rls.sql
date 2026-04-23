-- ================================================================
-- RLS Supabase – Musiam Planning
-- Coller dans Supabase > SQL Editor et exécuter
-- ================================================================

-- ----------------------------------------------------------------
-- USERS
-- SELECT : tout utilisateur authentifié
-- WRITE  : admin uniquement
-- (La politique SELECT simple évite la récursion sur les subqueries)
-- ----------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_select" ON users;
DROP POLICY IF EXISTS "users_insert" ON users;
DROP POLICY IF EXISTS "users_update" ON users;
DROP POLICY IF EXISTS "users_delete" ON users;

CREATE POLICY "users_select" ON users
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "users_insert" ON users
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "users_update" ON users
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "users_delete" ON users
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ----------------------------------------------------------------
-- EMPLOYEES
-- ----------------------------------------------------------------
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "employees_select" ON employees;
DROP POLICY IF EXISTS "employees_insert" ON employees;
DROP POLICY IF EXISTS "employees_update" ON employees;
DROP POLICY IF EXISTS "employees_delete" ON employees;

CREATE POLICY "employees_select" ON employees
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "employees_insert" ON employees
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "employees_update" ON employees
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "employees_delete" ON employees
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ----------------------------------------------------------------
-- TEAMS
-- ----------------------------------------------------------------
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "teams_select" ON teams;
DROP POLICY IF EXISTS "teams_insert" ON teams;
DROP POLICY IF EXISTS "teams_update" ON teams;
DROP POLICY IF EXISTS "teams_delete" ON teams;

CREATE POLICY "teams_select" ON teams
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "teams_insert" ON teams
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "teams_update" ON teams
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "teams_delete" ON teams
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ----------------------------------------------------------------
-- SHIFT_CODES
-- ----------------------------------------------------------------
ALTER TABLE shift_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shift_codes_select" ON shift_codes;
DROP POLICY IF EXISTS "shift_codes_insert" ON shift_codes;
DROP POLICY IF EXISTS "shift_codes_update" ON shift_codes;
DROP POLICY IF EXISTS "shift_codes_delete" ON shift_codes;

CREATE POLICY "shift_codes_select" ON shift_codes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "shift_codes_insert" ON shift_codes
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "shift_codes_update" ON shift_codes
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "shift_codes_delete" ON shift_codes
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ----------------------------------------------------------------
-- ABSENCE_CODES
-- ----------------------------------------------------------------
ALTER TABLE absence_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "absence_codes_select" ON absence_codes;
DROP POLICY IF EXISTS "absence_codes_insert" ON absence_codes;
DROP POLICY IF EXISTS "absence_codes_update" ON absence_codes;
DROP POLICY IF EXISTS "absence_codes_delete" ON absence_codes;

CREATE POLICY "absence_codes_select" ON absence_codes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "absence_codes_insert" ON absence_codes
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "absence_codes_update" ON absence_codes
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "absence_codes_delete" ON absence_codes
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ----------------------------------------------------------------
-- SITES
-- ----------------------------------------------------------------
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sites_select" ON sites;
DROP POLICY IF EXISTS "sites_insert" ON sites;
DROP POLICY IF EXISTS "sites_update" ON sites;
DROP POLICY IF EXISTS "sites_delete" ON sites;

CREATE POLICY "sites_select" ON sites
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "sites_insert" ON sites
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "sites_update" ON sites
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "sites_delete" ON sites
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ----------------------------------------------------------------
-- JOB_FUNCTIONS
-- ----------------------------------------------------------------
ALTER TABLE job_functions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "job_functions_select" ON job_functions;
DROP POLICY IF EXISTS "job_functions_insert" ON job_functions;
DROP POLICY IF EXISTS "job_functions_update" ON job_functions;
DROP POLICY IF EXISTS "job_functions_delete" ON job_functions;

CREATE POLICY "job_functions_select" ON job_functions
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "job_functions_insert" ON job_functions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "job_functions_update" ON job_functions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "job_functions_delete" ON job_functions
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ----------------------------------------------------------------
-- STAFFING_STRUCTURES
-- ----------------------------------------------------------------
ALTER TABLE staffing_structures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staffing_structures_select" ON staffing_structures;
DROP POLICY IF EXISTS "staffing_structures_insert" ON staffing_structures;
DROP POLICY IF EXISTS "staffing_structures_update" ON staffing_structures;
DROP POLICY IF EXISTS "staffing_structures_delete" ON staffing_structures;

CREATE POLICY "staffing_structures_select" ON staffing_structures
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "staffing_structures_insert" ON staffing_structures
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "staffing_structures_update" ON staffing_structures
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "staffing_structures_delete" ON staffing_structures
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ----------------------------------------------------------------
-- STAFFING_STRUCTURE_POSITIONS
-- ----------------------------------------------------------------
ALTER TABLE staffing_structure_positions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ssp_select" ON staffing_structure_positions;
DROP POLICY IF EXISTS "ssp_insert" ON staffing_structure_positions;
DROP POLICY IF EXISTS "ssp_update" ON staffing_structure_positions;
DROP POLICY IF EXISTS "ssp_delete" ON staffing_structure_positions;

CREATE POLICY "ssp_select" ON staffing_structure_positions
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "ssp_insert" ON staffing_structure_positions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "ssp_update" ON staffing_structure_positions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "ssp_delete" ON staffing_structure_positions
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ----------------------------------------------------------------
-- ANNUAL_CALENDAR
-- ----------------------------------------------------------------
ALTER TABLE annual_calendar ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "annual_calendar_select" ON annual_calendar;
DROP POLICY IF EXISTS "annual_calendar_insert" ON annual_calendar;
DROP POLICY IF EXISTS "annual_calendar_update" ON annual_calendar;
DROP POLICY IF EXISTS "annual_calendar_delete" ON annual_calendar;

CREATE POLICY "annual_calendar_select" ON annual_calendar
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "annual_calendar_insert" ON annual_calendar
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "annual_calendar_update" ON annual_calendar
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "annual_calendar_delete" ON annual_calendar
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- ----------------------------------------------------------------
-- EMPLOYEE_TEAMS (admin + manager)
-- ----------------------------------------------------------------
ALTER TABLE employee_teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "employee_teams_select" ON employee_teams;
DROP POLICY IF EXISTS "employee_teams_insert" ON employee_teams;
DROP POLICY IF EXISTS "employee_teams_update" ON employee_teams;
DROP POLICY IF EXISTS "employee_teams_delete" ON employee_teams;

CREATE POLICY "employee_teams_select" ON employee_teams
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "employee_teams_insert" ON employee_teams
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE POLICY "employee_teams_update" ON employee_teams
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE POLICY "employee_teams_delete" ON employee_teams
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- ----------------------------------------------------------------
-- CYCLE_SCHEDULES (admin + manager)
-- ----------------------------------------------------------------
ALTER TABLE cycle_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cycle_schedules_select" ON cycle_schedules;
DROP POLICY IF EXISTS "cycle_schedules_insert" ON cycle_schedules;
DROP POLICY IF EXISTS "cycle_schedules_update" ON cycle_schedules;
DROP POLICY IF EXISTS "cycle_schedules_delete" ON cycle_schedules;

CREATE POLICY "cycle_schedules_select" ON cycle_schedules
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "cycle_schedules_insert" ON cycle_schedules
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE POLICY "cycle_schedules_update" ON cycle_schedules
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE POLICY "cycle_schedules_delete" ON cycle_schedules
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- ----------------------------------------------------------------
-- PLANNING_ARCHIVES (admin + manager)
-- ----------------------------------------------------------------
ALTER TABLE planning_archives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "planning_archives_select" ON planning_archives;
DROP POLICY IF EXISTS "planning_archives_insert" ON planning_archives;
DROP POLICY IF EXISTS "planning_archives_update" ON planning_archives;
DROP POLICY IF EXISTS "planning_archives_delete" ON planning_archives;

CREATE POLICY "planning_archives_select" ON planning_archives
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "planning_archives_insert" ON planning_archives
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE POLICY "planning_archives_update" ON planning_archives
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE POLICY "planning_archives_delete" ON planning_archives
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- ----------------------------------------------------------------
-- SCHEDULES
-- SELECT : admin/manager voient tout ; salarié voit uniquement
--          les lignes où employee_id = son propre employee_id
-- WRITE  : admin + manager uniquement (salariés : aucun droit)
-- ----------------------------------------------------------------
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "schedules_select" ON schedules;
DROP POLICY IF EXISTS "schedules_insert" ON schedules;
DROP POLICY IF EXISTS "schedules_update" ON schedules;
DROP POLICY IF EXISTS "schedules_delete" ON schedules;

CREATE POLICY "schedules_select" ON schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND (
          role IN ('admin', 'manager')
          OR employee_id = schedules.employee_id
        )
    )
  );

CREATE POLICY "schedules_insert" ON schedules
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE POLICY "schedules_update" ON schedules
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE POLICY "schedules_delete" ON schedules
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );
