"use strict";

const db = require("../db");
const { requireAuth } = require("./auth");
const { httpError } = require("./utils");
const { logAuditEvent } = require("./audit");

const VALID_ROLES = ["sales", "designer", "lead_designer", "admin", "ceo"];

// ─── Invite a new user by email ───────────────────────────────────────────────
async function userInvite(req, body) {
  const { profile: admin } = await requireAuth(req, ["admin"]);
  const { email, role, fullName } = body;
  if (!email || !email.includes("@")) throw httpError(400, "Valid email required.");
  if (!role || !VALID_ROLES.includes(role)) throw httpError(400, `Role must be one of: ${VALID_ROLES.join(", ")}.`);

  const sb = db.getClient();
  const normalizedEmail = email.toLowerCase().trim();

  // Pre-create user in Supabase auth with role in user_metadata.
  // This makes the invite work for users who have never logged in before —
  // when they sign in via Google OAuth, requireAuth reads user_metadata.role
  // to create their profile automatically.
  const { error: createErr } = await sb.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: true,
    user_metadata: { role, full_name: fullName || normalizedEmail.split("@")[0] },
  });
  if (createErr && !createErr.message?.toLowerCase().includes("already registered")) {
    console.warn("[invite] auth.admin.createUser:", createErr.message);
  }

  // Also store in invitations table as a record and fallback
  const { error } = await sb.from("invitations").upsert(
    { email: normalizedEmail, role, full_name: fullName || null, invited_by: admin.id },
    { onConflict: "email" }
  );
  if (error) throw httpError(500, error.message);
  return { ok: true };
}

// ─── List all user profiles ───────────────────────────────────────────────────
async function usersList(req) {
  const { profile } = await requireAuth(req, ["admin", "ceo", "lead_designer"]);
  const sb = db.getClient();
  // Lead designers only need to see designers (for drawing/team assignment)
  let query = sb.from("profiles").select("*").order("created_at", { ascending: true });
  if (profile.role === "lead_designer") query = query.eq("role", "designer");
  const { data, error } = await query;
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

  // Fetch prior state for audit diff
  const { data: target } = await sb.from("profiles").select("full_name, role, is_active").eq("id", userId).maybeSingle();

  const { error } = await sb.from("profiles").update(updates).eq("id", userId);
  if (error) throw httpError(500, error.message);

  if (role !== undefined && target?.role !== role) {
    await logAuditEvent({
      category: "admin",
      subcategory: "role_change",
      actionedBy: admin.id,
      actionedByName: admin.full_name,
      logMessage: `${admin.full_name} changed ${target?.full_name || userId}'s role from ${target?.role || "?"} to ${role}.`,
      metadata: { targetUserId: userId, fromRole: target?.role, toRole: role },
    });
  }

  if (isActive !== undefined && target?.is_active !== isActive) {
    await logAuditEvent({
      category: "admin",
      subcategory: isActive ? "user_activated" : "user_deactivated",
      actionedBy: admin.id,
      actionedByName: admin.full_name,
      logMessage: `${admin.full_name} ${isActive ? "activated" : "deactivated"} ${target?.full_name || userId}.`,
      metadata: { targetUserId: userId },
    });
  }

  return { ok: true };
}

// ─── Get team members for a project ──────────────────────────────────────────
async function projectTeamGet(req, projectId) {
  await requireAuth(req, ["admin", "ceo", "lead_designer"]);
  if (!projectId) throw httpError(400, "projectId required.");
  const sb = db.getClient();
  const { data, error } = await sb
    .from("project_assignments")
    .select("*, profile:profiles!user_id(id, full_name, email, role)")
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

  const [{ data: existing }, { data: project }, { data: assignee }] = await Promise.all([
    sb.from("project_assignments").select("id").eq("project_id", projectId).eq("user_id", userId).maybeSingle(),
    sb.from("projects").select("name").eq("id", projectId).maybeSingle(),
    sb.from("profiles").select("id, full_name, role").eq("id", userId).maybeSingle(),
  ]);

  const { error } = await sb.from("project_assignments").upsert(
    { project_id: projectId, user_id: userId, assigned_by: profile.id },
    { onConflict: "project_id,user_id" }
  );
  if (error) {
    console.error("[projectAssignUser]", error.message);
    throw httpError(500, error.message);
  }

  if (!existing) {
    await logAuditEvent({
      category: "design",
      subcategory: "team_assignment",
      projectId,
      actionedBy: profile.id,
      actionedByName: profile.full_name,
      logMessage: `${profile.full_name} assigned ${assignee?.full_name || "team member"} to ${project?.name || "project"} team.`,
      metadata: { assignedUserId: userId, assignedUserRole: assignee?.role || null },
    });

    if (profile.role === "lead_designer" && profile.id === userId) {
      await logAuditEvent({
        category: "design",
        subcategory: "lead_designer_took_up_project",
        projectId,
        actionedBy: profile.id,
        actionedByName: profile.full_name,
        logMessage: `${profile.full_name} took up project ${project?.name || "project"} as lead designer.`,
      });
    }
  }

  return { ok: true };
}

// ─── Remove a user from a project ─────────────────────────────────────────────
async function projectUnassignUser(req, body) {
  const { profile } = await requireAuth(req, ["admin", "lead_designer"]);
  const { projectId, userId } = body;
  if (!projectId || !userId) throw httpError(400, "projectId, userId required.");
  const sb = db.getClient();

  // Fetch context before deletion so we can write a meaningful audit entry
  const [{ data: project }, { data: removedUser }] = await Promise.all([
    sb.from("projects").select("name").eq("id", projectId).maybeSingle(),
    sb.from("profiles").select("id, full_name, role").eq("id", userId).maybeSingle(),
  ]);

  const { error } = await sb
    .from("project_assignments")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw httpError(500, error.message);

  await logAuditEvent({
    category: "design",
    subcategory: "team_removal",
    projectId,
    actionedBy: profile.id,
    actionedByName: profile.full_name,
    logMessage: `${profile.full_name} removed ${removedUser?.full_name || "team member"} from ${project?.name || "project"} team.`,
    metadata: { removedUserId: userId, removedUserRole: removedUser?.role || null },
  });

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

// ─── List pending invitations ─────────────────────────────────────────────────
async function invitationsList(req) {
  await requireAuth(req, ["admin"]);
  const sb = db.getClient();
  const { data, error } = await sb
    .from("invitations")
    .select("email, role, full_name, invited_at")
    .order("invited_at", { ascending: false });
  if (error) throw httpError(500, error.message);
  return { invitations: data };
}

// ─── Cancel a pending invitation ─────────────────────────────────────────────
async function invitationCancel(req, body) {
  await requireAuth(req, ["admin"]);
  const { email } = body;
  if (!email) throw httpError(400, "email required.");
  const sb = db.getClient();
  const { error } = await sb.from("invitations").delete().eq("email", email);
  if (error) throw httpError(500, error.message);
  return { ok: true };
}

module.exports = {
  userInvite,
  usersList,
  userUpdateRole,
  invitationsList,
  invitationCancel,
  projectTeamGet,
  projectAssignUser,
  projectUnassignUser,
  ceoDashboard,
  teamStats,
};
