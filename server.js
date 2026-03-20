const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 8080);
const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-1.5";
const DEFAULT_OPENAI_TEXT_MODEL = "gpt-5.4-mini";
const DEFAULT_OPENAI_VISION_MODEL = "gpt-5.4";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

loadEnvFile(path.join(ROOT, ".env.local"));

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "POST" && url.pathname === "/api/render/openai") {
      const body = await readJson(req);
      const result = await renderWithOpenAi(body);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/style/extract") {
      const body = await readJson(req);
      const result = await extractStyleWithOpenAi(body);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/analyze/floorplan") {
      const body = await readJson(req);
      const result = await analyzeFloorPlanWithOpenAi(body);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/analyze/room-image") {
      const body = await readJson(req);
      const result = await matchRoomImageWithOpenAi(body);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/furniture/suggest") {
      const body = await readJson(req);
      const result = await suggestFurnitureWithOpenAi(body);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/furniture/autoplace") {
      const body = await readJson(req);
      const result = await autoPlaceFurnitureWithOpenAi(body);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/chat/placement") {
      const body = await readJson(req);
      const result = await chatPlacementWithOpenAi(body);
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" || req.method === "HEAD") {
      return serveStatic(url.pathname, req.method === "HEAD", res);
    }

    return sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    const message = error && error.message ? error.message : "Server error";
    const status = Number(error && error.statusCode) || 500;
    return sendJson(res, status, { error: message });
  }
});

server.listen(PORT, () => {
  console.log(`Interior planner server running on http://localhost:${PORT}`);
});

async function renderWithOpenAi(body) {
  const apiKey = resolveApiKey("", process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const model = String(body.model || DEFAULT_OPENAI_IMAGE_MODEL).trim();
  const prompt = String(body.prompt || "").trim();
  const imageBase64 = String(body.imageBase64 || "").trim();
  const mimeType = String(body.mimeType || "image/png").trim();
  const quality = "low";

  if (!prompt || !imageBase64) {
    throw httpError(400, "Missing prompt or imageBase64 for OpenAI render.");
  }

  const imageBuffer = decodeBase64Image(imageBase64);
  const form = new FormData();
  form.append("model", model);
  form.append("quality", quality);
  form.append("prompt", prompt);
  form.append("image", new Blob([imageBuffer], { type: mimeType }), "room_input.png");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });

  const raw = await response.text();
  if (!response.ok) {
    throw httpError(response.status, extractApiError(raw));
  }

  const parsed = safeJson(raw);
  const firstImage = Array.isArray(parsed && parsed.data) ? parsed.data[0] : null;
  if (!firstImage) {
    throw httpError(502, "OpenAI response did not include image data.");
  }

  if (firstImage.b64_json) {
    return {
      provider: "openai",
      model,
      dataUrl: `data:image/png;base64,${firstImage.b64_json}`
    };
  }

  if (firstImage.url) {
    return {
      provider: "openai",
      model,
      dataUrl: firstImage.url
    };
  }

  throw httpError(502, "OpenAI response did not include b64_json or url.");
}

