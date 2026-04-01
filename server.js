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
  projectLoadVersions
} = require("./server/projects");

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
    if (req.method === "GET" && url.pathname === "/api/project/list") {
      return sendJson(res, 200, await projectList());
    }
    if (req.method === "GET" && url.pathname === "/api/project/load") {
      return sendJson(res, 200, await projectLoad(url.searchParams.get("id")));
    }
    if (req.method === "GET" && url.pathname === "/api/project/versions") {
      return sendJson(res, 200, await projectLoadVersions(url.searchParams.get("id")));
    }
    if (req.method === "POST" && url.pathname.startsWith("/api/project/")) {
      const body   = await readJson(req);
      const action = url.pathname.slice("/api/project/".length);
      return sendJson(res, 200, await handleProjectAction(action, body));
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
