"use strict";
const db = require("../db");
const { httpError } = require("./utils");
const { requireAuth } = require("./auth");
// ─── Project DB Handlers ─────────────────────────────────────────────────────

async function handleProjectAction(action, body, auth) {
  switch (action) {
    case "save-analysis": return projectSaveAnalysis(body, auth);
    case "save-rooms": return projectSaveRooms(body);
    case "save-inspiration": return projectSaveInspiration(body);
    case "save-pin": return projectSavePin(body);
    case "save-render": return projectSaveRender(body);
    case "save-placements": return projectSavePlacements(body);
    case "save-boq": return projectSaveBoq(body);
    case "update-boq": return projectUpdateBoq(body);
    case "save-scene": return projectSaveScene(body);
    case "rename": return projectRename(body);
    case "save-brief": return projectSaveBrief(body);
    case "create-version": return projectCreateVersion(body);
    default: throw httpError(404, "Unknown project action: " + action);
  }
}

// ── Create a new design version for a project ─────────────────────────────────
async function projectCreateVersion(body) {
  const { projectId, designBrief, regenInspirationImages } = body;
  if (!projectId) throw httpError(400, "Missing projectId");
  const sb = db.getClient();

  // Determine next version number
  const { data: existing } = await sb
    .from("project_versions")
    .select("version_number")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false })
    .limit(1);
  const nextNum = existing?.length ? existing[0].version_number + 1 : 1;

  // Upload version-specific inspiration images if provided
  let regenInspirationPaths = null;
  if (Array.isArray(regenInspirationImages) && regenInspirationImages.length > 0) {
    const paths = [];
    for (let i = 0; i < regenInspirationImages.length; i++) {
      const img = regenInspirationImages[i];
      if (!img.base64) continue;
      const ext = (img.mimeType || "").includes("png") ? "png" : "jpg";
      const storagePath = await db.uploadBase64(
        "poligrid-inspiration",
        `${projectId}/v${nextNum}_insp_${Date.now()}_${i}.${ext}`,
        img.base64,
        img.mimeType || "image/jpeg"
      );
      if (storagePath) paths.push(storagePath);
    }
    if (paths.length) regenInspirationPaths = paths;
  }

  const { data, error } = await sb
    .from("project_versions")
    .insert({
      project_id: projectId,
      version_number: nextNum,
      design_brief: designBrief || null,
      regen_inspiration_paths: regenInspirationPaths
    })
    .select()
    .single();

  if (error) throw httpError(500, "Failed to create version: " + error.message);
  return { version: data };
}

// ── Load all versions for a project with their renders + BOQ ──────────────────
async function projectLoadVersions(projectId) {
  if (!projectId) throw httpError(400, "Missing projectId");
  const sb = db.getClient();
  const supabaseUrl = process.env.SUPABASE_URL;
  const pubUrl = (bucket, storagePath) =>
    storagePath ? `${supabaseUrl}/storage/v1/object/public/${bucket}/${storagePath}` : null;

  const [{ data: versions }, { data: insps }] = await Promise.all([
    sb.from("project_versions").select("*").eq("project_id", projectId).order("version_number", { ascending: true }),
    sb.from("inspiration_images").select("*").eq("project_id", projectId).order("sort_order", { ascending: true })
  ]);

  // Batch-fetch renders + BOQ for all versions in 2 queries (avoids N+1)
  const versionIds = (versions || []).map(v => v.id);
  const [allRendersRes, allBoqRes] = versionIds.length
    ? await Promise.all([
        sb.from("renders").select("*").in("version_id", versionIds).order("created_at", { ascending: true }),
        sb.from("boq_items").select("*").in("version_id", versionIds)
      ])
    : [{ data: [] }, { data: [] }];

  const rendersByVersion = {};
  const boqByVersion = {};
  for (const r of allRendersRes.data || []) {
    (rendersByVersion[r.version_id] = rendersByVersion[r.version_id] || []).push(r);
  }
  for (const b of allBoqRes.data || []) {
    (boqByVersion[b.version_id] = boqByVersion[b.version_id] || []).push(b);
  }

  const versionsWithData = (versions || []).map(v => {
    const renders = rendersByVersion[v.id] || [];
    const boq = boqByVersion[v.id] || [];
    // Version-specific inspiration overrides project-level inspiration
    const inspPaths = v.regen_inspiration_paths;
    const inspUrls = inspPaths
      ? inspPaths.map(p => pubUrl("poligrid-inspiration", p))
      : (insps || []).map(i => pubUrl("poligrid-inspiration", i.storage_path));
    return {
      ...v,
      renders: renders.map(r => ({ ...r, url: pubUrl("poligrid-renders", r.storage_path) })),
      boqItems: boq,
      inspirationUrls: inspUrls.filter(Boolean)
    };
  });

  return { versions: versionsWithData };
}

