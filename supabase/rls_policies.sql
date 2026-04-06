-- ============================================================
-- RLS POLICIES — Musiam Planning
-- Seuls les utilisateurs authentifiés ont accès (auth requis).
-- ============================================================

-- Supprimer TOUTES les anciennes politiques permissives
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

-- ============================================================
-- SELECT : authenticated
-- ============================================================
CREATE POLICY "auth_select" ON teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select" ON employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select" ON employee_teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select" ON shift_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select" ON shift_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select" ON absence_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select" ON schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select" ON leave_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select" ON job_functions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select" ON planning_archives FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select" ON staffing_structures FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select" ON staffing_structure_positions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select" ON annual_calendar FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_select" ON cycle_schedules FOR SELECT TO authenticated USING (true);

-- ============================================================
-- INSERT : authenticated
-- ============================================================
CREATE POLICY "auth_insert" ON teams FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON employees FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON employee_teams FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON shift_codes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON shift_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON absence_codes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON schedules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON leave_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON users FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON job_functions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON planning_archives FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON staffing_structures FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON staffing_structure_positions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON annual_calendar FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_insert" ON cycle_schedules FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- UPDATE : authenticated
-- ============================================================
CREATE POLICY "auth_update" ON teams FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON employees FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON employee_teams FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON shift_codes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON shift_templates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON absence_codes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON schedules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON leave_requests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON users FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON job_functions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON planning_archives FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON staffing_structures FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON staffing_structure_positions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON annual_calendar FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_update" ON cycle_schedules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- DELETE : authenticated
-- ============================================================
CREATE POLICY "auth_delete" ON teams FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON employees FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON employee_teams FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON shift_codes FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON shift_templates FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON absence_codes FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON schedules FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON leave_requests FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON users FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON job_functions FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON planning_archives FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON staffing_structures FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON staffing_structure_positions FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON annual_calendar FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON cycle_schedules FOR DELETE TO authenticated USING (true);
