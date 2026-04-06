"use strict";

const db = require("../db");
const { requireAuth } = require("./auth");
const { httpError } = require("./utils");
const { notifyDrawingUploaded, notifyDrawingReviewed } = require("./notifications");

const MIME_MAP = {
  pdf:  "application/pdf",
  png:  "image/png",
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  dwg:  "application/octet-stream",
  dxf:  "application/octet-stream",
};

// ─── List drawings for a project ─────────────────────────────────────────────
async function drawingsList(req, projectId) {
  await requireAuth(req);
  if (!projectId) throw httpError(400, "projectId required.");

  const sb = db.getClient();
  const { data, error } = await sb
    .from("drawings")
    .select(`
      *,
      uploader:profiles!uploaded_by(id, full_name, role),
      drawing_reviews(id, status, comments, reviewed_at,
        reviewer:profiles!reviewed_by(full_name))
    `)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw httpError(500, error.message);
  return { drawings: data };
}

// ─── All pending-review drawings visible to the caller ────────────────────────
async function drawingsPending(req) {
  const { profile } = await requireAuth(req, ["admin", "lead_designer"]);
  const sb = db.getClient();

  const { data, error } = await sb
    .from("drawings")
    .select(`
      *,
      project:projects(id, name, client_name),
      uploader:profiles!uploaded_by(id, full_name)
    `)
    .eq("status", "pending_review")
    .order("created_at", { ascending: true });

  if (error) throw httpError(500, error.message);
  return { drawings: data || [] };
}

// ─── Return a short-lived signed URL for a private drawing file ───────────────
async function drawingSignedUrl(req, filePath) {
  await requireAuth(req);
  if (!filePath) throw httpError(400, "path required.");

  const sb = db.getClient();
  const { data, error } = await sb.storage
    .from("poligrid-drawings")
    .createSignedUrl(filePath, 300); // 5-minute window

  if (error || !data?.signedUrl) throw httpError(500, "Could not generate signed URL.");
  return { url: data.signedUrl };
}

// ─── Batch signed URLs for ZIP download ──────────────────────────────────────
async function drawingSignedUrlBatch(req, filePaths) {
  await requireAuth(req);
  if (!Array.isArray(filePaths) || !filePaths.length) throw httpError(400, "filePaths array required.");

  const sb = db.getClient();
  const { data, error } = await sb.storage
    .from("poligrid-drawings")
    .createSignedUrls(filePaths, 300);

  if (error) throw httpError(500, "Could not generate signed URLs.");
  return { urls: data || [] };
}