async function projectSaveAnalysis(body, auth) {
  const { projectId, floorPlanBase64, fileName, analysis, context } = body;
  if (!projectId) throw httpError(400, "Missing projectId");

  const sb = db.getClient();
  // Preserve created_by if already set; otherwise stamp the current user
  const { data: existingProj } = await sb.from("projects").select("created_by").eq("id", projectId).maybeSingle();
  const createdBy = existingProj?.created_by ?? (auth?.profile?.id ?? null);

  await db.upsertProject(projectId, {
    property_type: context?.propertyType,
    bhk: context?.bhk,
    total_area_m2: context?.totalAreaM2 || analysis?.totalAreaM2,
    notes: context?.notes,
    bhk_type: analysis?.bhkType,
    orientation: analysis?.orientation,
    summary: analysis?.summary,
    created_by: createdBy
  });

  const storagePath = await db.uploadBase64(
    "poligrid-floor-plans",
    `${projectId}/floorplan.png`,
    floorPlanBase64,
    "image/png"
  );

  // Floor plan is static per project — upsert in place rather than inserting a new row
  const { data: existingFp } = await sb.from("floor_plans").select("id").eq("project_id", projectId).limit(1).single();
  let fpId;
  if (existingFp) {
    await sb.from("floor_plans").update({
      file_name: fileName || "floorplan.png",
      storage_path: storagePath,
      analysis_raw: analysis,
      analyzed_at: new Date().toISOString()
    }).eq("id", existingFp.id);
    fpId = existingFp.id;
  } else {
    fpId = await db.insertRow("floor_plans", {
      project_id: projectId,
      file_name: fileName || "floorplan.png",
      storage_path: storagePath,
      analysis_raw: analysis,
      analyzed_at: new Date().toISOString()
    });
  }

  const rooms = analysis?.rooms || [];
  if (rooms.length) {
    await db.replaceRows("rooms", { project_id: projectId }, rooms.map(r => ({
      project_id: projectId,
      floor_plan_id: fpId,
      label: r.label,
      name: r.name,
      room_type: r.roomType,
      bbox_x_pct: r.bbox?.xPct,
      bbox_y_pct: r.bbox?.yPct,
      bbox_w_pct: r.bbox?.wPct,
      bbox_h_pct: r.bbox?.hPct,
      width_m: r.widthM,
      length_m: r.lengthM,
      notes: r.notes,
      walls: r.walls || null,
      fp_placements: r.placements || null
    })));
  }

  const boq = analysis?.globalBoq || [];
  if (boq.length) {
    await db.replaceRows(
      "boq_items",
      { project_id: projectId, source: "floor_plan_analysis" },
      boq.map(b => ({
        project_id: projectId,
        source: "floor_plan_analysis",
        category: b.category,
        item: b.item,
        qty: b.qty,
        unit: b.unit,
        rate: b.rate,
        amount: b.amount
      }))
    );
  }

  return { ok: true };
}

async function projectSaveRooms(body) {
  const { projectId, rooms } = body;
  if (!projectId) throw httpError(400, "Missing projectId");

  await db.replaceRows("rooms", { project_id: projectId }, (rooms || []).map(r => ({
    project_id: projectId,
    label: r.label,
    name: r.name,
    room_type: r.roomType,
    bbox_x_pct: r.bbox?.xPct,
    bbox_y_pct: r.bbox?.yPct,
    bbox_w_pct: r.bbox?.wPct,
    bbox_h_pct: r.bbox?.hPct,
    width_m: r.widthM,
    length_m: r.lengthM,
    notes: r.notes
  })));

  return { ok: true };
}

