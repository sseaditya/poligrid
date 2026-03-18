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

const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-1.5";

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const dom = {
  floorPlan:          document.getElementById("floorPlan"),
  floorPlanName:      document.getElementById("floorPlanName"),
  analyzeBtn:         document.getElementById("analyzeBtn"),
  analysisPanel:      document.getElementById("analysisPanel"),
  analysisStatusText: document.getElementById("analysisStatusText"),
  analysisSummaryWrap:document.getElementById("analysisSummaryWrap"),
  analysisSummaryText:document.getElementById("analysisSummaryText"),
  detectedRoomsList:  document.getElementById("detectedRoomsList"),
  canvasPlaceholder:  document.getElementById("canvasPlaceholder"),
  canvasWrap:         document.getElementById("canvasWrap"),
  plannerCanvas:      document.getElementById("plannerCanvas"),
  canvasControlsSection: document.getElementById("canvasControlsSection"),
  pinsPanelSection:   document.getElementById("pinsPanelSection"),
  tabSelect:          document.getElementById("tabSelect"),
  tabPin:             document.getElementById("tabPin"),
  furniturePalette:   document.getElementById("furniturePalette"),
  nlInput:            document.getElementById("nlInput"),
  nlBtn:              document.getElementById("nlBtn"),
  nlStatus:           document.getElementById("nlStatus"),
  selectionPanel:     document.getElementById("selectionPanel"),
  selectionLabel:     document.getElementById("selectionLabel"),
  rotateBtn:          document.getElementById("rotateBtn"),
  deleteBtn:          document.getElementById("deleteBtn"),
  placedList:         document.getElementById("placedList"),
  pinsList:           document.getElementById("pinsList"),
  globalBrief:        document.getElementById("globalBrief"),
  generateBtn:        document.getElementById("generateBtn"),
  generateStatus:     document.getElementById("generateStatus"),
  outputPanel:        document.getElementById("outputPanel"),
  roomResults:        document.getElementById("roomResults"),
  statusBox:          document.getElementById("statusBox"),
  placementSummary:   document.getElementById("placementSummary"),
  boqTableBody:       document.querySelector("#boqTable tbody"),
  grandTotal:         document.getElementById("grandTotal"),
  downloadScene:      document.getElementById("downloadScene"),
  downloadBoq:        document.getElementById("downloadBoq"),
  // Camera pin popover
  pinPopover:         document.getElementById("pinPopover"),
  pinPopoverTitle:    document.getElementById("pinPopoverTitle"),
  pinPopoverClose:    document.getElementById("pinPopoverClose"),
  pinPhotoInput:      document.getElementById("pinPhotoInput"),
  pinPhotoPreview:    document.getElementById("pinPhotoPreview"),
  pinRoomLabel:       document.getElementById("pinRoomLabel"),
  pinFov:             document.getElementById("pinFov"),
  pinBrief:           document.getElementById("pinBrief")
};

// ─── State ────────────────────────────────────────────────────────────────────

let planner = null; // PlannerCanvas instance
let latestArtifacts = null;
let activePinId = null; // pin being edited in popover

const floorPlanState = {
  file: null,
  kind: null,
  rendered: false,
  detectedRooms: null
};

const ROOM_DOT_COLORS = {
  bedroom:"#8a4db5", living:"#2e8b57", kitchen:"#c97820",
  bathroom:"#2080c0", dining:"#c04040", study:"#3070a0",
  balcony:"#288070", foyer:"#a09020", utility:"#707070", other:"#6050a0"
};

// ─── Init ─────────────────────────────────────────────────────────────────────

init();

