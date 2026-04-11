-- Backfill historical audit logs from existing data.
-- Safe to run multiple times (best-effort idempotent guards included).
-- Note: Some events (especially payment/status changes) are inferred from current table state.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS audit_logs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category         TEXT NOT NULL,
  subcategory      TEXT NOT NULL,
  project_id       UUID REFERENCES projects(id) ON DELETE CASCADE,
  log_message      TEXT NOT NULL,
  actioned_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actioned_by_name TEXT,
  actioned_on      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_project_id  ON audit_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category    ON audit_logs(category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_subcategory ON audit_logs(subcategory);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actioned_by ON audit_logs(actioned_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actioned_on ON audit_logs(actioned_on DESC);

-- 1) Project creation
INSERT INTO audit_logs (
  category, subcategory, project_id, log_message,
  actioned_by, actioned_by_name, actioned_on, metadata
)
SELECT
  'sales'::text,
  'project_creation'::text,
  p.id,
  COALESCE(creator.full_name, 'User') || ' created project ' || COALESCE(NULLIF(p.name, ''), 'Untitled') || '.',
  p.created_by,
  creator.full_name,
  COALESCE(p.created_at, NOW()),
  jsonb_build_object(
    'source', 'backfill',
    'sourceProjectId', p.id,
    'clientName', p.client_name
  )
FROM projects p
LEFT JOIN profiles creator ON creator.id = p.created_by
WHERE NOT EXISTS (
  SELECT 1
  FROM audit_logs al
  WHERE al.subcategory = 'project_creation'
    AND al.project_id = p.id
);

-- 2) Team assignment (project team)
INSERT INTO audit_logs (
  category, subcategory, project_id, log_message,
  actioned_by, actioned_by_name, actioned_on, metadata
)
SELECT
  'design'::text,
  'team_assignment'::text,
  pa.project_id,
  COALESCE(assigner.full_name, 'User') || ' assigned ' || COALESCE(assignee.full_name, 'team member') ||
  ' to ' || COALESCE(NULLIF(p.name, ''), 'project') || ' team.',
  pa.assigned_by,
  assigner.full_name,
  COALESCE(pa.assigned_at, NOW()),
  jsonb_build_object(
    'source', 'backfill',
    'sourceProjectAssignmentId', pa.id,
    'assignedUserId', pa.user_id,
    'assignedUserRole', assignee.role
  )
FROM project_assignments pa
JOIN projects p ON p.id = pa.project_id
LEFT JOIN profiles assigner ON assigner.id = pa.assigned_by
LEFT JOIN profiles assignee ON assignee.id = pa.user_id
WHERE NOT EXISTS (
  SELECT 1
  FROM audit_logs al
  WHERE al.subcategory = 'team_assignment'
    AND al.project_id = pa.project_id
    AND (
      al.metadata ->> 'sourceProjectAssignmentId' = pa.id::text
      OR (
        al.actioned_by IS NOT DISTINCT FROM pa.assigned_by
        AND al.actioned_on IS NOT DISTINCT FROM pa.assigned_at
        AND al.metadata ->> 'assignedUserId' = pa.user_id::text
      )
    )
);

-- 3) Lead designer took up project (self-assignment)
INSERT INTO audit_logs (
  category, subcategory, project_id, log_message,
  actioned_by, actioned_by_name, actioned_on, metadata
)
SELECT
  'design'::text,
  'lead_designer_took_up_project'::text,
  pa.project_id,
  COALESCE(assignee.full_name, 'Lead designer') || ' took up project ' || COALESCE(NULLIF(p.name, ''), 'project') ||
  ' as lead designer.',
  pa.user_id,
  assignee.full_name,
  COALESCE(pa.assigned_at, NOW()),
  jsonb_build_object(
    'source', 'backfill',
    'sourceProjectAssignmentId', pa.id,
    'selfAssigned', true
  )