async function projectSaveInspiration(body) {
  const { projectId, images } = body;
  if (!projectId) throw httpError(400, "Missing projectId");

  // Ensure the project row exists before inserting child rows (FK constraint)
  await db.upsertProject(projectId, {});

  // Get current max sort_order so new images append rather than collide
  const sb = db.getClient();
  const { data: existing } = await sb
    .from("inspiration_images")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const offset = existing?.[0]?.sort_order != null ? existing[0].sort_order + 1 : 0;

  const rows = [];
  for (let i = 0; i < (images || []).length; i++) {
    const img = images[i];
    if (!img.base64) continue;
    const ext = (img.mimeType || "").includes("png") ? "png" : "jpg";
    const storagePath = await db.uploadBase64(
      "poligrid-inspiration",
      `${projectId}/${Date.now()}_${i}.${ext}`,
      img.base64,
      img.mimeType || "image/jpeg"
    );
    rows.push({
      project_id: projectId,
      file_name: img.fileName || `${i}.${ext}`,
      storage_path: storagePath,
      sort_order: offset + i
    });
  }

  if (rows.length) {
    const { error } = await sb.from("inspiration_images").insert(rows);
    if (error) console.error("[DB] Insert inspiration_images failed:", error.message);
  }
  return { ok: true };
}

async function projectSavePin(body) {
  const { projectId, pin } = body;
  if (!projectId || !pin?.clientId) throw httpError(400, "Missing projectId or pin.clientId");

  let photoStoragePath = null;
  if (pin.photoDataUrl) {
    const ext = (pin.photoMimeType || "").includes("png") ? "png" : "jpg";
    photoStoragePath = await db.uploadBase64(
      "poligrid-pin-photos",
      `${projectId}/${pin.clientId}.${ext}`,
      pin.photoDataUrl,
      pin.photoMimeType || "image/jpeg"
    );
  }

  const pinRow = {
    project_id: projectId,
    client_id: pin.clientId,
    x_m: pin.xM,
    y_m: pin.yM,
    angle_deg: pin.angleDeg,
    fov_deg: pin.fovDeg,
    room_label: pin.roomLabel,
    brief: pin.brief,
    photo_file_name: pin.photoFileName || null,
  };
  const resolvedPath = photoStoragePath || pin.existingPhotoPath || null;
  if (resolvedPath !== null) {
    pinRow.photo_storage_path = resolvedPath;
  }
  await db.upsertPin(projectId, pinRow);

  return { ok: true, photoStoragePath: resolvedPath };
}

async function projectSaveRender(body) {
  const { projectId, pinClientId, roomLabel, dataUrl, modelUsed, furnitureList, generationType, versionId } = body;
  if (!projectId) throw httpError(400, "Missing projectId");

  const ts = Date.now();
  const safe = (roomLabel || "room").replace(/[^a-z0-9_]/gi, "_").toLowerCase();
  const storagePath = await db.uploadBase64(
    "poligrid-renders",
    `${projectId}/${safe}_${ts}.png`,
    dataUrl,
    "image/png"
  );

  await db.insertRow("renders", {
    project_id: projectId,
    camera_pin_client_id: pinClientId || null,
    room_label: roomLabel,
    storage_path: storagePath,
    model_used: modelUsed || null,
    furniture_list: furnitureList || null,
    generation_type: generationType || "generate",
    version_id: versionId || null
  });

  return { ok: true };
}

async function projectSavePlacements(body) {
  const { projectId, placements } = body;
  if (!projectId) throw httpError(400, "Missing projectId");

  await db.replaceRows("furniture_placements", { project_id: projectId }, (placements || []).map(p => ({
    project_id: projectId,
    client_id: p.id,
    module_id: p.moduleId,
    label: p.label,
    type: p.type,
    room_label: p.roomLabel,
    room_type: p.roomType,
    x_m: p.xM,
    y_m: p.yM,
    w_m: p.wM,
    d_m: p.dM,
    h_m: p.hM,
    rotation_y: p.rotationY,
    wall: p.wall,
    color: p.color,
    source: p.source || "manual"
  })));

  return { ok: true };
}

