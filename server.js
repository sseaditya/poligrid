const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const db = require("./db.js");

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

    if (req.method === "POST" && url.pathname === "/api/inspire/extract-furnish-style") {
      const body = await readJson(req);
      const result = await extractFurnishStyleGuidance(body);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname === "/api/project/generate-boq") {
      const body = await readJson(req);
      const result = await generateStructuralBoqWithOpenAi(body);
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

    if (req.method === "POST" && url.pathname === "/api/generate-text") {
      const body = await readJson(req);
      const result = await generateText(body);
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && url.pathname === "/api/project/list") {
      const result = await projectList();
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && url.pathname === "/api/project/load") {
      const id = url.searchParams.get("id");
      const result = await projectLoad(id);
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && url.pathname === "/api/project/versions") {
      const id = url.searchParams.get("id");
      const result = await projectLoadVersions(id);
      return sendJson(res, 200, result);
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/project/")) {
      const body = await readJson(req);
      const action = url.pathname.slice("/api/project/".length);
      const result = await handleProjectAction(action, body);
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
    // Use image[] to support multiple reference images (gpt-image-1 supports up to 16)
    form.append("image[]", new Blob([imageBuffer], { type: mimeType }), "room_3d_reference.png");

    // Additional reference images (e.g. annotated floor plan with camera pin)
    const additionalImages = Array.isArray(body.additionalImages) ? body.additionalImages : [];
    for (let i = 0; i < additionalImages.length; i++) {
      const ai = additionalImages[i];
      if (!ai || !ai.base64) continue;
      const buf = Buffer.from(ai.base64, "base64");
      form.append("image[]", new Blob([buf], { type: ai.mimeType || "image/png" }), ai.name || `ref_${i}.png`);
    }

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
  const roomLabel = body.roomContext?.roomType || "unknown";

  console.log(`[OpenAI] furnishRoom START room=${roomLabel} hasPhoto=${!!emptyRoomBase64} inspirationImages=${inspirationImages.length} precomputedStyle=${!!body.precomputedStyleGuidance}`);

  const _debug = [];

  // STEP 1: Extract Style from Inspiration Images (skip if pre-computed by caller)
  let styleGuidance = String(body.precomputedStyleGuidance || "").trim();
  if (!styleGuidance && inspirationImages.length > 0) {
    console.log(`[OpenAI] furnishRoom STEP1 → extracting style from ${inspirationImages.length} images (inline, not pre-computed)`);
    const extracted = await extractFurnishStyleGuidance({ inspirationBase64: inspirationImages, visionModel });
    styleGuidance = extracted.styleGuidance;
    console.log(`[OpenAI] furnishRoom STEP1 ✓ styleGuidance ${styleGuidance.length} chars`);
    _debug.push({ step: "Vision Style Extraction (inline)", styleGuidance });
  } else if (styleGuidance) {
    console.log(`[OpenAI] furnishRoom STEP1 skipped (pre-computed ${styleGuidance.length} chars)`);
  }

  // STEP 2: Vision Planning (Decide what furniture to place)
  const providedPlacements = Array.isArray(body.placements) ? body.placements : null;
  let placements = providedPlacements;

  const floorPlanBase64 = String(body.floorPlanBase64 || "").trim();
  const cam = body.cameraContext || {};
  const camXFt = mToFtIn(cam.xM || 0);
  const camYFt = mToFtIn(cam.yM || 0);
  const cameraPositionText = `Camera is located at X:${camXFt}, Y:${camYFt} from room origin, facing ${cam.angleDeg || 0}° with a ${cam.fovDeg || 60}° Field of View. The camera pin and FOV cone are already drawn on the floor plan image provided.`;

  if (!placements || placements.length === 0) {
    if (!emptyRoomBase64) {
      throw httpError(400, "Missing empty room photo for Vision Planning.");
    }
    const roomCtxForPlan = body.roomContext || {};
    const roomSizeText = (roomCtxForPlan.widthM && roomCtxForPlan.lengthM)
      ? `${mToFtIn(roomCtxForPlan.widthM)} wide × ${mToFtIn(roomCtxForPlan.lengthM)} long`
      : "unknown size";
    // Describe camera FOV sectors for spatial awareness
    const fovDeg = cam.fovDeg || 60;
    const halfFov = fovDeg / 2;
    const facingAngle = cam.angleDeg || 0;
    const leftEdge = ((facingAngle - halfFov) + 360) % 360;
    const rightEdge = (facingAngle + halfFov) % 360;
    const planningPrompt = [
      "You are a senior interior designer. Plan a COMPLETE furniture scheme for the entire room — not just what's visible in the photo.",
      `ROOM: ${roomCtxForPlan.roomType || 'residential'}, ${roomSizeText}`,
      roomCtxForPlan.archNotes ? `ARCHITECTURAL NOTES: ${roomCtxForPlan.archNotes}` : "",
      `CAMERA REFERENCE (for spatial context only): pin at (${camXFt}, ${camYFt}), facing ${facingAngle}°, FOV ${fovDeg}° (viewing cone from ${leftEdge.toFixed(0)}° to ${rightEdge.toFixed(0)}°). The camera pin and its FOV cone are drawn directly on the floor plan image. Use this to understand what the 3D photo shows, but plan furniture for the ENTIRE room — the list must cover everything, not just visible items.`,
      floorPlanBase64 ? "The floor plan image is provided — it shows all walls, zones, room boundaries, and has the camera pin with FOV cone drawn on it." : "",
      body.brief ? `DESIGN BRIEF: "${body.brief}"` : "",
      styleGuidance
        ? [
          "STYLE DIRECTIVE — This is the most critical instruction. Every item MUST reflect this extracted style:",
          styleGuidance,
          "Name each item with its material/finish explicitly (e.g. 'Walnut-veneer Full-Height Wardrobe', 'Bouclé 3-Seater Sofa on brass legs', 'Fluted oak TV unit'). The label should be descriptive enough to price it."
        ].join("\n")
        : "",
      "Return STRICT JSON only — a 'placements' array covering ALL furniture for this room type. Each item:",
      "  label: specific descriptive name with material and finish (e.g. 'Matte walnut 3-door full-height wardrobe', 'Marble-top 6-seater dining table', 'Linen-upholstered queen bed with padded headboard')",
      "  type: exactly one of 'seating'|'table'|'cabinet'|'bed'|'decor'|'custom'",
      "  category: either 'Modular furniture' (built-in/fitted: wardrobes, kitchen cabinets, TV units, study units, shoe racks) or 'Loose furniture' (free-standing: sofas, beds, dining tables, chairs, decor)",
      "  wFt: realistic width in decimal feet (e.g. 7.0 for a 3-seater sofa, 6.5 for a queen bed, 8.0 for a full-height wardrobe)",
      "  dFt: depth in decimal feet (e.g. 3.0 for sofa, 6.5 for queen bed, 2.0 for wardrobe)",
      "  hFt: height in decimal feet (e.g. 3.0 for sofa, 4.0 for bed with headboard, 7.5 for full-height wardrobe)",
      "  rateINR: your best estimate of the Hyderabad premium market price in INR for this specific item (one unit, supply + install). Be realistic — e.g. a full-height sliding wardrobe ₹95,000, a 3-seater sofa ₹70,000-85,000, a queen bed ₹55,000-70,000, kitchen cabinets ₹45,000-65,000 per unit.",
      "Return NOTHING but valid JSON."
    ].filter(Boolean).join("\n");

    // Floor plan already has the camera pin + FOV cone drawn on it by the frontend (planner canvas composited in)
    const contentArray = [
      { type: "input_text", text: planningPrompt },
      { type: "input_image", image_url: emptyRoomBase64.startsWith("data:") ? emptyRoomBase64 : `data:${mimeType};base64,${emptyRoomBase64}` }
    ];

    if (floorPlanBase64) {
      contentArray.push({
        type: "input_image",
        image_url: floorPlanBase64.startsWith("data:") ? floorPlanBase64 : `data:image/jpeg;base64,${floorPlanBase64}`
      });
    }

    // Include inspiration images in planning so AI picks style-matching furniture
    for (const inspBase64 of inspirationImages.slice(0, 2)) {
      contentArray.push({
        type: "input_image",
        image_url: inspBase64.startsWith("data:") ? inspBase64 : `data:image/jpeg;base64,${inspBase64}`
      });
    }

    const payload = {
      model: visionModel,
      reasoning: { effort: "medium" },
      max_output_tokens: 4000,
      input: [{ role: "user", content: contentArray }]
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
    placements = (jsonOutput?.placements || []).map(p => {
      // AI always returns feet (wFt/dFt/hFt). Compute meters server-side so
      // all downstream code (deterministicPack, furnitureStr, BOQ) uses consistent wM/dM/hM.
      const wFt = parseFloat(p.wFt) || 0;
      const dFt = parseFloat(p.dFt) || 0;
      const hFt = parseFloat(p.hFt) || 0;
      return {
        ...p,
        wFt: wFt || p.wFt,
        dFt: dFt || p.dFt,
        hFt: hFt || p.hFt,
        wM: wFt ? parseFloat((wFt * 0.3048).toFixed(3)) : (parseFloat(p.wM) || 1.2),
        dM: dFt ? parseFloat((dFt * 0.3048).toFixed(3)) : (parseFloat(p.dM) || 0.6),
        hM: hFt ? parseFloat((hFt * 0.3048).toFixed(3)) : (parseFloat(p.hM) || 0.9)
      };
    });
    console.log(`[OpenAI] furnishRoom STEP2 ✓ placements=${placements.length}`);
  } else {
    console.log(`[OpenAI] furnishRoom STEP2 skipped (${placements?.length ?? 0} pre-provided placements)`);
  }

  // STEP 3: Render Generation (DALL-E)
  const roomCtx = body.roomContext || {};
  // wM/dM/hM are always in meters here (either server-converted from wFt, or pre-provided in meters)
  const furnitureStr = placements.map(p =>
    `- ${p.label} (${mToFtIn(p.wM || 1.2)} wide × ${mToFtIn(p.dM || 0.6)} deep × ${mToFtIn(p.hM || 0.9)} tall)`
  ).join("\n");

  const roomDimsText = (roomCtx.widthM && roomCtx.lengthM)
    ? `Room: ${mToFtIn(roomCtx.widthM)} wide × ${mToFtIn(roomCtx.lengthM)} long × 9'-4" ceiling height.`
    : '';

  const wallLines = Array.isArray(roomCtx.walls) && roomCtx.walls.length
    ? roomCtx.walls.map(w => {
      const openings = (w.openings || []).map(o => `${o.type} (${mToFtIn(o.widthM || 0.9)} wide)`).join(', ');
      return `${w.side}: ${w.isExterior ? 'exterior' : 'interior'}${openings ? ' — ' + openings : ''}`;
    }).join(' | ')
    : '';

  // Floor plan already has camera pin + FOV cone composited by the frontend — send it as the single reference
  const renderAdditionalImages = [];
  if (floorPlanBase64) {
    const fpRaw = floorPlanBase64.includes("base64,") ? floorPlanBase64.split("base64,")[1] : floorPlanBase64;
    renderAdditionalImages.push({ base64: fpRaw, mimeType: "image/jpeg", name: "floor_plan_with_camera.jpg" });
  }

  let renderPrompt;

  if (emptyRoomBase64) {
    // ── IMAGE-TO-IMAGE: preserve structure exactly, apply style + add furniture ──
    renderPrompt = [
      "INTERIOR DESIGN RENDER — you are editing the REFERENCE PHOTOGRAPH provided as the first image.",
      "═══ CRITICAL SPATIAL INTEGRITY RULES — MUST NOT CHANGE ═══",
      "• Every wall surface visible in the photo: exact same position, shape, and perspective — DO NOT move, warp, or replace any wall",
      "• All architectural elements: every door (exact position, size, swing direction), every window (exact position, size, mullion pattern) — UNCHANGED",
      "• Camera viewpoint: identical perspective angle, focal length, vanishing points, horizon line, and spatial distortion as the reference photo — DO NOT re-angle or zoom",
      "• Ceiling height and room proportions: UNCHANGED — do not raise, lower, or stretch the space",
      "• Floor plane: same perspective, same level — furniture must sit on THIS floor, not a redrawn one",
      "═══ PERMITTED CHANGES — apply style to surfaces ═══",
      "• Wall paint / finish: update colour and texture to match the style guide",
      "• Floor finish: replace with style-appropriate material (tile, wood, stone)",
      "• Ceiling finish and cove/recessed lighting: update per style",
      "• Lighting mood: warm or cool as directed",
      "═══ PRIMARY TASK — place furniture ═══",
      "Place every furniture item listed below into the room photograph. Requirements:",
      "- Each piece must sit flush on the EXISTING floor plane with correct perspective foreshortening from the reference camera angle",
      "- Scale each item accurately against the room dimensions stated below",
      "- Cast realistic shadows from the existing light sources",
      "- No floating, no clipping into walls, no blocking exit doors",
      roomDimsText,
      wallLines ? `ARCHITECTURE: ${wallLines}. Never block doors or interrupt window light paths.` : "",
      `FURNITURE:\n${furnitureStr}`,
      body.brief ? `DESIGN BRIEF: ${body.brief}` : "",
      styleGuidance
        ? ["STYLE GUIDE — apply to all surfaces AND furniture:", styleGuidance].join("\n")
        : "",
      `CAMERA REFERENCE: ${cameraPositionText}`,
      floorPlanBase64
        ? "The floor plan image provided shows the camera pin and FOV cone — use it only to verify spatial relationships — do NOT alter the photographic viewpoint."
        : ""
    ].filter(Boolean).join("\n");
  } else {
    // ── TEXT-TO-IMAGE: generate full room render ──────────────────────────────
    renderPrompt = [
      "Photorealistic interior design photograph, professional architectural photography quality, shot on full-frame camera.",
      roomDimsText,
      wallLines ? `ROOM LAYOUT — walls: ${wallLines}. Do NOT block doors or windows with furniture.` : "",
      `ROOM TYPE: ${roomCtx.roomType || 'residential living space'}`,
      roomCtx.archNotes ? `ARCHITECTURAL NOTES: ${roomCtx.archNotes}` : "",
      `FURNITURE (place all items; respect room scale and ensure natural circulation paths):\n${furnitureStr}`,
      body.brief ? `DESIGN BRIEF: ${body.brief}` : "Modern Indian residential interior, warm and liveable.",
      styleGuidance
        ? [
          "COMPREHENSIVE STYLE GUIDE — apply every detail below faithfully:",
          styleGuidance,
          "Match colors, materials, finishes, lighting mood, and decorative elements from the style guide exactly."
        ].join("\n")
        : "",
      `CAMERA: ${cameraPositionText}`,
      floorPlanBase64
        ? "The floor plan image shows the camera pin and viewing cone — compose the shot from the exact pin location and angle indicated."
        : ""
    ].filter(Boolean).join("\n");
  }

  console.log(`[OpenAI] furnishRoom STEP3 → render model=${body.renderModel || "gpt-image-1.5"} mode=${emptyRoomBase64 ? "image-edit" : "text-to-image"} promptLen=${renderPrompt.length}`);

  const renderResult = await renderWithOpenAi({
    model: body.renderModel || "gpt-image-1.5",
    prompt: renderPrompt,
    imageBase64: emptyRoomBase64,
    mimeType: mimeType,
    additionalImages: emptyRoomBase64 ? renderAdditionalImages : []
  });

  if (renderResult._debug) _debug.push(...renderResult._debug);
  console.log(`[OpenAI] furnishRoom STEP3 ✓ render complete`);

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

  console.log(`[OpenAI] analyzeFloorPlan → model=${model} imageSize=${Math.round(imageBase64.length / 1024)}KB (rooms+dimensions only, BOQ is separate call)`);

  const isCommercial = (body.context?.propertyType || "").toLowerCase().includes("commercial");

  const prompt = [
    "You are an expert architectural floor plan analyst.",
    "You are analyzing a technical drawing (CAD, architectural blueprint, or hand-drafted plan).",
    "DIMENSION READING: Read ALL dimension annotations visible on the drawing (e.g. '7-5\"', '8-1\"', '14-2\"', '10.5 ft' etc.). Prefer annotated dimensions over visual estimation. Convert all annotated dimensions to meters (1 ft = 0.3048 m) for the widthM/lengthM output fields. Estimate from visual scale only if no annotations are present.",
    "LABEL READING: Room/zone labels may appear as zone codes (ZONE-1, ZONE-2), numeric IDs (101, 102), abbreviations (LR, MBR, KIT), or plain text. Use whatever is printed inside or adjacent to each enclosed space as the label.",
    "Extract ALL rooms/spaces visible in the drawing.",
    "For each room return:",
    "  - label: the exact text label or code shown on the plan for that space. If none visible, generate a short code.",
    "  - name: human readable name (e.g. 'Open Office', 'Conference Room', 'Reception', 'Living Room')",
    isCommercial
      ? "  - roomType: one of: office, conference, reception, pantry, store, workstation, bathroom, utility, foyer, other"
      : "  - roomType: one of: bedroom, living, kitchen, bathroom, dining, study, balcony, foyer, utility, other",
    "  - bbox: TIGHT bounding box hugging the room's actual wall lines, as fractions of image dimensions: { xPct, yPct, wPct, hPct } (0.0–1.0). Do NOT add padding — the box must align with the walls.",
    "  - widthM: room width in meters (converted from feet-inch annotation; estimate only if no annotation)",
    "  - lengthM: room length in meters (converted from feet-inch annotation; estimate only if no annotation)",
    "  - notes: brief plain-text summary including dimensions in feet (e.g. '11\\'-6\" × 13\\'-0\", open plan with glazed east partition')",
    "  - walls: array of exactly 4 wall objects, one per side. For each wall:",
    "      { side: 'north'|'south'|'east'|'west',",
    "        isExterior: boolean (true if it faces outside the building),",
    "        adjacentRoomLabel: string|null (label of neighbouring room if shared wall, else null),",
    "        openings: array of openings on this wall, each:",
    "          { type: 'door'|'window'|'glazed-partition'|'archway'|'none',",
    "            widthM: number (opening width in meters),",
    "            offsetFromWestOrNorthM: number (distance in meters from the left/top end of that wall to the opening's near edge) }",
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
    `- Total Area: ${body.context?.totalAreaM2 ? m2ToSqft(body.context.totalAreaM2) + " sqft" : "unspecified"}`,
    `- Additional Notes/Brief: ${body.context?.notes || "none"}`,
    "CRITICAL: Pay close attention to the Additional Notes/Brief as it contains literal descriptions of the rooms from the user.",
    "",
    "Also return top-level:",
    "  - totalAreaM2: approximate total floor area in square meters (sum of individual room areas)",
    "  - bhkType: e.g. '2BHK', '3BHK', 'Small Office', 'Open Plan Office'",
    "  - orientation: compass orientation if north arrow visible, else 'unknown'",
    "  - summary: 1-2 sentence description of the plan",
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
    console.error("[OpenAI] analyzeFloorPlan ✗ failed to parse. Raw text:", text.slice(0, 500));
    throw httpError(502, "Floor plan analysis returned unexpected output.");
  }

  console.log(`[OpenAI] analyzeFloorPlan ✓ rooms=${json.rooms?.length ?? 0} area=${json.totalAreaM2 ?? "?"}m²`);
  return {
    model,
    analysis: json,
    _debug: [{ step: "Floor Plan Analysis", payload, response: parsed }]
  };
}

async function generateStructuralBoqWithOpenAi(body) {
  const apiKey = resolveApiKey("", process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const model = String(body.model || DEFAULT_OPENAI_VISION_MODEL).trim();
  const floorPlanBase64 = String(body.floorPlanBase64 || "").trim();
  const rooms = Array.isArray(body.rooms) ? body.rooms : [];
  const ctx = body.context || {};

  const totalAreaM2 = ctx.totalAreaM2 || rooms.reduce((s, r) => s + ((r.widthM || 0) * (r.lengthM || 0)), 0);
  const totalAreaSqft = Math.round(totalAreaM2 * 10.764);
  const bathroomCount = rooms.filter(r => r.roomType === "bathroom").length;
  const kitchenCount = rooms.filter(r => r.roomType === "kitchen").length;
  const roomSummary = rooms.map(r => {
    const wStr = r.widthM ? mToFtIn(r.widthM) : "?";
    const lStr = r.lengthM ? mToFtIn(r.lengthM) : "?";
    const roomSqft = r.widthM && r.lengthM ? ` (${Math.round(r.widthM * r.lengthM * 10.764)} sqft)` : "";
    const doorCount = r.walls ? r.walls.flatMap(w => w.openings || []).filter(o => o.type === "door").length : 0;
    const winCount = r.walls ? r.walls.flatMap(w => w.openings || []).filter(o => o.type === "window").length : 0;
    return `  - ${r.name || r.label} (${r.roomType}): ${wStr} × ${lStr}${roomSqft}` +
      (r.walls ? `, doors=${doorCount}, windows=${winCount}` : "");
  }).join("\n");

  console.log(`[OpenAI] generateStructuralBoq → rooms=${rooms.length} area=${totalAreaSqft}sqft bathrooms=${bathroomCount}`);

  const prompt = [
    "You are an expert interior design project estimator specialising in Indian residential and commercial interiors.",
    "Generate a COMPREHENSIVE structural Bill of Quantities (BOQ) for the project described below.",
    "Use HYDERABAD PREMIUM MARKET RATES (INR). Be generous and realistic — this is a premium interior project.",
    "ALL dimensions and quantities are in feet, sqft, or rft — do NOT use meters or sqm anywhere.",
    "",
    `Project: ${ctx.propertyType || "Apartment"}, ${ctx.bhk || ""}, total area ≈ ${totalAreaSqft} sqft`,
    `Rooms:\n${roomSummary}`,
    ctx.notes ? `Client notes: ${ctx.notes}` : "",
    "",
    "Return STRICT JSON only — a single object with a \"globalBoq\" array.",
    "Include ALL 7 categories with MULTIPLE line items each (be detailed, not lumped):",
    "",
    "'Civil work'        — partition walls (rft × rate), waterproofing for bathrooms/kitchen/balcony (sqft × rate), any masonry or structural work",
    "                      Rates: partition wall ₹900-1,400/rft, waterproofing ₹130-200/sqft",
    "'Plumbing'          — per room: CP fittings (EWC, wash basin, shower, bathtub), supply pipes, drainage. Separate line per bathroom/kitchen.",
    "                      Rates: per bathroom ₹50,000-75,000 lump sum, kitchen plumbing ₹35,000-55,000 lump sum, balcony point ₹8,000-12,000",
    "'Electrical'        — DB/MCB panel, wiring (light + power points per room), earthing, switches+sockets. Separate line per room.",
    "                      Rates: DB + MCBs ₹25,000-40,000, per room wiring+points ₹8,000-18,000 depending on room size",
    "'Faux ceiling'      — gypsum board false ceiling with cove lighting per room (living, dining, master bed, kitchen). Separate line per room.",
    "                      Rates: ₹100-145/sqft. Estimate 60-80% of each room area has false ceiling.",
    "'Flooring'          — vitrified tiles or wood finish per room. Separate line per room.",
    "                      Rates: living/dining ₹160-220/sqft, bedrooms ₹135-185/sqft, kitchen/bath ₹115-165/sqft",
    "'Doors and windows' — count from room data. Main entrance door, internal flush doors, bathroom doors, UPVC windows per room.",
    "                      Rates: main door ₹60,000-95,000, internal flush door ₹24,000-34,000, bathroom door ₹18,000-26,000, UPVC window ₹950-1,450/sqft",
    "'Painting'          — premium emulsion for walls + ceiling per room. Wall area ≈ 2.5× floor area per room + ceiling area.",
    "                      Rates: ₹38-58/sqft (walls+ceiling combined)",
    "",
    "For each item: { \"category\": string, \"item\": string, \"qty\": number, \"unit\": string, \"rate\": number, \"amount\": number }",
    "unit must be one of: 'sqft', 'pcs', 'rft', 'points', 'lump sum'  — NEVER use sqm",
    "amount = qty × rate",
    "NEVER return an empty globalBoq. Every project has all 7 categories.",
    floorPlanBase64 ? "Use the floor plan image provided to accurately count doors, windows, and wet areas." : ""
  ].filter(Boolean).join("\n");

  const content = [{ type: "input_text", text: prompt }];
  if (floorPlanBase64) {
    content.push({
      type: "input_image",
      image_url: floorPlanBase64.startsWith("data:") ? floorPlanBase64 : `data:image/png;base64,${floorPlanBase64}`
    });
  }

  const payload = {
    model,
    reasoning: { effort: "medium" },
    max_output_tokens: 8000,
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
  const json = extractJsonFromText(text);
  const globalBoq = json?.globalBoq || [];

  console.log(`[OpenAI] generateStructuralBoq ✓ ${globalBoq.length} items across ${new Set(globalBoq.map(b => b.category)).size} categories`);

  return {
    globalBoq,
    _debug: [{ step: "Structural BOQ Generation", payload, response: parsed }]
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
    .map(m => `  - id:"${m.id}" label:"${m.label}" w:${mToFtIn(m.w)} d:${mToFtIn(m.d)} h:${mToFtIn(m.h)} type:${m.type}`)
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
          `${o.type} (${mToFtIn(o.widthM || 0)} wide, ${mToFtIn(o.offsetFromWestOrNorthM || 0)} from ${w.side === "north" || w.side === "south" ? "west" : "north"} end)`
        ).join(", ");
        return `    ${w.side}: ${tag}${openings ? " — " + openings : " — no openings"}`;
      }).join("\n")
      : "";

    return `- ${r.label} (${r.name || r.roomType}): ${r.widthM ? mToFtIn(r.widthM) : "?"} × ${r.lengthM ? mToFtIn(r.lengthM) : "?"}${bboxStr}${notesStr}${wallLines}`;
  }).join("\n");

  const moduleList = (body.moduleLibrary || []).map(m =>
    `${m.id}: "${m.label}" w=${mToFtIn(m.w)} d=${mToFtIn(m.d)} h=${mToFtIn(m.h)} [${(m.keywords || []).join(", ")}]`
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
    "5. CUSTOM ITEMS: If a room needs an item not in the module list, add it with custom wFt/dFt/hFt dimensions in feet (e.g. a custom peninsula counter: wFt:8.0, dFt:2.5, hFt:3.0).",
    "6. MAX ITEMS: Do not assign more items than can realistically fit.",
    "",
    "Property context:",
    context.bhk ? `- Space type: ${context.bhk}` : "",
    context.propertyType ? `- Property type: ${context.propertyType}` : "",
    context.totalAreaM2 ? `- Total area: ${m2ToSqft(context.totalAreaM2)} sqft` : "",
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
    `      "wFt": number|null,   // custom item width in feet (null = use module default)`,
    `      "dFt": number|null,   // custom item depth in feet`,
    `      "hFt": number|null,   // custom item height in feet`,
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

  // Convert AI's feet dimensions to meters before passing to the deterministic packer
  const assignmentsInMeters = json.assignments.map(a => ({
    ...a,
    wM: a.wFt ? parseFloat((a.wFt * 0.3048).toFixed(3)) : (a.wM || null),
    dM: a.dFt ? parseFloat((a.dFt * 0.3048).toFixed(3)) : (a.dM || null),
    hM: a.hFt ? parseFloat((a.hFt * 0.3048).toFixed(3)) : (a.hM || null)
  }));

  // Hand assignments to the deterministic packer — it computes exact center coordinates
  const placements = deterministicPack(assignmentsInMeters, rooms, body.moduleLibrary || []);
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
    `[id:${p.id}] ${p.label} in ${p.roomLabel} at (${mToFtIn(p.xM || 0)}, ${mToFtIn(p.yM || 0)}), ${mToFtIn(p.wM || 0)} × ${mToFtIn(p.dM || 0)}`
  ).join("\n") || "(empty)";

  const moduleList = moduleLibrary.map(m =>
    `${m.id}: "${m.label}" default ${mToFtIn(m.w)} × ${mToFtIn(m.d)}`
  ).join("\n");

  const roomList = rooms.map(r =>
    `${r.label} (${r.roomType}) ${r.widthM ? mToFtIn(r.widthM) : "?"} × ${r.lengthM ? mToFtIn(r.lengthM) : "?"}`
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
    "- add: add a new piece  { action:'add', moduleId, label, roomLabel, xFt, yFt, wFt, dFt, rotationDeg, rationale }  — positions and dims in decimal feet",
    "- move: move existing  { action:'move', id, xFt, yFt, rationale }  — position in decimal feet from room origin",
    "- remove: delete        { action:'remove', id, rationale }",
    "- resize: change dims   { action:'resize', id, wFt, dFt, rationale }  — new dims in decimal feet",
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

  // AI returns feet (xFt, yFt, wFt, dFt). Convert to meters for the canvas engine.
  const ft2m = ft => ft ? parseFloat((ft * 0.3048).toFixed(3)) : undefined;
  const normalizeAction = a => {
    if (!a || typeof a !== "object") return a;
    const out = { ...a };
    if (a.xFt != null) { out.xM = ft2m(a.xFt); delete out.xFt; }
    if (a.yFt != null) { out.yM = ft2m(a.yFt); delete out.yFt; }
    if (a.wFt != null) { out.wM = ft2m(a.wFt); delete out.wFt; }
    if (a.dFt != null) { out.dM = ft2m(a.dFt); delete out.dFt; }
    return out;
  };
  const rawActions = json.actions || [json.action].filter(Boolean);
  const actions = rawActions.map(normalizeAction);

  return {
    model,
    reply: json.reply || "",
    actions,
    _debug: [{ step: "Chat Placement Assistant", payload, response: parsed }]
  };
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
        reasoning: { effort: "medium" },
        max_output_tokens: 1800,
        input: [{ role: "user", content: styleContent }]
      })
    });
    const raw = await res.text();
    const parsed = safeJson(raw);
    const styleGuidance = extractResponsesText(parsed) || "";
    console.log(`[OpenAI] extractFurnishStyle ✓ ${styleGuidance.length} chars`);
    return {
      styleGuidance,
      _debug: [{ step: "Inspiration Style Extraction", payload: { model: visionModel, images: inspirationImages.length }, response: parsed }]
    };
  } catch (e) {
    console.warn("[OpenAI] extractFurnishStyle ✗ failed:", e.message);
    return { styleGuidance: "", _debug: [{ step: "Inspiration Style Extraction", payload: {}, response: { error: { message: e.message } } }] };
  }
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

