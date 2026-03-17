const LAMINATE_LIBRARY = [
  // Internal rate card SKUs (auto-picked; UI does not expose selection)
  { code: "LW-101", name: "Matte Walnut", family: "Woodgrain", ratePerSqFt: 102, color: "#8a5a3b", tags: ["warm", "walnut", "wood", "modern warm"] },
  { code: "LW-152", name: "Teak Linea", family: "Woodgrain", ratePerSqFt: 106, color: "#a66d3f", tags: ["teak", "wood", "warm"] },
  { code: "MO-221", name: "Warm Ivory Matte", family: "Solid Matte", ratePerSqFt: 94, color: "#d7c8a5", tags: ["ivory", "beige", "neutral", "warm", "minimal"] },
  { code: "MO-248", name: "Olive Sand", family: "Solid Matte", ratePerSqFt: 97, color: "#b6b39f", tags: ["olive", "sand", "earthy", "neutral"] },
  { code: "TC-410", name: "Smoky Concrete", family: "Textured", ratePerSqFt: 109, color: "#8d8e8e", tags: ["concrete", "grey", "industrial", "modern"] },
  { code: "HG-309", name: "Pearl Gloss", family: "High Gloss", ratePerSqFt: 118, color: "#f2f1ec", tags: ["gloss", "pearl", "bright", "contemporary"] }
];

const MODULE_LIBRARY = [
  {
    id: "wardrobe",
    label: "Full Height Wardrobe",
    keywords: ["wardrobe", "bedroom", "closet", "storage"],
    w: 1.8,
    d: 0.6,
    h: 2.7,
    type: "cabinet",
    shelves: 5,
    partitions: 2,
    shutters: 4,
    drawers: 2,
    priority: 9
  },
  {
    id: "kitchen_base",
    label: "Kitchen Base Cabinets",
    keywords: ["kitchen", "base cabinet", "modular kitchen", "counter"],
    w: 2.4,
    d: 0.6,
    h: 0.86,
    type: "cabinet",
    shelves: 2,
    partitions: 3,
    shutters: 4,
    drawers: 3,
    priority: 8
  },
  {
    id: "kitchen_wall",
    label: "Kitchen Wall Cabinets",
    keywords: ["kitchen", "wall cabinet", "overhead"],
    w: 2.4,
    d: 0.35,
    h: 0.75,
    type: "cabinet",
    shelves: 1,
    partitions: 2,
    shutters: 4,
    drawers: 0,
    priority: 6
  },
  {
    id: "tv_unit",
    label: "TV Unit",
    keywords: ["tv", "living", "media", "entertainment"],
    w: 1.9,
    d: 0.45,
    h: 2.1,
    type: "cabinet",
    shelves: 4,
    partitions: 2,
    shutters: 3,
    drawers: 2,
    priority: 7
  },
  {
    id: "study",
    label: "Study Table + Hutch",
    keywords: ["study", "work", "home office", "desk"],
    w: 1.5,
    d: 0.6,
    h: 2.1,
    type: "study",
    shelves: 3,
    partitions: 1,
    shutters: 2,
    drawers: 2,
    priority: 6
  },
  {
    id: "shoe",
    label: "Shoe Rack",
    keywords: ["shoe", "foyer", "entry"],
    w: 1.0,
    d: 0.36,
    h: 1.1,
    type: "cabinet",
    shelves: 3,
    partitions: 1,
    shutters: 2,
    drawers: 0,
    priority: 4
  },
  {
    id: "crockery",
    label: "Crockery Unit",
    keywords: ["crockery", "dining", "bar unit"],
    w: 1.5,
    d: 0.45,
    h: 2.1,
    type: "cabinet",
    shelves: 5,
    partitions: 2,
    shutters: 4,
    drawers: 2,
    priority: 5
  },
  {
    id: "bed",
    label: "Queen Bed with Storage",
    keywords: ["bed", "master", "bedroom"],
    w: 1.6,
    d: 2.05,
    h: 0.48,
    type: "bed",
    priority: 7
  }
];

const COST_RATES = {
  plywood18: 115,
  edgeBandPerM: 14,
  hinge: 180,
  channelPair: 420,
  handle: 120,
  cuttingPerCut: 35,
  groovePerM: 28,
  transportInstall: 8500
};

const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-1";

const dom = {
  floorPlan: document.getElementById("floorPlan"),
  floorPlanLabels: document.getElementById("floorPlanLabels"),
  floorPlanPreview: document.getElementById("floorPlanPreview"),
  floorPlanCanvas: document.getElementById("floorPlanCanvas"),
  floorPlanPreviewName: document.getElementById("floorPlanPreviewName"),
  addRoomBtn: document.getElementById("addRoomBtn"),
  roomsList: document.getElementById("roomsList"),
  plannerForm: document.getElementById("planner-form"),
  outputPanel: document.getElementById("outputPanel"),
  roomResults: document.getElementById("roomResults"),
  statusBox: document.getElementById("statusBox"),
  placementSummary: document.getElementById("placementSummary"),
  boqTableBody: document.querySelector("#boqTable tbody"),
  grandTotal: document.getElementById("grandTotal"),
  downloadScene: document.getElementById("downloadScene"),
  downloadBoq: document.getElementById("downloadBoq")
};

let latestArtifacts = null;
let roomsState = [];
let roomIdSeq = 1;

const floorPlanState = {
  file: null,
  kind: null, // "pdf" | "image"
  page: 1,
  rendered: false,
  _renderWidth: 0,
  _renderHeight: 0,
  roomRectsById: {}
};

init();

function init() {
  dom.plannerForm.addEventListener("submit", onGenerate);
  dom.addRoomBtn.addEventListener("click", () => addRoom());
  dom.floorPlan.addEventListener("change", onFloorPlanPicked);
  dom.downloadScene.addEventListener("click", () => {
    if (latestArtifacts) {
      downloadText("furnished_scene.json", JSON.stringify(latestArtifacts.scene, null, 2), "application/json");
    }
  });
  dom.downloadBoq.addEventListener("click", () => {
    if (latestArtifacts) {
      downloadText("bom_pricing.csv", latestArtifacts.boq.csv, "text/csv");
    }
  });
  addRoom();
}

