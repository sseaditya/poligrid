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

    if (req.method === "POST" && url.pathname === "/api/furnish-room") {
      const body = await readJson(req);
      const result = await furnishRoomWithOpenAi(body);
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
    console.error("[Server error]", status, message, error?.stack || "");
    return sendJson(res, status, { error: message });
  }
});

server.listen(PORT, () => {
  console.log(`Interior planner server running on http://localhost:${PORT}`);
});

async function renderWithOpenAi(body) {
  const apiKey = resolveApiKey("", process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const model = String(body.model || "gpt-image-1.5").trim();
  const prompt = String(body.prompt || "").trim();

  let imageBase64 = String(body.imageBase64 || "").trim();
  if (imageBase64 && imageBase64.includes("base64,")) {
    imageBase64 = imageBase64.split("base64,")[1];
  }

  const mimeType = String(body.mimeType || "image/png").trim();

  if (!prompt) {
    throw httpError(400, "Missing prompt for OpenAI render.");
  }

  let endpoint, headers, payload;

  if (imageBase64) {
    // IMAGE-TO-IMAGE EDIT MODE
    endpoint = "https://api.openai.com/v1/images/edits";
    const imageBuffer = decodeBase64Image(imageBase64);
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt.slice(0, 4000));
    form.append("quality", "low");
    form.append("image", new Blob([imageBuffer], { type: mimeType }), "room_input.png");

    headers = { Authorization: `Bearer ${apiKey}` };
    payload = form;
  } else {
    // TEXT-TO-IMAGE GENERATION MODE
    endpoint = "https://api.openai.com/v1/images/generations";
    headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
    payload = JSON.stringify({
      model: model,
      prompt: prompt.slice(0, 4000),
      quality: "low",
      n: 1,
      size: "1024x1024"
    });
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: payload
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
    return { provider: "openai", model, dataUrl: `data:image/png;base64,${firstImage.b64_json}` };
  }
  if (firstImage.url) {
    return { provider: "openai", model, dataUrl: firstImage.url };
  }
  throw httpError(502, "OpenAI response did not include b64_json or url.");
}

