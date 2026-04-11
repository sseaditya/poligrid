"use strict";

const http = require("http");
const path = require("path");

const { ROOT, PORT, loadEnvFile }               = require("./server/config");
const { readJson, sendJson, serveStatic }        = require("./server/utils");
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
  generateText
} = require("./server/openai");
const {
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
} = require("./server/projects");
const { requireAuth, getAuthProfile } = require("./server/auth");
const {
  drawingsList, drawingsPending, drawingSignedUrl, drawingSignedUrlBatch,
  drawingDownload, drawingDownloadZip,
  drawingUpload, drawingReview,
  drawingAssignmentsList, drawingAssignmentUpsert, drawingAssignmentDelete,
  drawingsRevisionRequests, drawingProjectSummary,
} = require("./server/drawings");
const { tasksList, taskCreate, taskUpdate } = require("./server/tasks");
const {
  userInvite, usersList, userUpdateRole,
  invitationsList, invitationCancel,
  projectTeamGet, projectAssignUser, projectUnassignUser,
  ceoDashboard, teamStats
} = require("./server/admin");
const { auditLogsList } = require("./server/audit");

loadEnvFile(path.join(ROOT, ".env.local"));

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "POST" && url.pathname === "/api/render/openai") {
      return sendJson(res, 200, await renderWithOpenAi(await readJson(req)));
    }
    if (req.method === "POST" && url.pathname === "/api/style/extract") {
      return sendJson(res, 200, await extractStyleWithOpenAi(await readJson(req)));
    }
    if (req.method === "POST" && url.pathname === "/api/inspire/extract-furnish-style") {
      return sendJson(res, 200, await extractFurnishStyleGuidance(await readJson(req)));
    }
    if (req.method === "POST" && url.pathname === "/api/project/generate-boq") {
      return sendJson(res, 200, await generateStructuralBoqWithOpenAi(await readJson(req)));
    }
    if (req.method === "POST" && url.pathname === "/api/analyze/floorplan") {
      return sendJson(res, 200, await analyzeFloorPlanWithOpenAi(await readJson(req)));
    }
    if (req.method === "POST" && url.pathname === "/api/analyze/room-image") {
      return sendJson(res, 200, await matchRoomImageWithOpenAi(await readJson(req)));
    }
    if (req.method === "POST" && url.pathname === "/api/furniture/suggest") {
      return sendJson(res, 200, await suggestFurnitureWithOpenAi(await readJson(req)));
    }
    if (req.method === "POST" && url.pathname === "/api/furniture/autoplace") {
      return sendJson(res, 200, await autoPlaceFurnitureWithOpenAi(await readJson(req)));
    }
    if (req.method === "POST" && url.pathname === "/api/furnish-room") {
      return sendJson(res, 200, await furnishRoomWithOpenAi(await readJson(req)));
    }
    if (req.method === "POST" && url.pathname === "/api/chat/placement") {
      return sendJson(res, 200, await chatPlacementWithOpenAi(await readJson(req)));
    }
    if (req.method === "POST" && url.pathname === "/api/generate-text") {
      return sendJson(res, 200, await generateText(await readJson(req)));
    }
    // ── Config (public — exposes anon key for client-side Supabase Auth) ──────
    if (req.method === "GET" && url.pathname === "/api/config") {
      return sendJson(res, 200, {
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
      });
    }

    // ── Auth ──────────────────────────────────────────────────────────────────
    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const auth = await requireAuth(req);
      return sendJson(res, 200, { profile: auth.profile });
    }

    // ── Profile ───────────────────────────────────────────────────────────────
    if (req.method === "POST" && url.pathname === "/api/profile/update") {
      const { user } = await requireAuth(req);
      const { full_name, phone } = await readJson(req);
      if (!full_name || !full_name.trim()) return sendJson(res, 400, { error: "Name is required." });
      const sb = require("./db").getClient();
      const { data: updated, error } = await sb.from("profiles")
        .update({ full_name: full_name.trim(), phone: (phone || "").trim() || null })
        .eq("id", user.id)
        .select()
        .single();
      if (error) return sendJson(res, 500, { error: error.message });
      return sendJson(res, 200, { profile: updated });
    }
    if (req.method === "GET" && url.pathname === "/api/profile/by-slug") {
      await requireAuth(req, ["admin"]);
      const slug = url.searchParams.get("slug") || "";
      const sb = require("./db").getClient();
      const { data: users, error } = await sb.from("profiles").select("*");
      if (error) return sendJson(res, 500, { error: error.message });
      function emailToSlug(email) {
        return email.split("@")[0].toLowerCase().replace(/[^a-z0-9-]/g, "-");
      }
      const found = (users || []).find(u => emailToSlug(u.email) === slug);
      if (!found) return sendJson(res, 404, { error: "User not found." });
      return sendJson(res, 200, { profile: found });
    }

    // ── Drawings ──────────────────────────────────────────────────────────────
    if (req.method === "GET" && url.pathname === "/api/drawings/list") {
      return sendJson(res, 200, await drawingsList(req, url.searchParams.get("projectId")));
    }
    if (req.method === "GET" && url.pathname === "/api/drawings/pending") {
      return sendJson(res, 200, await drawingsPending(req));
    }
    if (req.method === "GET" && url.pathname === "/api/drawings/signed-url") {
      return sendJson(res, 200, await drawingSignedUrl(req, url.searchParams.get("path")));
    }
    if (req.method === "POST" && url.pathname === "/api/drawings/signed-urls") {
      return sendJson(res, 200, await drawingSignedUrlBatch(req, (await readJson(req)).filePaths));
    }
    if (req.method === "GET" && url.pathname === "/api/drawings/download") {
      return drawingDownload(req, res, url.searchParams.get("path"), url.searchParams.get("name"));
    }
    if (req.method === "GET" && url.pathname === "/api/drawings/download-zip") {
      return drawingDownloadZip(req, res, url.searchParams.get("projectId"));
    }
    if (req.method === "POST" && url.pathname === "/api/drawings/upload") {
      return sendJson(res, 200, await drawingUpload(req, await readJson(req)));
    }
    if (req.method === "POST" && url.pathname === "/api/drawings/review") {
      return sendJson(res, 200, await drawingReview(req, await readJson(req)));
    }
    if (req.method === "GET" && url.pathname === "/api/drawings/assignments") {
      const projectIdsParam = url.searchParams.get("projectIds");
      return sendJson(res, 200, await drawingAssignmentsList(req, {
        projectId:  url.searchParams.get("projectId"),
        projectIds: projectIdsParam ? projectIdsParam.split(",").filter(Boolean) : null,
        mineOnly:   url.searchParams.get("mine") === "1",
      }));
    }
    if (req.method === "POST" && url.pathname === "/api/drawings/assignments/upsert") {
      return sendJson(res, 200, await drawingAssignmentUpsert(req, await readJson(req)));
    }
    if (req.method === "POST" && url.pathname === "/api/drawings/assignments/delete") {
      return sendJson(res, 200, await drawingAssignmentDelete(req, await readJson(req)));
    }
    if (req.method === "GET" && url.pathname === "/api/drawings/revision-requests") {
      return sendJson(res, 200, await drawingsRevisionRequests(req));
    }
    if (req.method === "GET" && url.pathname === "/api/drawings/project-summary") {
      const ids = (url.searchParams.get("projectIds") || "").split(",").filter(Boolean);
      return sendJson(res, 200, await drawingProjectSummary(req, ids));
    }

    // ── Tasks ─────────────────────────────────────────────────────────────────
    if (req.method === "GET" && url.pathname === "/api/tasks/list") {
      return sendJson(res, 200, await tasksList(req, url.searchParams));
    }
    if (req.method === "POST" && url.pathname === "/api/tasks/create") {
      return sendJson(res, 200, await taskCreate(req, await readJson(req)));
    }
    if (req.method === "POST" && url.pathname === "/api/tasks/update") {
      return sendJson(res, 200, await taskUpdate(req, await readJson(req)));
    }

    // ── User management (admin) ───────────────────────────────────────────────
    if (req.method === "GET" && url.pathname === "/api/users/list") {
      return sendJson(res, 200, await usersList(req));
    }
    if (req.method === "POST" && url.pathname === "/api/users/update-role") {
      return sendJson(res, 200, await userUpdateRole(req, await readJson(req)));
    }
    if (req.method === "POST" && url.pathname === "/api/users/invite") {
      return sendJson(res, 200, await userInvite(req, await readJson(req)));
    }
    if (req.method === "GET" && url.pathname === "/api/users/invitations") {
      return sendJson(res, 200, await invitationsList(req));
    }
    if (req.method === "POST" && url.pathname === "/api/users/invitations/cancel") {
      return sendJson(res, 200, await invitationCancel(req, await readJson(req)));
    }

    // ── CEO dashboard ─────────────────────────────────────────────────────────
    if (req.method === "GET" && url.pathname === "/api/ceo/dashboard") {
      return sendJson(res, 200, await ceoDashboard(req));
    }
    if (req.method === "GET" && url.pathname === "/api/ceo/team-stats") {
      return sendJson(res, 200, await teamStats(req));
    }
    if (req.method === "GET" && url.pathname === "/api/audit/logs") {
      return sendJson(res, 200, await auditLogsList(req, {
        projectId: url.searchParams.get("projectId"),
        limit: url.searchParams.get("limit"),
      }));
    }

    if (req.method === "GET" && url.pathname === "/api/project/list") {
      const auth = await getAuthProfile(req);
      return sendJson(res, 200, await projectList(auth));
    }
    if (req.method === "GET" && url.pathname === "/api/project/load") {
      return sendJson(res, 200, await projectLoad(url.searchParams.get("id")));
    }
    if (req.method === "GET" && url.pathname === "/api/project/versions") {
      return sendJson(res, 200, await projectLoadVersions(url.searchParams.get("id")));
    }
    if (req.method === "GET" && url.pathname === "/api/sales/projects") {
      const auth = await requireAuth(req, ["sales", "admin", "ceo"]);
      return sendJson(res, 200, await salesProjectList(auth));
    }

    if (req.method === "POST" && url.pathname === "/api/project/update-status") {
      const auth = await getAuthProfile(req);
      return sendJson(res, 200, await projectUpdateStatus(await readJson(req), auth));
    }
    if (req.method === "POST" && url.pathname === "/api/project/create") {
      return sendJson(res, 200, await projectCreate(req, await readJson(req)));
    }
    if (req.method === "POST" && url.pathname === "/api/project/advance-payment") {
      return sendJson(res, 200, await projectAdvancePayment(req, await readJson(req)));
    }
    if (req.method === "GET" && url.pathname === "/api/project/detail") {
      return sendJson(res, 200, await projectDetail(req, url.searchParams.get("id")));
    }
    if (req.method === "POST" && url.pathname === "/api/project/update") {
      return sendJson(res, 200, await projectUpdate(req, await readJson(req)));
    }
    // ── Project team (must be before the catch-all below) ────────────────────
    if (req.method === "GET" && url.pathname === "/api/project/team") {
      return sendJson(res, 200, await projectTeamGet(req, url.searchParams.get("id")));
    }
    if (req.method === "POST" && url.pathname === "/api/project/assign-user") {
      return sendJson(res, 200, await projectAssignUser(req, await readJson(req)));
    }
    if (req.method === "POST" && url.pathname === "/api/project/unassign-user") {
      return sendJson(res, 200, await projectUnassignUser(req, await readJson(req)));
    }
    // ── Project action catch-all (legacy fitout planner actions) ─────────────
    if (req.method === "POST" && url.pathname.startsWith("/api/project/")) {
      const auth   = await getAuthProfile(req);
      const body   = await readJson(req);
      const action = url.pathname.slice("/api/project/".length);
      return sendJson(res, 200, await handleProjectAction(action, body, auth));
    }
    // Serve sales dashboard for /sales/:name paths
    if (req.method === "GET" && url.pathname.startsWith("/sales/")) {
      return serveStatic("/sales.html", false, res);
    }
    // Serve profile page for /profile/:slug paths
    if (req.method === "GET" && url.pathname.startsWith("/profile/")) {
      return serveStatic("/profile.html", false, res);
    }
    // Serve lead designer home
    if (req.method === "GET" && url.pathname === "/lead_designer_home") {
      return serveStatic("/lead_designer_home.html", false, res);
    }
    // Serve designer home
    if (req.method === "GET" && url.pathname === "/designer_home") {
      return serveStatic("/designer_home.html", false, res);
    }
    // Serve admin/CEO command center (unified home for admin + ceo)
    if (req.method === "GET" && (url.pathname === "/admin_home" || url.pathname === "/ceo")) {
      return serveStatic("/admin_home.html", false, res);
    }
    if (req.method === "GET" || req.method === "HEAD") {
      return serveStatic(url.pathname, req.method === "HEAD", res);
    }

    return sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    const message = error && error.message ? error.message : "Server error";
    const status  = Number(error && error.statusCode) || 500;
    console.error("[Server error]", status, message, error?.stack || "");
    return sendJson(res, status, { error: message });
  }
});

server.listen(PORT, () => {
  console.log(`Interior planner server running on http://localhost:${PORT}`);
});