FROM project_assignments pa
JOIN projects p ON p.id = pa.project_id
JOIN profiles assignee ON assignee.id = pa.user_id
WHERE assignee.role = 'lead_designer'
  AND pa.assigned_by = pa.user_id
  AND NOT EXISTS (
    SELECT 1
    FROM audit_logs al
    WHERE al.subcategory = 'lead_designer_took_up_project'
      AND al.project_id = pa.project_id
      AND al.actioned_by = pa.user_id
  );

-- 4) Marked paid by sales (inferred from current state)
INSERT INTO audit_logs (
  category, subcategory, project_id, log_message,
  actioned_by, actioned_by_name, actioned_on, metadata
)
SELECT
  'sales'::text,
  'marked_paid_by_sales'::text,
  p.id,
  COALESCE(creator.full_name, 'Sales') || ' marked ' || COALESCE(NULLIF(p.name, ''), 'project') || ' as advance paid.',
  CASE WHEN creator.role IN ('sales', 'admin') THEN creator.id ELSE NULL END,
  CASE WHEN creator.role IN ('sales', 'admin') THEN creator.full_name ELSE 'Sales' END,
  COALESCE(p.updated_at, p.created_at, NOW()),
  jsonb_build_object(
    'source', 'backfill',
    'inferred', true,
    'sourceProjectId', p.id
  )
FROM projects p
LEFT JOIN profiles creator ON creator.id = p.created_by
WHERE p.advance_payment_done = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM audit_logs al
    WHERE al.subcategory = 'marked_paid_by_sales'
      AND al.project_id = p.id
  );

-- 5) Drawing assignment
INSERT INTO audit_logs (
  category, subcategory, project_id, log_message,
  actioned_by, actioned_by_name, actioned_on, metadata
)
SELECT
  'design'::text,
  'drawing_assignment'::text,
  da.project_id,
  COALESCE(assigner.full_name, 'Lead designer') || ' assigned ' || da.drawing_type ||
  ' drawing to ' || COALESCE(assignee.full_name, 'designer') || ' for ' || COALESCE(NULLIF(p.name, ''), 'project') || '.',
  da.assigned_by,
  assigner.full_name,
  COALESCE(da.assigned_at, da.created_at, NOW()),
  jsonb_build_object(
    'source', 'backfill',
    'sourceDrawingAssignmentId', da.id,
    'drawingType', da.drawing_type,
    'assignedTo', da.assigned_to,
    'deadline', da.deadline,
    'notes', da.notes
  )
FROM drawing_assignments da
JOIN projects p ON p.id = da.project_id
LEFT JOIN profiles assigner ON assigner.id = da.assigned_by
LEFT JOIN profiles assignee ON assignee.id = da.assigned_to
WHERE NOT EXISTS (
  SELECT 1
  FROM audit_logs al
  WHERE al.subcategory = 'drawing_assignment'
    AND al.project_id = da.project_id
    AND (
      al.metadata ->> 'sourceDrawingAssignmentId' = da.id::text
      OR (
        al.actioned_by IS NOT DISTINCT FROM da.assigned_by
        AND al.actioned_on IS NOT DISTINCT FROM da.assigned_at
        AND al.metadata ->> 'drawingType' = da.drawing_type
        AND al.metadata ->> 'assignedTo' = da.assigned_to::text
      )
    )
);

-- 6) Drawing upload / reupload
INSERT INTO audit_logs (
  category, subcategory, project_id, log_message,
  actioned_by, actioned_by_name, actioned_on, metadata
)
SELECT
  'design'::text,
  CASE WHEN COALESCE(d.version_number, 1) > 1 THEN 'drawing_reupload' ELSE 'drawing_upload' END,
  d.project_id,
  COALESCE(uploader.full_name, 'Designer') || ' ' ||
  CASE WHEN COALESCE(d.version_number, 1) > 1 THEN 're-uploaded ' ELSE 'uploaded ' END ||
  d.drawing_type || ' drawing (' || COALESCE(NULLIF(d.title, ''), d.file_name) || ') v' || COALESCE(d.version_number, 1) ||
  ' for ' || COALESCE(NULLIF(p.name, ''), 'project') || '.',
  d.uploaded_by,
  uploader.full_name,
  COALESCE(d.created_at, NOW()),
  jsonb_build_object(
    'source', 'backfill',
    'sourceDrawingId', d.id,
    'drawingId', d.id,
    'drawingType', d.drawing_type,
    'versionNumber', d.version_number,
    'fileName', d.file_name
  )