async function furnishRoomWithOpenAi(body) {
  const apiKey = resolveApiKey("", process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const visionModel = String(body.visionModel || DEFAULT_OPENAI_VISION_MODEL).trim();
  
  const emptyRoomBase64 = String(body.emptyRoomBase64 || "").trim();
  const mimeType = String(body.mimeType || "image/jpeg").trim();
  const inspirationImages = Array.isArray(body.inspirationBase64) ? body.inspirationBase64 : [];

  if (!emptyRoomBase64) {
    throw httpError(400, "Missing emptyRoomBase64 for direct furnishing.");
  }

  // STEP 1: Vision Planning (Decide what furniture to place)
  const providedPlacements = Array.isArray(body.placements) ? body.placements : null;
  let placements = providedPlacements;

  if (!placements || placements.length === 0) {
    const planningPrompt = [
      "You are an expert interior designer. You have been given a photo of an empty room.",
      inspirationImages.length ? "You have also been given inspiration images showing the desired style." : "",
      "Based on the room's geometry and the implied style, generate a complete list of furniture necessary to furnish this room.",
      "Return strict JSON with a `placements` array, where each item has:",
      "  - label: e.g., '3-Seater Sofa'",
      "  - type: 'seating', 'table', 'cabinet', 'bed', 'decor', or 'custom'",
      "  - wM: approx width in meters",
      "  - dM: approx depth in meters",
      "  - hM: approx height in meters",
      "Return nothing but JSON."
    ].filter(Boolean).join("\n");

    const contentArray = [
      { type: "input_text", text: planningPrompt },
      { type: "input_image", image_url: emptyRoomBase64.startsWith("data:") ? emptyRoomBase64 : `data:${mimeType};base64,${emptyRoomBase64}` }
    ];

    for (const inspBase64 of inspirationImages) {
      contentArray.push({
        type: "input_image",
        image_url: inspBase64.startsWith("data:") ? inspBase64 : `data:${mimeType};base64,${inspBase64}`
      });
    }

    const payload = {
      model: visionModel,
      reasoning: { effort: "medium" },
      max_output_tokens: 4000,
      input: [
        { role: "user", content: contentArray }
      ]
    };

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const raw = await response.text();
    if (!response.ok) throw httpError(response.status, extractApiError(raw));
    
    const parsed = safeJson(raw);
    const jsonOutput = extractJsonFromText(extractResponsesText(parsed));
    placements = jsonOutput?.placements || [];
  }

  // STEP 1.5: Extract Style from Inspiration Images
  let styleGuidance = "";
  if (inspirationImages.length > 0) {
    const stylePrompt = [
      "Describe the interior design style, color palette, materials, and overall mood shown in these inspiration images.",
      "Keep it strictly under 3 sentences, focusing only on actionable visual details."
    ].join("\n");
    const styleContent = [{ type: "input_text", text: stylePrompt }];
    // Limit to 3 images to prevent payload size limits or proxy timeouts
    for (const inspBase64 of inspirationImages.slice(0, 3)) {
      styleContent.push({
        type: "input_image",
        image_url: inspBase64.startsWith("data:") ? inspBase64 : `data:${mimeType};base64,${inspBase64}`
      });
    }
    try {
      const stylePayload = {
        model: visionModel,
        reasoning: { effort: "medium" }, // Increased effort for better extraction
        max_output_tokens: 500,
        input: [{ role: "user", content: styleContent }]
      };
      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(stylePayload)
      });
      const raw = await res.text();
      const parsed = safeJson(raw);
      styleGuidance = extractResponsesText(parsed) || "";
    } catch (e) {
      console.warn("Style extraction failed:", e);
    }
  }

  // STEP 2: Render Generation (DALL-E)
  const furnitureStr = placements.map(p => `- ${p.label} (${p.wM}x${p.dM}m)`).join("\n");
  
  const renderPrompt = [
    "Photorealistic architectural interior render.",
    `Furnish the empty room strictly with the following items:\n${furnitureStr}`,
    "Maintain the architectural geometry, lighting, and camera angle of the original empty room.",
    body.brief ? `Design Brief / Style Preference: ${body.brief}` : "Apply standard styling.",
    styleGuidance ? `CRITICAL Visual Inspiration Guidance: The entire scene MUST heavily reflect this specific style, materials, and color palette:\n${styleGuidance}` : ""
  ].filter(Boolean).join("\n");

  const renderResult = await renderWithOpenAi({
    model: body.renderModel || "gpt-image-1.5",
    prompt: renderPrompt,
    imageBase64: emptyRoomBase64,
    mimeType: mimeType
  });

  return { 
    dataUrl: renderResult.dataUrl,
    furnitureList: placements
  };
}

