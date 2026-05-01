CREATE TABLE IF NOT EXISTS employee_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  effective_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE employee_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eh_select" ON employee_history FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "eh_insert" ON employee_history FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'responsable')));