async function projectSaveBoq(body) {
  const { projectId, boqItems, versionId } = body;
  if (!projectId) throw httpError(400, "Missing projectId");
  const sb = db.getClient();

  if (versionId) {
    // Version-specific: insert without deleting (each version owns its BOQ)
    const rows = (boqItems || []).map(b => ({
      project_id: projectId,
      source: "furniture_generated",
      version_id: versionId,
      category: b.category,
      item: b.item,
      qty: b.qty,
      unit: b.unit,
      rate: b.rate,
      amount: b.amount
    }));
    if (rows.length) {
      const { error } = await sb.from("boq_items").insert(rows);
      if (error) console.error("[DB] Insert version BOQ failed:", error.message);
    }
    return { ok: true };
  }

  // Legacy path (no version): replace all furniture_generated items
  await db.replaceRows(
    "boq_items",
    { project_id: projectId, source: "furniture_generated" },
    (boqItems || []).map(b => ({
      project_id: projectId,
      source: "furniture_generated",
      category: b.category,
      item: b.item,
      qty: b.qty,
      unit: b.unit,
      rate: b.rate,
      amount: b.amount
    }))
  );

  return { ok: true };
}

async function projectUpdateBoq(body) {
  const { projectId, versionId, projectItems, versionItems } = body;
  if (!projectId) throw httpError(400, "Missing projectId");
  const sb = db.getClient();

  // Replace project-level (floor plan) BOQ items
  if (Array.isArray(projectItems)) {
    await db.replaceRows(
      "boq_items",
      { project_id: projectId, source: "floor_plan_analysis" },
      projectItems.map(b => ({
        project_id: projectId,
        source: "floor_plan_analysis",
        category: b.category,
        item: b.item,
        qty: b.qty,
        unit: b.unit,
        rate: b.rate,
        amount: b.amount
      }))
    );
  }

  // Replace version-level BOQ items
  if (versionId && Array.isArray(versionItems)) {
    const { error: delErr } = await sb.from("boq_items").delete().eq("version_id", versionId);
    if (delErr) console.error("[DB] Delete version BOQ failed:", delErr.message);
    if (versionItems.length) {
      const rows = versionItems.map(b => ({
        project_id: projectId,
        version_id: versionId,
        source: "furniture_generated",
        category: b.category,
        item: b.item,
        qty: b.qty,
        unit: b.unit,
        rate: b.rate,
        amount: b.amount
      }));
      const { error: insErr } = await sb.from("boq_items").insert(rows);
      if (insErr) console.error("[DB] Insert updated version BOQ failed:", insErr.message);
    }
  }

  return { ok: true };
}

async function projectSaveScene(body) {
  const { projectId, sceneJson, boqCsv } = body;
  if (!projectId) throw httpError(400, "Missing projectId");

  let csvPath = null;
  if (boqCsv) {
    csvPath = await db.uploadText(
      "poligrid-exports",
      `${projectId}/boq_${Date.now()}.csv`,
      boqCsv,
      "text/csv; charset=utf-8"
    );
  }

  await db.insertRow("scene_exports", {
    project_id: projectId,
    scene_json: sceneJson || null,
    boq_csv_storage_path: csvPath
  });

  return { ok: true };
}

async function projectList(auth) {
  const sb = db.getClient();
  const supabaseUrl = process.env.SUPABASE_URL;

  let query = sb
    .from("projects")
    .select("id, name, property_type, bhk, bhk_type, total_area_m2, summary, created_at, updated_at, status, client_name, created_by, advance_payment_done, floor_plans(storage_path)")
    .order("updated_at", { ascending: false });

  // Filter by role when auth is present
  if (auth && !["admin", "ceo", "sales"].includes(auth.profile.role)) {
    const userId = auth.profile.id;
    const { data: assigned } = await sb
      .from("project_assignments")
      .select("project_id")
      .eq("user_id", userId);
    const assignedIds = (assigned || []).map(a => a.project_id);

    // Designers / lead designers see only explicitly assigned projects
    if (assignedIds.length === 0) return { projects: [] };
    query = query.in("id", assignedIds);
  }

  const { data, error } = await query;
  if (error) throw httpError(500, "Failed to list projects: " + error.message);

  const projects = (data || []).map(({ floor_plans, ...p }) => {
    const fp = Array.isArray(floor_plans) ? floor_plans[0] : floor_plans;
    return {
      ...p,
      thumbnail_url: fp?.storage_path
        ? `${supabaseUrl}/storage/v1/object/public/poligrid-floor-plans/${fp.storage_path}`
        : null
    };
  });
  return { projects };
}