async function analyzeFloorPlanWithOpenAi(body) {
  const apiKey = resolveApiKey("", process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const model = String(body.model || DEFAULT_OPENAI_VISION_MODEL).trim();
  const imageBase64 = String(body.imageBase64 || "").trim();
  const mimeType = String(body.mimeType || "image/png").trim();

  if (!imageBase64) {
    throw httpError(400, "Missing imageBase64 for floor plan analysis.");
  }

  const isCommercial = (body.context?.propertyType || "").toLowerCase().includes("commercial");

  const prompt = [
    "You are an expert architectural floor plan analyst.",
    "You are analyzing a technical drawing (CAD, architectural blueprint, or hand-drafted plan).",
    "DIMENSION READING: Read ALL dimension annotations visible on the drawing (e.g. '7-5\"', '8-1\"', '14-2\" etc.) to derive actual room sizes in meters. Convert feet-inch notation to meters (1 foot = 0.3048 m). Prefer these annotated dimensions over visual estimation.",
    "LABEL READING: Room/zone labels may appear as zone codes (ZONE-1, ZONE-2), numeric IDs (101, 102), abbreviations (LR, MBR, KIT), or plain text. Use whatever is printed inside or adjacent to each enclosed space as the label.",
    "Extract ALL rooms/spaces visible in the drawing.",
    "For each room return:",
    "  - label: the exact text label or code shown on the plan for that space. If none visible, generate a short code.",
    "  - name: human readable name (e.g. 'Open Office', 'Conference Room', 'Reception', 'Living Room')",
    isCommercial
      ? "  - roomType: one of: office, conference, reception, pantry, store, workstation, bathroom, utility, foyer, other"
      : "  - roomType: one of: bedroom, living, kitchen, bathroom, dining, study, balcony, foyer, utility, other",
    "  - bbox: bounding box as fractions of image dimensions: { xPct, yPct, wPct, hPct } (0.0–1.0)",
    "  - widthM: width in meters derived from dimension annotations on the plan; estimate only if annotations are absent",
    "  - lengthM: length in meters derived from dimension annotations on the plan; estimate only if annotations are absent",
    "  - notes: brief plain-text summary of the space (e.g. 'open plan with glazed east partition')",
    "  - walls: array of exactly 4 wall objects, one per side. For each wall:",
    "      { side: 'north'|'south'|'east'|'west',",
    "        isExterior: boolean (true if it faces outside the building),",
    "        adjacentRoomLabel: string|null (label of neighbouring room if shared wall, else null),",
    "        openings: array of openings on this wall, each:",
    "          { type: 'door'|'window'|'glazed-partition'|'archway'|'none',",
    "            widthM: number,",
    "            offsetFromWestOrNorthM: number (distance from the left/top end of that wall to the opening's near edge) }",
    "      }",
    "    If a wall has no openings, return openings: []",
    "",
    "FURNITURE EXTRACTION:",
    "The floor plan may contain hand-drawn or CAD-drawn furniture. For EACH room, identify all depicted furniture items and return them in the `placements` array.",
    "For each item, provide:",
    "  - label: A short descriptive name (e.g., '3-Seater Sofa', 'Desk', 'Wardrobe')",
    "  - type: Must be one of: 'seating', 'table', 'cabinet', 'bed', 'other'",
    "  - xPct, yPct: Center point of the furniture relative to the room's bounding box (0.0 to 1.0, where 0,0 is the room's top-left corner).",
    "  - wPct, dPct: Width and depth of the furniture relative to the room's bounding box dimensions (0.0 to 1.0).",
    "  - rotationDeg: Approximate rotation in degrees (0 = facing north/up, 90 = facing east/right, etc.). Defaults to 0.",
    "",
    "Context provided by user:",
    `- Property Type: ${body.context?.propertyType || "unspecified"}`,
    `- Configuration/Space Type: ${body.context?.bhk || "unspecified"}`,
    `- Total Area: ${body.context?.totalAreaM2 ? body.context.totalAreaM2 + " sqm" : "unspecified"}`,
    `- Additional Notes/Brief: ${body.context?.notes || "none"}`,
    "CRITICAL: Pay close attention to the Additional Notes/Brief as it contains literal descriptions of the rooms from the user.",
    "",
    "Also return top-level:",
    "  - totalAreaM2: approximate total floor area in square meters (sum of individual room areas)",
    "  - bhkType: e.g. '2BHK', '3BHK', 'Small Office', 'Open Plan Office'",
    "  - orientation: compass orientation if north arrow visible, else 'unknown'",
    "  - summary: 1-2 sentence description of the plan",
    "  - globalBoq: an array of all bill of quantity line items identified from the entire floor plan. You MUST exhaustively extract every piece of furniture, structure, and material need visible on the drawing.",
    "    IMPORTANT: Every single item in `globalBoq` must be strictly categorized into ONE of the following exact strings: 'Civil work', 'Plumbing', 'Faux ceiling', 'Modular furniture', 'Loose furniture', 'Flooring', 'Doors and windows', 'Painting'.",
    "    For each item in `globalBoq` return:",
    "      - category: MUST be exactly one of the 8 strings above.",
    "      - item: specific name e.g. 'Demolish partition wall', '3-Seater Sofa', 'Wooden flooring', 'Internal Door', 'Wardrobe'",
    "      - qty: number (quantity or area size in appropriate units)",
    "      - unit: e.g. 'sqm', 'pcs', 'rft', 'lump sum'",
    "      - rate: realistic estimated rate in INR for this unit (e.g. 1500 for a door, 80 for sqm of painting, 50000 for a wardrobe)",
    "      - amount: qty * rate",
    "",
    "Return STRICT JSON only (no markdown, no explanation):",
    "{",
    "  \"rooms\": [",
    "    { \"label\": string, \"name\": string, \"roomType\": string,",
    "      \"bbox\": { \"xPct\": number, \"yPct\": number, \"wPct\": number, \"hPct\": number },",
    "      \"widthM\": number, \"lengthM\": number, \"notes\": string,",
    "      \"walls\": [",
    "        { \"side\": string, \"isExterior\": boolean, \"adjacentRoomLabel\": string|null,",
    "          \"openings\": [ { \"type\": string, \"widthM\": number, \"offsetFromWestOrNorthM\": number } ] }",
    "      ],",
    "      \"placements\": [",
    "        { \"label\": string, \"type\": string, \"xPct\": number, \"yPct\": number, \"wPct\": number, \"dPct\": number, \"rotationDeg\": number }",
    "      ]",
    "    }",
    "  ],",
    "  \"globalBoq\": [",
    "    { \"category\": string, \"item\": string, \"qty\": number, \"unit\": string, \"rate\": number, \"amount\": number }",
    "  ],",
    "  \"totalAreaM2\": number,",
    "  \"bhkType\": string,",
    "  \"orientation\": string,",
    "  \"summary\": string",
    "}"
  ].filter(Boolean).join("\n");

  const payload = {
    model,
    reasoning: { effort: "medium" },
    max_output_tokens: 16000,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: `data:${mimeType};base64,${imageBase64}` }
        ]
      }
    ]
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
    max_output_tokens: 2000
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
    "Available furniture modules:",
    moduleList,
    "",
    "Return STRICT JSON only:",
    '{ "suggestions": [ { "id": string, "label": string, "reason": string } ] }',
    "Match the request to module IDs from the list above."
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

  const roomSummary = rooms.map(r => {
    const bboxStr = r.bbox
      ? ` [canvas position: top-left (${(r.bbox.xPct * 100).toFixed(1)}%, ${(r.bbox.yPct * 100).toFixed(1)}%), size (${(r.bbox.wPct * 100).toFixed(1)}% × ${(r.bbox.hPct * 100).toFixed(1)}%)]`
      : "";
    const notesStr = r.notes ? ` Notes: ${r.notes}` : "";

    // Format structured wall data so the model knows exactly where doors/windows are
    const wallLines = Array.isArray(r.walls) && r.walls.length
      ? "\n  Walls:\n" + r.walls.map(w => {
        const tag = w.isExterior ? "exterior" : (w.adjacentRoomLabel ? `shared with ${w.adjacentRoomLabel}` : "internal");
        const openings = (w.openings || []).map(o =>
          `${o.type} (${(o.widthM || 0).toFixed(1)}m wide, ${(o.offsetFromWestOrNorthM || 0).toFixed(1)}m from ${w.side === "north" || w.side === "south" ? "west" : "north"} end)`
        ).join(", ");
        return `    ${w.side}: ${tag}${openings ? " — " + openings : " — no openings"}`;
      }).join("\n")
      : "";

    return `- ${r.label} (${r.name || r.roomType}): ${r.widthM || "?"}m × ${r.lengthM || "?"}m${bboxStr}${notesStr}${wallLines}`;
  }).join("\n");

  const moduleList = (body.moduleLibrary || []).map(m =>
    `${m.id}: "${m.label}" w=${m.w}m d=${m.d}m h=${m.h}m [${(m.keywords || []).join(", ")}]`
  ).join("\n");

  const prompt = [
    "You are a professional interior designer. Your job: decide WHAT furniture each room needs and WHICH WALL it should sit against.",
    "All spatial context (room sizes, wall types, door/window positions) is provided as structured text below.",
    "A layout engine will compute exact coordinates — you do NOT output x/y numbers.",
    "",
    "YOUR TASK: For each room, choose the right furniture pieces from the list (or invent custom ones) and assign each to a wall.",
    "Rules:",
    "1. WALL ASSIGNMENT: Assign each item to: north | south | east | west | center",
    "2. DO NOT BLOCK DOORS: If a wall has a door, mark it 'hasDoor:true' in your reasoning and prefer lighter items or skip that wall.",
    "3. WINDOWS: Avoid placing tall storage units in front of windows (they block light). Prefer low items (coffee tables, sofas) in front of windows.",
    "4. PRIORITIES: Large cabinets first, then beds, then seating, then tables. Do not overcrowd.",
    "5. CUSTOM ITEMS: If a room needs an item not in the module list, add it with custom wM/dM/hM dimensions.",
    "6. MAX ITEMS: Do not assign more items than can realistically fit.",
    "",
    "Property context:",
    context.bhk ? `- Space type: ${context.bhk}` : "",
    context.propertyType ? `- Property type: ${context.propertyType}` : "",
    context.totalAreaM2 ? `- Total area: ${context.totalAreaM2} m\u00b2` : "",
    context.notes ? `- Notes: ${context.notes}` : "",
    "",
    `Design brief: ${brief || "Modern, minimal, functional"}`,
    "",
    "Rooms:",
    roomSummary,
    "",
    "Available furniture modules (you can also invent custom items):",
    moduleList,
    "",
    "Return STRICT JSON only:",
    `{`,
    `  "assignments": [`,
    `    {`,
    `      "moduleId": string,`,
    `      "label": string,`,
    `      "roomLabel": string,`,
    `      "wall": "north"|"south"|"east"|"west"|"center",`,
    `      "type": "cabinet"|"study"|"bed"|"table"|"seating"|"decor",`,
    `      "wM": number|null,`,
    `      "dM": number|null,`,
    `      "hM": number|null,`,
    `      "rationale": string`,
    `    }`,
    `  ]`,
    `}`
  ].filter(Boolean).join("\n");

  const payload = {
    model,
    reasoning: { effort: "low" },
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
    max_output_tokens: 3000
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
  if (!json || !Array.isArray(json.assignments)) {
    console.error("Autoplace assignment failed to parse. Raw text:", text.slice(0, 500));
    throw httpError(502, "Autoplace returned unexpected output.");
  }

  // Hand assignments to the deterministic packer — it computes exact center coordinates
  const placements = deterministicPack(json.assignments, rooms, body.moduleLibrary || []);
  return { model, placements };
}

