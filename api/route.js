"use strict";
// Vercel serverless entry point — handles all /api/* requests.
// All AI handler functions are appended below from the shared logic.

const db = require("../db.js");

const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-1.5";
const DEFAULT_OPENAI_TEXT_MODEL  = "gpt-5.4-mini";
const DEFAULT_OPENAI_VISION_MODEL = "gpt-5.4";

module.exports = async (req, res) => {
  // Allow CORS for browser calls (Vercel rewrites already scope this to /api/*)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  try {
    const url = new URL(req.url || "/", `https://${req.headers.host || "localhost"}`);

    if (req.method === "POST" && url.pathname === "/api/render/openai") {
      return sendJson(res, 200, await renderWithOpenAi(await readJson(req)));
    }
    if (req.method === "POST" && url.pathname === "/api/style/extract") {
      return sendJson(res, 200, await extractStyleWithOpenAi(await readJson(req)));
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
    if (req.method === "POST" && url.pathname === "/api/inspire/extract-furnish-style") {
      return sendJson(res, 200, await extractFurnishStyleGuidance(await readJson(req)));
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
      const action = url.pathname.slice("/api/project/".length);
      return sendJson(res, 200, await handleProjectAction(action, await readJson(req)));
    }
    return sendJson(res, 404, { error: "Not found." });

  } catch (error) {
    const message = error?.message || "Server error";
    const status  = Number(error?.statusCode) || 500;
    console.error("[API]", status, message, error?.stack || "");
    return sendJson(res, status, { error: message });
  }
};

// ─── Handler functions (extracted from server.js) ────────────────────────────
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

  const debugPayload = imageBase64 ? { model, prompt, quality: "low", image: "[Base64 Data Omitted]" } : JSON.parse(payload);
  const _debug = [{ step: "DALL-E Render Generaton", payload: debugPayload, response: parsed }];

  if (firstImage.b64_json) {
    return { provider: "openai", model, dataUrl: `data:image/png;base64,${firstImage.b64_json}`, _debug };
  }
  if (firstImage.url) {
    return { provider: "openai", model, dataUrl: firstImage.url, _debug };
  }
  throw httpError(502, "OpenAI response did not include b64_json or url.");
}

