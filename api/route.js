"use strict";

const { readJson, sendJson } = require("../server/utils");
const { requireAuth } = require("../server/auth");
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
} = require("../server/projects");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  try {
    const url = new URL(req.url || "/", `https://${req.headers.host || "localhost"}`);
    const { pathname } = url;

    if (req.method === "GET" && pathname === "/api/config") {
      return sendJson(res, 200, {
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
      });
    }
    if (req.method === "GET" && pathname === "/api/auth/me") {
      const auth = await requireAuth(req);
      return sendJson(res, 200, { profile: auth.profile });
    }

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

    if (req.method === "GET" && pathname === "/api/project/list") {
      const auth = await requireAuth(req);
      return sendJson(res, 200, await projectList(auth));
    }
    if (req.method === "GET" && pathname === "/api/project/load") {
      const auth = await requireAuth(req);
      return sendJson(res, 200, await projectLoad(url.searchParams.get("id"), auth));
    }
    if (req.method === "GET" && pathname === "/api/project/versions") {
      const auth = await requireAuth(req);
      return sendJson(res, 200, await projectLoadVersions(url.searchParams.get("id"), auth));
    }
    if (req.method === "POST" && pathname.startsWith("/api/project/")) {
      const auth = await requireAuth(req);
      const body = await readJson(req);
      const action = pathname.slice("/api/project/".length);
      return sendJson(res, 200, await handleProjectAction(action, body, auth));
    }

    return sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    const message = error?.message || "Server error";
    const status = Number(error?.statusCode) || 500;
    console.error("[API]", status, message, error?.stack || "");
    return sendJson(res, status, { error: message });
  }
};
