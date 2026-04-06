-- ─────────────────────────────────────────────────────────────────────────────
-- Run this in Supabase dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- Per-project drawing type assignments (lead_designer assigns designer + deadline per type)
CREATE TABLE IF NOT EXISTS drawing_assignments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  drawing_type TEXT        NOT NULL,
  assigned_to  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  deadline     DATE,
  notes        TEXT,
  -- status mirrors the latest drawing submission for this type:
  -- assigned | pending_review | approved | revision_requested | rejected
  status       TEXT        NOT NULL DEFAULT 'assigned',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT drawing_assignments_project_type_unique UNIQUE (project_id, drawing_type)
);

CREATE INDEX IF NOT EXISTS idx_da_project_id  ON drawing_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_da_assigned_to ON drawing_assignments(assigned_to);
