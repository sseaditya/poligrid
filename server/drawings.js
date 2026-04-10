"use strict";

const zlib = require("zlib");
const db = require("../db");
const { requireAuth } = require("./auth");
const { httpError } = require("./utils");
const { notifyDrawingUploaded, notifyDrawingReviewed } = require("./notifications");
const { logAuditEvent } = require("./audit");

const MIME_MAP = {
  pdf:  "application/pdf",
  png:  "image/png",
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  dwg:  "application/octet-stream",
  dxf:  "application/octet-stream",
};

// ─── Minimal ZIP builder (no external deps) ───────────────────────────────────
const _CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function _crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ _CRC_TABLE[(c ^ buf[i]) & 0xFF];
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function _buildZip(files) {
  // files: [{ name: string, data: Buffer }]
  const parts = [];
  const centralDir = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = _crc32(data);
    const compressed = zlib.deflateRawSync(data, { level: 6 });
    const useDeflate = compressed.length < data.length;
    const fileData = useDeflate ? compressed : data;
    const method = useDeflate ? 8 : 0;

    const lh = Buffer.alloc(30 + nameBuf.length);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(fileData.length, 18);
    lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28); nameBuf.copy(lh, 30);
    parts.push(lh, fileData);

    const cd = Buffer.alloc(46 + nameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8); cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(fileData.length, 20);
    cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38); cd.writeUInt32LE(offset, 42);
    nameBuf.copy(cd, 46);
    centralDir.push(cd);
    offset += lh.length + fileData.length;
  }

  const cdBuf = Buffer.concat(centralDir);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(centralDir.length, 8); eocd.writeUInt16LE(centralDir.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, cdBuf, eocd]);
}

function _cap(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, " ") : str;
}

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

  // Designers can upload only drawing types explicitly assigned to them.
  if (profile.role === "designer") {
    const { data: assignment, error: assignmentError } = await sb
      .from("drawing_assignments")
      .select("id, status")
      .eq("project_id", projectId)
      .eq("drawing_type", drawingType)
      .eq("assigned_to", profile.id)
      .maybeSingle();

    if (assignmentError) throw httpError(500, assignmentError.message);
    if (!assignment) {
      throw httpError(403, "You can only upload drawing types assigned to you for this project.");
    }
    if (assignment.status === "pending_review") {
      throw httpError(409, "Drawing already submitted and awaiting lead designer review. You cannot upload again until the lead has reviewed it.");
    }
    if (assignment.status === "approved") {
      throw httpError(403, "This drawing has been approved and is finalised. No further uploads are allowed.");
    }
  }

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
      status:          "pending_review",
    })
    .select("id")
    .single();

  if (error) throw httpError(500, error.message);

  const { data: proj } = await sb.from("projects").select("name").eq("id", projectId).maybeSingle();
  const isReupload = versionNumber > 1;
  await logAuditEvent({
    category: "design",
    subcategory: isReupload ? "drawing_reupload" : "drawing_upload",
    projectId,
    actionedBy: profile.id,
    actionedByName: profile.full_name,
    logMessage: `${profile.full_name} ${isReupload ? "re-uploaded" : "uploaded"} ${drawingType} drawing (${title}) v${versionNumber} for ${proj?.name || "project"}.`,
    metadata: { drawingId: row.id, drawingType, versionNumber, fileName },
  });

  const nowIso = new Date().toISOString();

  // Sync assignment lifecycle → submitted for review
  let assignmentUpdate = sb
    .from("drawing_assignments")
    .update({
      status: "pending_review",
      submitted_at: nowIso,
      completed_at: null,
      updated_at: nowIso,
    })
    .eq("project_id", projectId)
    .eq("drawing_type", drawingType);

  if (profile.role === "designer") {
    assignmentUpdate = assignmentUpdate.eq("assigned_to", profile.id);
  }
  await assignmentUpdate;

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
    const nowIso = new Date().toISOString();

    const reviewSubcategory =
      status === "approved" ? "approve" :
      status === "revision_requested" ? "request_revision" :
      "review";

    const reviewLabel =
      status === "approved" ? "approved" :
      status === "revision_requested" ? "requested revision for" :
      "reviewed and rejected";

    await logAuditEvent({
      category: "design",
      subcategory: reviewSubcategory,
      projectId: drawing.project_id,
      actionedBy: profile.id,
      actionedByName: profile.full_name,
      logMessage: `${profile.full_name} ${reviewLabel} ${drawing.drawing_type} drawing (${drawing.title}) for ${drawing.projects?.name || "project"}.`,
      metadata: { drawingId, status, comments: comments || null, drawingType: drawing.drawing_type },
    });

    // Sync assignment status
    const assignmentPatch = {
      status,
      updated_at: nowIso,
      completed_at: status === "approved" ? nowIso : null,
    };
    await sb
      .from("drawing_assignments")
      .update(assignmentPatch)
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