async function onFloorPlanPicked() {
  const file = dom.floorPlan.files && dom.floorPlan.files[0];
  if (!file) {
    dom.floorPlanPreview.hidden = true;
    resetFloorPlanState();
    return;
  }
  resetFloorPlanState();
  floorPlanState.file = file;
  floorPlanState.kind = file.type === "application/pdf" ? "pdf" : file.type.startsWith("image/") ? "image" : null;
  if (!floorPlanState.kind) {
    dom.floorPlanPreview.hidden = true;
    return;
  }

  dom.floorPlanPreviewName.textContent = file.name;
  dom.floorPlanPreview.hidden = false;
  await renderFloorPlanToCanvas(file);
}

async function onGenerate(event) {
  event.preventDefault();
  const generateBtn = document.getElementById("generateBtn");
  generateBtn.disabled = true;
  generateBtn.textContent = "Generating...";

  try {
    const floorPlanFile = dom.floorPlan.files[0];
    if (!floorPlanFile) {
      throw new Error("Please provide a floor plan PDF.");
    }

    const rooms = readRoomsFromDom();
    if (!rooms.length) {
      throw new Error("Add at least one room.");
    }
    for (const room of rooms) {
      if (!room.label) {
        throw new Error("Each room needs a room number / label.");
      }
      if (!room.brief) {
        throw new Error(`Room ${room.label}: design brief is required.`);
      }
      if (!room.photos.length && !room.generateFromPlan) {
        throw new Error(`Room ${room.label}: add photos OR enable "Generate from floor plan".`);
      }
    }

    dom.outputPanel.hidden = false;
    dom.statusBox.textContent = "Extracting style from inspiration + generating furnished room concepts (OpenAI)...";

    const floorPlanLabels = String(dom.floorPlanLabels.value || "").trim();

    const roomResults = [];
    const allPlacements = [];
    const perRoomSummary = [];
    let fallbackCount = 0;

    for (const room of rooms) {
      const style = await extractRoomStyle(room);
      const laminate = pickLaminateFromStyle(style);
      const widthM = room.widthM || 4.2;
      const lengthM = room.lengthM || 4.2;
      const selectedModules = pickModulesFromBrief(`${room.brief}\n${style.style_summary || ""}`, widthM * lengthM);
      const placement = placeModules(selectedModules, widthM, lengthM);
      allPlacements.push(...placement.placements.map((p) => ({ ...p, roomLabel: room.label })));

      const renders = [];
      if (room.photos.length) {
        for (let i = 0; i < room.photos.length; i += 1) {
          const file = room.photos[i];
          try {
            const edited = await createOpenAiFurnishedRender(
              file,
              {
                model: DEFAULT_OPENAI_IMAGE_MODEL,
                roomWidth: widthM,
                roomLength: lengthM,
                brief: room.brief,
                styleSummary: style.style_summary || "",
                laminate,
                placements: placement.placements,
                roomLabel: room.label
              },
              i
            );
            renders.push(edited);
          } catch (error) {
            fallbackCount += 1;
            const fb = await createLocalFurnishedRender(file, placement.placements, laminate, i);
            fb.note = `OpenAI failed: ${error.message}`;
            renders.push(fb);
          }
        }
      } else if (room.generateFromPlan) {
        const crop = floorPlanState.roomRectsById[room._roomId];
        const cropPngBase64 = crop
          ? cropCanvasRegionToPngBase64(dom.floorPlanCanvas, crop, 1400)
          : cropCanvasRegionToPngBase64(dom.floorPlanCanvas, { x: 0, y: 0, w: dom.floorPlanCanvas.width, h: dom.floorPlanCanvas.height }, 1400);
        for (let i = 0; i < 2; i += 1) {
          try {
            const edited = await createOpenAiFurnishedRenderFromBase64(
              `floorplan_${room.label}_concept_${i + 1}.png`,
              cropPngBase64,
              "image/png",
              {
                model: DEFAULT_OPENAI_IMAGE_MODEL,
                roomWidth: widthM,
                roomLength: lengthM,
                brief: room.brief,
                styleSummary: style.style_summary || "",
                laminate,
                placements: placement.placements,
                roomLabel: room.label,
                fromFloorPlan: true
              },
              i
            );
            renders.push(edited);
          } catch (error) {
            fallbackCount += 1;
            renders.push({
              name: `floorplan_${room.label}_concept_${i + 1}.png`,
              dataUrl: `data:image/png;base64,${cropPngBase64}`,
              source: "floorplan",
              note: `OpenAI failed (showing plan crop): ${error.message}`
            });
          }
        }
      }

      roomResults.push({
        room,
        style,
        laminate,
        selectedModules,
        placement,
        renders
      });

      perRoomSummary.push(formatRoomSummary({ room, style, laminate, selectedModules, placement }));
    }

    drawRoomResults(roomResults);

    const scene = buildSceneJson({ floorPlan: floorPlanFile.name, floorPlanLabels, rooms: roomResults });
    const boq = buildBoqFromRooms(roomResults);
    paintBoq(boq.rows, boq.grandTotal);

    dom.placementSummary.textContent = [
      `Floor plan file: ${floorPlanFile.name}`,
      floorPlanLabels ? `Floor plan labels/notes: ${floorPlanLabels}` : null,
      "",
      ...perRoomSummary
    ]
      .filter(Boolean)
      .join("\n");

    dom.statusBox.textContent = fallbackCount
      ? `Done. ${fallbackCount} image(s) used local fallback due to OpenAI errors.`
      : "Done. Generated furnished rooms + standardized BOM.";

    latestArtifacts = { scene, boq };
  } catch (error) {
    dom.outputPanel.hidden = false;
    dom.statusBox.textContent = error.message;
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = "Generate furnished rooms + BOM";
  }
}

function pickModulesFromBrief(brief, roomArea) {
  const normalized = brief.toLowerCase();
  const picked = [];

  for (const module of MODULE_LIBRARY) {
    let score = 0;
    for (const keyword of module.keywords) {
      if (normalized.includes(keyword)) {
        score += 1;
      }
    }
    if (score > 0) {
      picked.push({ ...module, score: score + module.priority / 10 });
    }
  }

  if (!picked.length) {
    ["tv_unit", "study", "shoe"].forEach((id) => {
      const fallback = MODULE_LIBRARY.find((m) => m.id === id);
      if (fallback) {
        picked.push({ ...fallback, score: 0.1 });
      }
    });
  }

  picked.sort((a, b) => b.score - a.score);

  const capped = [];
  let occupiedArea = 0;
  for (const module of picked) {
    const moduleFootprint = module.w * module.d;
    if (occupiedArea + moduleFootprint <= roomArea * 0.58) {
      capped.push(module);
      occupiedArea += moduleFootprint;
    }
  }

  if (!capped.length) {
    capped.push(MODULE_LIBRARY.find((m) => m.id === "study"));
  }

  return capped;
}