function init() {
  dom.floorPlan.addEventListener("change", onFloorPlanPicked);
  dom.analyzeBtn.addEventListener("click", onAnalyzePlan);
  dom.tabSelect.addEventListener("click", () => setMode("select"));
  dom.tabPin.addEventListener("click", () => setMode("pin"));
  dom.rotateBtn.addEventListener("click", () => planner?.rotateSelected());
  dom.deleteBtn.addEventListener("click", () => planner?.removeSelected());
  dom.nlBtn.addEventListener("click", onNlAdd);
  dom.nlInput.addEventListener("keydown", e => { if (e.key === "Enter") onNlAdd(); });
  dom.generateBtn.addEventListener("click", onGenerate);
  dom.pinPopoverClose.addEventListener("click", () => { dom.pinPopover.hidden = true; });
  dom.pinPhotoInput.addEventListener("change", onPinPhotoUpload);
  dom.pinRoomLabel.addEventListener("input", onPinFieldChange);
  dom.pinFov.addEventListener("input", onPinFieldChange);
  dom.pinBrief.addEventListener("input", onPinFieldChange);
  dom.downloadScene.addEventListener("click", () => {
    if (latestArtifacts) downloadText("furnished_scene.json", JSON.stringify(latestArtifacts.scene, null, 2), "application/json");
  });
  dom.downloadBoq.addEventListener("click", () => {
    if (latestArtifacts) downloadText("bom_pricing.csv", latestArtifacts.boq.csv, "text/csv");
  });

  buildPalette();
}

function buildPalette() {
  dom.furniturePalette.innerHTML = "";
  for (const m of MODULE_LIBRARY) {
    const item = document.createElement("div");
    item.className = "palette-item";
    item.draggable = true;
    item.innerHTML = `<span>${escapeHtml(m.label)}</span><span class="palette-item-dim">${m.w}×${m.d}m</span>`;
    item.addEventListener("dragstart", () => { planner?.startExternalDrop(m); });
    item.addEventListener("click", () => {
      if (!planner) return;
      planner.addFurnitureFromSuggestion(MODULE_LIBRARY, { id: m.id, label: m.label }, null);
      refreshPlacedList();
    });
    dom.furniturePalette.appendChild(item);
  }
}

function setMode(mode) {
  if (!planner) return;
  planner.setMode(mode);
  dom.tabSelect.classList.toggle("active", mode === "select");
  dom.tabPin.classList.toggle("active", mode === "pin");
}

// ─── Floor plan upload ────────────────────────────────────────────────────────

async function onFloorPlanPicked() {
  const file = dom.floorPlan.files?.[0];
  if (!file) return;
  floorPlanState.file = file;
  floorPlanState.kind = file.type === "application/pdf" ? "pdf" : file.type.startsWith("image/") ? "image" : null;
  if (!floorPlanState.kind) { alert("Only PDF or image files are supported."); return; }

  dom.floorPlanName.textContent = file.name;
  dom.analyzeBtn.disabled = false;

  // Render floor plan to a hidden canvas, then pass it to PlannerCanvas
  dom.canvasPlaceholder.hidden = false;
  dom.canvasWrap.hidden = true;
  floorPlanState.rendered = false;
  floorPlanState.detectedRooms = null;

  // Use a temporary off-screen canvas to render the plan
  const tempCanvas = document.createElement("canvas");
  await renderFloorPlanToCanvas(file, tempCanvas);
  floorPlanState.rendered = true;

  // Show canvas workspace
  dom.canvasPlaceholder.hidden = true;
  dom.canvasWrap.hidden = false;

  // Init PlannerCanvas
  planner = new PlannerCanvas(dom.plannerCanvas, {
    onStateChange: onSceneChange,
    onPinSelect: openPinPopover
  });
  planner.setFloorPlanImage(tempCanvas);
}

// ─── Floor plan analysis ──────────────────────────────────────────────────────