async function analyzeFloorPlanWithOpenAi(body) {
  const apiKey = resolveApiKey("", process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const model = String(body.model || DEFAULT_OPENAI_VISION_MODEL).trim();
  const imageBase64 = String(body.imageBase64 || "").trim();
  const mimeType = String(body.mimeType || "image/png").trim();

  if (!imageBase64) {
    throw httpError(400, "Missing imageBase64 for floor plan analysis.");
  }

  const prompt = [
    "You are an expert architectural floor plan analyst.",
    "Analyze the floor plan image provided and extract ALL rooms/spaces visible.",
    "For each room return:",
    "  - label: the room number or code shown on the plan (e.g. '101', 'LR', 'MBR'). If none, generate a short code.",
    "  - name: human readable name (e.g. 'Living Room', 'Master Bedroom', 'Kitchen')",
    "  - roomType: one of: bedroom, living, kitchen, bathroom, dining, study, balcony, foyer, utility, other",
    "  - bbox: bounding box as fractions of image dimensions: { xPct, yPct, wPct, hPct } (0.0–1.0)",
    "  - widthM: estimated width in meters (floor plan scale; estimate if not shown)",
    "  - lengthM: estimated length in meters",
    "  - notes: any notable features (windows on north wall, L-shaped, open plan, etc.)",
    "",
    "Context provided by user:",
    `- Property Type: ${body.context?.propertyType || "unspecified"}`,
    `- Configuration/Space Type: ${body.context?.bhk || "unspecified"}`,
    `- Total Area: ${body.context?.totalAreaM2 ? body.context.totalAreaM2 + " sqm" : "unspecified"}`,
    `- Additional Notes/Brief: ${body.context?.notes || "none"}`,
    `CRITICAL: Pay close attention to the Additional Notes/Brief as it contains literal descriptions of the rooms from the user.`,
    "",
    "Also return top-level:",
    "  - totalAreaM2: approximate total floor area in square meters",
    "  - bhkType: e.g. '2BHK', '3BHK'",
    "  - orientation: compass orientation if north arrow visible, else 'unknown'",
    "  - summary: 1-2 sentence description of the plan",
    "",
    "Return STRICT JSON only (no markdown, no explanation):",
    "{",
    "  \"rooms\": [ { \"label\": string, \"name\": string, \"roomType\": string, \"bbox\": { \"xPct\": number, \"yPct\": number, \"wPct\": number, \"hPct\": number }, \"widthM\": number, \"lengthM\": number, \"notes\": string } ],",
    "  \"totalAreaM2\": number,",
    "  \"bhkType\": string,",
    "  \"orientation\": string,",
    "  \"summary\": string",
    "}"
  ].join("\n");

  const payload = {
    model,
    reasoning: { effort: "medium" },
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: `data:${mimeType};base64,${imageBase64}` }
        ]
      }
    ],
    max_output_tokens: 10000
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const raw = await response.text();
  if (!response.ok) {
    throw httpError(response.status, extractApiError(raw));
  }

  const parsed = safeJson(raw);
  const text = extractResponsesText(parsed);
  const json = extractJsonFromText(text);
  if (!json || !Array.isArray(json.rooms)) {
    console.error("Floor plan analysis failed to parse. Raw text:", text.slice(0, 500));
    throw httpError(502, "Floor plan analysis returned unexpected output.");
  }

  return { model, analysis: json };
}

