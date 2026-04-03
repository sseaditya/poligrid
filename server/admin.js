"use strict";

const db = require("../db");
const { requireAuth } = require("./auth");
const { httpError } = require("./utils");

// ─── List all user profiles ───────────────────────────────────────────────────
async function usersList(req) {
  await requireAuth(req, ["admin", "ceo"]);
  const sb = db.getClient();
  const { data, error } = await sb
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw httpError(500, error.message);
  return { users: data };
}

// ─── Update a user's role or active status ────────────────────────────────────
async function userUpdateRole(req, body) {
  const { profile: admin } = await requireAuth(req, ["admin"]);
  const { userId, role, isActive } = body;
  if (!userId) throw httpError(400, "userId required.");
  if (userId === admin.id) throw httpError(400, "Cannot change your own role here.");

  const updates = {};
  if (role !== undefined) updates.role = role;
  if (isActive !== undefined) updates.is_active = isActive;
  if (!Object.keys(updates).length) throw httpError(400, "Nothing to update.");

  const sb = db.getClient();
  const { error } = await sb.from("profiles").update(updates).eq("id", userId);
  if (error) throw httpError(500, error.message);
  return { ok: true };
}

// ─── Get team members for a project ──────────────────────────────────────────
async function projectTeamGet(req, projectId) {
  await requireAuth(req, ["admin", "ceo", "lead_designer"]);
  if (!projectId) throw httpError(400, "projectId required.");
  const sb = db.getClient();
  const { data, error } = await sb
    .from("project_assignments")
    .select("*, profile:profiles(id, full_name, email, role)")
    .eq("project_id", projectId);
  if (error) throw httpError(500, error.message);
  return { team: data };
}

// ─── Assign a user to a project ───────────────────────────────────────────────
async function projectAssignUser(req, body) {
  const { profile } = await requireAuth(req, ["admin", "lead_designer"]);
  const { projectId, userId } = body;
  if (!projectId || !userId) throw httpError(400, "projectId, userId required.");
  const sb = db.getClient();
  const { error } = await sb.from("project_assignments").upsert(
    { project_id: projectId, user_id: userId, assigned_by: profile.id },
    { onConflict: "project_id,user_id" }
  );
  if (error) throw httpError(500, error.message);
  return { ok: true };
}

// ─── Remove a user from a project ─────────────────────────────────────────────
async function projectUnassignUser(req, body) {
  await requireAuth(req, ["admin"]);
  const { projectId, userId } = body;
  if (!projectId || !userId) throw httpError(400, "projectId, userId required.");
  const sb = db.getClient();
  const { error } = await sb
    .from("project_assignments")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw httpError(500, error.message);
  return { ok: true };
}

// ─── CEO dashboard — aggregated per-project view ─────────────────────────────
async function ceoDashboard(req) {
  await requireAuth(req, ["admin", "ceo"]);
  const sb = db.getClient();
  const { data, error } = await sb
    .from("ceo_project_dashboard")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw httpError(500, error.message);
  return { projects: data };
}

// ─── CEO team stats — counts by role + pending queues ─────────────────────────
async function teamStats(req) {
  await requireAuth(req, ["admin", "ceo"]);
  const sb = db.getClient();

  const [
    { data: byRole },
    { data: pendingTasks },
    { data: pendingDrawings },
    { data: totalProjects },
  ] = await Promise.all([
    sb.from("profiles").select("role").eq("is_active", true),
    sb.from("tasks").select("id").eq("status", "pending"),
    sb.from("drawings").select("id").eq("status", "pending_review"),
    sb.from("projects").select("id"),
  ]);

  const roleCount = {};
  for (const p of (byRole || [])) roleCount[p.role] = (roleCount[p.role] || 0) + 1;

  return {
    roleCount,
    pendingTasksTotal: (pendingTasks || []).length,
    pendingDrawingsTotal: (pendingDrawings || []).length,
    totalProjects: (totalProjects || []).length,
  };
}

module.exports = {
  usersList,
  userUpdateRole,
  projectTeamGet,
  projectAssignUser,
  projectUnassignUser,
  ceoDashboard,
  teamStats,
};
