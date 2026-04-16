-- ─────────────────────────────────────────────────────────────────────────────
-- Poligrid — Material Request Migration
-- New roles: site_supervisor, procurement
-- New tables: material_requests, material_request_items, material_request_reviews
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Safe to re-run: uses IF NOT EXISTS / DO ... EXCEPTION patterns
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Extend user_role enum ─────────────────────────────────────────────────
-- NOTE: PostgreSQL only allows adding enum values, not removing them.
-- If 'site_supervisor' or 'procurement' already exist, the DO block swallows the error.

DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE 'site_supervisor';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE 'procurement';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. Material request status enum ─────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE material_request_status AS ENUM (
    'draft', 'pending_approval', 'approved', 'revision_requested'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3. material_requests ─────────────────────────────────────────────────────
-- One request per version per project. Supervisor submits for approval.
-- Locked (no item edits) once status = 'approved'.
-- Multiple versions (supplements) are allowed — each independently approved.

CREATE TABLE IF NOT EXISTS material_requests (
  id              UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID                    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  submitted_by    UUID                    NOT NULL REFERENCES profiles(id),
  version_number  INTEGER                 NOT NULL,   -- 1, 2, 3… sequential per project
  title           TEXT                    NOT NULL DEFAULT 'Material Request',
  status          material_request_status NOT NULL DEFAULT 'draft',
  notes           TEXT,
  submitted_at    TIMESTAMPTZ,
  approved_at     TIMESTAMPTZ,
  approved_by     UUID                    REFERENCES profiles(id),
  created_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, version_number)
);

DO $$ BEGIN
  CREATE TRIGGER material_requests_updated_at BEFORE UPDATE ON material_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_material_requests_project_id   ON material_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_material_requests_submitted_by ON material_requests(submitted_by);
CREATE INDEX IF NOT EXISTS idx_material_requests_status       ON material_requests(status);

-- ─── 4. material_request_items ────────────────────────────────────────────────
-- Individual line items. ~100 items across 8 categories per request.
-- Live-saved to DB as supervisor fills in the form.
-- Only editable while parent request.status = 'draft' or 'revision_requested'.
-- procured / procured_at / procured_by set by procurement role after approval.

CREATE TABLE IF NOT EXISTS material_request_items (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id       UUID        NOT NULL REFERENCES material_requests(id) ON DELETE CASCADE,
  project_id       UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category         TEXT        NOT NULL,    -- Civil | Electrical | Plumbing | HVAC | Flooring | Furniture/Joinery | Doors & Windows | Miscellaneous
  item_name        TEXT        NOT NULL,
  description      TEXT,
  quantity         NUMERIC,
  unit             TEXT,
  estimated_rate   NUMERIC,
  sort_order       INTEGER     NOT NULL DEFAULT 0,
  procured         BOOLEAN     NOT NULL DEFAULT FALSE,
  procured_at      TIMESTAMPTZ,
  procured_by      UUID        REFERENCES profiles(id),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  CREATE TRIGGER material_request_items_updated_at BEFORE UPDATE ON material_request_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_mri_request_id  ON material_request_items(request_id);
CREATE INDEX IF NOT EXISTS idx_mri_project_id  ON material_request_items(project_id);
CREATE INDEX IF NOT EXISTS idx_mri_category    ON material_request_items(category);

-- ─── 5. material_request_reviews ─────────────────────────────────────────────
-- Audit trail for each approval/rejection/revision-request action.

CREATE TABLE IF NOT EXISTS material_request_reviews (
  id           UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id   UUID                    NOT NULL REFERENCES material_requests(id) ON DELETE CASCADE,
  reviewed_by  UUID                    NOT NULL REFERENCES profiles(id),
  status       material_request_status NOT NULL,
  comments     TEXT,
  reviewed_at  TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mrr_request_id ON material_request_reviews(request_id);

-- ─── 6. Backfill ROLE_LABELS logic (informational comment) ───────────────────
-- The client admin.js ROLES array must also be updated in code to include
-- 'site_supervisor' and 'procurement'.
