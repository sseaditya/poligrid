"use strict";

const db = require("../db");
const { requireAuth } = require("./auth");
const { httpError } = require("./utils");

// ─── List tasks ───────────────────────────────────────────────────────────────
// Admin/CEO can pass ?userId= to see another user's tasks.
// Everyone else sees only their own.
async function tasksList(req, searchParams) {
  const { profile } = await requireAuth(req);
  const sb = db.getClient();

  let query = sb
    .from("tasks")
    .select(`
      *,
      project:projects(id, name),
      drawing:drawings(id, title, drawing_type),
      assigner:profiles!assigned_by(full_name)
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  const isAdmin = ["admin", "ceo"].includes(profile.role);
  const filterUserId = searchParams?.get("userId");

  if (isAdmin && filterUserId) {
    query = query.eq("assigned_to", filterUserId);
  } else if (!isAdmin) {
    query = query.eq("assigned_to", profile.id);
  }

  const statusFilter = searchParams?.get("status");
  if (statusFilter) query = query.eq("status", statusFilter);

  const projectFilter = searchParams?.get("projectId");
  if (projectFilter) query = query.eq("project_id", projectFilter);

  const { data, error } = await query;
  if (error) throw httpError(500, error.message);
  return { tasks: data };
}

// ─── Create a task ────────────────────────────────────────────────────────────
async function taskCreate(req, body) {
  const { profile } = await requireAuth(req, ["admin", "lead_designer"]);
  const { assignedTo, projectId, drawingId, title, description, priority, dueDate } = body;
  if (!assignedTo || !title) throw httpError(400, "assignedTo, title required.");

  const sb = db.getClient();
  const { data, error } = await sb
    .from("tasks")
    .insert({
      assigned_to: assignedTo,
      assigned_by: profile.id,
      project_id: projectId || null,
      drawing_id: drawingId || null,
      title,
      description: description || null,
      priority: priority || "medium",
      due_date: dueDate || null,
    })
    .select("id")
    .single();

  if (error) throw httpError(500, error.message);
  return { taskId: data.id };
}

// ─── Update a task's status ───────────────────────────────────────────────────
async function taskUpdate(req, body) {
  const { profile } = await requireAuth(req);
  const { taskId, status } = body;
  if (!taskId || !status) throw httpError(400, "taskId, status required.");

  const sb = db.getClient();
  const updates = { status };
  if (status === "completed") updates.completed_at = new Date().toISOString();

  let q = sb.from("tasks").update(updates).eq("id", taskId);
  // Non-admin users can only update tasks assigned to them
  if (!["admin"].includes(profile.role)) q = q.eq("assigned_to", profile.id);
  const { error } = await q;
  if (error) throw httpError(500, error.message);
  return { ok: true };
}

module.exports = { tasksList, taskCreate, taskUpdate };