async function projectLoad(id) {
  if (!id) throw httpError(400, "Missing project id");
  const sb = db.getClient();
  const supabaseUrl = process.env.SUPABASE_URL;
  const pubUrl = (bucket, storagePath) =>
    storagePath ? `${supabaseUrl}/storage/v1/object/public/${bucket}/${storagePath}` : null;

  const [
    { data: project },
    { data: fps },
    { data: rooms },
    { data: cameraPins },
    { data: furniturePlacements },
    { data: boqItems },
    { data: inspirationImages },
    { data: versions }
  ] = await Promise.all([
    sb.from("projects").select("*").eq("id", id).single(),
    sb.from("floor_plans").select("*").eq("project_id", id).order("created_at", { ascending: false }).limit(1),
    sb.from("rooms").select("*").eq("project_id", id),
    sb.from("camera_pins").select("*").eq("project_id", id),
    sb.from("furniture_placements").select("*").eq("project_id", id),
    sb.from("boq_items").select("*").eq("project_id", id).eq("source", "floor_plan_analysis"),
    sb.from("inspiration_images").select("*").eq("project_id", id).order("sort_order", { ascending: true }),
    sb.from("project_versions").select("*").eq("project_id", id).order("version_number", { ascending: true })
  ]);

  if (!project) throw httpError(404, "Project not found");
  const fp = fps && fps[0] ? { ...fps[0], url: pubUrl("poligrid-floor-plans", fps[0].storage_path) } : null;

  // Batch-fetch renders + BOQ for all versions in 2 queries (avoids N+1)
  const versionIds = (versions || []).map(v => v.id);
  const [allRendersRes, allBoqRes] = versionIds.length
    ? await Promise.all([
        sb.from("renders").select("*").in("version_id", versionIds).order("created_at", { ascending: true }),
        sb.from("boq_items").select("*").in("version_id", versionIds)
      ])
    : [{ data: [] }, { data: [] }];

  const rendersByVersion = {};
  const boqByVersion = {};
  for (const r of allRendersRes.data || []) {
    (rendersByVersion[r.version_id] = rendersByVersion[r.version_id] || []).push(r);
  }
  for (const b of allBoqRes.data || []) {
    (boqByVersion[b.version_id] = boqByVersion[b.version_id] || []).push(b);
  }

  const versionsWithData = (versions || []).map(v => {
    const renders = rendersByVersion[v.id] || [];
    const boq = boqByVersion[v.id] || [];
    const inspPaths = v.regen_inspiration_paths;
    const inspUrls = inspPaths
      ? inspPaths.map(p => pubUrl("poligrid-inspiration", p))
      : (inspirationImages || []).map(i => pubUrl("poligrid-inspiration", i.storage_path));
    return {
      ...v,
      renders: renders.map(r => ({ ...r, url: pubUrl("poligrid-renders", r.storage_path) })),
      boqItems: boq,
      inspirationUrls: inspUrls.filter(Boolean)
    };
  });

  return {
    project,
    floorPlan: fp,
    rooms: rooms || [],
    cameraPins: (cameraPins || []).map(p => ({
      ...p,
      photo_url: pubUrl("poligrid-pin-photos", p.photo_storage_path)
    })),
    furniturePlacements: furniturePlacements || [],
    boqItems: boqItems || [],
    inspirationImages: (inspirationImages || []).map(i => ({
      ...i,
      url: pubUrl("poligrid-inspiration", i.storage_path)
    })),
    versions: versionsWithData
  };
}

