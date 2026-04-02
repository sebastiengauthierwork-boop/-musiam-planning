-- ============================================================
-- RLS POLICIES — Musiam Planning
-- Allows full access via the anon key (no auth system yet).
-- Restrict to authenticated users once auth is in place.
-- ============================================================

-- ============================================================
-- TEAMS
-- ============================================================
DROP POLICY IF EXISTS "teams_select"  ON teams;
DROP POLICY IF EXISTS "teams_insert"  ON teams;
DROP POLICY IF EXISTS "teams_update"  ON teams;
DROP POLICY IF EXISTS "teams_delete"  ON teams;

CREATE POLICY "teams_select" ON teams FOR SELECT TO anon USING (true);
CREATE POLICY "teams_insert" ON teams FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "teams_update" ON teams FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "teams_delete" ON teams FOR DELETE TO anon USING (true);

-- ============================================================
-- EMPLOYEES
-- ============================================================
DROP POLICY IF EXISTS "employees_select" ON employees;
DROP POLICY IF EXISTS "employees_insert" ON employees;
DROP POLICY IF EXISTS "employees_update" ON employees;
DROP POLICY IF EXISTS "employees_delete" ON employees;

CREATE POLICY "employees_select" ON employees FOR SELECT TO anon USING (true);
CREATE POLICY "employees_insert" ON employees FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "employees_update" ON employees FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "employees_delete" ON employees FOR DELETE TO anon USING (true);

-- ============================================================
-- EMPLOYEE_TEAMS
-- ============================================================
DROP POLICY IF EXISTS "employee_teams_select" ON employee_teams;
DROP POLICY IF EXISTS "employee_teams_insert" ON employee_teams;
DROP POLICY IF EXISTS "employee_teams_update" ON employee_teams;
DROP POLICY IF EXISTS "employee_teams_delete" ON employee_teams;

CREATE POLICY "employee_teams_select" ON employee_teams FOR SELECT TO anon USING (true);
CREATE POLICY "employee_teams_insert" ON employee_teams FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "employee_teams_update" ON employee_teams FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "employee_teams_delete" ON employee_teams FOR DELETE TO anon USING (true);

-- ============================================================
-- SHIFT_TEMPLATES
-- ============================================================
DROP POLICY IF EXISTS "shift_templates_select" ON shift_templates;
DROP POLICY IF EXISTS "shift_templates_insert" ON shift_templates;
DROP POLICY IF EXISTS "shift_templates_update" ON shift_templates;
DROP POLICY IF EXISTS "shift_templates_delete" ON shift_templates;

CREATE POLICY "shift_templates_select" ON shift_templates FOR SELECT TO anon USING (true);
CREATE POLICY "shift_templates_insert" ON shift_templates FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "shift_templates_update" ON shift_templates FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "shift_templates_delete" ON shift_templates FOR DELETE TO anon USING (true);

-- ============================================================
-- SCHEDULES
-- ============================================================
DROP POLICY IF EXISTS "schedules_select" ON schedules;
DROP POLICY IF EXISTS "schedules_insert" ON schedules;
DROP POLICY IF EXISTS "schedules_update" ON schedules;
DROP POLICY IF EXISTS "schedules_delete" ON schedules;

CREATE POLICY "schedules_select" ON schedules FOR SELECT TO anon USING (true);
CREATE POLICY "schedules_insert" ON schedules FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "schedules_update" ON schedules FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "schedules_delete" ON schedules FOR DELETE TO anon USING (true);

-- ============================================================
-- LEAVE_REQUESTS
-- ============================================================
DROP POLICY IF EXISTS "leave_requests_select" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_insert" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_update" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_delete" ON leave_requests;

CREATE POLICY "leave_requests_select" ON leave_requests FOR SELECT TO anon USING (true);
CREATE POLICY "leave_requests_insert" ON leave_requests FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "leave_requests_update" ON leave_requests FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "leave_requests_delete" ON leave_requests FOR DELETE TO anon USING (true);

-- ============================================================
-- USERS
-- ============================================================
DROP POLICY IF EXISTS "users_select" ON users;
DROP POLICY IF EXISTS "users_insert" ON users;
DROP POLICY IF EXISTS "users_update" ON users;
DROP POLICY IF EXISTS "users_delete" ON users;

CREATE POLICY "users_select" ON users FOR SELECT TO anon USING (true);
CREATE POLICY "users_insert" ON users FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "users_update" ON users FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "users_delete" ON users FOR DELETE TO anon USING (true);
