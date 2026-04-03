"use strict";

const { getClient } = require("../db");
const { httpError } = require("./utils");

// ─── Extract Bearer token from Authorization header ───────────────────────────
function extractToken(req) {
  const auth = req.headers["authorization"] || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

// ─── Validate token, return { user, profile } or throw ───────────────────────
async function requireAuth(req, allowedRoles) {
  const token = extractToken(req);
  if (!token) throw httpError(401, "Authentication required.");

  const sb = getClient();
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) throw httpError(401, "Invalid or expired session.");

  const { data: profile, error: profileError } = await sb
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) throw httpError(401, "User profile not found.");
  if (!profile.is_active) throw httpError(403, "Account is deactivated.");

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    throw httpError(403, `Role '${profile.role}' is not allowed for this action.`);
  }

  return { user, profile };
}

// ─── Non-throwing version — returns null if not authenticated ────────────────
async function getAuthProfile(req) {
  try { return await requireAuth(req); } catch { return null; }
}

module.exports = { requireAuth, getAuthProfile, extractToken };