async function onAnalyzePlan() {
  if (!floorPlanState.rendered || !planner) { alert("Upload a floor plan first."); return; }
  const PA = window.PoligridAnalysis;
  if (!PA) { alert("Analysis module not loaded."); return; }

  dom.analysisPanel.hidden = false;
  dom.analysisStatusText.textContent = "Analysing with AI…";

  try {
    // Use a temp canvas matching the bg image to run analysis
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = planner.bgImage.width;
    tempCanvas.height = planner.bgImage.height;
    tempCanvas.getContext("2d").drawImage(planner.bgImage, 0, 0);

    const analysis = await PA.analyzeFloorPlan(tempCanvas);
    floorPlanState.detectedRooms = analysis.rooms || [];

    dom.analysisStatusText.textContent = `✓ ${analysis.rooms.length} rooms · ${analysis.bhkType || ""} · ${analysis.totalAreaM2 || "?"}m²`;
    dom.analysisSummaryText.textContent = analysis.summary || "";

    renderRoomChips(analysis.rooms);
    dom.analysisSummaryWrap.hidden = false;

    // Pass rooms to PlannerCanvas — sets overlays + auto-places furniture
    planner.setDetectedRooms(analysis.rooms);
    planner.autoPlaceAll(MODULE_LIBRARY);

    // Show canvas tools
    dom.canvasControlsSection.hidden = false;
    dom.pinsPanelSection.hidden = false;
    dom.generateBtn.disabled = false;

    refreshPlacedList();
    refreshPinsList();
  } catch (err) {
    dom.analysisStatusText.textContent = `⚠ ${err.message}`;
  }
}

function renderRoomChips(rooms) {
  dom.detectedRoomsList.innerHTML = "";
  for (const room of rooms) {
    const chip = document.createElement("span");
    chip.className = "room-chip";
    chip.title = room.notes || "";
    chip.innerHTML = `
      <span class="room-chip-dot" style="background:${ROOM_DOT_COLORS[room.roomType]||"#6050a0"}"></span>
      ${escapeHtml(room.label)}
      <span class="room-chip-dim">${room.widthM||"?"}×${room.lengthM||"?"}m</span>`;
    dom.detectedRoomsList.appendChild(chip);
  }
}

// ─── NL furniture add ─────────────────────────────────────────────────────────