async function projectRename(body) {
  const { projectId, name } = body;
  if (!projectId) throw httpError(400, "Missing projectId");
  const sb = db.getClient();
  const { error } = await sb.from("projects").update({ name: name || null }).eq("id", projectId);
  if (error) throw httpError(500, "Rename failed: " + error.message);
  return { ok: true };
}

async function projectSaveBrief(body) {
  const { projectId, globalBrief } = body;
  if (!projectId) throw httpError(400, "Missing projectId");
  const sb = db.getClient();
  const { error } = await sb.from("projects").update({ global_brief: globalBrief || null }).eq("id", projectId);
  if (error) throw httpError(500, "Save brief failed: " + error.message);
  return { ok: true };
}

async function projectUpdateStatus(body, auth) {
  const { projectId, status } = body;
  if (!projectId || !status) throw httpError(400, "projectId, status required.");

  const VALID = ["active", "advanced_paid", "in_progress", "completed", "on_hold", "cancelled"];
  if (!VALID.includes(status)) throw httpError(400, `Invalid status. Must be: ${VALID.join(", ")}`);

  const sb = db.getClient();
  const { error } = await sb.from("projects")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", projectId);
  if (error) throw httpError(500, "Status update failed: " + error.message);
  return { ok: true };
}

// ─── Sales-specific: all projects split into mine vs others ───────────────────
async function salesProjectList(auth) {
  const sb = db.getClient();
  const supabaseUrl = process.env.SUPABASE_URL;
  const userId = auth.profile.id;

  const FIELDS = "id, name, property_type, bhk, bhk_type, total_area_m2, summary, created_at, updated_at, status, client_name, created_by, floor_plans(storage_path)";
  const toProject = ({ floor_plans, ...p }) => {
    const fp = Array.isArray(floor_plans) ? floor_plans[0] : floor_plans;
    return {
      ...p,
      thumbnail_url: fp?.storage_path
        ? `${supabaseUrl}/storage/v1/object/public/poligrid-floor-plans/${fp.storage_path}`
        : null
    };
  };

  const [{ data: mine, error: e1 }, { data: others, error: e2 }] = await Promise.all([
    sb.from("projects").select(FIELDS).eq("created_by", userId).order("updated_at", { ascending: false }),
    sb.from("projects").select(FIELDS).neq("created_by", userId).order("updated_at", { ascending: false }),
  ]);
  if (e1 || e2) throw httpError(500, "Failed to list projects: " + (e1 || e2).message);

  return {
    mine:   (mine   || []).map(toProject),
    others: (others || []).map(toProject),
  };
}

// ─── Create a new project (self-serve for designer / sales) ──────────────────
async function projectCreate(req, body) {
  const { profile } = await requireAuth(req, ["designer", "lead_designer", "admin", "sales"]);
  const { name, clientName } = body;
  if (!name || !name.trim()) throw httpError(400, "Project name required.");

  const sb = db.getClient();
  const newId = require("crypto").randomUUID();

  const { error } = await sb.from("projects").insert({
    id:          newId,
    name:        name.trim(),
    client_name: clientName?.trim() || null,
    created_by:  profile.id,
    status:      "active",
  });
  if (error) throw httpError(500, error.message);

  // Auto-assign creator
  await sb.from("project_assignments").insert({
    project_id:  newId,
    user_id:     profile.id,
    assigned_by: profile.id,
  });

  return { projectId: newId };
}

// ─── Toggle advance payment done flag ────────────────────────────────────────
async function projectAdvancePayment(req, body) {
  await requireAuth(req, ["sales", "admin"]);
  const { projectId, done } = body;
  if (!projectId) throw httpError(400, "projectId required.");

  const sb = db.getClient();
  const { error } = await sb
    .from("projects")
    .update({ advance_payment_done: !!done, updated_at: new Date().toISOString() })
    .eq("id", projectId);
  if (error) throw httpError(500, error.message);
  return { ok: true };
}

