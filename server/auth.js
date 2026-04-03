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

  if (profileError || !profile) {
    // Auto-create profile for any Google OAuth user on first login
    const { data: newProfile, error: upsertError } = await sb.from("profiles").upsert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || user.email.split("@")[0],
      role: "sales",
      is_active: true,
    }, { onConflict: "id" }).select().single();
    if (upsertError || !newProfile) throw httpError(500, "Could not create user profile.");
    return { user, profile: newProfile };
  }

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
