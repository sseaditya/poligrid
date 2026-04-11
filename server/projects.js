"use strict";

const db = require("../db");
const { httpError } = require("./utils");

const FULL_ACCESS_ROLES = new Set(["admin", "ceo", "sales"]);

function publicStorageUrl(bucket, storagePath) {
  if (!storagePath) return null;
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`;
}

async function assertProjectAccess(projectId, auth, existingProject) {
  if (!projectId) throw httpError(400, "Missing projectId");
  if (!auth || !auth.profile) throw httpError(401, "Authentication required.");
  if (FULL_ACCESS_ROLES.has(auth.profile.role)) return existingProject || null;

  const sb = db.getClient();
  const project = existingProject || (
    await sb.from("projects").select("id, created_by").eq("id", projectId).maybeSingle()
  ).data;
  if (!project) throw httpError(404, "Project not found");
  if (project.created_by === auth.profile.id) return project;

  const { data: assignment } = await sb.from("project_assignments")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", auth.profile.id)
    .maybeSingle();
  if (!assignment) throw httpError(403, "You do not have access to this project.");
  return project;
}

async function handleProjectAction(action, body, auth) {
  if (!body || typeof body !== "object") throw httpError(400, "Invalid request body.");
  const projectId = body.projectId;

  if (action === "save-analysis") {
    return projectSaveAnalysis(body, auth);
  }

  await assertProjectAccess(projectId, auth);

  switch (action) {
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

async function projectCreateVersion(body) {
  const { projectId, designBrief, regenInspirationImages, regenExistingInspirationPaths } = body;
  if (!projectId) throw httpError(400, "Missing projectId");
  const sb = db.getClient();

  const { data: existing } = await sb
    .from("project_versions")
    .select("version_number")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false })
    .limit(1);
  const nextNum = existing?.length ? existing[0].version_number + 1 : 1;

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
  } else if (Array.isArray(regenExistingInspirationPaths) && regenExistingInspirationPaths.length) {
    regenInspirationPaths = regenExistingInspirationPaths.filter(Boolean);
  }

  const { data, error } = await sb
    .from("project_versions")
    .insert({
      project_id: projectId,
      version_number: nextNum,
      design_brief: designBrief || null,
      regen_inspiration_paths: regenInspirationPaths
    })
    .select("id, project_id, version_number, design_brief, regen_inspiration_paths, created_at")
    .single();
  if (error) throw httpError(500, "Failed to create version: " + error.message);

  return { version: data };
}

async function projectLoadVersions(projectId, auth) {
  if (!projectId) throw httpError(400, "Missing projectId");
  await assertProjectAccess(projectId, auth);
  const sb = db.getClient();

  const [{ data: versions }, { data: insps }] = await Promise.all([
    sb.from("project_versions")
      .select("id, project_id, version_number, design_brief, regen_inspiration_paths, created_at")
      .eq("project_id", projectId)
      .order("version_number", { ascending: true }),
    sb.from("inspiration_images")
      .select("storage_path")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true }),
  ]);

  const versionIds = (versions || []).map((v) => v.id);
  const [allRendersRes, allBoqRes] = versionIds.length
    ? await Promise.all([
        sb.from("renders")
          .select("version_id, room_label, camera_pin_client_id, storage_path, created_at")
          .in("version_id", versionIds)
          .order("created_at", { ascending: true }),
        sb.from("boq_items")
          .select("version_id, category, item, qty, unit, rate, amount")
          .in("version_id", versionIds),
      ])
    : [{ data: [] }, { data: [] }];

  const rendersByVersion = {};
  const boqByVersion = {};
  for (const r of allRendersRes.data || []) {
    (rendersByVersion[r.version_id] = rendersByVersion[r.version_id] || []).push({
      ...r,
      url: publicStorageUrl("poligrid-renders", r.storage_path),
    });
  }
  for (const b of allBoqRes.data || []) {
    (boqByVersion[b.version_id] = boqByVersion[b.version_id] || []).push(b);
  }

  return {
    versions: (versions || []).map((v) => {
      const inspPaths = v.regen_inspiration_paths;
      const inspirationUrls = inspPaths
        ? inspPaths.map((p) => publicStorageUrl("poligrid-inspiration", p))
        : (insps || []).map((i) => publicStorageUrl("poligrid-inspiration", i.storage_path));
      return {
        ...v,
        renders: rendersByVersion[v.id] || [],
        boqItems: boqByVersion[v.id] || [],
        inspirationUrls: inspirationUrls.filter(Boolean),
      };
    }),
  };
}

async function projectSaveAnalysis(body, auth) {
  const { projectId, floorPlanBase64, fileName, analysis, context } = body;
  if (!projectId) throw httpError(400, "Missing projectId");
  const sb = db.getClient();

  const { data: existingProj } = await sb
    .from("projects")
    .select("id, created_by")
    .eq("id", projectId)
    .maybeSingle();
  if (existingProj) {
    await assertProjectAccess(projectId, auth, existingProj);
  }

  const createdBy = existingProj?.created_by ?? auth.profile.id;
  await db.upsertProject(projectId, {
    property_type: context?.propertyType,
    bhk: context?.bhk,
    total_area_m2: context?.totalAreaM2 || analysis?.totalAreaM2,
    notes: context?.notes,
    bhk_type: analysis?.bhkType,
    orientation: analysis?.orientation,
    summary: analysis?.summary,
    created_by: createdBy,
  });

  const storagePath = await db.uploadBase64(
    "poligrid-floor-plans",
    `${projectId}/floorplan.png`,
    floorPlanBase64,
    "image/png"
  );

  const { data: existingFp } = await sb
    .from("floor_plans")
    .select("id")
    .eq("project_id", projectId)
    .limit(1)
    .maybeSingle();
  let fpId;
  if (existingFp) {
    await sb.from("floor_plans").update({
      file_name: fileName || "floorplan.png",
      storage_path: storagePath,
      analysis_raw: analysis,
      analyzed_at: new Date().toISOString(),
    }).eq("id", existingFp.id);
    fpId = existingFp.id;
  } else {
    fpId = await db.insertRow("floor_plans", {
      project_id: projectId,
      file_name: fileName || "floorplan.png",
      storage_path: storagePath,
      analysis_raw: analysis,
      analyzed_at: new Date().toISOString(),
    });
  }

  const rooms = analysis?.rooms || [];
  if (rooms.length) {
    await db.replaceRows("rooms", { project_id: projectId }, rooms.map((r) => ({
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
      fp_placements: r.placements || null,
    })));
  }

  const boq = analysis?.globalBoq || [];
  if (boq.length) {
    await db.replaceRows("boq_items", { project_id: projectId, source: "floor_plan_analysis" }, boq.map((b) => ({
      project_id: projectId,
      source: "floor_plan_analysis",
      category: b.category,
      item: b.item,
      qty: b.qty,
      unit: b.unit,
      rate: b.rate,
      amount: b.amount,
    })));
  }

  return { ok: true };
}

async function projectSaveRooms(body) {
  const { projectId, rooms } = body;
  if (!projectId) throw httpError(400, "Missing projectId");

  await db.replaceRows("rooms", { project_id: projectId }, (rooms || []).map((r) => ({
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
    notes: r.notes,
    walls: r.walls || null,
    fp_placements: r.placements || null,
  })));

  return { ok: true };
}

async function projectSaveInspiration(body) {
  const { projectId, images } = body;
  if (!projectId) throw httpError(400, "Missing projectId");
  await db.upsertProject(projectId, {});
  const sb = db.getClient();

  const { data: existing } = await sb.from("inspiration_images")
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
      sort_order: offset + i,
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

  await db.replaceRows("furniture_placements", { project_id: projectId }, (placements || []).map((p) => ({
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
    const rows = (boqItems || []).map((b) => ({
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

  await db.replaceRows("boq_items", { project_id: projectId, source: "furniture_generated" }, (boqItems || []).map((b) => ({
    project_id: projectId,
    source: "furniture_generated",
    category: b.category,
    item: b.item,
    qty: b.qty,
    unit: b.unit,
    rate: b.rate,
    amount: b.amount
  })));

  return { ok: true };
}

async function projectUpdateBoq(body) {
  const { projectId, versionId, projectItems, versionItems } = body;
  if (!projectId) throw httpError(400, "Missing projectId");
  const sb = db.getClient();

  if (Array.isArray(projectItems)) {
    await db.replaceRows("boq_items", { project_id: projectId, source: "floor_plan_analysis" }, projectItems.map((b) => ({
      project_id: projectId,
      source: "floor_plan_analysis",
      category: b.category,
      item: b.item,
      qty: b.qty,
      unit: b.unit,
      rate: b.rate,
      amount: b.amount
    })));
  }

  if (versionId && Array.isArray(versionItems)) {
    const { error: delErr } = await sb.from("boq_items").delete().eq("version_id", versionId);
    if (delErr) console.error("[DB] Delete version BOQ failed:", delErr.message);
    if (versionItems.length) {
      const rows = versionItems.map((b) => ({
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
  const userId = auth.profile.id;
  const role = auth.profile.role;

  let query = sb.from("projects")
    .select("id, name, property_type, bhk, bhk_type, total_area_m2, summary, status, updated_at, created_by")
    .order("updated_at", { ascending: false });

  if (!FULL_ACCESS_ROLES.has(role)) {
    const { data: assigned } = await sb.from("project_assignments")
      .select("project_id")
      .eq("user_id", userId);
    const assignedIds = (assigned || []).map((a) => a.project_id).filter(Boolean);
    const orParts = [`created_by.eq.${userId}`];
    if (assignedIds.length) {
      orParts.push(`id.in.(${assignedIds.join(",")})`);
    }
    query = query.or(orParts.join(","));
  }

  const { data, error } = await query;
  if (error) throw httpError(500, "Failed to list projects: " + error.message);
  const projects = data || [];
  if (!projects.length) return { projects: [] };

  const ids = projects.map((p) => p.id);
  const { data: floorPlans } = await sb.from("floor_plans")
    .select("project_id, storage_path, created_at")
    .in("project_id", ids)
    .order("created_at", { ascending: false });

  const latestByProject = {};
  for (const fp of floorPlans || []) {
    if (!latestByProject[fp.project_id]) latestByProject[fp.project_id] = fp.storage_path;
  }

  return {
    projects: projects.map((p) => ({
      ...p,
      thumbnail_url: publicStorageUrl("poligrid-floor-plans", latestByProject[p.id]),
    })),
  };
}

async function projectLoad(id, auth) {
  if (!id) throw httpError(400, "Missing project id");
  const sb = db.getClient();

  const { data: project, error: projectError } = await sb
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (projectError) throw httpError(500, "Failed to load project: " + projectError.message);
  if (!project) throw httpError(404, "Project not found");
  await assertProjectAccess(id, auth, { id: project.id, created_by: project.created_by });

  const [
    { data: fps },
    { data: rooms },
    { data: cameraPins },
    { data: furniturePlacements },
    { data: boqItems },
    { data: inspirationImages },
  ] = await Promise.all([
    sb.from("floor_plans")
      .select("id, storage_path")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(1),
    sb.from("rooms").select("*").eq("project_id", id),
    sb.from("camera_pins").select("*").eq("project_id", id),
    sb.from("furniture_placements").select("*").eq("project_id", id),
    sb.from("boq_items")
      .select("category, item, qty, unit, rate, amount")
      .eq("project_id", id)
      .eq("source", "floor_plan_analysis"),
    sb.from("inspiration_images")
      .select("storage_path, sort_order")
      .eq("project_id", id)
      .order("sort_order", { ascending: true }),
  ]);

  const fp = fps && fps[0]
    ? { ...fps[0], url: publicStorageUrl("poligrid-floor-plans", fps[0].storage_path) }
    : null;

  return {
    project,
    floorPlan: fp,
    rooms: rooms || [],
    cameraPins: (cameraPins || []).map((p) => ({
      ...p,
      photo_url: publicStorageUrl("poligrid-pin-photos", p.photo_storage_path),
    })),
    furniturePlacements: furniturePlacements || [],
    boqItems: boqItems || [],
    inspirationImages: (inspirationImages || []).map((i) => ({
      ...i,
      url: publicStorageUrl("poligrid-inspiration", i.storage_path),
    })),
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

module.exports = {
  handleProjectAction,
  projectList,
  projectLoad,
  projectLoadVersions,
};