async function matchRoomImageWithOpenAi(body) {
  const apiKey = resolveApiKey("", process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const model = String(body.model || DEFAULT_OPENAI_VISION_MODEL).trim();
  const roomImageBase64 = String(body.roomImageBase64 || "").trim();
  const roomImageMime = String(body.roomImageMime || "image/jpeg").trim();
  const floorplanBase64 = String(body.floorplanBase64 || "").trim();
  const floorplanMime = String(body.floorplanMime || "image/png").trim();
  const rooms = Array.isArray(body.rooms) ? body.rooms : [];

  if (!roomImageBase64) {
    throw httpError(400, "Missing roomImageBase64 for room matching.");
  }

  const roomList = rooms.map((r) => `  - Label: ${r.label}, Name: ${r.name}, Type: ${r.roomType}`).join("\n");

  const prompt = [
    "You are an expert interior designer analyzing room photographs.",
    "Given the room photograph and optionally a floor plan, identify which room the photograph shows.",
    "",
    "Available rooms from the floor plan:",
    roomList || "  (no floor plan rooms detected yet)",
    "",
    "Based on visual cues (room size, fixtures, finishes, windows, architectural features),",
    "match the photograph to one of the rooms listed above.",
    "",
    "Return STRICT JSON only:",
    "{ \"matchedLabel\": string, \"matchedName\": string, \"confidence\": number (0-1), \"reasoning\": string }"
  ].join("\n");

  const contentItems = [
    { type: "input_text", text: prompt },
    { type: "input_image", image_url: `data:${roomImageMime};base64,${roomImageBase64}` }
  ];

  if (floorplanBase64) {
    contentItems.push({ type: "input_image", image_url: `data:${floorplanMime};base64,${floorplanBase64}` });
  }

  const payload = {
    model,
    reasoning: { effort: "low" },
    input: [{ role: "user", content: contentItems }],
    max_output_tokens: 4000
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const raw = await response.text();
  if (!response.ok) {
    throw httpError(response.status, extractApiError(raw));
  }

  const parsed = safeJson(raw);
  const text = extractResponsesText(parsed);
  const json = extractJsonFromText(text);
  if (!json || typeof json.matchedLabel !== "string") {
    console.error("Room matching failed to parse. Raw text:", text.slice(0, 500));
    throw httpError(502, "Room matching returned unexpected output.");
  }

  return { model, match: json };
}

async function suggestFurnitureWithOpenAi(body) {
  const apiKey = resolveApiKey("", process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const model = String(body.model || DEFAULT_OPENAI_TEXT_MODEL).trim();
  const request = String(body.request || "").trim();
  const roomLabel = String(body.roomLabel || "").trim();
  const roomType = String(body.roomType || "").trim();
  const availableModules = Array.isArray(body.availableModules) ? body.availableModules : [];

  if (!request) throw httpError(400, "Missing request for furniture suggestion.");

  const moduleList = availableModules
    .map(m => `  - id:"${m.id}" label:"${m.label}" w:${m.w}m d:${m.d}m h:${m.h}m type:${m.type}`)
    .join("\n");

  const prompt = [
    "You are an interior design assistant for Indian apartments.",
    "The user wants to add furniture to their floor plan.",
    `User request: "${request}"`,
    roomLabel ? `Target room: ${roomLabel} (${roomType})` : "",
    "",
    "Available furniture modules (pick 1-3 most relevant):",
    moduleList,
    "",
    "Return STRICT JSON only:",
    '{ "suggestions": [ { "id": string, "label": string, "reason": string } ] }',
    "Match the request to module IDs from the list above. Max 3 suggestions."
  ].filter(Boolean).join("\n");

  const payload = {
    model,
    reasoning: { effort: "low" },
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
    max_output_tokens: 4000
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const raw = await response.text();
  if (!response.ok) throw httpError(response.status, extractApiError(raw));

  const parsed = safeJson(raw);
  const text = extractResponsesText(parsed);
  const json = extractJsonFromText(text);
  if (!json || !Array.isArray(json.suggestions)) {
    console.error("Furniture suggestion failed to parse. Raw text:", text.slice(0, 500));
    throw httpError(502, "Furniture suggestion returned unexpected output.");
  }
  return { model, suggestions: json.suggestions };
}

async function autoPlaceFurnitureWithOpenAi(body) {
  const apiKey = resolveApiKey("", process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const model = String(body.model || DEFAULT_OPENAI_TEXT_MODEL).trim();
  const rooms = body.rooms || [];
  const brief = String(body.brief || "").trim();
  const context = body.context || {};

  if (!rooms.length) throw httpError(400, "Missing rooms for autoplace.");

  const roomSummary = rooms.map(r =>
    `- ${r.label} (${r.roomType}): ${r.widthM || "?"}m × ${r.lengthM || "?"}m`
  ).join("\n");

  const moduleList = (body.moduleLibrary || []).map(m =>
    `${m.id}: "${m.label}" w=${m.w}m d=${m.d}m h=${m.h}m [${(m.keywords||[]).join(", ")}]`
  ).join("\n");

  const prompt = [
    "You are a professional Indian interior designer creating a furniture layout plan.",
    "Strictly follow interior design rules: maintain clearance paths, don't block doors/windows, respect room function.",
    "",
    "Property context:",
    context.bhk ? `- ${context.bhk}` : "",
    context.propertyType ? `- Type: ${context.propertyType}` : "",
    context.totalAreaM2 ? `- Total area: ${context.totalAreaM2} m²` : "",
    context.notes ? `- Notes: ${context.notes}` : "",
    "",
    `Design brief: ${brief || "Modern Indian, minimal, functional"}`,
    "",
    "Rooms:",
    roomSummary,
    "",
    "Available furniture modules:",
    moduleList,
    "",
    "For each room, pick the most appropriate furniture and return their placement coordinates.",
    "Coordinates are from the room's top-left corner. x=width axis, y=depth axis, both in meters.",
    "Respect clearances: min 0.9m walkway, 0.6m beside beds, at least 0.3m from walls.",
    "",
    "Return STRICT JSON only:",
    `{`,
    `  "placements": [`,
    `    {`,
    `      "moduleId": string,`,
    `      "label": string,`,
    `      "roomLabel": string,`,
    `      "xM": number,`,
    `      "yM": number,`,
    `      "wM": number,`,
    `      "dM": number,`,
    `      "rotationDeg": number,`,
    `      "wall": "north"|"south"|"east"|"west"|"center"`,
    `      "rationale": string`,
    `    }`,
    `  ]`,
    `}`
  ].filter(Boolean).join("\n");

  const payload = {
    model,
    reasoning: { effort: "low" },
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
    max_output_tokens: 4000
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const raw = await response.text();
  if (!response.ok) throw httpError(response.status, extractApiError(raw));

  const parsed = safeJson(raw);
  const text = extractResponsesText(parsed);
  const json = extractJsonFromText(text);
  if (!json || !Array.isArray(json.placements)) {
    console.error("Autoplace failed to parse. Raw text:", text.slice(0, 500));
    throw httpError(502, "Autoplace returned unexpected output.");
  }
  return { model, placements: json.placements };
}

async function chatPlacementWithOpenAi(body) {
  const apiKey = resolveApiKey("", process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const model = String(body.model || DEFAULT_OPENAI_TEXT_MODEL).trim();
  const message = String(body.message || "").trim();
  const rooms = body.rooms || [];
  const currentPlacements = body.currentPlacements || [];
  const moduleLibrary = body.moduleLibrary || [];

  if (!message) throw httpError(400, "Missing message.");

  const currentLayout = currentPlacements.map(p =>
    `[id:${p.id}] ${p.label} in ${p.roomLabel} at (${(p.xM||0).toFixed(1)}, ${(p.yM||0).toFixed(1)}), ${(p.wM||0).toFixed(1)}×${(p.dM||0).toFixed(1)}m`
  ).join("\n") || "(empty)";

  const moduleList = moduleLibrary.map(m =>
    `${m.id}: "${m.label}" default ${m.w}×${m.d}m`
  ).join("\n");

  const roomList = rooms.map(r =>
    `${r.label} (${r.roomType}) ${r.widthM}×${r.lengthM}m`
  ).join(", ");

  const prompt = [
    "You are an interior design AI assistant. The user has a furniture layout open and is asking you to make changes.",
    "",
    `Rooms: ${roomList}`,
    "",
    "Available furniture modules:",
    moduleList,
    "",
    "Current placement:",
    currentLayout,
    "",
    `User request: "${message}"`,
    "",
    "Understand the user's intent and return ONE structured action. Actions:",
    "- add: add a new piece  { action:'add', moduleId, label, roomLabel, xM, yM, wM, dM, rotationDeg, rationale }" ,
    "- move: move existing  { action:'move', id, xM, yM, rationale }",
    "- remove: delete        { action:'remove', id, rationale }",
    "- resize: change dims   { action:'resize', id, wM, dM, rationale }",
    "- message: explain/ask  { action:'message', text }",
    "",
    "Also include a 'reply' string: a short natural language response to the user (1–2 sentences).",
    "",
    "Return STRICT JSON only:",
    `{ "reply": string, "action": { ...as above } }`
  ].filter(Boolean).join("\n");

  const payload = {
    model,
    reasoning: { effort: "low" },
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
    max_output_tokens: 4000
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const raw = await response.text();
  if (!response.ok) throw httpError(response.status, extractApiError(raw));

  const parsed = safeJson(raw);
  const text = extractResponsesText(parsed);
  const json = extractJsonFromText(text);
  if (!json || !json.action) {
    console.error("Chat placement failed to parse. Raw text:", text.slice(0, 500));
    throw httpError(502, "Chat placement returned unexpected output.");
  }
  return { model, reply: json.reply || "", action: json.action };
}

async function extractStyleWithOpenAi(body) {
  const apiKey = resolveApiKey("", process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const model = String(body.model || DEFAULT_OPENAI_TEXT_MODEL).trim();
  const roomLabel = String(body.roomLabel || "").trim();
  const brief = String(body.brief || "").trim();
  const inspirationImages = Array.isArray(body.inspirationImages) ? body.inspirationImages : [];

  if (!brief) {
    throw httpError(400, "Missing brief for style extraction.");
  }

  const content = [];
  content.push({
    type: "input_text",
    text: [
      "You are an interior designer + production estimator for Indian modular / plywood + laminate interiors.",
      "Goal: extract a standardized style direction and propose a laminate finish selection + furniture requirements for THIS room.",
      "Return STRICT JSON only (no markdown).",
      "",
      `Room: ${roomLabel || "Unknown room"}`,
      `Brief: ${brief}`,
      "",
      "JSON schema:",
      "{",
      '  "style_summary": string,',
      '  "finish_palette": { "primary": string, "secondary": string, "accent": string },',
      '  "laminate_recommendation": { "name": string, "tone": string, "finish": "matte"|"gloss"|"textured", "notes": string },',
      '  "furniture_requirements": [ { "module": string, "notes": string } ],',
      '  "do_not_do": [ string ]',
      "}",
      "",
      "Keep laminate recommendation generic (do NOT reference catalog codes).",
      "Furniture requirements should be concise and feasible for a typical apartment.",
      "If inspiration images conflict with brief, prioritize brief but mention the conflict in do_not_do."
    ].join("\n")
  });

  for (const img of inspirationImages.slice(0, 8)) {
    const mimeType = String(img && img.mimeType ? img.mimeType : "image/jpeg");
    const data = String(img && img.base64 ? img.base64 : "");
    if (!data) continue;
    content.push({
      type: "input_image",
      image_url: `data:${mimeType};base64,${data}`
    });
  }

  const payload = {
    model,
    reasoning: { effort: "low" },
    input: [{ role: "user", content }],
    max_output_tokens: 700
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const raw = await response.text();
  if (!response.ok) {
    throw httpError(response.status, extractApiError(raw));
  }

  const parsed = safeJson(raw);
  const text = extractResponsesText(parsed);
  const json = safeJson(text);
  if (!json) {
    throw httpError(502, "Style extraction returned non-JSON output.");
  }

  return {
    provider: "openai",
    model,
    style: json
  };
}

function resolveApiKey(override, envValue, envName) {
  const envKey = String(envValue || "").trim();
  if (!envKey) {
    throw httpError(400, `Missing API key. Set ${envName} in .env.local.`);
  }
  return envKey;
}

function decodeBase64Image(imageBase64) {
  try {
    const buffer = Buffer.from(imageBase64, "base64");
    if (!buffer.length) {
      throw new Error("empty buffer");
    }
    return buffer;
  } catch {
    throw httpError(400, "Invalid base64 image payload.");
  }
}

function serveStatic(pathname, headOnly, res) {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(decodeURIComponent(normalized));
  const absolute = path.resolve(ROOT, `.${safePath}`);

  if (!absolute.startsWith(ROOT)) {
    return sendJson(res, 403, { error: "Forbidden path." });
  }

  let filePath = absolute;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        return sendJson(res, 404, { error: "Not found." });
      }
      return sendJson(res, 500, { error: "Could not read file." });
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-store"
    });
    if (!headOnly) {
      res.end(data);
      return;
    }
    res.end();
  });
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  const maxBytes = 25 * 1024 * 1024;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw httpError(413, "Request body too large.");
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw httpError(400, "Invalid JSON payload.");
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function extractApiError(raw) {
  const parsed = safeJson(raw);
  if (parsed && parsed.error) {
    if (typeof parsed.error === "string") {
      return parsed.error;
    }
    if (parsed.error.message) {
      return parsed.error.message;
    }
  }
  return raw || "Upstream API error";
}

function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractJsonFromText(text) {
  let parsed = safeJson(text);
  if (parsed) return parsed;
  
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (match) {
    parsed = safeJson(match[1].trim());
    if (parsed) return parsed;
  }
  
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    parsed = safeJson(text.slice(start, end + 1));
    if (parsed) return parsed;
  }
  return null;
}

function extractResponsesText(response) {
  const output = Array.isArray(response && response.output) ? response.output : [];
  for (const item of output) {
    const content = Array.isArray(item && item.content) ? item.content : [];
    for (const c of content) {
      if (c && typeof c.text === "string" && c.text.trim()) {
        return c.text.trim();
      }
      if (c && c.type === "output_text" && typeof c.text === "string" && c.text.trim()) {
        return c.text.trim();
      }
    }
  }
  // fallback: some variants store in response.output_text
  if (typeof response?.output_text === "string") {
    return response.output_text.trim();
  }
  return "";
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }
  let raw;
  try {
    raw = fs.readFileSync(envPath, "utf8");
  } catch (error) {
    // In some sandboxed/dev environments this file may be blocked; do not crash the server.
    return;
  }
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
