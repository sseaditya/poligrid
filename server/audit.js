"use strict";

const db = require("../db");
const { requireAuth } = require("./auth");
const { httpError } = require("./utils");

const ADMIN_ROLES = new Set(["admin", "ceo"]);

function roleScope(role) {
  return ADMIN_ROLES.has(role) ? "all" : "own";
}

function safeLimit(rawLimit) {
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed) || parsed <= 0) return 300;
  return Math.min(Math.floor(parsed), 1000);
}

async function logAuditEvent({
  category,
  subcategory,
  projectId,
  logMessage,
  actionedBy,
  actionedByName,
  actionedOn,
  metadata,
}) {
  if (!category || !subcategory || !logMessage) return { ok: false, skipped: true };

  try {
    const sb = db.getClient();
    const payload = {
      category,
      subcategory,
      project_id: projectId || null,
      log_message: logMessage,
      actioned_by: actionedBy || null,
      actioned_by_name: actionedByName || null,
      actioned_on: actionedOn || new Date().toISOString(),
      metadata: metadata || null,
    };

    const { error } = await sb.from("audit_logs").insert(payload);
    if (error) {
      console.error("[audit] insert failed:", error.message);
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (err) {
    console.error("[audit] insert exception:", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

async function auditLogsList(req, opts = {}) {
  const { profile } = await requireAuth(req);
  const sb = db.getClient();

  const projectId = opts.projectId || null;
  const limit = safeLimit(opts.limit);

  let query = sb
    .from("audit_logs")
    .select(`
      id,
      category,
      subcategory,
      project_id,
      log_message,
      actioned_by,
      actioned_by_name,
      actioned_on,
      metadata,
      project:projects(id, name, client_name)
    `)
    .order("actioned_on", { ascending: false })
    .limit(limit);

  if (projectId) query = query.eq("project_id", projectId);

  if (!ADMIN_ROLES.has(profile.role)) {
    query = query.eq("actioned_by", profile.id);
  }

  const { data, error } = await query;
  if (error) throw httpError(500, error.message);

  return {
    logs: data || [],
    scope: roleScope(profile.role),
    role: profile.role,
    projectId,
  };
}

module.exports = {
  logAuditEvent,
  auditLogsList,
};