async function generateText(body) {
  const apiKey = resolveApiKey("", process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  const model   = DEFAULT_OPENAI_TEXT_MODEL;
  const prompt  = String(body.prompt || "").trim();
  const maxTok  = Math.min(parseInt(body.maxTokens) || 500, 1000);
  if (!prompt) throw httpError(400, "Missing prompt for text generation.");

  const payload = {
    model,
    reasoning: { effort: "low" },
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
    max_output_tokens: maxTok,
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  if (!response.ok) throw httpError(response.status, extractApiError(raw));

  const text = extractResponsesText(safeJson(raw));
  console.log(`[OpenAI] generateText ✓ chars=${text.length}`);
  return { text };
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

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/** Convert decimal meters to a feet-inches string, e.g. 3.2 → "10'-6\"" */
function mToFtIn(m) {
  const totalInches = (parseFloat(m) || 0) * 39.3701;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  if (inches >= 12) return `${feet + 1}'-0"`;
  return `${feet}'-${inches}"`;
}

/** Convert m² to sqft string */
function m2ToSqft(m2) {
  return `${Math.round((parseFloat(m2) || 0) * 10.764)} sqft`;
}

// ─── Minimal pure-JS PNG encoder (no native dependencies) ────────────────────
const _CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function _crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = _CRC32_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function _u32be(n) { return [(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF]; }

function _makePngChunk(type, data) {
  const tb = Buffer.from(type, "ascii");
  const crcSrc = Buffer.concat([tb, data]);
  return Buffer.concat([Buffer.from(_u32be(data.length)), tb, data, Buffer.from(_u32be(_crc32(crcSrc)))]);
}

function _encodePng(pixels, w, h) {
  // pixels: Buffer, RGBA, w*h*4 bytes
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = _makePngChunk("IHDR", Buffer.from([..._u32be(w), ..._u32be(h), 8, 6, 0, 0, 0]));
  const scanlines = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const row = y * (1 + w * 4);
    scanlines[row] = 0; // filter: None
    pixels.copy(scanlines, row + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = _makePngChunk("IDAT", zlib.deflateSync(scanlines, { level: 1 }));
  const iend = _makePngChunk("IEND", Buffer.alloc(0));
  return Buffer.concat([PNG_SIG, ihdr, idat, iend]);
}

/**
 * Create a bird's-eye camera-position diagram as a base64 PNG.
 * Shows room boundary, camera dot (red), and FOV cone (blue).
 * roomWidthM, roomLengthM: room dimensions in meters
 * camXM, camYM: camera position in meters from room origin
 * angleDeg: facing direction (0=north/up, 90=east/right)
 * fovDeg: field of view in degrees
 */
function createCameraAnnotationPng(roomWidthM, roomLengthM, camXM, camYM, angleDeg, fovDeg) {
  const W = 220, H = 220;
  const pix = Buffer.alloc(W * H * 4, 255); // white, opaque

  function sp(x, y, r, g, b) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const i = (y * W + x) * 4;
    pix[i] = r; pix[i + 1] = g; pix[i + 2] = b; pix[i + 3] = 255;
  }

  function line(x0, y0, x1, y1, r, g, b, thickness = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (let i = 0; i < 1000; i++) {
      for (let t = -Math.floor(thickness / 2); t <= Math.floor(thickness / 2); t++) {
        if (dx > dy) sp(x0, y0 + t, r, g, b); else sp(x0 + t, y0, r, g, b);
      }
      sp(x0, y0, r, g, b);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }

  function fillRect(x0, y0, x1, y1, r, g, b) {
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++)
        sp(x, y, r, g, b);
  }

  function fillCircle(cx, cy, radius, r, g, b) {
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++)
        if (dx * dx + dy * dy <= radius * radius) sp(cx + dx, cy + dy, r, g, b);
  }

  const pad = 20;
  const rw = W - pad * 2;
  const rh = H - pad * 2;

  // Light gray room fill
  fillRect(pad, pad, pad + rw, pad + rh, 240, 240, 240);

  // Room border (dark gray, 2px)
  for (let t = 0; t < 2; t++) {
    for (let x = pad - t; x <= pad + rw + t; x++) { sp(x, pad - t, 80, 80, 80); sp(x, pad + rh + t, 80, 80, 80); }
    for (let y = pad - t; y <= pad + rh + t; y++) { sp(pad - t, y, 80, 80, 80); sp(pad + rw + t, y, 80, 80, 80); }
  }

  // Camera position in image coordinates (clamp to room)
  const fracX = roomWidthM ? Math.min(Math.max(camXM / roomWidthM, 0.05), 0.95) : 0.5;
  const fracY = roomLengthM ? Math.min(Math.max(camYM / roomLengthM, 0.05), 0.95) : 0.5;
  const cx = Math.round(pad + fracX * rw);
  const cy = Math.round(pad + fracY * rh);

  // FOV cone (blue semi-transparent overlay via darker lines)
  const coneLen = Math.min(rw, rh) * 0.45;
  const halfFov = ((fovDeg || 60) / 2) * Math.PI / 180;
  const baseAngle = ((angleDeg || 0) - 90) * Math.PI / 180; // rotate so 0°=up
  const la = baseAngle - halfFov;
  const ra = baseAngle + halfFov;
  const ex1 = cx + Math.cos(la) * coneLen;
  const ey1 = cy + Math.sin(la) * coneLen;
  const ex2 = cx + Math.cos(ra) * coneLen;
  const ey2 = cy + Math.sin(ra) * coneLen;

  // Fill cone interior with light blue
  const steps = 30;
  for (let s = 0; s <= steps; s++) {
    const a = la + (ra - la) * (s / steps);
    for (let d = 0; d <= coneLen; d += 1.5) {
      sp(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 180, 210, 240);
    }
  }

  line(cx, cy, ex1, ey1, 0, 80, 180, 2);
  line(cx, cy, ex2, ey2, 0, 80, 180, 2);
  line(ex1, ey1, ex2, ey2, 0, 80, 180, 1);

  // Camera dot (red)
  fillCircle(cx, cy, 7, 210, 30, 30);
  fillCircle(cx, cy, 4, 255, 80, 80);

  return _encodePng(pix, W, H).toString("base64");
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

// ─── Project DB Handlers ─────────────────────────────────────────────────────

async function handleProjectAction(action, body) {
  switch (action) {
    case "save-analysis": return projectSaveAnalysis(body);
    case "save-rooms": return projectSaveRooms(body);
    case "save-inspiration": return projectSaveInspiration(body);
    case "save-pin": return projectSavePin(body);
    case "save-render": return projectSaveRender(body);
    case "save-placements": return projectSavePlacements(body);
    case "save-boq": return projectSaveBoq(body);
    case "update-boq": return projectUpdateBoq(body);
    case "save-scene": return projectSaveScene(body);
    case "rename": return projectRename(body);
    case "save-brief": return projectSaveBrief(body);
    case "create-version": return projectCreateVersion(body);
    default: throw httpError(404, "Unknown project action: " + action);
  }
}

// ── Create a new design version for a project ─────────────────────────────────
async function projectCreateVersion(body) {
  const { projectId, designBrief, regenInspirationImages } = body;
  if (!projectId) throw httpError(400, "Missing projectId");
  const sb = db.getClient();

  // Determine next version number
  const { data: existing } = await sb
    .from("project_versions")
    .select("version_number")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false })
    .limit(1);
  const nextNum = existing?.length ? existing[0].version_number + 1 : 1;

  // Upload version-specific inspiration images if provided
  let regenInspirationPaths = null;
  if (Array.isArray(regenInspirationImages) && regenInspirationImages.length > 0) {
    const paths = [];
    for (let i = 0; i < regenInspirationImages.length; i++) {
      const img = regenInspirationImages[i];
      if (!img.base64) continue;
      const ext = (img.mimeType || "").includes("png") ? "png" : "jpg";
      const storagePath = await db.uploadBase64(
        "poligrid-inspiration",
        `${projectId}/v${nextNum}_insp_${Date.now()}_${i}.${ext}`,
        img.base64,
        img.mimeType || "image/jpeg"
      );
      if (storagePath) paths.push(storagePath);
    }
    if (paths.length) regenInspirationPaths = paths;
  }

  const { data, error } = await sb
    .from("project_versions")
    .insert({
      project_id: projectId,
      version_number: nextNum,
      design_brief: designBrief || null,
      regen_inspiration_paths: regenInspirationPaths
    })
    .select()
    .single();

  if (error) throw httpError(500, "Failed to create version: " + error.message);
  return { version: data };
}

// ── Load all versions for a project with their renders + BOQ ──────────────────
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
      sb.from("renders").select("*").eq("version_id", v.id).order("created_at", { ascending: true }),
      sb.from("boq_items").select("*").eq("version_id", v.id)
    ]);
    // Version-specific inspiration overrides project-level inspiration
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
    }).eq("id", existingFp.id);
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

  // Get current max sort_order so new images append rather than collide
  const sb = db.getClient();
  const { data: existing } = await sb
    .from("inspiration_images")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const offset = existing?.[0]?.sort_order != null ? existing[0].sort_order + 1 : 0;

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
      sort_order: offset + i
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
    // Version-specific: insert without deleting (each version owns its BOQ)
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

  // Legacy path (no version): replace all furniture_generated items
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

