-- ─────────────────────────────────────────────────────────────────────────────
-- Poligrid – Complete Supabase Schema
-- Run this entire file in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Safe to re-run: uses CREATE IF NOT EXISTS / ALTER … ADD COLUMN IF NOT EXISTS
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Shared updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'sales', 'designer', 'lead_designer', 'ceo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE drawing_type AS ENUM (
    'civil', 'electrical', 'plumbing', 'hvac',
    'firefighting', 'architectural', 'structural',
    'interior', 'landscape', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE drawing_status AS ENUM (
    'pending_review', 'approved', 'rejected', 'revision_requested'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 1. Projects ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
  id             UUID        PRIMARY KEY,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name           TEXT,
  client_name    TEXT,
  client_email   TEXT,
  client_phone   TEXT,
  status         TEXT        NOT NULL DEFAULT 'active',
  property_type  TEXT,
  bhk            TEXT,
  bhk_type       TEXT,
  total_area_m2  NUMERIC,
  global_brief   TEXT,
  notes          TEXT,
  orientation    TEXT,
  summary        TEXT,
  advance_payment_done BOOLEAN NOT NULL DEFAULT FALSE,
  created_by     UUID        REFERENCES auth.users(id)
);

DO $$ BEGIN
  CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);
CREATE INDEX IF NOT EXISTS idx_projects_status     ON projects(status);

