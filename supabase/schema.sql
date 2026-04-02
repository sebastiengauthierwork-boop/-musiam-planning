-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TEAMS
-- ============================================================
CREATE TABLE teams (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('point_de_vente', 'metier')),
  description TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- EMPLOYEES
-- ============================================================
CREATE TABLE employees (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name            TEXT NOT NULL,
  last_name             TEXT NOT NULL,
  email                 TEXT UNIQUE NOT NULL,
  phone                 TEXT,
  contract_type         TEXT NOT NULL CHECK (contract_type IN ('CDI', 'CDD', 'extra')),
  weekly_contract_hours NUMERIC(5, 2),
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- EMPLOYEE_TEAMS
-- ============================================================
CREATE TABLE employee_teams (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  team_id     UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  role        TEXT,
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (employee_id, team_id)
);

ALTER TABLE employee_teams ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SHIFT_TEMPLATES
-- ============================================================
CREATE TABLE shift_templates (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           TEXT NOT NULL,
  start_time     TIME NOT NULL,
  end_time       TIME NOT NULL,
  break_minutes  INTEGER NOT NULL DEFAULT 0,
  team_id        UUID REFERENCES teams (id) ON DELETE SET NULL,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE shift_templates ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SCHEDULES
-- ============================================================
CREATE TABLE schedules (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id    UUID NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  team_id        UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  date           DATE NOT NULL,
  start_time     TIME,
  end_time       TIME,
  break_minutes  INTEGER NOT NULL DEFAULT 0,
  type           TEXT NOT NULL CHECK (type IN ('shift', 'repos', 'conge', 'absence')),
  status         TEXT NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon', 'publie', 'valide')),
  notes          TEXT,
  created_by     UUID,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- LEAVE_REQUESTS
-- ============================================================
CREATE TABLE leave_requests (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  leave_type  TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente', 'valide', 'refuse')),
  approved_by UUID,
  notes       TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- USERS (linked to Supabase Auth)
-- ============================================================
CREATE TABLE users (
  id         UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'manager', 'viewer')),
  team_id    UUID REFERENCES teams (id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