function placeModules(modules, roomWidth, roomLength) {
  const clear = 0.32;
  const gaps = 0.08;
  const walls = {
    south: { used: clear, cap: roomWidth - clear, runAxis: "x" },
    north: { used: clear, cap: roomWidth - clear, runAxis: "x" },
    west: { used: clear, cap: roomLength - clear, runAxis: "z" },
    east: { used: clear, cap: roomLength - clear, runAxis: "z" }
  };

  const placements = [];
  const warnings = [];

  for (const module of modules) {
    const candidateWalls = ["south", "north", "west", "east"]
      .map((name) => {
        const wall = walls[name];
        const available = wall.cap - wall.used;
        return { name, available };
      })
      .sort((a, b) => b.available - a.available);

    let placed = false;
    for (const candidate of candidateWalls) {
      const wall = walls[candidate.name];
      if (candidate.available < module.w + gaps) {
        continue;
      }
      if (module.d > Math.min(roomWidth, roomLength) * 0.42) {
        warnings.push(`${module.label} depth is high vs room size; verify clearances manually.`);
      }

      const slotCenter = wall.used + module.w / 2;
      let x = roomWidth / 2;
      let z = roomLength / 2;
      let rotationY = 0;

      if (candidate.name === "south") {
        x = slotCenter;
        z = module.d / 2 + 0.02;
        rotationY = 0;
      } else if (candidate.name === "north") {
        x = slotCenter;
        z = roomLength - module.d / 2 - 0.02;
        rotationY = 180;
      } else if (candidate.name === "west") {
        x = module.d / 2 + 0.02;
        z = slotCenter;
        rotationY = 90;
      } else if (candidate.name === "east") {
        x = roomWidth - module.d / 2 - 0.02;
        z = slotCenter;
        rotationY = -90;
      }

      placements.push({
        module,
        wall: candidate.name,
        x,
        y: module.h / 2,
        z,
        rotationY
      });

      wall.used += module.w + gaps;
      placed = true;
      break;
    }

    if (!placed) {
      warnings.push(`${module.label} could not be auto-placed without overlap. Increase room size or remove modules.`);
    }
  }

  return { placements, warnings };
}

async function createLocalFurnishedRender(file, placements, laminate, index) {
  const image = await readImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");

  ctx.drawImage(image, 0, 0);

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.04)");
  gradient.addColorStop(1, "rgba(247, 222, 180, 0.24)");
  ctx.fillStyle = gradient;
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over";

  const drawable = placements.slice(0, 5);
  const colW = canvas.width / Math.max(1, drawable.length);
  drawable.forEach((entry, idx) => {
    const baseX = idx * colW + colW * 0.14;
    const width = colW * 0.72;
    const height = Math.max(34, (entry.module.h / 2.7) * canvas.height * 0.22);
    const y = canvas.height * 0.74 - idx * 8;

    drawFurnitureBlock(ctx, baseX, y, width, height, laminate.color, entry.module.label);
  });

  const label = `Concept ${index + 1}`;
  ctx.fillStyle = "rgba(18, 18, 18, 0.62)";
  ctx.fillRect(12, 12, 136, 28);
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 15px 'Space Grotesk'";
  ctx.fillText(label, 20, 31);

  return {
    name: file.name,
    dataUrl: canvas.toDataURL("image/png"),
    source: "local"
  };
}

// (Old multi-engine UI removed; OpenAI is used via server-side key only.)

async function createOpenAiFurnishedRender(file, context, index) {
  const imageBase64 = await fileToBase64(file);
  const prompt = buildImageEditPrompt(context);
  const result = await callRenderApi("openai", {
    model: context.model,
    prompt,
    imageBase64,
    mimeType: file.type || "image/jpeg"
  });

  return {
    name: file.name,
    dataUrl: result.dataUrl,
    source: "openai",
    note: `Room ${context.roomLabel || ""} · concept ${index + 1}`
  };
}

async function createOpenAiFurnishedRenderFromBase64(name, imageBase64, mimeType, context, index) {
  const prompt = buildImageEditPrompt(context);
  const result = await callRenderApi("openai", {
    model: context.model,
    prompt,
    imageBase64,
    mimeType: mimeType || "image/png"
  });

  return {
    name,
    dataUrl: result.dataUrl,
    source: "openai",
    note: `Room ${context.roomLabel || ""} · concept ${index + 1}${context.fromFloorPlan ? " (from floor plan)" : ""}`
  };
}

function buildImageEditPrompt(context) {
  const moduleList = context.placements.map((p) => p.module.label).join(", ");
  return [
    "You are an interior render assistant.",
    context.fromFloorPlan
      ? "The input image is a cropped floor plan of a single room."
      : "Edit the input room photo by adding only realistic furniture and millwork.",
    "Strict rules:",
    "1) Respect room geometry and scale.",
    "2) Keep existing walls, windows, doors, and structural elements unchanged.",
    context.fromFloorPlan
      ? "3) Produce a photorealistic furnished 3D interior render consistent with the plan geometry."
      : "3) Add furniture only; lighting can be improved for realism.",
    "4) Photoreal output, natural shadows, no cartoon style.",
    "5) Do not add text overlays, labels, watermarks, or annotations.",
    `Room size approximately ${context.roomWidth}m x ${context.roomLength}m.`,
    `Design brief: ${context.brief}`,
    context.styleSummary ? `Inspiration-derived style direction: ${context.styleSummary}` : "",
    `Furniture modules to include if feasible: ${moduleList || "TV unit, storage, and study module"}.`,
    `Primary laminate tone: ${context.laminate.name} (${context.laminate.code}).`
  ]
    .filter(Boolean)
    .join("\n");
}