async function furnishRoomWithOpenAi(body) {
  const apiKey = resolveApiKey("", process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const visionModel = String(body.visionModel || DEFAULT_OPENAI_VISION_MODEL).trim();

  const emptyRoomBase64 = String(body.emptyRoomBase64 || "").trim();
  const mimeType = String(body.mimeType || "image/jpeg").trim();
  const inspirationImages = Array.isArray(body.inspirationBase64) ? body.inspirationBase64 : [];

  const _debug = [];

  // STEP 1: Use precomputed style guidance (extracted once before the per-room loop)
  // Fall back to a quick inline extraction only if nothing was precomputed.
  let styleGuidance = String(body.precomputedStyleGuidance || "").trim();
  if (!styleGuidance && inspirationImages.length > 0) {
    const stylePrompt = [
      "Describe the interior design style, color palette, materials, and overall mood shown in these inspiration images.",
      "Keep it strictly under 3 sentences, focusing only on actionable visual details."
    ].join("\n");
    const styleContent = [{ type: "input_text", text: stylePrompt }];
    for (const inspBase64 of inspirationImages.slice(0, 3)) {
      styleContent.push({
        type: "input_image",
        image_url: inspBase64.startsWith("data:") ? inspBase64 : `data:${mimeType};base64,${inspBase64}`
      });
    }
    try {
      const stylePayload = {
        model: visionModel,
        reasoning: { effort: "medium" },
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
      _debug.push({ step: "Vision Style Extraction (fallback)", payload: stylePayload, response: parsed });
      styleGuidance = extractResponsesText(parsed) || "";
    } catch (e) {
      console.warn("Style extraction failed:", e);
    }
  }

  // STEP 2: Vision Planning (Decide what furniture to place)
  const providedPlacements = Array.isArray(body.placements) ? body.placements : null;
  let placements = providedPlacements;
  
  const floorPlanBase64 = String(body.floorPlanBase64 || "").trim();
  const cam = body.cameraContext || {};
  const cameraPositionText = `Camera is located at X:${cam.xM || 0}m, Y:${cam.yM || 0}m relative to the room origin, facing angle ${cam.angleDeg || 0}° with a ${cam.fovDeg || 60}° Field of View.`;

  if (!placements || placements.length === 0) {
    if (!emptyRoomBase64) {
      throw httpError(400, "Missing empty room photo for Vision Planning. Please provide a photo or floor plan placements.");
    }
    const planningPrompt = [
      "You are an expert interior designer. You have been given a photo of an empty room.",
      floorPlanBase64 ? "You have also been given the top-down floor plan image for spatial context." : "",
      body.brief ? `CRITICAL CONTEXT: The user requested the following Design Brief/Room Type: "${body.brief}". Prioritize furnishing it matching this exact purpose.` : "",
      styleGuidance ? `STYLE CONTEXT: Use the following extracted style guidance to determine appropriate furniture choices:\n"${styleGuidance}"` : "",
      `CAMERA POSITIONS: ${cameraPositionText}. Use this to understand what parts of the room are currently visible in the provided empty room photo before deciding furniture placement.`,
      "Based on the room's geometry, requested brief, and the implied style, generate a complete list of furniture necessary to furnish this room.",
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

    if (floorPlanBase64) {
      contentArray.push({
        type: "input_image",
        image_url: floorPlanBase64.startsWith("data:") ? floorPlanBase64 : `data:image/png;base64,${floorPlanBase64}`
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
    _debug.push({ step: "Vision Room Planning", payload: payload, response: parsed });
    const jsonOutput = extractJsonFromText(extractResponsesText(parsed));
    placements = jsonOutput?.placements || [];
  }

  // STEP 3: Render Generation (DALL-E)
  const furnitureStr = placements.map(p => `- ${p.label} (${p.wM}x${p.dM}m, height ${p.hM || 0.9}m)`).join("\n");
  const roomCtx = body.roomContext || {};
  const roomDimsText = (roomCtx.widthM && roomCtx.lengthM)
    ? `Room dimensions: ${roomCtx.widthM}m wide × ${roomCtx.lengthM}m long × 2.85m ceiling height.`
    : '';

  // Describe wall openings so the AI knows where doors/windows are
  const wallLines = Array.isArray(roomCtx.walls) && roomCtx.walls.length
    ? roomCtx.walls.map(w => {
        const openings = (w.openings || []).map(o => `${o.type} (${o.widthM || 0.9}m wide)`).join(', ');
        return `${w.side} wall: ${w.isExterior ? 'exterior' : 'interior'}${openings ? ' — ' + openings : ' — solid'}`;
      }).join('; ')
    : '';

  const fovDeg = cam.fovDeg || 60;
  const angleDeg = cam.angleDeg != null ? cam.angleDeg : 0;
  // Convert numeric angle to compass description (0°=North, clockwise)
  const compassDirs = ["North","NNE","NE","ENE","East","ESE","SE","SSE","South","SSW","SW","WSW","West","WNW","NW","NNW"];
  const compassFacing = compassDirs[Math.round(((angleDeg % 360) + 360) % 360 / 22.5) % 16];
  // Determine which walls are in view based on facing angle + FOV
  const halfFov = fovDeg / 2;
  const visibleWalls = [];
  const cardinals = [["North wall",0],["East wall",90],["South wall",180],["West wall",270]];
  for (const [wallName, wallAngle] of cardinals) {
    let diff = Math.abs(((wallAngle - angleDeg) % 360 + 360) % 360);
    if (diff > 180) diff = 360 - diff;
    if (diff <= halfFov + 45) visibleWalls.push(wallName);
  }
  const cameraViewText = [
    `CRITICAL CAMERA CONSTRAINTS — MUST BE FOLLOWED EXACTLY:`,
    `  • Camera is at position X:${cam.xM != null ? cam.xM : 0}m, Y:${cam.yM != null ? cam.yM : 0}m in the room, facing ${compassFacing} (${angleDeg}°).`,
    `  • Field of View: ${fovDeg}°. Only what falls within this cone from the camera position is visible.`,
    `  • Walls visible in this shot: ${visibleWalls.join(", ")}. These walls MUST appear as solid boundaries in the render.`,
    `  • DO NOT omit walls that are in the camera's view — every visible wall must be rendered with its correct surface.`,
    `  • Door and window openings on visible walls MUST be faithfully rendered — do NOT block or fill them with furniture.`,
    `  • Maintain correct one-point or two-point perspective for this camera direction. Vanishing points must match ${compassFacing}-facing view.`,
    `  • Furniture must sit on the floor, against the correct walls, with proper clearance gaps between pieces and walls.`,
  ].join("\n");

  const renderPrompt = [
    "Photorealistic architectural interior render.",
    cameraViewText,
    roomDimsText,
    wallLines ? `WALL LAYOUT: ${wallLines}. These walls, doors, and windows ARE REAL — render them faithfully.` : "",
    `FURNITURE TO PLACE (must fit within room; respect clearances between pieces and walls):\n${furnitureStr}`,
    emptyRoomBase64
      ? "Maintain the EXACT architectural geometry, perspective, lighting, wall positions, and camera angle of the provided empty room photo. Do not alter any architectural element."
      : `Room type: ${roomCtx.roomType || 'residential'}. Generate a realistic perspective view from the specified camera angle.`,
    roomCtx.archNotes ? `Architectural notes: ${roomCtx.archNotes}` : "",
    body.brief ? `Design Brief: ${body.brief}` : "Apply a modern, clean Indian residential style.",
    styleGuidance ? `STYLE — apply this throughout (materials, colours, mood):\n${styleGuidance}` : "",
  ].filter(Boolean).join("\n");

  const renderResult = await renderWithOpenAi({
    model: body.renderModel || "gpt-image-1.5",
    prompt: renderPrompt,
    imageBase64: emptyRoomBase64,
    mimeType: mimeType
  });

  if (renderResult._debug) _debug.push(...renderResult._debug);

  return { 
    dataUrl: renderResult.dataUrl,
    furnitureList: placements,
    _debug
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
    "  - bbox: TIGHT bounding box hugging the room's actual wall lines, as fractions of image dimensions: { xPct, yPct, wPct, hPct } (0.0–1.0). Do NOT add padding — the box must align with the walls.",
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
    "  - globalBoq: exhaustive bill of quantities for the ENTIRE project. CRITICAL RULES:",
    "    1. NEVER return an empty array.",
    "    2. You MUST return items in ALL 8 categories below — every project needs all of them.",
    "    3. Use Hyderabad (India) premium market rates in INR.",
    "    4. Estimate quantities from totalAreaM2 and room count if not explicitly visible on drawing.",
    "    CATEGORIES (use EXACTLY these strings):",
    "      'Civil work'      — demolition, partition walls, masonry, structural changes",
    "      'Plumbing'        — supply lines, drainage, fixtures (bathrooms, kitchen) — estimate per room count",
    "      'Faux ceiling'    — false ceiling with coves/lights — estimate sqm from room areas",
    "      'Modular furniture' — wardrobes, kitchen cabinets, TV units, study units — count per room type",
    "      'Loose furniture' — sofas, beds, dining tables, chairs — count per room type",
    "      'Flooring'        — tiles or wood — total carpet area in sqm",
    "      'Doors and windows' — count all doors and windows visible or typical for the layout",
    "      'Painting'        — internal walls + ceiling — estimate 2.5× floor area for wall area",
    "    For each item return:",
    "      - category: EXACTLY one of the 8 strings above",
    "      - item: descriptive name e.g. 'Vitrified tile flooring (800×800)', 'Full-height wardrobe', 'Internal flush door'",
    "      - qty: numeric quantity",
    "      - unit: 'sqm', 'pcs', 'rft', 'lump sum', 'points'",
    "      - rate: Hyderabad premium INR rate per unit",
    "      - amount: qty × rate",
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

  return { 
    model, 
    analysis: json,
    _debug: [{ step: "Floor Plan Analysis", payload, response: parsed }]
  };
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
  return { 
    model, 
    reply: json.reply || "", 
    actions: json.actions || [json.action].filter(Boolean),
    _debug: [{ step: "Chat Placement Assistant", payload, response: parsed }]
  };
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

// BOQ-specific extraction: handles truncated globalBoq arrays by closing them properly
function extractBoqJson(text) {
  if (!text) return null;

  // Try clean parse first
  let parsed = safeJson(text);
  if (parsed && Array.isArray(parsed.globalBoq)) return parsed;

  // Strip markdown fences
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let content = fence ? fence[1].trim() : text;

  // Find the start of the outer object
  const start = content.indexOf('{');
  if (start < 0) return null;
  content = content.slice(start);

  // Try direct parse
  parsed = safeJson(content);
  if (parsed && Array.isArray(parsed.globalBoq)) return parsed;

  // The response is likely truncated mid-array. Find the globalBoq array start.
  const arrStart = content.indexOf('"globalBoq"');
  if (arrStart < 0) return null;

  // Find the last complete BOQ item (ends with }) and close the structure
  // Collect all complete objects from the array
  const arrayOpen = content.indexOf('[', arrStart);
  if (arrayOpen < 0) return null;

  // Walk through to find all complete {...} objects
  const items = [];
  let depth = 0, inStr = false, escape = false, itemStart = -1;
  for (let i = arrayOpen + 1; i < content.length; i++) {
    const ch = content[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inStr) { escape = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') { if (depth === 0) itemStart = i; depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && itemStart >= 0) {
        items.push(content.slice(itemStart, i + 1));
        itemStart = -1;
      }
    } else if (ch === ']' && depth === 0) break;
  }

  if (items.length === 0) return null;

  // Reconstruct valid JSON from the complete items we found
  const reconstructed = `{"globalBoq":[${items.join(",")}]}`;
  parsed = safeJson(reconstructed);
  if (parsed && Array.isArray(parsed.globalBoq)) {
    console.log(`[BOQ] Repaired truncated JSON: recovered ${parsed.globalBoq.length} items`);
    return parsed;
  }
  return null;
}

function extractResponsesText(response) {
  const output = Array.isArray(response && response.output) ? response.output : [];
  // Prefer output_text typed items (the actual model reply) over any other text.
  // Reasoning models return reasoning summaries as plain text items first —
  // picking them up causes the JSON parse to fail with their prose content.
  for (const item of output) {
    const content = Array.isArray(item && item.content) ? item.content : [];
    for (const c of content) {
      if (c && c.type === "output_text" && typeof c.text === "string" && c.text.trim()) {
        return c.text.trim();
      }
    }
  }
  // Fallback: accept any text content if no output_text found
  for (const item of output) {
    const content = Array.isArray(item && item.content) ? item.content : [];
    for (const c of content) {
      if (c && typeof c.text === "string" && c.text.trim()) {
        return c.text.trim();
      }
    }
  }
  // Last resort: some variants store in response.output_text
  if (typeof response?.output_text === "string") {
    return response.output_text.trim();
  }
  return "";
}

async function extractFurnishStyleGuidance(body) {
  const apiKey = resolveApiKey("", process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const visionModel = String(body.visionModel || DEFAULT_OPENAI_VISION_MODEL).trim();
  const inspirationImages = Array.isArray(body.inspirationBase64) ? body.inspirationBase64 : [];

  if (inspirationImages.length === 0) return { styleGuidance: "" };

  console.log(`[OpenAI] extractFurnishStyle → model=${visionModel} images=${inspirationImages.length}`);

  const stylePrompt = [
    "You are a senior interior designer. Analyze these inspiration images and extract HIGHLY SPECIFIC, ACTIONABLE design details that can guide a photorealistic render.",
    "Structure your response in these exact sections:",
    "COLOR PALETTE: List each color with descriptive names (e.g. 'warm ivory walls #F5F0E8', 'dark charcoal sofa fabric', 'aged brass hardware', 'off-white ceiling'). Be specific.",
    "MATERIALS & FINISHES: Name exact materials (e.g. 'matte walnut veneer cabinetry', 'honed Carrara marble countertop', 'brushed brass fixtures', 'bouclé upholstery', 'wide-plank oak flooring', 'limewash walls'). List every material visible.",
    "FURNITURE FORM LANGUAGE: Describe the silhouette and construction style (e.g. 'low-profile tight-back sofa on tapered legs', 'curved fluted cabinet fronts', 'minimalist floating shelves with no visible hardware', 'rattan accent chairs').",
    "LIGHTING CHARACTER: Describe quality and sources (e.g. 'warm 2700K ambient light from concealed cove', 'pendant lights over dining table', 'natural light through sheer white linen curtains', 'soft bounce off white walls').",
    "SPATIAL MOOD & ATMOSPHERE: One sentence describing the feel (e.g. 'quiet understated luxury with an earthy warmth', 'crisp Japandi minimalism', 'layered bohemian warmth').",
    "DECORATIVE DETAILS: List specific decor items visible (e.g. 'large-format abstract canvas on wall', 'sculptural ceramic vases', 'woven jute rug', 'potted fiddle-leaf fig', 'stacked art books on coffee table').",
    "Be exhaustive and precise — a render artist must be able to reproduce this style exactly from your description."
  ].join("\n");

  const styleContent = [{ type: "input_text", text: stylePrompt }];
  for (const inspBase64 of inspirationImages.slice(0, 4)) {
    styleContent.push({
      type: "input_image",
      image_url: inspBase64.startsWith("data:") ? inspBase64 : `data:image/jpeg;base64,${inspBase64}`
    });
  }

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: visionModel,
        max_output_tokens: 2000,
        input: [{ role: "user", content: styleContent }]
      })
    });
    const raw = await res.text();
    if (!res.ok) throw httpError(res.status, extractApiError(raw));
    const parsed = safeJson(raw);
    const styleGuidance = extractResponsesText(parsed) || "";
    console.log(`[OpenAI] extractFurnishStyle ✓ ${styleGuidance.length} chars`);
    return {
      styleGuidance,
      _debug: [{ step: "Inspiration Style Extraction", payload: { model: visionModel, images: inspirationImages.length }, response: parsed }]
    };
  } catch (e) {
    console.warn("[OpenAI] extractFurnishStyle ✗ failed:", e.message);
    return { styleGuidance: "" };
  }
}

async function generateStructuralBoqWithOpenAi(body) {
  const apiKey = resolveApiKey("", process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const model = String(body.model || DEFAULT_OPENAI_VISION_MODEL).trim();
  const floorPlanBase64 = String(body.floorPlanBase64 || "").trim();
  const rooms = Array.isArray(body.rooms) ? body.rooms : [];
  const ctx = body.context || {};

  const totalAreaM2 = ctx.totalAreaM2 || rooms.reduce((s, r) => s + ((r.widthM || 0) * (r.lengthM || 0)), 0);
  const roomSummary = rooms.map(r =>
    `  - ${r.name || r.label} (${r.roomType}): ${r.widthM || "?"}m × ${r.lengthM || "?"}m` +
    (r.walls ? `, doors=${r.walls.flatMap(w => w.openings || []).filter(o => o.type === "door").length}` +
    `, windows=${r.walls.flatMap(w => w.openings || []).filter(o => o.type === "window").length}` : "")
  ).join("\n");

  console.log(`[OpenAI] generateStructuralBoq → rooms=${rooms.length} area=${totalAreaM2}m²`);

  const prompt = [
    "You are an expert interior design project estimator specialising in Indian residential and commercial interiors.",
    "Generate a COMPREHENSIVE structural Bill of Quantities (BOQ) for the project described below.",
    "Use current HYDERABAD PREMIUM MARKET RATES (INR) — derive all rates yourself based on your knowledge of premium Hyderabad interior market. Do NOT use generic or average rates.",
    floorPlanBase64 ? "You have been provided the floor plan image. Study it carefully to count every room, wet area, door, window, and balcony before computing quantities." : "",
    "",
    `Project: ${ctx.propertyType || "Apartment"}, ${ctx.bhk || ""}, total area ≈ ${totalAreaM2.toFixed(1)} m² (${(totalAreaM2 * 10.764).toFixed(0)} sqft)`,
    `Rooms:\n${roomSummary}`,
    ctx.notes ? `Client notes: ${ctx.notes}` : "",
    "",
    "Return STRICT JSON only — a single object with a \"globalBoq\" array.",
    "Include ALL 7 categories with MULTIPLE detailed line items each:",
    "",
    "'Civil work'        — partition walls (per rft), waterproofing per wet area (sqft), masonry or structural work as needed",
    "'Plumbing'          — itemise separately per bathroom, kitchen, balcony: CP fittings (EWC, wash basin, shower, bathtub as applicable), supply lines, drainage",
    "'Electrical'        — DB/MCB panel, per-room wiring and points (light, power, AC, fan), earthing, switches and sockets per room",
    "'Faux ceiling'      — gypsum false ceiling with cove lighting per applicable room (living, dining, master bed, kitchen); give per-room sqft quantity",
    "'Flooring'          — appropriate finish per room type (vitrified/porcelain tile or engineered wood); give per-room sqft quantity",
    "'Doors and windows' — main entrance door, internal flush doors, bathroom doors, UPVC/aluminium windows; count from floor plan",
    "'Painting'          — premium emulsion for walls and ceiling per room; compute wall area from floor plan dimensions",
    "",
    "For each item: { \"category\": string, \"item\": string, \"qty\": number, \"unit\": string, \"rate\": number, \"amount\": number }",
    "unit must be one of: 'sqft', 'sqm', 'pcs', 'rft', 'points', 'lump sum'",
    "amount = qty × rate",
    "NEVER return an empty globalBoq. Every project must have all 7 categories with itemised line items."
  ].filter(Boolean).join("\n");

  const content = [{ type: "input_text", text: prompt }];
  if (floorPlanBase64) {
    content.push({
      type: "input_image",
      image_url: floorPlanBase64.startsWith("data:") ? floorPlanBase64 : `data:image/png;base64,${floorPlanBase64}`
    });
  }

  // No reasoning — give all tokens to the JSON output
  const payload = {
    model,
    max_output_tokens: 10000,
    input: [{ role: "user", content }]
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
  console.log(`[OpenAI] generateStructuralBoq raw text length=${text ? text.length : 0}`);

  const json = extractBoqJson(text);
  const globalBoq = json?.globalBoq || [];

  console.log(`[OpenAI] generateStructuralBoq ✓ ${globalBoq.length} items across ${new Set(globalBoq.map(b => b.category)).size} categories`);

  if (globalBoq.length === 0) {
    console.error("[OpenAI] generateStructuralBoq returned 0 items. Raw text:", text ? text.slice(0, 500) : "(null)");
  }

  return {
    globalBoq,
    _debug: [{ step: "Structural BOQ Generation", payload, response: parsed }]
  };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function handleProjectAction(action, body) {
  switch (action) {
    case "save-analysis":    return projectSaveAnalysis(body);
    case "save-rooms":       return projectSaveRooms(body);
    case "save-inspiration": return projectSaveInspiration(body);
    case "save-pin":         return projectSavePin(body);
    case "save-render":      return projectSaveRender(body);
    case "save-placements":  return projectSavePlacements(body);
    case "save-boq":         return projectSaveBoq(body);
    case "save-scene":       return projectSaveScene(body);
    case "rename":           return projectRename(body);
    case "save-brief":       return projectSaveBrief(body);
    case "create-version":   return projectCreateVersion(body);
    case "generate-boq":     return generateStructuralBoqWithOpenAi(body);
    default: throw httpError(404, "Unknown project action: " + action);
  }
}

async function projectCreateVersion(body) {
  const { projectId, designBrief, regenInspirationImages, regenExistingInspirationPaths } = body;
  if (!projectId) throw httpError(400, "Missing projectId");
  const sb = db.getClient();
  const { data: existing } = await sb
    .from("project_versions").select("version_number")
    .eq("project_id", projectId).order("version_number", { ascending: false }).limit(1);
  const nextNum = existing?.length ? existing[0].version_number + 1 : 1;
  let regenInspirationPaths = null;
  if (Array.isArray(regenInspirationImages) && regenInspirationImages.length > 0) {
    // New files uploaded — upload them and store fresh paths
    const paths = [];
    for (let i = 0; i < regenInspirationImages.length; i++) {
      const img = regenInspirationImages[i];
      if (!img.base64) continue;
      const ext = (img.mimeType || "").includes("png") ? "png" : "jpg";
      const storagePath = await db.uploadBase64(
        "poligrid-inspiration",
        `${projectId}/v${nextNum}_insp_${Date.now()}_${i}.${ext}`,
        img.base64, img.mimeType || "image/jpeg"
      );
      if (storagePath) paths.push(storagePath);
    }
    if (paths.length) regenInspirationPaths = paths;
  } else if (Array.isArray(regenExistingInspirationPaths) && regenExistingInspirationPaths.length > 0) {
    // No new files — reuse the existing project-level storage paths so the version has an explicit reference
    regenInspirationPaths = regenExistingInspirationPaths;
  }
  const { data, error } = await sb.from("project_versions")
    .insert({ project_id: projectId, version_number: nextNum, design_brief: designBrief || null, regen_inspiration_paths: regenInspirationPaths })
    .select().single();
  if (error) throw httpError(500, "Failed to create version: " + error.message);
  return { version: data };
}

async function projectLoadVersions(projectId) {
  if (!projectId) throw httpError(400, "Missing projectId");
  const sb = db.getClient();
  const supabaseUrl = process.env.SUPABASE_URL;
  const pubUrl = (bucket, storagePath) =>
    storagePath ? `${supabaseUrl}/storage/v1/object/public/${bucket}/${storagePath}` : null;
  const [{ data: versions }, { data: insps }] = await Promise.all([
    sb.from("project_versions").select("*").eq("project_id", projectId).order("version_number", { ascending: true }),
    sb.from("inspiration_images").select("*").eq("project_id", projectId).order("sort_order", { ascending: true })
  ]);
  const versionsWithData = await Promise.all((versions || []).map(async v => {
    const [{ data: renders }, { data: boq }] = await Promise.all([
      sb.from("renders").select("*").eq("project_id", projectId).eq("version_id", v.id).order("created_at", { ascending: true }),
      sb.from("boq_items").select("*").eq("project_id", projectId).eq("version_id", v.id)
    ]);
    const inspPaths = v.regen_inspiration_paths;
    const inspUrls = inspPaths
      ? inspPaths.map(p => pubUrl("poligrid-inspiration", p))
      : (insps || []).map(i => pubUrl("poligrid-inspiration", i.storage_path));
    return {
      ...v,
      renders: (renders || []).map(r => ({ ...r, url: pubUrl("poligrid-renders", r.storage_path) })),
      boqItems: boq || [],
      inspirationUrls: inspUrls.filter(Boolean)
    };
  }));
  return { versions: versionsWithData };
}

async function projectSaveAnalysis(body) {
  const { projectId, floorPlanBase64, fileName, analysis, context } = body;
  if (!projectId) throw httpError(400, "Missing projectId");

  await db.upsertProject(projectId, {
    property_type: context?.propertyType,
    bhk: context?.bhk,
    total_area_m2: context?.totalAreaM2 || analysis?.totalAreaM2,
    notes: context?.notes,
    bhk_type: analysis?.bhkType,
    orientation: analysis?.orientation,
    summary: analysis?.summary
  });

  const storagePath = await db.uploadBase64(
    "poligrid-floor-plans",
    `${projectId}/floorplan.png`,
    floorPlanBase64,
    "image/png"
  );

  // Floor plan is static per project — upsert in place rather than inserting a new row
  const sb = db.getClient();
  const { data: existingFp } = await sb.from("floor_plans").select("id").eq("project_id", projectId).limit(1).single();
  let fpId;
  if (existingFp) {
    await sb.from("floor_plans").update({
      file_name: fileName || "floorplan.png",
      storage_path: storagePath,
      analysis_raw: analysis,
      analyzed_at: new Date().toISOString()
    }).eq("id", existingFp.id).eq("project_id", projectId);
    fpId = existingFp.id;
  } else {
    fpId = await db.insertRow("floor_plans", {
      project_id: projectId,
      file_name: fileName || "floorplan.png",
      storage_path: storagePath,
      analysis_raw: analysis,
      analyzed_at: new Date().toISOString()
    });
  }

  const rooms = analysis?.rooms || [];
  if (rooms.length) {
    await db.replaceRows("rooms", { project_id: projectId }, rooms.map(r => ({
      project_id: projectId,
      floor_plan_id: fpId,
      label: r.label,
      name: r.name,
      room_type: r.roomType,
      bbox_x_pct: r.bbox?.xPct,
      bbox_y_pct: r.bbox?.yPct,
      bbox_w_pct: r.bbox?.wPct,
      bbox_h_pct: r.bbox?.hPct,
      width_m: r.widthM,
      length_m: r.lengthM,
      notes: r.notes,
      walls: r.walls || null,
      fp_placements: r.placements || null
    })));
  }

  const boq = analysis?.globalBoq || [];
  if (boq.length) {
    await db.replaceRows(
      "boq_items",
      { project_id: projectId, source: "floor_plan_analysis" },
      boq.map(b => ({
        project_id: projectId,
        source: "floor_plan_analysis",
        category: b.category,
        item: b.item,
        qty: b.qty,
        unit: b.unit,
        rate: b.rate,
        amount: b.amount
      }))
    );
  }

  return { ok: true };
}

async function projectSaveRooms(body) {
  const { projectId, rooms } = body;
  if (!projectId) throw httpError(400, "Missing projectId");

  await db.replaceRows("rooms", { project_id: projectId }, (rooms || []).map(r => ({
    project_id: projectId,
    label: r.label,
    name: r.name,
    room_type: r.roomType,
    bbox_x_pct: r.bbox?.xPct,
    bbox_y_pct: r.bbox?.yPct,
    bbox_w_pct: r.bbox?.wPct,
    bbox_h_pct: r.bbox?.hPct,
    width_m: r.widthM,
    length_m: r.lengthM,
    notes: r.notes
  })));

  return { ok: true };
}

async function projectSaveInspiration(body) {
  const { projectId, images } = body;
  if (!projectId) throw httpError(400, "Missing projectId");

  // Ensure the project row exists before inserting child rows (FK constraint)
  await db.upsertProject(projectId, {});

  const sb = db.getClient();

  // Replace all existing project-level inspiration images — prevents old images
  // from bleeding into new versions via the fallback in projectLoadVersions.
  await sb.from("inspiration_images").delete().eq("project_id", projectId);

  const rows = [];
  for (let i = 0; i < (images || []).length; i++) {
    const img = images[i];
    if (!img.base64) continue;
    const ext = (img.mimeType || "").includes("png") ? "png" : "jpg";
    const storagePath = await db.uploadBase64(
      "poligrid-inspiration",
      `${projectId}/${Date.now()}_${i}.${ext}`,
      img.base64,
      img.mimeType || "image/jpeg"
    );
    rows.push({
      project_id: projectId,
      file_name: img.fileName || `${i}.${ext}`,
      storage_path: storagePath,
      sort_order: i
    });
  }

  if (rows.length) {
    const { error } = await sb.from("inspiration_images").insert(rows);
    if (error) console.error("[DB] Insert inspiration_images failed:", error.message);
  }
  return { ok: true };
}

async function projectSavePin(body) {
  const { projectId, pin } = body;
  if (!projectId || !pin?.clientId) throw httpError(400, "Missing projectId or pin.clientId");

  let photoStoragePath = null;
  if (pin.photoDataUrl) {
    const ext = (pin.photoMimeType || "").includes("png") ? "png" : "jpg";
    photoStoragePath = await db.uploadBase64(
      "poligrid-pin-photos",
      `${projectId}/${pin.clientId}.${ext}`,
      pin.photoDataUrl,
      pin.photoMimeType || "image/jpeg"
    );
  }

  await db.upsertPin(projectId, {
    project_id: projectId,
    client_id: pin.clientId,
    x_m: pin.xM,
    y_m: pin.yM,
    angle_deg: pin.angleDeg,
    fov_deg: pin.fovDeg,
    room_label: pin.roomLabel,
    brief: pin.brief,
    photo_file_name: pin.photoFileName || null,
    photo_storage_path: photoStoragePath || pin.existingPhotoPath || null
  });

  return { ok: true };
}

async function projectSaveRender(body) {
  const { projectId, pinClientId, roomLabel, dataUrl, modelUsed, furnitureList, generationType, versionId } = body;
  if (!projectId) throw httpError(400, "Missing projectId");

  const ts = Date.now();
  const safe = (roomLabel || "room").replace(/[^a-z0-9_]/gi, "_").toLowerCase();
  const storagePath = await db.uploadBase64(
    "poligrid-renders",
    `${projectId}/${safe}_${ts}.png`,
    dataUrl,
    "image/png"
  );

  await db.insertRow("renders", {
    project_id: projectId,
    camera_pin_client_id: pinClientId || null,
    room_label: roomLabel,
    storage_path: storagePath,
    model_used: modelUsed || null,
    furniture_list: furnitureList || null,
    generation_type: generationType || "generate",
    version_id: versionId || null
  });

  return { ok: true };
}

async function projectSavePlacements(body) {
  const { projectId, placements } = body;
  if (!projectId) throw httpError(400, "Missing projectId");

  await db.replaceRows("furniture_placements", { project_id: projectId }, (placements || []).map(p => ({
    project_id: projectId,
    client_id: p.id,
    module_id: p.moduleId,
    label: p.label,
    type: p.type,
    room_label: p.roomLabel,
    room_type: p.roomType,
    x_m: p.xM,
    y_m: p.yM,
    w_m: p.wM,
    d_m: p.dM,
    h_m: p.hM,
    rotation_y: p.rotationY,
    wall: p.wall,
    color: p.color,
    source: p.source || "manual"
  })));

  return { ok: true };
}

async function projectSaveBoq(body) {
  const { projectId, boqItems, versionId } = body;
  if (!projectId) throw httpError(400, "Missing projectId");
  const sb = db.getClient();

  if (versionId) {
    const rows = (boqItems || []).map(b => ({
      project_id: projectId,
      source: "furniture_generated",
      version_id: versionId,
      category: b.category,
      item: b.item,
      qty: b.qty,
      unit: b.unit,
      rate: b.rate,
      amount: b.amount
    }));
    if (rows.length) {
      const { error } = await sb.from("boq_items").insert(rows);
      if (error) console.error("[DB] Insert version BOQ failed:", error.message);
    }
    return { ok: true };
  }

  await db.replaceRows(
    "boq_items",
    { project_id: projectId, source: "furniture_generated" },
    (boqItems || []).map(b => ({
      project_id: projectId,
      source: "furniture_generated",
      category: b.category,
      item: b.item,
      qty: b.qty,
      unit: b.unit,
      rate: b.rate,
      amount: b.amount
    }))
  );

  return { ok: true };
}

async function projectSaveScene(body) {
  const { projectId, sceneJson, boqCsv } = body;
  if (!projectId) throw httpError(400, "Missing projectId");

  let csvPath = null;
  if (boqCsv) {
    csvPath = await db.uploadText(
      "poligrid-exports",
      `${projectId}/boq_${Date.now()}.csv`,
      boqCsv,
      "text/csv; charset=utf-8"
    );
  }

  await db.insertRow("scene_exports", {
    project_id: projectId,
    scene_json: sceneJson || null,
    boq_csv_storage_path: csvPath
  });

  return { ok: true };
}

async function projectList() {
  const sb = db.getClient();
  const supabaseUrl = process.env.SUPABASE_URL;
  const { data, error } = await sb
    .from("projects")
    .select("id, name, property_type, bhk, bhk_type, total_area_m2, summary, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw httpError(500, "Failed to list projects: " + error.message);

  const projects = await Promise.all((data || []).map(async p => {
    const { data: fps } = await sb
      .from("floor_plans")
      .select("storage_path")
      .eq("project_id", p.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const fp = fps && fps[0];
    return {
      ...p,
      thumbnail_url: fp?.storage_path
        ? `${supabaseUrl}/storage/v1/object/public/poligrid-floor-plans/${fp.storage_path}`
        : null
    };
  }));
  return { projects };
}

async function projectLoad(id) {
  if (!id) throw httpError(400, "Missing project id");
  const sb = db.getClient();
  const supabaseUrl = process.env.SUPABASE_URL;
  const pubUrl = (bucket, storagePath) =>
    storagePath ? `${supabaseUrl}/storage/v1/object/public/${bucket}/${storagePath}` : null;

  const [
    { data: project },
    { data: fps },
    { data: rooms },
    { data: cameraPins },
    { data: furniturePlacements },
    { data: boqItems },
    { data: inspirationImages },
    { data: versions }
  ] = await Promise.all([
    sb.from("projects").select("*").eq("id", id).single(),
    sb.from("floor_plans").select("*").eq("project_id", id).order("created_at", { ascending: false }).limit(1),
    sb.from("rooms").select("*").eq("project_id", id),
    sb.from("camera_pins").select("*").eq("project_id", id),
    sb.from("furniture_placements").select("*").eq("project_id", id),
    sb.from("boq_items").select("*").eq("project_id", id).eq("source", "floor_plan_analysis"),
    sb.from("inspiration_images").select("*").eq("project_id", id).order("sort_order", { ascending: true }),
    sb.from("project_versions").select("*").eq("project_id", id).order("version_number", { ascending: true })
  ]);

  if (!project) throw httpError(404, "Project not found");
  const fp = fps && fps[0] ? { ...fps[0], url: pubUrl("poligrid-floor-plans", fps[0].storage_path) } : null;

  const versionsWithData = await Promise.all((versions || []).map(async v => {
    const [{ data: renders }, { data: boq }] = await Promise.all([
      sb.from("renders").select("*").eq("project_id", id).eq("version_id", v.id).order("created_at", { ascending: true }),
      sb.from("boq_items").select("*").eq("project_id", id).eq("version_id", v.id)
    ]);
    const inspPaths = v.regen_inspiration_paths;
    const inspUrls = inspPaths
      ? inspPaths.map(p => pubUrl("poligrid-inspiration", p))
      : (inspirationImages || []).map(i => pubUrl("poligrid-inspiration", i.storage_path));
    return {
      ...v,
      renders: (renders || []).map(r => ({ ...r, url: pubUrl("poligrid-renders", r.storage_path) })),
      boqItems: boq || [],
      inspirationUrls: inspUrls.filter(Boolean)
    };
  }));

  return {
    project,
    floorPlan: fp,
    rooms: rooms || [],
    cameraPins: (cameraPins || []).map(p => ({
      ...p,
      photo_url: pubUrl("poligrid-pin-photos", p.photo_storage_path)
    })),
    furniturePlacements: furniturePlacements || [],
    boqItems: boqItems || [],
    inspirationImages: (inspirationImages || []).map(i => ({
      ...i,
      url: pubUrl("poligrid-inspiration", i.storage_path)
    })),
    versions: versionsWithData
  };
}

async function projectRename(body) {
  const { projectId, name } = body;
  if (!projectId) throw httpError(400, "Missing projectId");
  const sb = db.getClient();
  const { error } = await sb.from("projects").update({ name: name || null }).eq("id", projectId);
  if (error) throw httpError(500, "Rename failed: " + error.message);
  return { ok: true };
}

async function projectSaveBrief(body) {
  const { projectId, globalBrief } = body;
  if (!projectId) throw httpError(400, "Missing projectId");
  const sb = db.getClient();
  const { error } = await sb.from("projects").update({ global_brief: globalBrief || null }).eq("id", projectId);
  if (error) throw httpError(500, "Save brief failed: " + error.message);
  return { ok: true };
}
