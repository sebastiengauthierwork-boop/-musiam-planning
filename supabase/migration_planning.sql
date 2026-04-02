-- ============================================================
-- MIGRATION — Codes horaires / absence + colonne code dans schedules
-- ============================================================

CREATE TABLE IF NOT EXISTS shift_codes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            VARCHAR(10) NOT NULL UNIQUE,
  label           TEXT NOT NULL,
  team_prefix     TEXT,
  location_prefix TEXT,
  start_time      TIME,
  end_time        TIME,
  break_minutes   INTEGER NOT NULL DEFAULT 0,
  net_hours       NUMERIC(4, 2),
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS absence_codes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code       VARCHAR(10) NOT NULL UNIQUE,
  label      TEXT NOT NULL,
  is_paid    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS code VARCHAR(10);

-- Contrainte unique (employee_id, date) pour les upserts
DELETE FROM schedules a USING schedules b
  WHERE a.id < b.id AND a.employee_id = b.employee_id AND a.date = b.date;
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_emp_date_unique;
ALTER TABLE schedules ADD CONSTRAINT schedules_emp_date_unique UNIQUE (employee_id, date);

-- RLS
ALTER TABLE shift_codes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE absence_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shift_codes_all"   ON shift_codes   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "absence_codes_all" ON absence_codes FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- SEED — Codes horaires
-- ============================================================
INSERT INTO shift_codes (code, label, team_prefix, location_prefix, start_time, end_time, break_minutes, net_hours) VALUES
  ('M',   'Matin',                NULL, NULL,  '07:30', '14:30', 30,  6.5),
  ('AM',  'Après-midi',           NULL, NULL,  '14:00', '21:00', 30,  6.5),
  ('J',   'Journée',              NULL, NULL,  '09:00', '17:00', 30,  7.5),
  ('S',   'Soir',                 NULL, NULL,  '16:00', '23:00', 30,  6.5),
  ('L',   'Long',                 NULL, NULL,  '08:00', '20:00', 60, 11.0),
  ('C',   'Coupé',                NULL, NULL,  '11:00', '15:00',  0,  4.0),
  ('RCA', 'Richelieu Matin',      'RC', 'RIC', '07:30', '14:30', 30,  6.5),
  ('RCM', 'Richelieu Midi',       'RC', 'RIC', '11:00', '18:00', 30,  6.5),
  ('RCS', 'Richelieu Soir',       'RC', 'RIC', '14:00', '21:00', 30,  6.5),
  ('MOA', 'Mollien Matin',        'MO', 'MOL', '07:30', '14:30', 30,  6.5),
  ('MOM', 'Mollien Midi',         'MO', 'MOL', '11:00', '18:00', 30,  6.5),
  ('MOS', 'Mollien Soir',         'MO', 'MOL', '14:00', '21:00', 30,  6.5),
  ('DEA', 'Denon Matin',          'DE', 'DEN', '07:30', '14:30', 30,  6.5),
  ('DEM', 'Denon Midi',           'DE', 'DEN', '11:00', '18:00', 30,  6.5),
  ('DES', 'Denon Soir',           'DE', 'DEN', '14:00', '21:00', 30,  6.5),
  ('CTA', 'Comptoir Matin',       'CT', 'CPT', '08:00', '14:00', 20,  5.67),
  ('CTM', 'Comptoir Midi',        'CT', 'CPT', '11:30', '17:30', 20,  5.67),
  ('CTS', 'Comptoir Soir',        'CT', 'CPT', '15:00', '21:00', 20,  5.67),
  ('CUA', 'Cuisine Matin',        'CU', 'CUI', '06:00', '13:00', 30,  6.5),
  ('CUM', 'Cuisine Midi',         'CU', 'CUI', '10:00', '17:00', 30,  6.5),
  ('CUS', 'Cuisine Soir',         'CU', 'CUI', '14:00', '21:00', 30,  6.5)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- SEED — Codes absence
-- ============================================================
INSERT INTO absence_codes (code, label, is_paid) VALUES
  ('R',   'Repos',                     FALSE),
  ('CP',  'Congé payé',                TRUE),
  ('RTT', 'RTT',                       TRUE),
  ('CSS', 'Congé sans solde',          FALSE),
  ('MAL', 'Maladie',                   TRUE),
  ('AT',  'Accident de travail',       TRUE),
  ('MAT', 'Maternité / Paternité',     TRUE),
  ('FOR', 'Formation',                 TRUE),
  ('REP', 'Récupération',              FALSE),
  ('ABS', 'Absence non justifiée',     FALSE),
  ('FER', 'Fermeture établissement',   FALSE)
ON CONFLICT (code) DO NOTHING;