function cropCanvasRegionToPngBase64(canvas, rect, maxSidePx = 1400) {
  if (!canvas) return "";
  const srcW = Math.max(2, Math.round(rect.w));
  const srcH = Math.max(2, Math.round(rect.h));
  const scale = Math.min(1, maxSidePx / Math.max(srcW, srcH));
  const outW = Math.max(2, Math.round(srcW * scale));
  const outH = Math.max(2, Math.round(srcH * scale));

  const tmp = document.createElement("canvas");
  tmp.width = outW;
  tmp.height = outH;
  const ctx = tmp.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(canvas, rect.x, rect.y, srcW, srcH, 0, 0, outW, outH);

  const dataUrl = tmp.toDataURL("image/png");
  return dataUrl.split(",")[1] || "";
}

async function callRenderApi(provider, payload) {
  const response = await fetch(`/api/render/${provider}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const raw = await response.text();
  let parsed;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const message = parsed?.error || parseApiError(raw);
    throw new Error(message);
  }
  if (!parsed?.dataUrl) {
    throw new Error("Render API returned no image.");
  }
  return parsed;
}

function parseApiError(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed?.error?.message || text || "Unknown API error";
  } catch {
    return text || "Unknown API error";
  }
}

function drawFurnitureBlock(ctx, x, y, w, h, color, label) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - 10, y + h);
  ctx.lineTo(x + 10, y + h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.82;
  ctx.fill();
  ctx.globalAlpha = 1;

  const capHeight = Math.max(9, h * 0.18);
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillRect(x + 10, y + 4, Math.max(22, w - 20), capHeight);

  ctx.fillStyle = "rgba(0,0,0,0.58)";
  ctx.font = "500 12px 'Space Grotesk'";
  const short = label.length > 18 ? `${label.slice(0, 16)}..` : label;
  ctx.fillText(short, x + 12, y + h - 8);
  ctx.restore();
}

function drawRoomResults(roomResults) {
  dom.roomResults.innerHTML = "";
  for (const result of roomResults) {
    const wrap = document.createElement("section");
    wrap.className = "room-result-card";

    const head = document.createElement("div");
    head.className = "room-result-head";
    head.innerHTML = `
      <div>
        <div class="pill">Room ${escapeHtml(result.room.label)}</div>
        <div class="mini-note">${escapeHtml(result.room.name || "")}</div>
      </div>
      <div class="mini-note">Laminate: ${escapeHtml(result.laminate.name)}</div>
    `;

    const body = document.createElement("div");
    body.className = "room-result-body";

    const styleBox = document.createElement("div");
    styleBox.className = "status";
    styleBox.textContent = result.style?.style_summary ? `Style: ${result.style.style_summary}` : "Style extracted.";
    body.appendChild(styleBox);

    const grid = document.createElement("div");
    grid.className = "room-render-grid";

    for (const render of result.renders) {
      const card = document.createElement("article");
      card.className = "render-card";

      const img = document.createElement("img");
      img.src = render.dataUrl;
      img.alt = `Furnished render for room ${result.room.label}`;

      const meta = document.createElement("div");
      meta.className = "render-meta";

      const name = document.createElement("span");
      name.textContent = `${render.name} (${render.source || "local"})`;

      const dl = document.createElement("button");
      dl.type = "button";
      dl.textContent = "Download PNG";
      dl.addEventListener("click", () =>
        downloadDataUrl(`room_${sanitizeName(result.room.label)}_${sanitizeName(render.name)}.png`, render.dataUrl)
      );

      meta.append(name, dl);
      card.append(img, meta);
      if (render.note) {
        const note = document.createElement("div");
        note.className = "render-note";
        note.textContent = render.note;
        card.appendChild(note);
      }
      grid.appendChild(card);
    }

    body.appendChild(grid);
    wrap.append(head, body);
    dom.roomResults.appendChild(wrap);
  }
}

function buildObjModel(room, placements, laminate) {
  const vertices = [];
  const chunks = [];
  let vOffset = 1;

  const addBox = (name, material, cx, cy, cz, w, h, d) => {
    const x1 = cx - w / 2;
    const x2 = cx + w / 2;
    const y1 = cy - h / 2;
    const y2 = cy + h / 2;
    const z1 = cz - d / 2;
    const z2 = cz + d / 2;

    const boxVertices = [
      [x1, y1, z1],
      [x2, y1, z1],
      [x2, y2, z1],
      [x1, y2, z1],
      [x1, y1, z2],
      [x2, y1, z2],
      [x2, y2, z2],
      [x1, y2, z2]
    ];

    for (const v of boxVertices) {
      vertices.push(`v ${v[0].toFixed(4)} ${v[1].toFixed(4)} ${v[2].toFixed(4)}`);
    }

    const faces = [
      [1, 2, 3],
      [1, 3, 4],
      [5, 6, 7],
      [5, 7, 8],
      [1, 5, 8],
      [1, 8, 4],
      [2, 6, 7],
      [2, 7, 3],
      [4, 3, 7],
      [4, 7, 8],
      [1, 2, 6],
      [1, 6, 5]
    ];

    const lines = [`g ${name}`, `usemtl ${material}`];
    for (const f of faces) {
      lines.push(`f ${f[0] + vOffset - 1} ${f[1] + vOffset - 1} ${f[2] + vOffset - 1}`);
    }
    chunks.push(lines.join("\n"));
    vOffset += 8;
  };

  addBox("floor", "lam_floor", room.width / 2, -0.02, room.length / 2, room.width, 0.04, room.length);
  addBox("wall_south", "wall_paint", room.width / 2, 1.45, 0.03, room.width, 2.9, 0.06);
  addBox("wall_north", "wall_paint", room.width / 2, 1.45, room.length - 0.03, room.width, 2.9, 0.06);
  addBox("wall_west", "wall_paint", 0.03, 1.45, room.length / 2, 0.06, 2.9, room.length);
  addBox("wall_east", "wall_paint", room.width - 0.03, 1.45, room.length / 2, 0.06, 2.9, room.length);

  placements.forEach((entry, index) => {
    const alongX = Math.abs(entry.rotationY) !== 90;
    const ww = alongX ? entry.module.w : entry.module.d;
    const dd = alongX ? entry.module.d : entry.module.w;
    addBox(`furn_${index + 1}_${entry.module.id}`, "laminate_main", entry.x, entry.module.h / 2, entry.z, ww, entry.module.h, dd);
  });

  const obj = ["mtllib furnished_scene.mtl", ...vertices, ...chunks].join("\n");

  const mtl = [
    "newmtl laminate_main",
    `Kd ${hexToRgb01(laminate.color).join(" ")}`,
    "Ka 0.2 0.2 0.2",
    "Ks 0.1 0.1 0.1",
    "Ns 30",
    "",
    "newmtl lam_floor",
    "Kd 0.71 0.67 0.61",
    "",
    "newmtl wall_paint",
    "Kd 0.9 0.9 0.9"
  ].join("\n");

  const scene = {
    units: "meters",
    room,
    laminate,
    objects: placements.map((entry) => ({
      id: entry.module.id,
      label: entry.module.label,
      position: { x: entry.x, y: entry.y, z: entry.z },
      rotationY: entry.rotationY,
      dimensions: { w: entry.module.w, h: entry.module.h, d: entry.module.d },
      wall: entry.wall
    }))
  };

  return { obj, mtl, scene };
}

function buildBoq(placements, laminate) {
  const totals = {
    boardSqM: 0,
    laminateSqM: 0,
    edgeM: 0,
    hinges: 0,
    channels: 0,
    handles: 0,
    cuts: 0,
    grooves: 0
  };

  for (const entry of placements) {
    const module = entry.module;
    if (module.type === "cabinet" || module.type === "study") {
      const side = 2 * module.d * module.h;
      const topBottom = 2 * module.w * module.d;
      const shelf = module.shelves * module.w * module.d;
      const partition = module.partitions * module.d * module.h;
      const back = 0.45 * module.w * module.h;
      const shutterArea = module.shutters > 0 ? module.w * module.h * 0.92 : 0;

      totals.boardSqM += side + topBottom + shelf + partition + back;
      totals.laminateSqM += (side + topBottom + shelf + partition + shutterArea) * 1.05;
      totals.edgeM += module.shutters * (2 * (module.w / Math.max(1, module.shutters)) + 2 * module.h) + module.shelves * module.w * 0.35;
      totals.hinges += Math.max(2, module.shutters * 2);
      totals.channels += module.drawers;
      totals.handles += Math.max(module.shutters, module.drawers);
      totals.cuts += Math.round(8 + module.shelves + module.partitions + module.shutters * 2);
      totals.grooves += module.w * 1.8;
    } else if (module.type === "bed") {
      totals.boardSqM += 7.2;
      totals.laminateSqM += 8.4;
      totals.edgeM += 14;
      totals.hinges += 4;
      totals.handles += 4;
      totals.cuts += 24;
      totals.grooves += 3.5;
    }
  }

  totals.boardSqM *= 1.12;
  totals.laminateSqM *= 1.1;
  totals.edgeM *= 1.08;

  const boardSqFt = totals.boardSqM * 10.7639;
  const laminateSqFt = totals.laminateSqM * 10.7639;
  const laminateSheets = Math.ceil(laminateSqFt / 32);

  const rows = [];
  const pushRow = (item, qty, unit, rate, amount) => {
    rows.push({
      item,
      qty,
      unit,
      rate,
      amount
    });
  };

  const plywoodCost = boardSqFt * COST_RATES.plywood18;
  const laminateCost = laminateSqFt * laminate.ratePerSqFt;
  const edgeCost = totals.edgeM * COST_RATES.edgeBandPerM;
  const hingeCost = totals.hinges * COST_RATES.hinge;
  const channelCost = totals.channels * COST_RATES.channelPair;
  const handleCost = totals.handles * COST_RATES.handle;
  const cutCost = totals.cuts * COST_RATES.cuttingPerCut;
  const grooveCost = totals.grooves * COST_RATES.groovePerM;

  pushRow("18mm BWP Plywood (first quality)", round(boardSqFt, 2), "sqft", COST_RATES.plywood18, plywoodCost);
  pushRow(`Laminate ${laminate.code} ${laminate.name}`, round(laminateSqFt, 2), "sqft", laminate.ratePerSqFt, laminateCost);
  pushRow("Laminate sheets reference", laminateSheets, "sheets (8x4)", 0, 0);
  pushRow("Edge banding 1mm", round(totals.edgeM, 2), "rm", COST_RATES.edgeBandPerM, edgeCost);
  pushRow("Soft close hinges", totals.hinges, "nos", COST_RATES.hinge, hingeCost);
  pushRow("Telescopic channels", totals.channels, "pairs", COST_RATES.channelPair, channelCost);
  pushRow("Handles", totals.handles, "nos", COST_RATES.handle, handleCost);
  pushRow("Cutting charges", totals.cuts, "cuts", COST_RATES.cuttingPerCut, cutCost);
  pushRow("Grooving charges", round(totals.grooves, 2), "rm", COST_RATES.groovePerM, grooveCost);

  const materialHardwareSubtotal =
    plywoodCost + laminateCost + edgeCost + hingeCost + channelCost + handleCost + cutCost + grooveCost;
  const consumables = materialHardwareSubtotal * 0.06;
  const labor = materialHardwareSubtotal * 0.22;
  const contingency = materialHardwareSubtotal * 0.08;

  pushRow("Adhesives, screws, fasteners", 1, "lot", round(consumables, 0), consumables);
  pushRow("Fabrication and polishing labor", 1, "lot", round(labor, 0), labor);
  pushRow("Transport and installation", 1, "lot", COST_RATES.transportInstall, COST_RATES.transportInstall);
  pushRow("Contingency", 1, "lot", round(contingency, 0), contingency);

  const grandTotal = rows.reduce((sum, row) => sum + row.amount, 0);

  const csvLines = ["Item,Quantity,Unit,Rate,Amount"];
  for (const row of rows) {
    csvLines.push(`"${row.item}",${row.qty},${row.unit},${round(row.rate, 2)},${round(row.amount, 2)}`);
  }
  csvLines.push(`"Grand Total",,, ,${round(grandTotal, 2)}`);

  return {
    rows,
    grandTotal,
    csv: csvLines.join("\n")
  };
}

function paintBoq(rows, grandTotal) {
  dom.boqTableBody.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.item}</td>
      <td>${row.qty}</td>
      <td>${row.unit}</td>
      <td>${formatInr(row.rate)}</td>
      <td>${formatInr(row.amount)}</td>
    `;
    dom.boqTableBody.appendChild(tr);
  }
  dom.grandTotal.textContent = formatInr(grandTotal);
}