// ─── List drawing assignments (project-scoped or mine-only) ──────────────────
async function drawingAssignmentsList(req, projectId) {
  const { profile } = await requireAuth(req);
  const parsed = typeof projectId === "object" && projectId !== null
    ? projectId
    : { projectId };
  const { projectId: pid, mineOnly = false } = parsed;

  const sb = db.getClient();
  let query = sb
    .from("drawing_assignments")
    .select(`
      *,
      project:projects(id, name, client_name, status),
      assignee:profiles!assigned_to(id, full_name, email, role),
      assigner:profiles!assigned_by(id, full_name)
    `)
    .order("assigned_at", { ascending: false });

  if (pid) query = query.eq("project_id", pid);
  if (mineOnly) query = query.eq("assigned_by", profile.id);

  if (profile.role === "designer") {
    query = query.eq("assigned_to", profile.id);
  }

  const { data, error } = await query;

  if (error) throw httpError(500, error.message);
  return { assignments: data || [] };
}

// ─── Upsert a drawing assignment ──────────────────────────────────────────────
async function drawingAssignmentUpsert(req, body) {
  const { profile } = await requireAuth(req, ["admin", "lead_designer"]);
  const { projectId, drawingType, assignedTo, deadline, notes } = body;
  if (!projectId || !drawingType || !assignedTo) {
    throw httpError(400, "projectId, drawingType, assignedTo required.");
  }

  const sb = db.getClient();
  const nowIso = new Date().toISOString();
  const [{ data: project }, { data: assignee }] = await Promise.all([
    sb.from("projects").select("name").eq("id", projectId).maybeSingle(),
    sb.from("profiles").select("id, full_name, role").eq("id", assignedTo).maybeSingle(),
  ]);

  const { data: existing, error: existingError } = await sb
    .from("drawing_assignments")
    .select("id, assigned_to")
    .eq("project_id", projectId)
    .eq("drawing_type", drawingType)
    .maybeSingle();

  if (existingError) throw httpError(500, existingError.message);

  const shouldResetLifecycle = !existing || existing.assigned_to !== assignedTo;

  if (existing) {
    const updatePayload = {
      assigned_to: assignedTo,
      assigned_by: profile.id,
      deadline: deadline || null,
      notes: notes || null,
      updated_at: nowIso,
      ...(shouldResetLifecycle
        ? {
            status: "assigned",
            assigned_at: nowIso,
            submitted_at: null,
            completed_at: null,
          }
        : {}),
    };

    const { error } = await sb
      .from("drawing_assignments")
      .update(updatePayload)
      .eq("id", existing.id);

    if (error) {
      console.error("[drawingAssignmentUpsert:update]", error.message);
      throw httpError(500, error.message);
    }
  } else {
    const { error } = await sb
      .from("drawing_assignments")
      .insert({
        project_id: projectId,
        drawing_type: drawingType,
        assigned_to: assignedTo,
        assigned_by: profile.id,
        assigned_at: nowIso,
        submitted_at: null,
        completed_at: null,
        deadline: deadline || null,
        notes: notes || null,
        status: "assigned",
        updated_at: nowIso,
      });

    if (error) {
      console.error("[drawingAssignmentUpsert:insert]", error.message);
      throw httpError(500, error.message);
    }
  }

  // Give the designer access to this project
  await sb.from("project_assignments").upsert(
    { project_id: projectId, user_id: assignedTo, assigned_by: profile.id },
    { onConflict: "project_id,user_id" }
  );

  // Create an upload task only when this is a new or reassigned owner.
  if (shouldResetLifecycle) {
    const deadlineStr = deadline ? ` by ${new Date(deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : "";
    await sb.from("tasks").insert({
      assigned_to:  assignedTo,
      assigned_by:  profile.id,
      project_id:   projectId,
      title:        `Complete ${drawingType} drawing`,
      description:  `Please upload the ${drawingType} drawing${deadlineStr}.${notes ? " Notes: " + notes : ""}`,
      priority:     deadline ? "high" : "medium",
      due_date:     deadline || null,
    });
  }

  await logAuditEvent({
    category: "design",
    subcategory: "drawing_assignment",
    projectId,
    actionedBy: profile.id,
    actionedByName: profile.full_name,
    logMessage: `${profile.full_name} assigned ${drawingType} drawing to ${assignee?.full_name || "designer"} for ${project?.name || "project"}.`,
    metadata: { drawingType, assignedTo, deadline: deadline || null, notes: notes || null },
  });

  return { ok: true };
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

// ─── Proxy a single drawing file (forces download, no CORS issues) ────────────
async function drawingDownload(req, res, filePath, fileName) {
  await requireAuth(req);
  if (!filePath) throw httpError(400, "path required.");

  const sb = db.getClient();
  const { data: blob, error } = await sb.storage
    .from("poligrid-drawings")
    .download(filePath);

  if (error || !blob) throw httpError(404, "File not found.");

  const buffer = Buffer.from(await blob.arrayBuffer());
  const ext = (fileName || filePath).split(".").pop().toLowerCase();
  const mime = MIME_MAP[ext] || "application/octet-stream";
  const safeName = (fileName || filePath.split("/").pop()).replace(/[^\w.\- ]/g, "_");

  res.writeHead(200, {
    "Content-Type": mime,
    "Content-Disposition": `attachment; filename="${safeName}"`,
    "Content-Length": buffer.length,
    "Cache-Control": "no-store",
  });
  res.end(buffer);
}

// ─── Server-side ZIP of all drawings for a project ────────────────────────────
async function drawingDownloadZip(req, res, projectId) {
  await requireAuth(req);
  if (!projectId) throw httpError(400, "projectId required.");

  const sb = db.getClient();
  const { data: drawings, error } = await sb
    .from("drawings")
    .select("id, title, file_path, file_name, drawing_type, version_number")
    .eq("project_id", projectId)
    .order("drawing_type", { ascending: true });

  if (error) throw httpError(500, error.message);
  if (!drawings?.length) throw httpError(404, "No drawings found for this project.");

  // Fetch files server-side — no browser CORS, uses service role key
  const files = [];
  await Promise.all(drawings.map(async d => {
    try {
      const { data: blob } = await sb.storage
        .from("poligrid-drawings")
        .download(d.file_path);
      if (!blob) return;
      const buffer = Buffer.from(await blob.arrayBuffer());
      const ext = (d.file_name || "file").split(".").pop();
      const safeTitle = (d.title || "drawing").replace(/[^a-z0-9_\- ]/gi, "_");
      files.push({ name: `${_cap(d.drawing_type)}/v${d.version_number}_${safeTitle}.${ext}`, data: buffer });
    } catch { /* skip unavailable files */ }
  }));

  if (!files.length) throw httpError(500, "Could not fetch any drawing files.");

  const zipBuffer = _buildZip(files);
  const { data: proj } = await sb.from("projects").select("name").eq("id", projectId).single();
  const safeProjName = (proj?.name || "project").replace(/[^a-z0-9_\- ]/gi, "_");

  res.writeHead(200, {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${safeProjName}_drawings.zip"`,
    "Content-Length": zipBuffer.length,
    "Cache-Control": "no-store",
  });
  res.end(zipBuffer);
}