// ─── Project detail (lightweight — includes team + drawing stats) ─────────────
async function projectDetail(req, id) {
  await requireAuth(req);
  if (!id) throw httpError(400, "Missing id");
  const sb = db.getClient();
  const supabaseUrl = process.env.SUPABASE_URL;

  const [
    { data: project },
    { data: team },
    { data: drawings },
    { data: fps },
    { data: renders },
  ] = await Promise.all([
    sb.from("projects").select("*").eq("id", id).single(),
    sb.from("project_assignments").select("*, profile:profiles(id, full_name, email, role)").eq("project_id", id),
    sb.from("drawings").select("id, status, drawing_type, title, file_name, created_at, uploaded_by, uploader:profiles!uploaded_by(full_name)").eq("project_id", id).order("created_at", { ascending: false }),
    sb.from("floor_plans").select("storage_path").eq("project_id", id).order("created_at", { ascending: false }).limit(1),
    sb.from("renders").select("id").eq("project_id", id),
  ]);

  if (!project) throw httpError(404, "Project not found");

  const drawingList = drawings || [];
  const drawingStats = {
    total: drawingList.length,
    approved: drawingList.filter(d => d.status === "approved").length,
    pending: drawingList.filter(d => d.status === "pending_review").length,
    revision: drawingList.filter(d => d.status === "revision_requested").length,
    rejected: drawingList.filter(d => d.status === "rejected").length,
  };

  const fp = fps && fps[0];
  const thumbnailUrl = fp?.storage_path
    ? `${supabaseUrl}/storage/v1/object/public/poligrid-floor-plans/${fp.storage_path}`
    : null;

  return { project, team: team || [], drawings: drawingList, drawingStats, thumbnailUrl, rendersCount: (renders || []).length };
}

// ─── Update editable project fields ──────────────────────────────────────────
async function projectUpdate(req, body) {
  await requireAuth(req, ["admin", "lead_designer", "sales", "designer"]);
  const { projectId, name, clientName, propertyType, bhk, bhkType, totalAreaM2, globalBrief } = body;
  if (!projectId) throw httpError(400, "projectId required.");

  const updates = {};
  if (name          !== undefined) updates.name            = name?.trim() || null;
  if (clientName    !== undefined) updates.client_name     = clientName?.trim() || null;
  if (propertyType  !== undefined) updates.property_type   = propertyType || null;
  if (bhk           !== undefined) updates.bhk             = bhk;
  if (bhkType       !== undefined) updates.bhk_type        = bhkType || null;
  if (totalAreaM2   !== undefined) updates.total_area_m2   = totalAreaM2;
  if (globalBrief   !== undefined) updates.global_brief    = globalBrief?.trim() || null;
  if (!Object.keys(updates).length) throw httpError(400, "Nothing to update.");
  updates.updated_at = new Date().toISOString();

  const sb = db.getClient();
  const { error } = await sb.from("projects").update(updates).eq("id", projectId);
  if (error) throw httpError(500, error.message);
  return { ok: true };
}

// ─── Paid projects not yet assigned to the requesting lead_designer ───────────
async function projectListAvailable(req) {
  const { profile } = await requireAuth(req, ["lead_designer", "admin"]);
  const sb = db.getClient();
  const supabaseUrl = process.env.SUPABASE_URL;

  // All assignments for this user
  const { data: assigned } = await sb
    .from("project_assignments")
    .select("project_id")
    .eq("user_id", profile.id);
  const assignedIds = (assigned || []).map(a => a.project_id);

  let query = sb
    .from("projects")
    .select("id, name, property_type, bhk, bhk_type, client_name, status, created_at, advance_payment_done, floor_plans(storage_path)")
    .eq("advance_payment_done", true)
    .order("updated_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw httpError(500, error.message);

  // Exclude already-assigned projects
  const available = (data || [])
    .filter(p => !assignedIds.includes(p.id))
    .map(({ floor_plans, ...p }) => {
      const fp = Array.isArray(floor_plans) ? floor_plans[0] : floor_plans;
      return {
        ...p,
        thumbnail_url: fp?.storage_path
          ? `${supabaseUrl}/storage/v1/object/public/poligrid-floor-plans/${fp.storage_path}`
          : null,
      };
    });

  return { projects: available };
}

module.exports = {
  handleProjectAction,
  projectList,
  projectLoad,
  projectLoadVersions,
  salesProjectList,
  projectUpdateStatus,
  projectCreate,
  projectAdvancePayment,
  projectDetail,
  projectUpdate,
  projectListAvailable,
};