function formatRoomSummary(ctx) {
  const summary = [];
  summary.push(`\nRoom ${ctx.room.label}${ctx.room.name ? ` (${ctx.room.name})` : ""}`);
  summary.push(`- Dimensions: ${ctx.room.widthM}m x ${ctx.room.lengthM}m`);
  summary.push(`- Laminate: ${ctx.laminate.code} ${ctx.laminate.name}`);
  summary.push("- Selected modules:");
  ctx.selectedModules.forEach((m) => summary.push(`  - ${m.label} (${m.w}m x ${m.d}m x ${m.h}m)`));
  summary.push("- Auto-placement:");
  ctx.placement.placements.forEach((p, idx) => {
    summary.push(
      `  ${idx + 1}. ${p.module.label} on ${p.wall} wall at (x:${round(p.x, 2)}, z:${round(p.z, 2)}) rotY:${p.rotationY}`
    );
  });
  if (ctx.placement.warnings.length) {
    summary.push("- Warnings:");
    ctx.placement.warnings.forEach((w) => summary.push(`  - ${w}`));
  }
  return summary.join("\n");
}

function formatInr(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not load image: ${file.name}`));
    };
    image.src = url;
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      if (!base64) {
        reject(new Error(`Could not encode image: ${file.name}`));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error(`Could not read image: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Could not read image: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function sanitizeName(name) {
  return name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
}

function downloadText(filename, content, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadDataUrl(filename, dataUrl) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function hexToRgb01(hex) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [round(r, 4), round(g, 4), round(b, 4)];
}

function addRoom() {
  const id = `room_${roomIdSeq++}`;
  roomsState.push(id);
  renderRoomsList();
}

function removeRoom(roomId) {
  roomsState = roomsState.filter((id) => id !== roomId);
  renderRoomsList();
}

function renderRoomsList() {
  dom.roomsList.innerHTML = "";
  for (const roomId of roomsState) {
    const card = document.createElement("div");
    card.className = "room-card";
    card.dataset.roomId = roomId;

    card.innerHTML = `
      <div class="room-card-head">
        <div class="pill">${escapeHtml(roomId.replace("room_", "Room "))}</div>
        <button type="button" class="ghost" data-action="remove-room">Remove</button>
      </div>
      <div class="room-card-body">
        <div class="room-grid">
          <label>
            Room number / label (matches floor plan)
            <input type="text" data-field="label" placeholder="Example: 101" required />
          </label>
          <label>
            Room name (optional)
            <input type="text" data-field="name" placeholder="Example: Living room" />
          </label>
          <input type="hidden" data-field="widthM" value="4.2" />
          <input type="hidden" data-field="lengthM" value="4.2" />
          <label class="full">
            Room photos (multiple)
            <input type="file" accept="image/*" multiple data-field="photos" />
            <div class="mini-note">Optional. If omitted, we can generate concepts from the floor plan for this room.</div>
          </label>
          <label class="full">
            Image source fallback
            <div class="inline-row">
              <input type="checkbox" data-field="generateFromPlan" checked />
              <span class="mini-note">Generate concepts from the floor plan if room photos are not uploaded.</span>
            </div>
          </label>
          <label class="full">
            Inspiration images (optional, multiple)
            <input type="file" accept="image/*" multiple data-field="inspo" />
            <div class="mini-note">Used to extract a consistent style direction and auto-select laminate tone.</div>
          </label>
          <label class="full">
            Design brief (per room)
            <textarea rows="4" data-field="brief" placeholder="Example: Warm modern living, TV wall + low storage, concealed wiring, minimal handles." required></textarea>
          </label>
        </div>
      </div>
    `;

    card.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest ? e.target.closest("button") : null;
      if (!btn) return;
      if (btn.dataset.action === "remove-room") {
        removeRoom(roomId);
      }
    });

    dom.roomsList.appendChild(card);
  }
}