// ─── Revision-requested drawings for the current designer ────────────────────
async function drawingsRevisionRequests(req) {
  const { profile } = await requireAuth(req, ["designer", "lead_designer", "admin"]);
  const sb = db.getClient();

  // Find projects this user is assigned to
  const { data: assigned } = await sb
    .from("project_assignments")
    .select("project_id")
    .eq("user_id", profile.id);

  if (!assigned?.length) return { drawings: [] };
  const projectIds = assigned.map(a => a.project_id);

  let query = sb
    .from("drawings")
    .select(`
      *,
      project:projects(id, name, client_name),
      drawing_reviews(id, status, comments, reviewed_at,
        reviewer:profiles!reviewed_by(full_name))
    `)
    .in("project_id", projectIds)
    .eq("status", "revision_requested")
    .order("updated_at", { ascending: false });

  // Designers only see their own uploaded drawings; leads see all
  if (profile.role === "designer") {
    query = query.eq("uploaded_by", profile.id);
  }

  const { data, error } = await query;
  if (error) throw httpError(500, error.message);
  return { drawings: data || [] };
}

// ─── Drawing assignment summary (counts) per project ─────────────────────────
async function drawingProjectSummary(req, projectIds) {
  await requireAuth(req);
  if (!projectIds?.length) return { summary: {} };

  const sb = db.getClient();
  const { data, error } = await sb
    .from("drawing_assignments")
    .select("project_id, status")
    .in("project_id", projectIds);

  if (error) throw httpError(500, error.message);

  const summary = {};
  for (const row of data || []) {
    if (!summary[row.project_id]) {
      summary[row.project_id] = { total: 0, approved: 0, pending_review: 0, revision_requested: 0 };
    }
    summary[row.project_id].total++;
    if (row.status === "approved")           summary[row.project_id].approved++;
    if (row.status === "pending_review")     summary[row.project_id].pending_review++;
    if (row.status === "revision_requested") summary[row.project_id].revision_requested++;
  }
  return { summary };
}

module.exports = {
  drawingsList,
  drawingsPending,
  drawingSignedUrl,
  drawingSignedUrlBatch,
  drawingDownload,
  drawingDownloadZip,
  drawingUpload,
  drawingReview,
  drawingAssignmentsList,
  drawingAssignmentUpsert,
  drawingAssignmentDelete,
  drawingsRevisionRequests,
  drawingProjectSummary,
};
