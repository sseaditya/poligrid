"use strict";
// Vercel serverless entry point — handles all /api/* requests.
// All logic lives in server/* modules (same as server.js dev server).

const { readJson, sendJson, httpError } = require("../server/utils");
const { requireAuth, getAuthProfile }   = require("../server/auth");
const db                                = require("../db.js");

const {
  renderWithOpenAi,
  extractStyleWithOpenAi,
  extractFurnishStyleGuidance,
  generateStructuralBoqWithOpenAi,
  analyzeFloorPlanWithOpenAi,
  matchRoomImageWithOpenAi,
  suggestFurnitureWithOpenAi,
  autoPlaceFurnitureWithOpenAi,
  furnishRoomWithOpenAi,
  chatPlacementWithOpenAi,
  generateText,
} = require("../server/openai");

const {
  handleProjectAction,
  projectList,
  projectLoad,
  projectLoadVersions,
  salesProjectList,
  projectUpdateStatus,
  projectUpdatePhase,
  projectToggleOnHold,
  projectUpdatePhaseFlag,
  projectCreate,
  projectAdvancePayment,
  projectDetail,
  projectUpdate,
  projectListAvailable,
} = require("../server/projects");

const {
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
} = require("../server/drawings");

const { tasksList, taskCreate, taskUpdate } = require("../server/tasks");

const {
  materialRequestsList,
  materialRequestGet,
  materialRequestCreate,
  materialRequestItemUpsert,
  materialRequestItemDelete,
  materialRequestSubmit,
  materialRequestReview,
  materialRequestItemMarkProcured,
  materialRequestSubmitPricing,
  materialRequestApprovePricing,
  materialRequestItemUpdateOrderStatus,
  materialRequestCategories,
  materialRequestSummary,
  materialRequestAdminQueue,
} = require("../server/material_requests");

const {
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
} = require("../server/admin");
const { auditLogsList } = require("../server/audit");
const {
  vendorsList,
  vendorGet,
  vendorCreate,
  vendorUpdate,
  vendorDelete,
} = require("../server/vendors");
const { materialRequestItemSetVendor } = require("../server/material_requests");