function readRoomsFromDom() {
  const cards = [...dom.roomsList.querySelectorAll(".room-card")];
  return cards.map((card) => {
    const getInput = (field) => card.querySelector(`[data-field="${field}"]`);
    const label = String(getInput("label")?.value || "").trim();
    const name = String(getInput("name")?.value || "").trim();
    const widthM = parseFloat(getInput("widthM")?.value || "0");
    const lengthM = parseFloat(getInput("lengthM")?.value || "0");
    const brief = String(getInput("brief")?.value || "").trim();
    const photos = getInput("photos")?.files ? [...getInput("photos").files] : [];
    const inspo = getInput("inspo")?.files ? [...getInput("inspo").files] : [];
    const generateFromPlan = Boolean(getInput("generateFromPlan")?.checked);
    return { _roomId: card.dataset.roomId, label, name, widthM, lengthM, brief, photos, inspo, generateFromPlan };
  });
}

function resetFloorPlanState() {
  floorPlanState.file = null;
  floorPlanState.kind = null;
  floorPlanState.page = 1;
  floorPlanState.rendered = false;
  floorPlanState._renderWidth = 0;
  floorPlanState._renderHeight = 0;
  floorPlanState.roomRectsById = {};
  if (dom.floorPlanCanvas) {
    const ctx = dom.floorPlanCanvas.getContext("2d");
    ctx?.clearRect(0, 0, dom.floorPlanCanvas.width, dom.floorPlanCanvas.height);
  }
}

async function renderFloorPlanToCanvas(file) {
  if (!dom.floorPlanCanvas) return;
  if (file.type === "application/pdf") {
    await renderPdfFirstPage(file);
    return;
  }
  if (file.type.startsWith("image/")) {
    await renderImageToCanvas(file);
  }
}