// ─── Upload a new drawing ─────────────────────────────────────────────────────
async function drawingUpload(req, body) {
  const { profile } = await requireAuth(req, ["admin", "designer", "lead_designer"]);

  const { projectId, drawingType, title, description, fileBase64, fileName, fileSizeBytes } = body;
  if (!projectId || !drawingType || !title || !fileBase64 || !fileName) {
    throw httpError(400, "projectId, drawingType, title, fileBase64, fileName required.");
  }

  const ext = fileName.split(".").pop().toLowerCase();
  const mimeType = MIME_MAP[ext] || "application/octet-stream";

  const sb = db.getClient();

  const { data: existing } = await sb
    .from("drawings")
    .select("version_number")
    .eq("project_id", projectId)
    .eq("drawing_type", drawingType)
    .order("version_number", { ascending: false })
    .limit(1);

  const versionNumber = existing?.length ? existing[0].version_number + 1 : 1;
  const storagePath = `${projectId}/${drawingType}/v${versionNumber}_${Date.now()}_${fileName}`;

  const uploadedPath = await db.uploadBase64("poligrid-drawings", storagePath, fileBase64, mimeType);
  if (!uploadedPath) throw httpError(500, "Failed to upload drawing to storage.");

  const { data: row, error } = await sb
    .from("drawings")
    .insert({
      project_id:      projectId,
      uploaded_by:     profile.id,
      drawing_type:    drawingType,
      title,
      description:     description || null,
      file_path:       storagePath,
      file_name:       fileName,
      file_size_bytes: fileSizeBytes || null,
      version_number:  versionNumber,
    })
    .select("id")
    .single();

  if (error) throw httpError(500, error.message);

  // Sync assignment status → pending_review
  await sb
    .from("drawing_assignments")
    .update({ status: "pending_review", updated_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("drawing_type", drawingType)
    .eq("status", "assigned"); // only bump if still in 'assigned' state

  // Also update if revision was requested (re-submitted)
  await sb
    .from("drawing_assignments")
    .update({ status: "pending_review", updated_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("drawing_type", drawingType)
    .eq("status", "revision_requested");

  // Auto-create review task for all active lead designers
  const { data: leads } = await sb
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "lead_designer")
    .eq("is_active", true);

  if (leads?.length) {
    const tasks = leads.map(ld => ({
      assigned_to:  ld.id,
      assigned_by:  profile.id,
      project_id:   projectId,
      drawing_id:   row.id,
      title:        `Review ${drawingType} drawing: ${title}`,
      description:  `Submitted by ${profile.full_name} — v${versionNumber}.`,
      priority:     "medium",
    }));
    await sb.from("tasks").insert(tasks);

    const { data: proj } = await sb.from("projects").select("name").eq("id", projectId).single();
    notifyDrawingUploaded({
      projectName:   proj?.name || projectId,
      drawingTitle:  title,
      drawingType,
      uploaderName:  profile.full_name,
      leadDesigners: leads,
    }).catch(err => console.error("[Notify] drawingUploaded failed:", err.message));
  }

  return { drawingId: row.id, storagePath, versionNumber };
}

// ─── Lead designer reviews a drawing ─────────────────────────────────────────
async function drawingReview(req, body) {
  const { profile } = await requireAuth(req, ["admin", "lead_designer"]);

  const { drawingId, status, comments } = body;
  if (!drawingId || !status) throw httpError(400, "drawingId, status required.");
  const valid = ["approved", "rejected", "revision_requested"];
  if (!valid.includes(status)) throw httpError(400, "Invalid status.");

  const sb = db.getClient();

  await sb.from("drawing_reviews").insert({
    drawing_id:  drawingId,
    reviewed_by: profile.id,
    status,
    comments:    comments || null,
  });

  await sb.from("drawings").update({ status }).eq("id", drawingId);

  const { data: drawing } = await sb
    .from("drawings")
    .select("project_id, uploaded_by, title, drawing_type, projects(name)")
    .eq("id", drawingId)
    .single();

  if (drawing) {
    // Sync assignment status
    await sb
      .from("drawing_assignments")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("project_id", drawing.project_id)
      .eq("drawing_type", drawing.drawing_type);

    // Check if all assignments are now approved → mark project complete
    if (status === "approved") {
      const { data: allAssignments } = await sb
        .from("drawing_assignments")
        .select("status")
        .eq("project_id", drawing.project_id);
      const allDone = (allAssignments || []).length > 0 &&
        (allAssignments || []).every(a => a.status === "approved");
      if (allDone) {
        await sb.from("projects")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("id", drawing.project_id);
      }
    }

    const { data: designer } = await sb
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", drawing.uploaded_by)
      .single();

    if (status === "revision_requested" && designer) {
      await sb.from("tasks").insert({
        assigned_to:  designer.id,
        assigned_by:  profile.id,
        project_id:   drawing.project_id,
        drawing_id:   drawingId,
        title:        `Revision needed: ${drawing.title}`,
        description:  comments || "Your drawing needs revision.",
        priority:     "high",
      });
    }

    notifyDrawingReviewed({
      projectName:   drawing.projects?.name || drawing.project_id,
      drawingTitle:  drawing.title,
      status,
      reviewerName:  profile.full_name,
      comments,
      designerEmail: designer?.email,
    }).catch(err => console.error("[Notify] drawingReviewed failed:", err.message));
  }

  return { ok: true };
}

// ─── List drawing assignments for a project ───────────────────────────────────
async function drawingAssignmentsList(req, projectId) {
  await requireAuth(req);
  if (!projectId) throw httpError(400, "projectId required.");

  const sb = db.getClient();
  const { data, error } = await sb
    .from("drawing_assignments")
    .select(`
      *,
      assignee:profiles!assigned_to(id, full_name, email, role),
      assigner:profiles!assigned_by(id, full_name)
    `)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) throw httpError(500, error.message);
  return { assignments: data || [] };
}

// ─── Upsert a drawing assignment ──────────────────────────────────────────────
async function drawingAssignmentUpsert(req, body) {
  const { profile } = await requireAuth(req, ["admin", "lead_designer"]);
  const { projectId, drawingType, assignedTo, deadline, notes } = body;
  if (!projectId || !drawingType) throw httpError(400, "projectId, drawingType required.");

  const sb = db.getClient();
  const { data, error } = await sb
    .from("drawing_assignments")
    .upsert(
      {
        project_id:  projectId,
        drawing_type: drawingType,
        assigned_to: assignedTo || null,
        assigned_by: profile.id,
        deadline:    deadline || null,
        notes:       notes || null,
        updated_at:  new Date().toISOString(),
      },
      { onConflict: "project_id,drawing_type" }
    )
    .select("id")
    .single();

  if (error) throw httpError(500, error.message);

  // Give the designer access to this project
  if (assignedTo) {
    await sb.from("project_assignments").upsert(
      { project_id: projectId, user_id: assignedTo, assigned_by: profile.id },
      { onConflict: "project_id,user_id" }
    );

    // Create an upload task for the designer
    const deadlineStr = deadline ? ` by ${new Date(deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : "";
    await sb.from("tasks").insert({
      assigned_to:  assignedTo,
      assigned_by:  profile.id,
      project_id:   projectId,
      title:        `Upload ${drawingType} drawing`,
      description:  `Please upload the ${drawingType} drawing${deadlineStr}.${notes ? " Notes: " + notes : ""}`,
      priority:     deadline ? "high" : "medium",
      due_date:     deadline || null,
    });
  }

  return { ok: true, id: data?.id };
}

// ─── Delete a drawing assignment ──────────────────────────────────────────────
async function drawingAssignmentDelete(req, body) {
  await requireAuth(req, ["admin", "lead_designer"]);
  const { assignmentId } = body;
  if (!assignmentId) throw httpError(400, "assignmentId required.");

  const sb = db.getClient();
  const { error } = await sb.from("drawing_assignments").delete().eq("id", assignmentId);
  if (error) throw httpError(500, error.message);
  return { ok: true };
}

module.exports = {
  drawingsList,
  drawingsPending,
  drawingSignedUrl,
  drawingSignedUrlBatch,
  drawingUpload,
  drawingReview,
  drawingAssignmentsList,
  drawingAssignmentUpsert,
  drawingAssignmentDelete,
};