FROM drawings d
JOIN projects p ON p.id = d.project_id
LEFT JOIN profiles uploader ON uploader.id = d.uploaded_by
WHERE NOT EXISTS (
  SELECT 1
  FROM audit_logs al
  WHERE al.subcategory IN ('drawing_upload', 'drawing_reupload')
    AND al.project_id = d.project_id
    AND (
      al.metadata ->> 'sourceDrawingId' = d.id::text
      OR al.metadata ->> 'drawingId' = d.id::text
    )
);

-- 7) Drawing review / request revision / approve
INSERT INTO audit_logs (
  category, subcategory, project_id, log_message,
  actioned_by, actioned_by_name, actioned_on, metadata
)
SELECT
  'design'::text,
  CASE
    WHEN dr.status = 'approved' THEN 'approve'
    WHEN dr.status = 'revision_requested' THEN 'request_revision'
    ELSE 'review'
  END,
  d.project_id,
  COALESCE(reviewer.full_name, 'Lead designer') || ' ' ||
  CASE
    WHEN dr.status = 'approved' THEN 'approved '
    WHEN dr.status = 'revision_requested' THEN 'requested revision for '
    ELSE 'reviewed and rejected '
  END ||
  d.drawing_type || ' drawing (' || COALESCE(NULLIF(d.title, ''), d.file_name) || ') for ' || COALESCE(NULLIF(p.name, ''), 'project') || '.',
  dr.reviewed_by,
  reviewer.full_name,
  COALESCE(dr.reviewed_at, NOW()),
  jsonb_build_object(
    'source', 'backfill',
    'sourceDrawingReviewId', dr.id,
    'drawingId', d.id,
    'drawingType', d.drawing_type,
    'status', dr.status,
    'comments', dr.comments
  )
FROM drawing_reviews dr
JOIN drawings d ON d.id = dr.drawing_id
JOIN projects p ON p.id = d.project_id
LEFT JOIN profiles reviewer ON reviewer.id = dr.reviewed_by
WHERE NOT EXISTS (
  SELECT 1
  FROM audit_logs al
  WHERE al.project_id = d.project_id
    AND al.subcategory = CASE
      WHEN dr.status = 'approved' THEN 'approve'
      WHEN dr.status = 'revision_requested' THEN 'request_revision'
      ELSE 'review'
    END
    AND (
      al.metadata ->> 'sourceDrawingReviewId' = dr.id::text
      OR (
        al.metadata ->> 'drawingId' = d.id::text
        AND al.actioned_by IS NOT DISTINCT FROM dr.reviewed_by
        AND al.actioned_on IS NOT DISTINCT FROM dr.reviewed_at
      )
    )
);

-- 8) Project status change (inferred snapshot for non-active projects)
INSERT INTO audit_logs (
  category, subcategory, project_id, log_message,
  actioned_by, actioned_by_name, actioned_on, metadata
)
SELECT
  CASE WHEN creator.role = 'sales' THEN 'sales' ELSE 'design' END,
  'project_status_change'::text,
  p.id,
  COALESCE(creator.full_name, 'User') || ' changed project status to ' || p.status ||
  ' for ' || COALESCE(NULLIF(p.name, ''), 'project') || '.',
  p.created_by,
  creator.full_name,
  COALESCE(p.updated_at, p.created_at, NOW()),
  jsonb_build_object(
    'source', 'backfill',
    'inferred', true,
    'previousStatus', null,
    'newStatus', p.status
  )
FROM projects p
LEFT JOIN profiles creator ON creator.id = p.created_by
WHERE p.status IS NOT NULL
  AND p.status <> 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM audit_logs al
    WHERE al.subcategory = 'project_status_change'
      AND al.project_id = p.id
  );

COMMIT;
