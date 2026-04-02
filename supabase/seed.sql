-- ============================================================
-- SEED DATA — Musiam Planning (Louvre)
-- ============================================================

-- ============================================================
-- TEAMS
-- ============================================================
INSERT INTO teams (id, name, type, description) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Café Richelieu',      'point_de_vente', 'Café situé dans l''aile Richelieu'),
  ('11111111-0000-0000-0000-000000000002', 'Café Mollien',        'point_de_vente', 'Café situé dans l''aile Mollien'),
  ('11111111-0000-0000-0000-000000000003', 'Café Denon',          'point_de_vente', 'Café situé dans l''aile Denon'),
  ('11111111-0000-0000-0000-000000000004', 'Comptoir du Louvre',  'point_de_vente', 'Comptoir rapide hall Napoléon'),
  ('11111111-0000-0000-0000-000000000005', 'Cuisine centrale',    'metier',         'Équipe de production cuisine');

-- ============================================================
-- EMPLOYEES
-- ============================================================
INSERT INTO employees (id, first_name, last_name, email, phone, contract_type, weekly_contract_hours, is_active) VALUES
  ('22222222-0000-0000-0000-000000000001', 'Sophie',   'Marchand',   'sophie.marchand@louvre.fr',   '06 10 11 12 13', 'CDI',   35,   TRUE),
  ('22222222-0000-0000-0000-000000000002', 'Thomas',   'Leroy',      'thomas.leroy@louvre.fr',      '06 20 21 22 23', 'CDI',   35,   TRUE),
  ('22222222-0000-0000-0000-000000000003', 'Camille',  'Dupont',     'camille.dupont@louvre.fr',    '06 30 31 32 33', 'CDD',   28,   TRUE),
  ('22222222-0000-0000-0000-000000000004', 'Lucas',    'Bernard',    'lucas.bernard@louvre.fr',     '06 40 41 42 43', 'CDI',   35,   TRUE),
  ('22222222-0000-0000-0000-000000000005', 'Emma',     'Petit',      'emma.petit@louvre.fr',        '06 50 51 52 53', 'extra', NULL, TRUE),
  ('22222222-0000-0000-0000-000000000006', 'Hugo',     'Martin',     'hugo.martin@louvre.fr',       '06 60 61 62 63', 'CDI',   35,   TRUE),
  ('22222222-0000-0000-0000-000000000007', 'Léa',      'Girard',     'lea.girard@louvre.fr',        '06 70 71 72 73', 'CDD',   24,   TRUE),
  ('22222222-0000-0000-0000-000000000008', 'Nathan',   'Roux',       'nathan.roux@louvre.fr',       '06 80 81 82 83', 'extra', NULL, TRUE),
  ('22222222-0000-0000-0000-000000000009', 'Inès',     'Fontaine',   'ines.fontaine@louvre.fr',     '06 90 91 92 93', 'CDI',   35,   TRUE),
  ('22222222-0000-0000-0000-000000000010', 'Maxime',   'Chevalier',  'maxime.chevalier@louvre.fr',  '07 00 01 02 03', 'CDD',   28,   TRUE);

-- ============================================================
-- EMPLOYEE_TEAMS  (certains employés sur 2 équipes)
-- ============================================================
INSERT INTO employee_teams (employee_id, team_id, role, is_primary) VALUES
  -- Sophie : Café Richelieu (principal) + Comptoir du Louvre
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Responsable',  TRUE),
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000004', 'Équipier',     FALSE),
  -- Thomas : Café Mollien (principal)
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002', 'Responsable',  TRUE),
  -- Camille : Café Denon (principal) + Café Mollien
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000003', 'Équipier',     TRUE),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 'Équipier',     FALSE),
  -- Lucas : Cuisine centrale (principal)
  ('22222222-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000005', 'Cuisinier',    TRUE),
  -- Emma (extra) : Comptoir du Louvre + Café Richelieu
  ('22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000004', 'Équipier',     TRUE),
  ('22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', 'Équipier',     FALSE),
  -- Hugo : Café Richelieu (principal)
  ('22222222-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001', 'Équipier',     TRUE),
  -- Léa : Comptoir du Louvre (principal) + Café Denon
  ('22222222-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000004', 'Responsable',  TRUE),
  ('22222222-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000003', 'Équipier',     FALSE),
  -- Nathan (extra) : Cuisine centrale
  ('22222222-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000005', 'Commis',       TRUE),
  -- Inès : Café Mollien (principal)
  ('22222222-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000002', 'Équipier',     TRUE),
  -- Maxime : Cuisine centrale (principal) + Café Denon
  ('22222222-0000-0000-0000-000000000010', '11111111-0000-0000-0000-000000000005', 'Cuisinier',    TRUE),
  ('22222222-0000-0000-0000-000000000010', '11111111-0000-0000-0000-000000000003', 'Équipier',     FALSE);

-- ============================================================
-- SHIFT_TEMPLATES  (3 par équipe : matin, midi, soir)
-- ============================================================
INSERT INTO shift_templates (name, start_time, end_time, break_minutes, team_id) VALUES
  -- Café Richelieu
  ('Matin Richelieu',     '07:30', '14:30', 30, '11111111-0000-0000-0000-000000000001'),
  ('Midi Richelieu',      '11:00', '18:00', 30, '11111111-0000-0000-0000-000000000001'),
  ('Soir Richelieu',      '14:00', '21:00', 30, '11111111-0000-0000-0000-000000000001'),
  -- Café Mollien
  ('Matin Mollien',       '07:30', '14:30', 30, '11111111-0000-0000-0000-000000000002'),
  ('Midi Mollien',        '11:00', '18:00', 30, '11111111-0000-0000-0000-000000000002'),
  ('Soir Mollien',        '14:00', '21:00', 30, '11111111-0000-0000-0000-000000000002'),
  -- Café Denon
  ('Matin Denon',         '07:30', '14:30', 30, '11111111-0000-0000-0000-000000000003'),
  ('Midi Denon',          '11:00', '18:00', 30, '11111111-0000-0000-0000-000000000003'),
  ('Soir Denon',          '14:00', '21:00', 30, '11111111-0000-0000-0000-000000000003'),
  -- Comptoir du Louvre
  ('Matin Comptoir',      '08:00', '14:00', 20, '11111111-0000-0000-0000-000000000004'),
  ('Midi Comptoir',       '11:30', '17:30', 20, '11111111-0000-0000-0000-000000000004'),
  ('Soir Comptoir',       '15:00', '21:00', 20, '11111111-0000-0000-0000-000000000004'),
  -- Cuisine centrale
  ('Matin Cuisine',       '06:00', '13:00', 30, '11111111-0000-0000-0000-000000000005'),
  ('Midi Cuisine',        '10:00', '17:00', 30, '11111111-0000-0000-0000-000000000005'),
  ('Soir Cuisine',        '14:00', '21:00', 30, '11111111-0000-0000-0000-000000000005');