// ─────────────────────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  try {
    const url = new URL(req.url || "/", `https://${req.headers.host || "localhost"}`);
    const { pathname } = url;

    // ── Config ──────────────────────────────────────────────────────────────
    if (req.method === "GET" && pathname === "/api/config") {
      return sendJson(res, 200, {
        supabaseUrl:     process.env.SUPABASE_URL,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
      });
    }

    // ── Auth ────────────────────────────────────────────────────────────────
    if (req.method === "GET" && pathname === "/api/auth/me") {
      const auth = await requireAuth(req);
      return sendJson(res, 200, { profile: auth.profile });
    }

    // ── Profile ─────────────────────────────────────────────────────────────
    if (req.method === "POST" && pathname === "/api/profile/update") {
      const { user } = await requireAuth(req);
      const { full_name, phone } = await readJson(req);
      if (!full_name || !full_name.trim()) return sendJson(res, 400, { error: "Name is required." });
      const sb = db.getClient();
      const { data: updated, error } = await sb.from("profiles")
        .update({ full_name: full_name.trim(), phone: (phone || "").trim() || null })
        .eq("id", user.id).select().single();
      if (error) return sendJson(res, 500, { error: error.message });
      return sendJson(res, 200, { profile: updated });
    }
    if (req.method === "GET" && pathname === "/api/profile/by-slug") {
      await requireAuth(req, ["admin"]);
      const slug = url.searchParams.get("slug") || "";
      const sb = db.getClient();
      const { data: users, error } = await sb.from("profiles").select("*");
      if (error) return sendJson(res, 500, { error: error.message });
      const emailToSlug = e => e.split("@")[0].toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const found = (users || []).find(u => emailToSlug(u.email) === slug);
      if (!found) return sendJson(res, 404, { error: "User not found." });
      return sendJson(res, 200, { profile: found });
    }

    // ── AI / Render ─────────────────────────────────────────────────────────
    if (req.method === "POST" && pathname === "/api/render/openai") {
      return sendJson(res, 200, await renderWithOpenAi(await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/style/extract") {
      return sendJson(res, 200, await extractStyleWithOpenAi(await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/analyze/floorplan") {
      return sendJson(res, 200, await analyzeFloorPlanWithOpenAi(await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/analyze/room-image") {
      return sendJson(res, 200, await matchRoomImageWithOpenAi(await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/furniture/suggest") {
      return sendJson(res, 200, await suggestFurnitureWithOpenAi(await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/furniture/autoplace") {
      return sendJson(res, 200, await autoPlaceFurnitureWithOpenAi(await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/furnish-room") {
      return sendJson(res, 200, await furnishRoomWithOpenAi(await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/chat/placement") {
      return sendJson(res, 200, await chatPlacementWithOpenAi(await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/inspire/extract-furnish-style") {
      return sendJson(res, 200, await extractFurnishStyleGuidance(await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/generate-text") {
      return sendJson(res, 200, await generateText(await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/project/generate-boq") {
      return sendJson(res, 200, await generateStructuralBoqWithOpenAi(await readJson(req)));
    }

    // ── Projects ─────────────────────────────────────────────────────────────
    if (req.method === "GET" && pathname === "/api/project/list") {
      const auth = await getAuthProfile(req);
      return sendJson(res, 200, await projectList(auth));
    }
    if (req.method === "GET" && pathname === "/api/project/available") {
      return sendJson(res, 200, await projectListAvailable(req));
    }
    if (req.method === "GET" && pathname === "/api/project/load") {
      return sendJson(res, 200, await projectLoad(url.searchParams.get("id")));
    }
    if (req.method === "GET" && pathname === "/api/project/versions") {
      return sendJson(res, 200, await projectLoadVersions(url.searchParams.get("id")));
    }
    if (req.method === "GET" && pathname === "/api/project/detail") {
      return sendJson(res, 200, await projectDetail(req, url.searchParams.get("id")));
    }
    if (req.method === "POST" && pathname === "/api/project/create") {
      return sendJson(res, 200, await projectCreate(req, await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/project/update") {
      return sendJson(res, 200, await projectUpdate(req, await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/project/update-status") {
      const auth = await getAuthProfile(req);
      return sendJson(res, 200, await projectUpdateStatus(await readJson(req), auth));
    }
    if (req.method === "POST" && pathname === "/api/project/update-phase") {
      const auth = await requireAuth(req, ["admin"]);
      return sendJson(res, 200, await projectUpdatePhase(await readJson(req), auth));
    }
    if (req.method === "POST" && pathname === "/api/project/toggle-on-hold") {
      const auth = await requireAuth(req, ["admin"]);
      return sendJson(res, 200, await projectToggleOnHold(await readJson(req), auth));
    }
    if (req.method === "POST" && pathname === "/api/project/update-phase-flag") {
      return sendJson(res, 200, await projectUpdatePhaseFlag(req, await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/project/advance-payment") {
      return sendJson(res, 200, await projectAdvancePayment(req, await readJson(req)));
    }

    // ── Project team (must be before the catch-all below) ────────────────────
    if (req.method === "GET" && pathname === "/api/project/team") {
      return sendJson(res, 200, await projectTeamGet(req, url.searchParams.get("id")));
    }
    if (req.method === "POST" && pathname === "/api/project/assign-user") {
      return sendJson(res, 200, await projectAssignUser(req, await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/project/unassign-user") {
      return sendJson(res, 200, await projectUnassignUser(req, await readJson(req)));
    }

    // ── Project action catch-all (legacy fitout planner actions) ─────────────
    if (req.method === "POST" && pathname.startsWith("/api/project/")) {
      const auth   = await getAuthProfile(req);
      const body   = await readJson(req);
      const action = pathname.slice("/api/project/".length);
      return sendJson(res, 200, await handleProjectAction(action, body, auth));
    }

    // ── Sales ────────────────────────────────────────────────────────────────
    if (req.method === "GET" && pathname === "/api/sales/projects") {
      const auth = await requireAuth(req, ["sales", "admin", "ceo"]);
      return sendJson(res, 200, await salesProjectList(auth));
    }

    // ── Drawings ────────────────────────────────────────────────────────────
    if (req.method === "GET" && pathname === "/api/drawings/list") {
      return sendJson(res, 200, await drawingsList(req, url.searchParams.get("projectId")));
    }
    if (req.method === "GET" && pathname === "/api/drawings/pending") {
      return sendJson(res, 200, await drawingsPending(req));
    }
    if (req.method === "GET" && pathname === "/api/drawings/signed-url") {
      return sendJson(res, 200, await drawingSignedUrl(req, url.searchParams.get("path")));
    }
    if (req.method === "POST" && pathname === "/api/drawings/signed-urls") {
      return sendJson(res, 200, await drawingSignedUrlBatch(req, (await readJson(req)).filePaths));
    }
    if (req.method === "GET" && pathname === "/api/drawings/download") {
      return drawingDownload(req, res, url.searchParams.get("path"), url.searchParams.get("name"));
    }
    if (req.method === "GET" && pathname === "/api/drawings/download-zip") {
      return drawingDownloadZip(req, res, url.searchParams.get("projectId"));
    }
    if (req.method === "POST" && pathname === "/api/drawings/upload") {
      return sendJson(res, 200, await drawingUpload(req, await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/drawings/review") {
      return sendJson(res, 200, await drawingReview(req, await readJson(req)));
    }
    if (req.method === "GET" && pathname === "/api/drawings/assignments") {
      return sendJson(res, 200, await drawingAssignmentsList(req, {
        projectId: url.searchParams.get("projectId"),
        mineOnly: url.searchParams.get("mine") === "1",
      }));
    }
    if (req.method === "POST" && pathname === "/api/drawings/assignments/upsert") {
      return sendJson(res, 200, await drawingAssignmentUpsert(req, await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/drawings/assignments/delete") {
      return sendJson(res, 200, await drawingAssignmentDelete(req, await readJson(req)));
    }
    if (req.method === "GET" && pathname === "/api/drawings/revision-requests") {
      return sendJson(res, 200, await drawingsRevisionRequests(req));
    }
    if (req.method === "GET" && pathname === "/api/drawings/project-summary") {
      const ids = (url.searchParams.get("projectIds") || "").split(",").filter(Boolean);
      return sendJson(res, 200, await drawingProjectSummary(req, ids));
    }

    // ── Tasks ────────────────────────────────────────────────────────────────
    if (req.method === "GET" && pathname === "/api/tasks/list") {
      return sendJson(res, 200, await tasksList(req, url.searchParams));
    }
    if (req.method === "POST" && pathname === "/api/tasks/create") {
      return sendJson(res, 200, await taskCreate(req, await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/tasks/update") {
      return sendJson(res, 200, await taskUpdate(req, await readJson(req)));
    }

    // ── Users / Admin ────────────────────────────────────────────────────────
    if (req.method === "GET" && pathname === "/api/users/list") {
      return sendJson(res, 200, await usersList(req));
    }
    if (req.method === "POST" && pathname === "/api/users/update-role") {
      return sendJson(res, 200, await userUpdateRole(req, await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/users/invite") {
      return sendJson(res, 200, await userInvite(req, await readJson(req)));
    }
    if (req.method === "GET" && pathname === "/api/users/invitations") {
      return sendJson(res, 200, await invitationsList(req));
    }
    if (req.method === "POST" && pathname === "/api/users/invitations/cancel") {
      return sendJson(res, 200, await invitationCancel(req, await readJson(req)));
    }

    // ── CEO dashboard ────────────────────────────────────────────────────────
    if (req.method === "GET" && pathname === "/api/ceo/dashboard") {
      return sendJson(res, 200, await ceoDashboard(req));
    }
    if (req.method === "GET" && pathname === "/api/ceo/team-stats") {
      return sendJson(res, 200, await teamStats(req));
    }
    if (req.method === "GET" && pathname === "/api/audit/logs") {
      return sendJson(res, 200, await auditLogsList(req, {
        projectId: url.searchParams.get("projectId"),
        limit: url.searchParams.get("limit"),
      }));
    }

    // ── Material Requests ────────────────────────────────────────────────────
    if (req.method === "GET" && pathname === "/api/material-requests/categories") {
      return sendJson(res, 200, materialRequestCategories());
    }
    if (req.method === "GET" && pathname === "/api/material-requests/list") {
      return sendJson(res, 200, await materialRequestsList(req, url.searchParams.get("projectId")));
    }
    if (req.method === "GET" && pathname === "/api/material-requests/get") {
      return sendJson(res, 200, await materialRequestGet(req, url.searchParams.get("id")));
    }
    if (req.method === "GET" && pathname === "/api/material-requests/summary") {
      const ids = (url.searchParams.get("projectIds") || "").split(",").filter(Boolean);
      return sendJson(res, 200, await materialRequestSummary(req, ids));
    }
    if (req.method === "GET" && pathname === "/api/material-requests/admin-queue") {
      return sendJson(res, 200, await materialRequestAdminQueue(req));
    }
    if (req.method === "POST" && pathname === "/api/material-requests/create") {
      return sendJson(res, 200, await materialRequestCreate(req, await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/material-requests/items/upsert") {
      return sendJson(res, 200, await materialRequestItemUpsert(req, await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/material-requests/items/delete") {
      return sendJson(res, 200, await materialRequestItemDelete(req, await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/material-requests/submit") {
      return sendJson(res, 200, await materialRequestSubmit(req, await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/material-requests/review") {
      return sendJson(res, 200, await materialRequestReview(req, await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/material-requests/items/mark-procured") {
      return sendJson(res, 200, await materialRequestItemMarkProcured(req, await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/material-requests/submit-pricing") {
      return sendJson(res, 200, await materialRequestSubmitPricing(req, await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/material-requests/approve-pricing") {
      return sendJson(res, 200, await materialRequestApprovePricing(req, await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/material-requests/items/update-order-status") {
      return sendJson(res, 200, await materialRequestItemUpdateOrderStatus(req, await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/material-requests/items/set-vendor") {
      return sendJson(res, 200, await materialRequestItemSetVendor(req, await readJson(req)));
    }

    // ── Vendors ──────────────────────────────────────────────────────────────
    if (req.method === "GET" && pathname === "/api/vendors/list") {
      return sendJson(res, 200, await vendorsList(req, url.searchParams));
    }
    if (req.method === "GET" && pathname === "/api/vendors/get") {
      return sendJson(res, 200, await vendorGet(req, url.searchParams.get("id")));
    }
    if (req.method === "POST" && pathname === "/api/vendors/create") {
      return sendJson(res, 200, await vendorCreate(req, await readJson(req)));
    }
    if (req.method === "PATCH" && pathname === "/api/vendors/update") {
      return sendJson(res, 200, await vendorUpdate(req, await readJson(req)));
    }
    if (req.method === "POST" && pathname === "/api/vendors/delete") {
      return sendJson(res, 200, await vendorDelete(req, await readJson(req)));
    }

    return sendJson(res, 404, { error: "Not found." });

  } catch (error) {
    const message = error?.message || "Server error";
    const status  = Number(error?.statusCode) || 500;
    console.error("[API]", status, message, error?.stack || "");
    return sendJson(res, status, { error: message });
  }
};