-- ─── 2. Profiles (extends Supabase auth.users) ───────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT        NOT NULL,
  email       TEXT        NOT NULL UNIQUE,
  phone       TEXT,
  role        user_role   NOT NULL DEFAULT 'sales',
  is_active   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Auto-create profile on new Supabase Auth sign-up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'sales'),
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3. Invitations ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invitations (
  email       TEXT        PRIMARY KEY,
  role        TEXT        NOT NULL,
  full_name   TEXT,
  invited_by  UUID        REFERENCES profiles(id),
  invited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 4. Project Assignments ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_assignments (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by UUID        REFERENCES profiles(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_assignments_project_id ON project_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_assignments_user_id    ON project_assignments(user_id);

-- ─── 5. Floor Plans ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS floor_plans (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id     UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  file_name      TEXT,
  storage_path   TEXT,
  analysis_raw   JSONB,
  analyzed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_floor_plans_project_id ON floor_plans(project_id);

-- ─── 6. Inspiration Images ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inspiration_images (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id   UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  file_name    TEXT,
  storage_path TEXT,
  sort_order   INTEGER     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_inspiration_images_project_id ON inspiration_images(project_id);

-- ─── 7. Rooms ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rooms (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id     UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  floor_plan_id  UUID        REFERENCES floor_plans(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  label          TEXT        NOT NULL,
  name           TEXT,
  room_type      TEXT,
  bbox_x_pct     NUMERIC,
  bbox_y_pct     NUMERIC,
  bbox_w_pct     NUMERIC,
  bbox_h_pct     NUMERIC,
  width_m        NUMERIC,
  length_m       NUMERIC,
  notes          TEXT,
  walls          JSONB,
  fp_placements  JSONB
);

DO $$ BEGIN
  CREATE TRIGGER rooms_updated_at BEFORE UPDATE ON rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_rooms_project_id ON rooms(project_id);

-- ─── 8. Camera Pins ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS camera_pins (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id          UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id           TEXT        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  x_m                 NUMERIC,
  y_m                 NUMERIC,
  angle_deg           NUMERIC,
  fov_deg             NUMERIC     DEFAULT 60,
  room_label          TEXT,
  brief               TEXT,
  photo_file_name     TEXT,
  photo_storage_path  TEXT,
  UNIQUE(project_id, client_id)
);

DO $$ BEGIN
  CREATE TRIGGER camera_pins_updated_at BEFORE UPDATE ON camera_pins
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_camera_pins_project_id ON camera_pins(project_id);

-- ─── 9. Furniture Placements ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS furniture_placements (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_id   TEXT,
  module_id   TEXT,
  label       TEXT,
  type        TEXT,
  room_label  TEXT,
  room_type   TEXT,
  x_m         NUMERIC,
  y_m         NUMERIC,
  w_m         NUMERIC,
  d_m         NUMERIC,
  h_m         NUMERIC,
  rotation_y  NUMERIC     DEFAULT 0,
  wall        TEXT,
  color       TEXT,
  source      TEXT
);

CREATE INDEX IF NOT EXISTS idx_furniture_placements_project_id ON furniture_placements(project_id);

-- ─── 10. Project Versions ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_versions (
  id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id              UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_number          INTEGER     NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  design_brief            TEXT,
  regen_inspiration_paths JSONB,
  UNIQUE(project_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_project_versions_project_id ON project_versions(project_id);

-- ─── 11. Renders ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS renders (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id            UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_id            UUID        REFERENCES project_versions(id) ON DELETE SET NULL,
  camera_pin_client_id  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  room_label            TEXT,
  storage_path          TEXT,
  model_used            TEXT,
  furniture_list        JSONB,
  generation_type       TEXT
);

CREATE INDEX IF NOT EXISTS idx_renders_project_id  ON renders(project_id);
CREATE INDEX IF NOT EXISTS idx_renders_version_id  ON renders(version_id);

-- ─── 12. BOQ Items ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS boq_items (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_id  UUID        REFERENCES project_versions(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source      TEXT,
  category    TEXT,
  item        TEXT,
  qty         NUMERIC,
  unit        TEXT,
  rate        NUMERIC,
  amount      NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_boq_items_project_id  ON boq_items(project_id);
CREATE INDEX IF NOT EXISTS idx_boq_items_version_id  ON boq_items(version_id);

-- ─── 13. Scene Exports ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scene_exports (
  id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id           UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scene_json           JSONB,
  boq_csv_storage_path TEXT
);

CREATE INDEX IF NOT EXISTS idx_scene_exports_project_id ON scene_exports(project_id);

-- ─── 14. Drawings ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS drawings (
  id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID           NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_by     UUID           NOT NULL REFERENCES profiles(id),
  drawing_type    drawing_type   NOT NULL,
  title           TEXT           NOT NULL,
  description     TEXT,
  file_path       TEXT           NOT NULL,
  file_name       TEXT           NOT NULL,
  file_size_bytes BIGINT,
  status          drawing_status NOT NULL DEFAULT 'pending_review',
  version_number  INTEGER        NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  CREATE TRIGGER update_drawings_updated_at BEFORE UPDATE ON drawings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_drawings_project_id  ON drawings(project_id);
CREATE INDEX IF NOT EXISTS idx_drawings_uploaded_by ON drawings(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_drawings_status      ON drawings(status);

-- ─── 15. Drawing Reviews ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS drawing_reviews (
  id           UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  drawing_id   UUID           NOT NULL REFERENCES drawings(id) ON DELETE CASCADE,
  reviewed_by  UUID           NOT NULL REFERENCES profiles(id),
  status       drawing_status NOT NULL,
  comments     TEXT,
  reviewed_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drawing_reviews_drawing_id ON drawing_reviews(drawing_id);

-- ─── 16. Drawing Assignments ─────────────────────────────────────────────────
-- Lead designer assigns a drawing type to a specific designer per project.
-- status mirrors the latest drawing submission: assigned | pending_review | approved | revision_requested | rejected

CREATE TABLE IF NOT EXISTS drawing_assignments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  drawing_type TEXT        NOT NULL,
  assigned_to  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  deadline     DATE,
  notes        TEXT,
  status       TEXT        NOT NULL DEFAULT 'assigned',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT drawing_assignments_project_type_unique UNIQUE (project_id, drawing_type)
);

CREATE INDEX IF NOT EXISTS idx_da_project_id  ON drawing_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_da_assigned_to ON drawing_assignments(assigned_to);

-- ─── 17. Tasks ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tasks (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  assigned_to  UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by  UUID          REFERENCES profiles(id),
  project_id   UUID          REFERENCES projects(id) ON DELETE SET NULL,
  drawing_id   UUID          REFERENCES drawings(id) ON DELETE SET NULL,
  title        TEXT          NOT NULL,
  description  TEXT,
  status       task_status   NOT NULL DEFAULT 'pending',
  priority     task_priority NOT NULL DEFAULT 'medium',
  due_date     DATE,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id  ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status      ON tasks(status);

-- ─── 18. CEO Dashboard View ──────────────────────────────────────────────────

CREATE OR REPLACE VIEW ceo_project_dashboard AS
SELECT
  p.id                                                                       AS project_id,
  p.name                                                                     AS project_name,
  p.status                                                                   AS project_status,
  p.client_name,
  p.created_at,
  creator.full_name                                                          AS sales_person,
  COUNT(DISTINCT pa.user_id)                                                 AS team_size,
  COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'pending_review')           AS drawings_pending_review,
  COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'approved')                 AS drawings_approved,
  COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'revision_requested')       AS drawings_needs_revision,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'pending')                  AS tasks_pending,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed')                AS tasks_completed
FROM projects p
LEFT JOIN profiles creator          ON p.created_by = creator.id
LEFT JOIN project_assignments pa    ON p.id = pa.project_id
LEFT JOIN drawings d                ON p.id = d.project_id
LEFT JOIN tasks t                   ON p.id = t.project_id
GROUP BY p.id, p.name, p.status, p.client_name, p.created_at, creator.full_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage Buckets (create manually in Supabase Dashboard → Storage)
-- ─────────────────────────────────────────────────────────────────────────────
--   poligrid-floor-plans  — Public
--   poligrid-inspiration  — Public
--   poligrid-pin-photos   — Public
--   poligrid-renders      — Public
--   poligrid-exports      — Public
--   poligrid-drawings     — Private (serve via signed URLs)

-- ─────────────────────────────────────────────────────────────────────────────
-- Bootstrap: activate first admin after their first Google sign-in
-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATE profiles SET is_active = TRUE, role = 'admin' WHERE email = 'sseaditya@gmail.com';