async function projectUpdateBoq(body) {
  const { projectId, versionId, projectItems, versionItems } = body;
  if (!projectId) throw httpError(400, "Missing projectId");
  const sb = db.getClient();

  // Replace project-level (floor plan) BOQ items
  if (Array.isArray(projectItems)) {
    await db.replaceRows(
      "boq_items",
      { project_id: projectId, source: "floor_plan_analysis" },
      projectItems.map(b => ({
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

  // Replace version-level BOQ items
  if (versionId && Array.isArray(versionItems)) {
    const { error: delErr } = await sb.from("boq_items").delete().eq("version_id", versionId);
    if (delErr) console.error("[DB] Delete version BOQ failed:", delErr.message);
    if (versionItems.length) {
      const rows = versionItems.map(b => ({
        project_id: projectId,
        version_id: versionId,
        source: "furniture_generated",
        category: b.category,
        item: b.item,
        qty: b.qty,
        unit: b.unit,
        rate: b.rate,
        amount: b.amount
      }));
      const { error: insErr } = await sb.from("boq_items").insert(rows);
      if (insErr) console.error("[DB] Insert updated version BOQ failed:", insErr.message);
    }
  }

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

  // For each version, fetch its renders and BOQ in parallel
  const versionsWithData = await Promise.all((versions || []).map(async v => {
    const [{ data: renders }, { data: boq }] = await Promise.all([
      sb.from("renders").select("*").eq("version_id", v.id).order("created_at", { ascending: true }),
      sb.from("boq_items").select("*").eq("version_id", v.id)
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