async function renderImageToCanvas(file) {
  const img = await readImage(file);
  const canvas = dom.floorPlanCanvas;
  const maxW = 860;
  const scale = img.width > maxW ? maxW / img.width : 1;
  canvas.width = Math.max(2, Math.round(img.width * scale));
  canvas.height = Math.max(2, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  floorPlanState.rendered = true;
  floorPlanState._renderWidth = canvas.width;
  floorPlanState._renderHeight = canvas.height;
}

async function renderPdfFirstPage(file) {
  const canvas = dom.floorPlanCanvas;
  const pdfjsLib = window.pdfjsLib;
  if (!pdfjsLib) {
    throw new Error("PDF renderer not available (pdf.js failed to load).");
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/node_modules/pdfjs-dist/build/pdf.worker.min.js";

  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const maxW = 860;
  const unscaled = page.getViewport({ scale: 1 });
  const scale = unscaled.width > maxW ? maxW / unscaled.width : 1.25;
  const viewport = page.getViewport({ scale });

  canvas.width = Math.max(2, Math.round(viewport.width));
  canvas.height = Math.max(2, Math.round(viewport.height));
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;
  floorPlanState.rendered = true;
  floorPlanState._renderWidth = canvas.width;
  floorPlanState._renderHeight = canvas.height;
}

function startRectPick({ title, onPicked }) {
  const canvas = dom.floorPlanCanvas;
  const ctx = canvas.getContext("2d");
  const base = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let start = null;
  let dragging = false;

  const onDown = (ev) => {
    start = canvasPointFromEvent(canvas, ev);
    dragging = true;
  };
  const onMove = (ev) => {
    if (!dragging || !start) return;
    const cur = canvasPointFromEvent(canvas, ev);
    const rect = normalizeRect(start, cur);
    ctx.putImageData(base, 0, 0);
    drawRect(ctx, rect, "#00e5ff");
    drawLabel(ctx, `${title}: release to set`, 12, 20);
  };
  const onUp = (ev) => {
    if (!dragging || !start) return;
    const end = canvasPointFromEvent(canvas, ev);
    const rect = normalizeRect(start, end);
    dragging = false;
    start = null;
    cleanup();
    if (rect.w < 8 || rect.h < 8) {
      alert("Room pick too small. Drag a bigger rectangle.");
      return;
    }
    onPicked(rect);
  };

  function cleanup() {
    canvas.removeEventListener("mousedown", onDown);
    canvas.removeEventListener("mousemove", onMove);
    canvas.removeEventListener("mouseup", onUp);
    canvas.removeEventListener("mouseleave", onUp);
    ctx.putImageData(base, 0, 0);
  }

  canvas.addEventListener("mousedown", onDown);
  canvas.addEventListener("mousemove", onMove);
  canvas.addEventListener("mouseup", onUp);
  canvas.addEventListener("mouseleave", onUp);
  ctx.putImageData(base, 0, 0);
  drawLabel(ctx, `${title}: drag a rectangle`, 12, 20);
}

function canvasPointFromEvent(canvas, ev) {
  const rect = canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
  return { x, y };
}

function normalizeRect(a, b) {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x, b.x);
  const y2 = Math.max(a.y, b.y);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function drawLabel(ctx, text, x, y) {
  ctx.save();
  ctx.fillStyle = "rgba(18,18,18,0.72)";
  ctx.fillRect(x - 6, y - 16, Math.min(540, text.length * 7.2 + 16), 22);
  ctx.fillStyle = "#fff";
  ctx.font = "600 13px 'Space Grotesk'";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawMarker(ctx, x, y, color) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawLine(ctx, x1, y1, x2, y2, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function drawRect(ctx, rect, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(0,229,255,0.12)";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

async function extractRoomStyle(room) {
  if (!room.inspo || !room.inspo.length) {
    // minimal style from brief only
    return {
      style_summary: room.brief.slice(0, 220),
      finish_palette: { primary: "warm neutral", secondary: "wood", accent: "black" },
      laminate_recommendation: { name: "matte neutral + warm wood", tone: "warm", finish: "matte", notes: "From brief only." },
      furniture_requirements: [],
      do_not_do: []
    };
  }
  const inspoPayload = [];
  for (const file of room.inspo.slice(0, 8)) {
    inspoPayload.push({ base64: await fileToBase64(file), mimeType: file.type || "image/jpeg" });
  }
  const response = await fetch("/api/style/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      roomLabel: room.label,
      brief: room.brief,
      inspirationImages: inspoPayload
    })
  });
  const raw = await response.text();
  const parsed = raw ? safeJson(raw) : null;
  if (!response.ok) {
    throw new Error(parsed?.error || raw || "Style extraction failed.");
  }
  return parsed?.style || {};
}

function pickLaminateFromStyle(style) {
  const txt = `${style?.style_summary || ""} ${style?.laminate_recommendation?.name || ""} ${style?.laminate_recommendation?.tone || ""}`.toLowerCase();
  const score = (lam) => {
    let s = 0;
    for (const t of lam.tags || []) {
      if (txt.includes(String(t).toLowerCase())) s += 1;
    }
    if (txt.includes("gloss") && lam.family.toLowerCase().includes("gloss")) s += 2;
    if (txt.includes("matte") && lam.name.toLowerCase().includes("matte")) s += 2;
    if (txt.includes("concrete") && lam.name.toLowerCase().includes("concrete")) s += 2;
    return s;
  };
  const ranked = [...LAMINATE_LIBRARY].sort((a, b) => score(b) - score(a));
  return ranked[0] || LAMINATE_LIBRARY[0];
}

function buildSceneJson(ctx) {
  return {
    units: "meters",
    floorPlan: { fileName: ctx.floorPlan, labels: ctx.floorPlanLabels || "" },
    rooms: ctx.rooms.map((r) => ({
      label: r.room.label,
      name: r.room.name,
      dimensions: { widthM: r.room.widthM, lengthM: r.room.lengthM },
      style: r.style,
      laminate: r.laminate,
      modules: r.selectedModules.map((m) => ({ id: m.id, label: m.label, w: m.w, h: m.h, d: m.d })),
      placements: r.placement.placements.map((p) => ({
        id: p.module.id,
        label: p.module.label,
        wall: p.wall,
        position: { x: p.x, y: p.y, z: p.z },
        rotationY: p.rotationY
      }))
    }))
  };
}

function buildBoqFromRooms(roomResults) {
  // Consolidated totals; laminate cost uses each room laminate selection.
  const totals = {
    boardSqM: 0,
    laminateSqM: 0,
    laminateCost: 0,
    edgeM: 0,
    hinges: 0,
    channels: 0,
    handles: 0,
    cuts: 0,
    grooves: 0
  };

  // Also create a very practical "cutlist-like" rollup that vendors expect.
  // NOTE: Without exact carcass design/drawings, this is a standardized estimating cutlist:
  // it’s meant to be consistent and reviewable, not CNC-ready.
  const cutlist = {
    sheets18mm_8x4: 0,
    back6mm_8x4: 0,
    edgeBand1mm_rm: 0,
    hinges_nos: 0,
    channels_pairs: 0,
    handles_nos: 0
  };

  for (const rr of roomResults) {
    const t = estimateTotalsFromPlacements(rr.placement.placements);
    totals.boardSqM += t.boardSqM;
    totals.laminateSqM += t.laminateSqM;
    totals.edgeM += t.edgeM;
    totals.hinges += t.hinges;
    totals.channels += t.channels;
    totals.handles += t.handles;
    totals.cuts += t.cuts;
    totals.grooves += t.grooves;

    const laminateSqFt = t.laminateSqM * 10.7639;
    totals.laminateCost += laminateSqFt * rr.laminate.ratePerSqFt;
  }

  const boardSqFt = totals.boardSqM * 10.7639;
  const laminateSqFt = totals.laminateSqM * 10.7639;
  const laminateSheets = Math.ceil(laminateSqFt / 32);

  // Cutlist rollup assumptions
  // - 18mm boards: estimate from sqft / 32 sqft per sheet, with 12% wastage already baked into totals.
  // - Back panels: approximate as 18% of board area (common across wardrobes/TV/study), as 6mm ply/MDF.
  cutlist.sheets18mm_8x4 = Math.ceil(boardSqFt / 32);
  cutlist.back6mm_8x4 = Math.ceil((boardSqFt * 0.18) / 32);
  cutlist.edgeBand1mm_rm = round(totals.edgeM, 2);
  cutlist.hinges_nos = totals.hinges;
  cutlist.channels_pairs = totals.channels;
  cutlist.handles_nos = totals.handles;

  const rows = [];
  const pushRow = (item, qty, unit, rate, amount) => {
    rows.push({ item, qty, unit, rate, amount });
  };

  const plywoodCost = boardSqFt * COST_RATES.plywood18;
  const edgeCost = totals.edgeM * COST_RATES.edgeBandPerM;
  const hingeCost = totals.hinges * COST_RATES.hinge;
  const channelCost = totals.channels * COST_RATES.channelPair;
  const handleCost = totals.handles * COST_RATES.handle;
  const cutCost = totals.cuts * COST_RATES.cuttingPerCut;
  const grooveCost = totals.grooves * COST_RATES.groovePerM;

  pushRow("18mm BWP Plywood (first quality)", round(boardSqFt, 2), "sqft", COST_RATES.plywood18, plywoodCost);
  pushRow("Laminate (auto-selected per room)", round(laminateSqFt, 2), "sqft", round(totals.laminateCost / Math.max(1, laminateSqFt), 2), totals.laminateCost);
  pushRow("Laminate sheets reference", laminateSheets, "sheets (8x4)", 0, 0);
  pushRow("18mm sheet reference", cutlist.sheets18mm_8x4, "sheets (8x4)", 0, 0);
  pushRow("6mm back sheet reference", cutlist.back6mm_8x4, "sheets (8x4)", 0, 0);
  pushRow("Edge banding 1mm", round(totals.edgeM, 2), "rm", COST_RATES.edgeBandPerM, edgeCost);
  pushRow("Soft close hinges", totals.hinges, "nos", COST_RATES.hinge, hingeCost);
  pushRow("Telescopic channels", totals.channels, "pairs", COST_RATES.channelPair, channelCost);
  pushRow("Handles", totals.handles, "nos", COST_RATES.handle, handleCost);
  pushRow("Cutting charges", totals.cuts, "cuts", COST_RATES.cuttingPerCut, cutCost);
  pushRow("Grooving charges", round(totals.grooves, 2), "rm", COST_RATES.groovePerM, grooveCost);

  const materialHardwareSubtotal =
    plywoodCost + totals.laminateCost + edgeCost + hingeCost + channelCost + handleCost + cutCost + grooveCost;
  const consumables = materialHardwareSubtotal * 0.06;
  const labor = materialHardwareSubtotal * 0.22;
  const contingency = materialHardwareSubtotal * 0.08;

  pushRow("Adhesives, screws, fasteners", 1, "lot", round(consumables, 0), consumables);
  pushRow("Fabrication and polishing labor", 1, "lot", round(labor, 0), labor);
  pushRow("Transport and installation", 1, "lot", COST_RATES.transportInstall, COST_RATES.transportInstall);
  pushRow("Contingency", 1, "lot", round(contingency, 0), contingency);

  const grandTotal = rows.reduce((sum, row) => sum + row.amount, 0);
  const csvLines = ["Item,Quantity,Unit,Rate,Amount"];
  for (const row of rows) {
    csvLines.push(`"${row.item}",${row.qty},${row.unit},${round(row.rate, 2)},${round(row.amount, 2)}`);
  }
  csvLines.push(`"Grand Total",,, ,${round(grandTotal, 2)}`);

  return { rows, grandTotal, csv: csvLines.join("\n") };
}

function estimateTotalsFromPlacements(placements) {
  const totals = {
    boardSqM: 0,
    laminateSqM: 0,
    edgeM: 0,
    hinges: 0,
    channels: 0,
    handles: 0,
    cuts: 0,
    grooves: 0
  };

  for (const entry of placements) {
    const module = entry.module;
    if (module.type === "cabinet" || module.type === "study") {
      const side = 2 * module.d * module.h;
      const topBottom = 2 * module.w * module.d;
      const shelf = module.shelves * module.w * module.d;
      const partition = module.partitions * module.d * module.h;
      const back = 0.45 * module.w * module.h;
      const shutterArea = module.shutters > 0 ? module.w * module.h * 0.92 : 0;

      totals.boardSqM += side + topBottom + shelf + partition + back;
      totals.laminateSqM += (side + topBottom + shelf + partition + shutterArea) * 1.05;
      totals.edgeM += module.shutters * (2 * (module.w / Math.max(1, module.shutters)) + 2 * module.h) + module.shelves * module.w * 0.35;
      totals.hinges += Math.max(2, module.shutters * 2);
      totals.channels += module.drawers;
      totals.handles += Math.max(module.shutters, module.drawers);
      totals.cuts += Math.round(8 + module.shelves + module.partitions + module.shutters * 2);
      totals.grooves += module.w * 1.8;
    } else if (module.type === "bed") {
      totals.boardSqM += 7.2;
      totals.laminateSqM += 8.4;
      totals.edgeM += 14;
      totals.hinges += 4;
      totals.handles += 4;
      totals.cuts += 24;
      totals.grooves += 3.5;
    }
  }

  totals.boardSqM *= 1.12;
  totals.laminateSqM *= 1.1;
  totals.edgeM *= 1.08;
  return totals;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
