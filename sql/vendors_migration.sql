-- ─── Vendors Table ────────────────────────────────────────────────────────────
-- Run this migration to add vendor management support.
-- Applies to: Poligrid procurement workflow

-- 1. Create vendors table
CREATE TABLE IF NOT EXISTS vendors (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  phone                 TEXT,
  email                 TEXT,
  address               TEXT,
  location              TEXT,                    -- city/area e.g. "Hyderabad - Secunderabad"
  specialty_categories  TEXT[] DEFAULT '{}',     -- e.g. ARRAY['Civil','Flooring']
  gstin                 TEXT,
  notes                 TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendors_name        ON vendors(name);
CREATE INDEX IF NOT EXISTS idx_vendors_is_active   ON vendors(is_active);

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER vendors_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Add vendor_id column to material_request_items
ALTER TABLE material_request_items
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mri_vendor_id ON material_request_items(vendor_id);

-- ─── Update ceo_project_dashboard view ────────────────────────────────────────
-- Note: DROP + CREATE required when adding columns to a view

DROP VIEW IF EXISTS ceo_project_dashboard;

CREATE VIEW ceo_project_dashboard AS
SELECT
  p.id                                                                          AS project_id,
  p.name                                                                        AS project_name,
  p.phase                                                                       AS project_status,
  p.on_hold                                                                     AS project_on_hold,
  p.client_name,
  p.created_at,
  creator.full_name                                                             AS sales_person,
  COUNT(DISTINCT pa.user_id)                                                    AS team_size,
  COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'pending_review')              AS drawings_pending_review,
  COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'approved')                    AS drawings_approved,
  COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'revision_requested')          AS drawings_needs_revision,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'pending')                     AS tasks_pending,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed')                   AS tasks_completed,
  COUNT(DISTINCT mr.id) FILTER (WHERE mr.status = 'pricing_review')            AS admin_approvals_pending
FROM projects p
LEFT JOIN profiles creator          ON p.created_by = creator.id
LEFT JOIN project_assignments pa    ON p.id = pa.project_id
LEFT JOIN drawings d                ON p.id = d.project_id
LEFT JOIN tasks t                   ON p.id = t.project_id
LEFT JOIN material_requests mr      ON p.id = mr.project_id
GROUP BY p.id, p.name, p.phase, p.on_hold, p.client_name, p.created_at, creator.full_name;