async function onNlAdd() {
  const text = dom.nlInput.value.trim();
  if (!text || !planner) return;

  dom.nlStatus.hidden = false;
  dom.nlStatus.textContent = "Thinking…";

  try {
    const resp = await fetch("/api/furniture/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request: text,
        availableModules: MODULE_LIBRARY.map(m => ({ id: m.id, label: m.label, w: m.w, d: m.d, h: m.h, type: m.type }))
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Suggest failed");

    const suggestions = data.suggestions || [];
    if (!suggestions.length) { dom.nlStatus.textContent = "No matching module found."; return; }

    // Add top suggestion
    const top = suggestions[0];
    planner.addFurnitureFromSuggestion(MODULE_LIBRARY, top, null);
    dom.nlStatus.textContent = `✓ Added: ${top.label}`;
    dom.nlInput.value = "";
    refreshPlacedList();
  } catch (err) {
    dom.nlStatus.textContent = `⚠ ${err.message}`;
  }
}

// ─── Scene change callback ────────────────────────────────────────────────────

function onSceneChange(state) {
  refreshPlacedList();
  refreshPinsList();
  // Enable generate once we have at least one camera pin
  dom.generateBtn.disabled = !state.cameraPins.length && !floorPlanState.detectedRooms;
}

function refreshPlacedList() {
  if (!planner) return;
  dom.placedList.innerHTML = "";
  for (const f of planner.furniturePlacements) {
    const item = document.createElement("div");
    item.className = "placed-item" + (planner.selected?.id === f.id ? " active" : "");
    item.innerHTML = `
      <span class="placed-dot" style="background:${f.color}"></span>
      <span>${escapeHtml(f.label)}</span>
      <span class="placed-room">${escapeHtml(f.roomLabel || "")}</span>`;
    item.addEventListener("click", () => {
      planner.selected = { type: "furniture", id: f.id };
      planner.render();
      updateSelectionPanel();
    });
    dom.placedList.appendChild(item);
  }
  updateSelectionPanel();
}

function updateSelectionPanel() {
  if (!planner || !planner.selected) {
    dom.selectionPanel.hidden = true;
    return;
  }
  dom.selectionPanel.hidden = false;
  if (planner.selected.type === "furniture") {
    const f = planner.furniturePlacements.find(f => f.id === planner.selected.id);
    dom.selectionLabel.textContent = f ? `${f.label} (${f.wM.toFixed(1)}×${f.dM.toFixed(1)}m)` : "";
    dom.rotateBtn.hidden = false;
  } else {
    const p = planner.cameraPins.find(p => p.id === planner.selected.id);
    dom.selectionLabel.textContent = p ? `📷 Pin — ${p.roomLabel || "no room"}` : "";
    dom.rotateBtn.hidden = true;
  }
}

function refreshPinsList() {
  if (!planner) return;
  dom.pinsList.innerHTML = "";
  for (const pin of planner.cameraPins) {
    const card = document.createElement("div");
    card.className = "pin-card" + (activePinId === pin.id ? " active" : "");
    const thumbHtml = pin.photoDataUrl
      ? `<img class="pin-thumb" src="${pin.photoDataUrl}" alt="photo">`
      : `<div class="pin-thumb-placeholder">📷</div>`;
    card.innerHTML = `
      <div class="pin-card-head">
        ${thumbHtml}
        <div class="pin-info">
          <div class="pin-name">${escapeHtml(pin.roomLabel || "Pin")}</div>
          <div class="pin-dir">${Math.round(pin.angleDeg)}° · FOV ${pin.fovDeg}°</div>
        </div>
        <button class="ghost-sm" data-pin-edit="${pin.id}">Edit</button>
      </div>
      ${pin.brief ? `<div class="mini-note" style="margin-top:4px">${escapeHtml(pin.brief)}</div>` : ""}`;
    card.querySelector("[data-pin-edit]").addEventListener("click", () => openPinPopover(pin));
    dom.pinsList.appendChild(card);
  }
}

// ─── Camera pin popover ───────────────────────────────────────────────────────

function openPinPopover(pin) {
  activePinId = pin.id;
  dom.pinPopoverTitle.textContent = `📷 ${pin.roomLabel || "Camera Pin"}`;
  dom.pinRoomLabel.value = pin.roomLabel || "";
  dom.pinFov.value = String(pin.fovDeg || 60);
  dom.pinBrief.value = pin.brief || "";
  if (pin.photoDataUrl) {
    dom.pinPhotoPreview.innerHTML = `<img src="${pin.photoDataUrl}" alt="Photo">`;
    dom.pinPhotoPreview.hidden = false;
  } else {
    dom.pinPhotoPreview.hidden = true;
  }
  dom.pinPopover.hidden = false;
  refreshPinsList();
}

function onPinPhotoUpload() {
  const file = dom.pinPhotoInput.files?.[0];
  if (!file || !activePinId || !planner) return;
  const reader = new FileReader();
  reader.onload = e => {
    planner.updatePin(activePinId, { photoFile: file, photoDataUrl: e.target.result });
    dom.pinPhotoPreview.innerHTML = `<img src="${e.target.result}" alt="Photo">`;
    dom.pinPhotoPreview.hidden = false;
    refreshPinsList();
  };
  reader.readAsDataURL(file);
}

function onPinFieldChange() {
  if (!activePinId || !planner) return;
  planner.updatePin(activePinId, {
    roomLabel: dom.pinRoomLabel.value,
    fovDeg: parseInt(dom.pinFov.value) || 60,
    brief: dom.pinBrief.value
  });
  refreshPinsList();
}

// ─── Generate ──────────────────────────────────────────────────────────────────

function promptRoomDims(roomLabel) {
  const wStr = prompt(`Enter width for ${roomLabel} (in meters, e.g. 4.2):`, "4.2");
  if (wStr === null) return null;
  const lStr = prompt(`Enter length for ${roomLabel} (in meters, e.g. 3.5):`, "4.2");
  if (lStr === null) return null;
  const w = parseFloat(wStr);
  const l = parseFloat(lStr);
  if (isNaN(w) || isNaN(l) || w <= 0 || l <= 0) {
    alert("Invalid dimensions entered.");
    return null;
  }
  return { w, l };
}

async function onGenerate() {
  if (!planner) { alert("Upload and analyse a floor plan first."); return; }

  const globalBrief = dom.globalBrief.value.trim();
  const pins = planner.getCameraPinsWithFiles();

  // Build per-room render requests from camera pins + placed furniture
  const renderSources = [];
  const detectedRooms = floorPlanState.detectedRooms || [];

  if (pins.length) {
    for (const pin of pins) {
      const roomLabel = pin.roomLabel || "unknown";
      const detectedRoom = detectedRooms.find(r => r.label === roomLabel);

      // Require real dimensions — no silent fallback
      let widthM  = parseFloat(detectedRoom?.widthM);
      let lengthM = parseFloat(detectedRoom?.lengthM);
      if (!widthM || !lengthM) {
        const entered = promptRoomDims(roomLabel);
        if (!entered) return; // user cancelled
        widthM = entered.w;
        lengthM = entered.l;
        // Store back so subsequent pins don't re-prompt
        if (detectedRoom) { detectedRoom.widthM = widthM; detectedRoom.lengthM = lengthM; }
      }

      const archNotes = detectedRoom?.notes || "";
      const roomType  = detectedRoom?.roomType || "other";
      const placements = planner.getPlacementsForRoom(roomLabel);
      const brief = [pin.brief, globalBrief].filter(Boolean).join(". ");

      renderSources.push({
        pinId: pin.id, roomLabel, widthM, lengthM, archNotes, roomType,
        placements, brief, photoFile: pin.photoFile, photoDataUrl: pin.photoDataUrl
      });
    }
  } else {
    // No pins: generate from all detected rooms
    if (!detectedRooms.length) {
      alert("Please analyse the floor plan first so room dimensions are known.");
      return;
    }
    for (const room of detectedRooms) {
      if (room.roomType === "bathroom" || room.roomType === "utility") continue;

      let widthM  = parseFloat(room.widthM);
      let lengthM = parseFloat(room.lengthM);
      if (!widthM || !lengthM) {
        const entered = promptRoomDims(room.label);
        if (!entered) return;
        widthM = entered.w;
        lengthM = entered.l;
        room.widthM = widthM;
        room.lengthM = lengthM;
      }

      const placements = planner.getPlacementsForRoom(room.label);
      renderSources.push({
        pinId: null, roomLabel: room.label,
        widthM, lengthM,
        archNotes: room.notes || "", roomType: room.roomType,
        placements, brief: globalBrief || room.name,
        photoFile: null, photoDataUrl: null
      });
    }
  }

  if (!renderSources.length) { alert("Add camera pins or analyse the floor plan first."); return; }

  dom.outputPanel.hidden = false;
  document.querySelector(".workspace").classList.add("output-open");
  dom.generateBtn.disabled = true;
  dom.generateBtn.textContent = "Generating…";
  dom.generateStatus.hidden = false;
  dom.generateStatus.textContent = "Extracting styles + generating renders…";

  let fallbackCount = 0;
  const roomResults = [];
  const allPlacements = [];
  const perRoomSummary = [];

  try {
    for (const src of renderSources) {
      dom.generateStatus.textContent = `Rendering ${src.roomLabel}…`;

      const styleInput = { label: src.roomLabel, brief: src.brief, name: src.roomLabel, inspo: [], photos: [] };
      const style = await extractRoomStyle(styleInput);
      const laminate = pickLaminateFromStyle(style);

      // Convert planner placements to the format expected by legacy BOM/prompt code
      const legacyPlacements = src.placements.map(f => ({
        module: MODULE_LIBRARY.find(m => m.id === f.moduleId) || { label: f.label, w: f.wM, d: f.dM, h: f.hM || 2.1 },
        wall: f.wall || "south",
        x: f.xM, z: f.yM, rotationY: f.rotationY || 0
      }));
      const placementObj = { placements: legacyPlacements, warnings: [] };
      allPlacements.push(...legacyPlacements.map(p => ({ ...p, roomLabel: src.roomLabel })));

      const selectedModules = legacyPlacements.map(p => p.module);
      const renders = [];

      if (src.photoFile) {
        try {
          const edited = await createOpenAiFurnishedRender(src.photoFile, {
            model: DEFAULT_OPENAI_IMAGE_MODEL,
            roomWidth: src.widthM, roomLength: src.lengthM,
            brief: src.brief, styleSummary: style.style_summary || "",
            laminate, placements: legacyPlacements,
            roomLabel: src.roomLabel, archNotes: src.archNotes
          }, 0);
          renders.push(edited);
        } catch (err) {
          fallbackCount++;
          const fb = await createLocalFurnishedRender(src.photoFile, legacyPlacements, laminate, 0);
          fb.note = `OpenAI failed: ${err.message}`;
          renders.push(fb);
        }
      } else {
        // Generate from floor plan crop of the room bbox
        const detectedRoom = detectedRooms.find(r => r.label === src.roomLabel);
        const bgW = planner.bgImage?.width || 800, bgH = planner.bgImage?.height || 600;
        const cropRect = detectedRoom
          ? {
              x: detectedRoom.bbox.xPct * bgW, y: detectedRoom.bbox.yPct * bgH,
              w: detectedRoom.bbox.wPct * bgW,  h: detectedRoom.bbox.hPct * bgH
            }
          : { x: 0, y: 0, w: bgW, h: bgH };

        const tempBg = document.createElement("canvas");
        tempBg.width = bgW; tempBg.height = bgH;
        tempBg.getContext("2d").drawImage(planner.bgImage, 0, 0);
        const cropBase64 = cropCanvasRegionToPngBase64(tempBg, cropRect, 1400);

        for (let i = 0; i < 2; i++) {
          try {
            const edited = await createOpenAiFurnishedRenderFromBase64(
              `floorplan_${src.roomLabel}_concept_${i + 1}.png`,
              cropBase64, "image/png",
              {
                model: DEFAULT_OPENAI_IMAGE_MODEL,
                roomWidth: src.widthM, roomLength: src.lengthM,
                brief: src.brief, styleSummary: style.style_summary || "",
                laminate, placements: legacyPlacements,
                roomLabel: src.roomLabel, fromFloorPlan: true, archNotes: src.archNotes
              }, i);
            renders.push(edited);
          } catch (err) {
            fallbackCount++;
            renders.push({
              name: `floorplan_${src.roomLabel}_concept_${i+1}.png`,
              dataUrl: `data:image/png;base64,${cropBase64}`,
              source: "floorplan",
              note: `OpenAI failed: ${err.message}`
            });
          }
        }
      }

      const roomLike = { label: src.roomLabel, name: src.roomLabel, widthM: src.widthM, lengthM: src.lengthM, brief: src.brief, photos: src.photoFile ? [src.photoFile] : [], inspo: [], generateFromPlan: !src.photoFile };
      roomResults.push({ room: roomLike, style, laminate, selectedModules, placement: placementObj, renders });
      perRoomSummary.push(formatRoomSummary({ room: roomLike, style, laminate, selectedModules, placement: placementObj }));
    }

    drawRoomResults(roomResults);

    const scene = buildSceneJson({ floorPlan: floorPlanState.file?.name || "", floorPlanLabels: "", rooms: roomResults });
    const boq = buildBoqFromRooms(roomResults);
    paintBoq(boq.rows, boq.grandTotal);

    dom.placementSummary.textContent = [
      `Floor plan: ${floorPlanState.file?.name || ""}`,
      "",
      ...perRoomSummary
    ].filter(v => v !== null).join("\n");

    dom.statusBox.textContent = fallbackCount
      ? `Done. ${fallbackCount} render(s) used local fallback.`
      : "Done. Generated furnished renders + BOM.";

    latestArtifacts = { scene, boq };
    dom.downloadScene.disabled = false;
    dom.downloadBoq.disabled = false;
  } catch (err) {
    dom.statusBox.textContent = `Error: ${err.message}`;
  } finally {
    dom.generateBtn.disabled = false;
    dom.generateBtn.textContent = "✦ Generate Renders + BOM";
    dom.generateStatus.hidden = true;
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
  const moduleList = context.placements.map((p) => `${p.module.label} (${p.module.w}m×${p.module.d}m, ${p.wall} wall)`).join(", ");
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
    "6) Ensure furniture placement is coherent with room shape — pieces along walls, clearance in centre.",
    `Room size approximately ${context.roomWidth}m × ${context.roomLength}m.`,
    context.archNotes ? `Architectural notes: ${context.archNotes}` : "",
    `Design brief: ${context.brief}`,
    context.styleSummary ? `Inspiration-derived style direction: ${context.styleSummary}` : "",
    `Furniture layout (position by wall): ${moduleList || "TV unit, storage, study module"}.`,
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

    const widthM  = parseFloat(result.room.widthM)  || null;
    const lengthM = parseFloat(result.room.lengthM) || null;

    // ── Head
    const head = document.createElement("div");
    head.className = "room-result-head";
    head.innerHTML = `
      <div>
        <div class="pill">Room ${escapeHtml(result.room.label)}</div>
        <div class="mini-note">${escapeHtml(result.room.name || "")}</div>
      </div>
      <div class="mini-note" style="text-align:right">
        Laminate: ${escapeHtml(result.laminate.name)}<br>
        <span style="font-size:0.8rem;color:var(--muted)">${widthM}m × ${lengthM}m</span>
      </div>
    `;

    // ── Body
    const body = document.createElement("div");
    body.className = "room-result-body";

    const styleBox = document.createElement("div");
    styleBox.className = "status";
    styleBox.textContent = result.style?.style_summary ? `Style: ${result.style.style_summary}` : "Style extracted.";
    body.appendChild(styleBox);

    // Render grid
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

    // ── Placement Map section
    if (result.placement && result.placement.placements.length) {
      const PA = window.PoligridAnalysis;
      const mapSection = document.createElement("div");
      mapSection.className = "placement-map-section";

      const mapH4 = document.createElement("h4");
      mapH4.textContent = "Furniture Placement Map";
      mapSection.appendChild(mapH4);

      const mapWrap = document.createElement("div");
      mapWrap.className = "placement-map-wrap";

      const mapCanvas = document.createElement("canvas");
      // Scale canvas to room proportions — max 600px wide
      const mapMaxW = 600;
      const mapScale = Math.min(mapMaxW / widthM, 120);
      mapCanvas.width = Math.round(widthM * mapScale + 80);
      mapCanvas.height = Math.round(lengthM * mapScale + 80);
      mapWrap.appendChild(mapCanvas);
      mapSection.appendChild(mapWrap);

      // Controls
      const controls = document.createElement("div");
      controls.className = "placement-map-controls";

      const ctrlNote = document.createElement("span");
      ctrlNote.className = "ctrl-note";
      ctrlNote.textContent = "Click to select. Drag to reposition.";
      controls.appendChild(ctrlNote);

      const flipBtn = document.createElement("button");
      flipBtn.type = "button";
      flipBtn.textContent = "↺ Flip";

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "✕ Remove";
      removeBtn.className = "remove-btn";

      controls.append(flipBtn, removeBtn);
      mapSection.appendChild(controls);

      if (result.placement.warnings.length) {
        const warn = document.createElement("p");
        warn.className = "mini-note";
        warn.style.color = "#b86d35";
        warn.textContent = "⚠ " + result.placement.warnings.join(" · ");
        mapSection.appendChild(warn);
      }

      wrap.append(head, body, mapSection);

      // Init interactive map after DOM is in place
      requestAnimationFrame(() => {
        if (PA && PA.makePlacementMapInteractive) {
          const roomObj = {
            widthM,
            lengthM,
            label: result.room.label,
            name: result.room.name
          };
          const roomInteractive = PA.makePlacementMapInteractive(
            mapCanvas,
            roomObj,
            result.placement.placements,
            (updatedPlacements) => {
              result.placement.placements = updatedPlacements;
            }
          );
          flipBtn.addEventListener("click", () => roomInteractive.flipSelected());
          removeBtn.addEventListener("click", () => roomInteractive.removeSelected());
        } else {
          // Fallback static render
          if (PA && PA.renderPlacementMap) {
            PA.renderPlacementMap(mapCanvas, { widthM, lengthM, label: result.room.label, name: result.room.name }, result.placement.placements, null);
          }
        }
      });
    } else {
      wrap.append(head, body);
    }

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

    // Photo upload → room matching
    const photosInput = card.querySelector('[data-field="photos"]');
    let matchBadge = null;
    photosInput && photosInput.addEventListener("change", async () => {
      if (matchBadge) { matchBadge.remove(); matchBadge = null; }
      const PA = window.PoligridAnalysis;
      if (!PA || !photosInput.files || !photosInput.files[0]) return;
      if (!floorPlanState.rendered) return;
      const photo = photosInput.files[0];
      const labelInput = card.querySelector('[data-field="label"]');
      try {
        const match = await PA.matchRoomImage(
          photo,
          dom.floorPlanCanvas,
          floorPlanState.detectedRooms || []
        );
        if (!match || !match.matchedLabel) return;
        const pct = Math.round((match.confidence || 0) * 100);
        matchBadge = document.createElement("div");
        matchBadge.className = "match-badge";
        matchBadge.innerHTML = `
          <span class="match-text">Suggested room: <strong>${escapeHtml(match.matchedLabel)} — ${escapeHtml(match.matchedName || "")}</strong><br>
          <span style="font-size:0.8rem;opacity:0.8">${escapeHtml(match.reasoning || "")}</span></span>
          <span class="match-confidence">${pct}%</span>
          <button type="button" data-match-action="accept" data-label="${escapeHtml(match.matchedLabel)}" data-name="${escapeHtml(match.matchedName || "")}">✓ Accept</button>
          <button type="button" class="reject-btn" data-match-action="reject">✕ Ignore</button>
        `;
        matchBadge.addEventListener("click", (e) => {
          const btn = e.target.closest("button");
          if (!btn) return;
          if (btn.dataset.matchAction === "accept") {
            if (labelInput && !labelInput.value) labelInput.value = btn.dataset.label;
            const nameInput = card.querySelector('[data-field="name"]');
            if (nameInput && !nameInput.value) nameInput.value = btn.dataset.name;
          }
          matchBadge.remove();
          matchBadge = null;
        });
        card.querySelector(".room-card-body").appendChild(matchBadge);
      } catch (_) {
        // Match failures are non-fatal; silently skip
      }
    });

    // Remove room button
    card.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest ? e.target.closest("button[data-action]") : null;
      if (!btn) return;
      if (btn.dataset.action === "remove-room") removeRoom(roomId);
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
  floorPlanState.detectedRooms = null;
  if (roomBoxEditorCleanup) { roomBoxEditorCleanup(); roomBoxEditorCleanup = null; }
  if (dom.floorPlanCanvas) {
    const ctx = dom.floorPlanCanvas.getContext("2d");
    ctx?.clearRect(0, 0, dom.floorPlanCanvas.width, dom.floorPlanCanvas.height);
  }
}

async function renderFloorPlanToCanvas(file, targetCanvas) {
  const canvas = targetCanvas || dom.plannerCanvas;
  if (!canvas) return;
  if (file.type === "application/pdf") {
    await renderPdfFirstPage(file, canvas);
    return;
  }
  if (file.type.startsWith("image/")) {
    await renderImageToCanvas(file, canvas);
  }
}

async function renderImageToCanvas(file, canvas) {
  const img = await readImage(file);
  const maxW = 860;
  const scale = img.width > maxW ? maxW / img.width : 1;
  canvas.width = Math.max(2, Math.round(img.width * scale));
  canvas.height = Math.max(2, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
}

async function renderPdfFirstPage(file, canvas) {
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
