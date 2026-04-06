"use strict";

const { getClient } = require("../db");
const { httpError } = require("./utils");

const VALID_ROLES = ["admin", "sales", "designer", "lead_designer", "ceo"];

// ─── Extract Bearer token from Authorization header ───────────────────────────
function extractToken(req) {
  const auth = req.headers["authorization"] || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

// ─── Validate token, return {user, profile} or throw ───────────────────────
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

  // Helper: look up invite record + user_metadata to get intended role for this email
  async function resolveInvite() {
    const { data: invite } = await sb
      .from("invitations")
      .select("role, full_name")
      .eq("email", user.email)
      .maybeSingle();
    const metaRole = user.user_metadata?.role;
    const role = invite?.role || (metaRole && VALID_ROLES.includes(metaRole) ? metaRole : null);
    const fullName = invite?.full_name || user.user_metadata?.full_name || null;
    return { invite, role, fullName };
  }

  // Profile not found — can happen if trigger is disabled or failed
  if (profileError || !profile) {
    const { invite, role, fullName } = await resolveInvite();
    if (!role) throw httpError(403, "not_invited");

    const { data: newProfile, error: upsertError } = await sb.from("profiles").upsert({
      id: user.id, email: user.email,
      full_name: fullName || user.email.split("@")[0],
      role, is_active: true,
    }, { onConflict: "id" }).select().single();
    if (upsertError || !newProfile) throw httpError(500, "Could not create user profile.");

    if (invite) await sb.from("invitations").delete().eq("email", user.email);
    return { user, profile: newProfile };
  }

  // Profile exists but is inactive.
  // The DB trigger auto-creates profiles with is_active=false for all new sign-ins.
  // Invited users arrive here — activate them with the correct role from the invitation.
  if (!profile.is_active) {
    const { invite, role, fullName } = await resolveInvite();
    if (!role) throw httpError(403, "account_inactive");

    const { data: activatedProfile, error: updateErr } = await sb.from("profiles")
      .update({
        role,
        full_name: fullName || profile.full_name,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select()
      .single();
    if (updateErr || !activatedProfile) throw httpError(500, "Could not activate user profile.");

    if (invite) await sb.from("invitations").delete().eq("email", user.email);
    return { user, profile: activatedProfile };
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
