INSERT INTO role_permissions (role, permission, allowed) VALUES
('admin', 'edit_past_planning', true),
('responsable', 'edit_past_planning', true),
('manager', 'edit_past_planning', false),
('salarie', 'edit_past_planning', false)
ON CONFLICT (role, permission) DO UPDATE SET allowed = EXCLUDED.allowed;