/**
 * Deterministic furniture packer.
 * Converts LLM wall assignments into precise (xM, yM) center coordinates.
 * Arranges items sequentially along each wall, skipping door/archway exclusion zones.
 * Outputs placement objects in the same shape as PlannerCanvas.furniturePlacements.
 */
function deterministicPack(assignments, rooms, moduleLibrary) {
  // Priority order for packing (cabinets before seating before decor)
  const TYPE_PRIORITY = { cabinet: 0, study: 0, bed: 1, table: 2, seating: 3, decor: 4 };

  // Group assignments by room then by wall
  const byRoom = {};
  for (const a of assignments) {
    const rl = a.roomLabel || "";
    if (!byRoom[rl]) byRoom[rl] = { north: [], south: [], east: [], west: [], center: [] };
    const wall = (a.wall && byRoom[rl][a.wall]) ? a.wall : "center";
    byRoom[rl][wall].push(a);
  }

  const allPlacements = [];

  for (const [roomLabel, walls] of Object.entries(byRoom)) {
    const room = rooms.find(r => r.label === roomLabel);
    const W = parseFloat(room?.widthM) || 4;
    const L = parseFloat(room?.lengthM) || 4;
    const roomWalls = Array.isArray(room?.walls) ? room.walls : [];

    // Build door exclusion zones for a given wall side (local axis: x for NS, y for EW)
    function getExclusions(side) {
      const wd = roomWalls.find(w => w.side === side);
      if (!wd) return [];
      return (wd.openings || [])
        .filter(o => o.type === "door" || o.type === "archway")
        .map(o => ({
          start: Math.max(0, (o.offsetFromWestOrNorthM || 0) - 0.35),
          end: Math.min(
            side === "north" || side === "south" ? W : L,
            (o.offsetFromWestOrNorthM || 0) + (o.widthM || 0.9) + 0.35
          )
        }));
    }

    // Sort each wall group by type priority
    for (const wallItems of Object.values(walls)) {
      wallItems.sort((a, b) => {
        const pa = TYPE_PRIORITY[a.type] ?? 5;
        const pb = TYPE_PRIORITY[b.type] ?? 5;
        return pa - pb;
      });
    }

    // Pack items along north or south wall (arranged left-to-right, i.e. along x)
    function packNS(wallItems, isNorth) {
      const exclusions = getExclusions(isNorth ? "north" : "south");
      let cursor = 0.3; // start 0.3m from west corner
      const GAP = 0.1;
      const result = [];

      for (const a of wallItems) {
        const mod = moduleLibrary.find(m => m.id === a.moduleId) || {};
        const itemW = a.wM || mod.w || 1.2; // extent along the wall (x axis)
        const itemD = a.dM || mod.d || 0.6; // depth into room (y axis)
        const itemH = a.hM || mod.h || 0.9;

        // Advance cursor past any door that overlaps this item
        let tries = 0;
        while (tries++ < 30) {
          const overlap = exclusions.find(ex => cursor < ex.end && cursor + itemW > ex.start);
          if (!overlap) break;
          cursor = overlap.end + GAP;
        }
        if (cursor + itemW > W - 0.3) continue; // doesn't fit

        const xM = cursor + itemW / 2; // center x
        const yM = isNorth ? itemD / 2 : L - itemD / 2; // center y
        result.push({
          moduleId: a.moduleId, label: a.label || mod.label || a.moduleId,
          roomLabel, xM, yM,
          wM: itemW, dM: itemD, hM: itemH,
          rotationY: isNorth ? 0 : 180,
          wall: isNorth ? "north" : "south",
          type: a.type || mod.type || "cabinet",
          rationale: a.rationale || ""
        });
        cursor += itemW + GAP;
      }
      return result;
    }

    // Pack items along east or west wall (arranged top-to-bottom, i.e. along y)
    // For EW walls: the module's w runs along y, d runs along x (into room)
    function packEW(wallItems, isWest) {
      const exclusions = getExclusions(isWest ? "west" : "east");
      let cursor = 0.3;
      const GAP = 0.1;
      const result = [];

      for (const a of wallItems) {
        const mod = moduleLibrary.find(m => m.id === a.moduleId) || {};
        // When placed on EW wall, the module rotates 90°:
        // module.w now runs along y (wall axis), module.d runs along x (into room)
        const itemW = a.wM || mod.w || 1.2; // now along y
        const itemD = a.dM || mod.d || 0.6; // now along x (depth into room)
        const itemH = a.hM || mod.h || 0.9;

        let tries = 0;
        while (tries++ < 30) {
          const overlap = exclusions.find(ex => cursor < ex.end && cursor + itemW > ex.start);
          if (!overlap) break;
          cursor = overlap.end + GAP;
        }
        if (cursor + itemW > L - 0.3) continue;

        const xM = isWest ? itemD / 2 : W - itemD / 2;
        const yM = cursor + itemW / 2;
        // wM/dM in canvas coords: wM = x-extent, dM = y-extent
        result.push({
          moduleId: a.moduleId, label: a.label || mod.label || a.moduleId,
          roomLabel, xM, yM,
          wM: itemD, dM: itemW, hM: itemH, // swapped: depth becomes canvas wM
          rotationY: isWest ? 270 : 90,
          wall: isWest ? "west" : "east",
          type: a.type || mod.type || "cabinet",
          rationale: a.rationale || ""
        });
        cursor += itemW + GAP;
      }
      return result;
    }

    // Center items: arrange in a simple row
    function packCenter(centerItems) {
      const result = [];
      let row = 0;
      for (const a of centerItems) {
        const mod = moduleLibrary.find(m => m.id === a.moduleId) || {};
        const itemW = a.wM || mod.w || 1.2;
        const itemD = a.dM || mod.d || 0.6;
        const itemH = a.hM || mod.h || 0.9;
        result.push({
          moduleId: a.moduleId, label: a.label || mod.label || a.moduleId,
          roomLabel,
          xM: W / 2,
          yM: L / 2 + row * (itemD + 0.9),
          wM: itemW, dM: itemD, hM: itemH,
          rotationY: 0, wall: "center",
          type: a.type || mod.type || "table",
          rationale: a.rationale || ""
        });
        row++;
      }
      return result;
    }

    allPlacements.push(
      ...packNS(walls.north, true),
      ...packNS(walls.south, false),
      ...packEW(walls.west, true),
      ...packEW(walls.east, false),
      ...packCenter(walls.center)
    );
  }

  return allPlacements;
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
    `[id:${p.id}] ${p.label} in ${p.roomLabel} at (${(p.xM || 0).toFixed(1)}, ${(p.yM || 0).toFixed(1)}), ${(p.wM || 0).toFixed(1)}×${(p.dM || 0).toFixed(1)}m`
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
    "Understand the user's intent and return an ARRAY of structured actions. You can return multiple actions if the user requests moving/removing/adding several items. Actions:",
    "- add: add a new piece  { action:'add', moduleId, label, roomLabel, xM, yM, wM, dM, rotationDeg, rationale }",
    "- move: move existing  { action:'move', id, xM, yM, rationale }",
    "- remove: delete        { action:'remove', id, rationale }",
    "- resize: change dims   { action:'resize', id, wM, dM, rationale }",
    "- message: explain/ask  { action:'message', text }",
    "",
    "Also include a 'reply' string: a short natural language response to the user (1–2 sentences).",
    "",
    "Return STRICT JSON only:",
    `{ "reply": string, "actions": [ { ...as above } ] }`
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
  if (!json || (!json.action && !json.actions)) {
    console.error("Chat placement failed to parse. Raw text:", text.slice(0, 500));
    throw httpError(502, "Chat placement returned unexpected output.");
  }
  return { model, reply: json.reply || "", actions: json.actions || [json.action].filter(Boolean) };
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
      "You are an interior designer + production estimator for modular / plywood + laminate interiors.",
      "Goal: extract a standardized style direction, laminate finish, furniture requirements, and precise visual style descriptions for each furniture type.",
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
      '  "furniture_visual_descriptions": {',
      '    "<furniture_type_or_label>": "<precise visual description — colour, material, legs, silhouette, e.g. dark charcoal low-profile 3-seater sofa with tapered light-oak legs and tight-back cushions>"',
      '  },',
      '  "do_not_do": [ string ]',
      "}",
      "",
      "furniture_visual_descriptions: provide one entry per distinct furniture type likely to appear in this room (sofa, desk, bed, wardrobe, dining table, etc.). Be specific — this text will be injected verbatim into photorealistic render prompts.",
      "Keep laminate recommendation generic (do NOT reference catalog codes).",
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
    max_output_tokens: 1500
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
  if (!json) {
    throw httpError(502, "Style extraction returned non-JSON output: " + text.slice(0, 100));
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
    try {
      return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      return null;
    }
  }
}

function extractJsonFromText(text) {
  let parsed = safeJson(text);
  if (parsed) return parsed;

  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let content = match ? match[1].trim() : text;

  const start = content.indexOf('{');
  let end = content.lastIndexOf('}');
  if (start >= 0) {
    if (end < start) end = content.length; // if '}' is missing entirely

    let slice = content.slice(start, end + 1);
    parsed = safeJson(slice);
    if (parsed) return parsed;

    // Auto-repair truncated JSON arrays
    parsed = safeJson(slice + "]}");
    if (parsed) return parsed;
    parsed = safeJson(slice + "]}]}");
    if (parsed) return parsed;

    // Try stripping the last hanging item entirely and closing
    parsed = safeJson(slice.replace(/,[^,]*$/, '') + "]}");
    if (parsed) return parsed;

    // One more extreme fallback: just strip anything after the last complete object in the placements array
    const lastObjectClose = slice.lastIndexOf('}');
    if (lastObjectClose > 0) {
      parsed = safeJson(slice.slice(0, lastObjectClose + 1) + "]}");
      if (parsed) return parsed;
    }
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
