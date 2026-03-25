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
  },
  {
    id: "sofa_3",
    label: "3-Seater Sofa",
    keywords: ["sofa", "living", "seating", "couch"],
    w: 2.1,
    d: 0.85,
    h: 0.8,
    type: "seating",
    priority: 8
  },
  {
    id: "armchair",
    label: "Accent Armchair",
    keywords: ["chair", "living", "seating", "accent"],
    w: 0.8,
    d: 0.8,
    h: 0.9,
    type: "seating",
    priority: 5
  },
  {
    id: "coffee_table",
    label: "Coffee Table",
    keywords: ["coffee table", "living", "center table"],
    w: 0.9,
    d: 0.6,
    h: 0.4,
    type: "table",
    priority: 6
  },
  {
    id: "dining_6",
    label: "6-Seater Dining Table",
    keywords: ["dining", "table", "eating"],
    w: 1.8,
    d: 0.9,
    h: 0.75,
    type: "table",
    priority: 7
  },
  {
    id: "rug_large",
    label: "Large Area Rug",
    keywords: ["rug", "carpet", "living", "floor"],
    w: 2.0,
    d: 3.0,
    h: 0.02,
    type: "decor",
    priority: 4
  },
  {
    id: "side_table",
    label: "Side Table",
    keywords: ["side table", "bedside", "living", "bedroom"],
    w: 0.45,
    d: 0.45,
    h: 0.5,
    type: "table",
    priority: 3
  },
  {
    id: "floor_lamp",
    label: "Floor Lamp",
    keywords: ["lamp", "lighting", "living", "corner"],
    w: 0.4,
    d: 0.4,
    h: 1.6,
    type: "decor",
    priority: 3
  },
  {
    id: "potted_plant",
    label: "Large Potted Plant",
    keywords: ["plant", "greens", "decor", "corner"],
    w: 0.5,
    d: 0.5,
    h: 1.2,
    type: "decor",
    priority: 3
  },
  {
    id: "office_desk",
    label: "Employee Desk",
    keywords: ["desk", "employee", "workstation", "office"],
    w: 1.2,
    d: 0.6,
    h: 0.75,
    type: "study",
    shelves: 1,
    partitions: 1,
    shutters: 1,
    drawers: 2,
    priority: 8
  },
  {
    id: "office_workstation_4",
    label: "4-Seater Linear Workstation",
    keywords: ["workstation", "linear", "office", "desk", "pod", "seating row"],
    w: 2.4,
    d: 1.2,
    h: 1.2,
    type: "study",
    shelves: 4,
    partitions: 4,
    shutters: 4,
    drawers: 8,
    priority: 9
  },
  {
    id: "conference_table",
    label: "Meeting / Conference Table",
    keywords: ["meeting", "conference", "boardroom", "table"],
    w: 3.0,
    d: 1.2,
    h: 0.75,
    type: "table",
    priority: 8
  },
  {
    id: "office_credenza",
    label: "Office Credenza / Storage",
    keywords: ["credenza", "storage", "office", "filing", "cabinet"],
    w: 1.6,
    d: 0.45,
    h: 0.75,
    type: "cabinet",
    shelves: 2,
    partitions: 1,
    shutters: 3,
    drawers: 0,
    priority: 7
  },
  {
    id: "reception_desk",
    label: "Reception Desk",
    keywords: ["reception", "desk", "lobby", "welcome"],
    w: 2.0,
    d: 0.6,
    h: 1.05,
    type: "cabinet",
    shelves: 2,
    partitions: 2,
    shutters: 2,
    drawers: 2,
    priority: 9
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
  // Phase 1
  floorPlan: el("floorPlan"),
  floorPlanName: el("floorPlanName"),
  inspirationImages: el("inspirationImages"),
  inspirationNames: el("inspirationNames"),
  inspirationPreviews: el("inspirationPreviews"),
  analyzeBtn: el("analyzeBtn"),
  analysisChip: el("analysisChip"),
  // Phase 2
  panel2: el("panel2"),
  roomChipList: el("roomChipList"),
  addRoomBtn: el("addRoomBtn"),
  analysisSummaryWrap: el("analysisSummaryWrap"),
  analysisSummaryText: el("analysisSummaryText"),
  confirmRoomsBtn: el("confirmRoomsBtn"),
  // Phase 3 (Room Photos)
  panel3: el("panel3"),
  tabSelectP4: el("tabSelectP4"),
  tabPin: el("tabPin"),
  pinsList: el("pinsList"),
  noPinsHint: el("noPinsHint"),
  confirmPinsBtn: el("confirmPinsBtn"),
  // Phase 4 (Brief & Generate)
  panel4: el("panel4"),
  globalBrief: el("globalBrief"),
  generateBtn: el("generateBtn"),
  generateStatus: el("generateStatus"),
  // Canvas
  canvasPlaceholder: el("canvasPlaceholder"),
  canvasWrap: el("canvasWrap"),
  floorBgCanvas: el("floorBgCanvas"),
  roomEditorCanvas: el("roomEditorCanvas"),
  plannerCanvas: el("plannerCanvas"),
  // Chat
  chatPanel: el("chatPanel"),
  chatHistory: el("chatHistory"),
  chatInput: el("chatInput"),
  chatSendBtn: el("chatSendBtn"),
  chatToggle: el("chatToggle"),
  // Pin popover
  pinPopover: el("pinPopover"),
  pinPopoverTitle: el("pinPopoverTitle"),
  pinPopoverClose: el("pinPopoverClose"),
  pinPhotoInput: el("pinPhotoInput"),
  pinPhotoPreview: el("pinPhotoPreview"),
  pinRoomLabel: el("pinRoomLabel"),
  pinFov: el("pinFov"),
  pinBrief: el("pinBrief"),
  // Output
  outputPanel: el("outputPanel"),
  closeOutput: el("closeOutput"),
  roomResults: el("roomResults"),
  statusBox: el("statusBox"),
  boqAccordionContainer: el("boqAccordionContainer"),
  grandTotal: el("grandTotal"),
  placementSummary: el("placementSummary"),
  downloadScene: el("downloadScene"),
  downloadBoq: el("downloadBoq"),
};

function el(id) { return document.getElementById(id); }

// ─── App State ─────────────────────────────────────────────────────────────────

let currentPhase = 1;
let planner = null;
let roomEditor = null;
let activePinId = null;
let latestArtifacts = null;

const appState = {
  projectId: generateUUID(),  // unique ID for this session, persisted to Supabase
  // Phase 1
  floorFile: null,
  inspirationFiles: [],
  context: {
    propertyType: "Apartment",
    bhk: "2BHK",
    totalAreaM2: null,
    notes: ""
  },
  // Phase 2
  detectedRooms: null,
  confirmedRooms: null,
  globalBoq: [], // Derived strictly from Floor Plan analysis
};

const ROOM_DOT_COLORS = {
  bedroom: "#8a4db5", living: "#2e8b57", kitchen: "#c97820",
  bathroom: "#2080c0", dining: "#c04040", study: "#3070a0",
  balcony: "#288070", foyer: "#a09020", utility: "#707070",
  office: "#4060c0", conference: "#c06040", workstation: "#60c040",
  reception: "#c040c0", pantry: "#d0a020", store: "#808080", retail: "#d05070",
  other: "#6050a0"
};

const FURN_COLORS = [
  "#3a6a5a", "#b86d35", "#5a6a9a", "#9a5a6a",
  "#6a9a5a", "#9a8a3a", "#5a8a9a", "#9a6a9a", "#6a5a8a", "#8a6a3a"
];

// ─── Phase state machine ───────────────────────────────────────────────────────

function advancePhase(n) {
  currentPhase = n;
  // Update pills
  for (let i = 1; i <= 4; i++) {
    const pill = el(`pill${i}`);
    if (!pill) continue;
    pill.classList.toggle("active", i === n);
    pill.classList.toggle("done", i < n);
    pill.disabled = i > n;
  }
  // Connectors
  for (let i = 1; i <= 3; i++) {
    const conn = el(`conn${i}${i + 1}`);
    if (conn) conn.style.background = i < n ? "var(--success)" : "var(--border)";
  }
  // Show/hide panels
  for (let i = 1; i <= 4; i++) {
    const p = el(`panel${i}`);
    if (p) p.hidden = i !== n;
  }
}

// ─── Init ──────────────────────────────────────────────────────────────────────

// ─── HYD furniture rates (Hyderabad premium market, INR) ──────────────────────
const HYD_FURNITURE_RATES = {
  cabinet: 48000,
  study:   38000,
  bed:     34000,
  seating: 40000,
  table:   22000,
  decor:    9000,
  custom:  26000
};

// ─── API Inspector (Debug Logger) ─────────────────────────────────────────────
const Debugger = {
  _seq:     0,
  _pSeq:    0,
  _pending: new Map(),   // pSeq → { el, label, startTime }
  _logs:    [],          // full log archive for download

  // ── Show a pending "waiting" entry immediately when a request starts ────────
  pending(label) {
    const id   = ++Debugger._pSeq;
    const time = new Date().toLocaleTimeString();
    const el_  = document.createElement('details');
    el_.className = 'dbg-entry dbg-pending';
    el_.open = false;
    el_.innerHTML = `
      <summary class="dbg-summary">
        <span class="dbg-seq">…</span>
        <span class="dbg-step-name">${escapeHtml(label)}</span>
        <span class="dbg-spinner">⟳</span>
        <span class="dbg-time">${time}</span>
      </summary>
      <div class="dbg-body"><div class="dbg-pending-msg">Waiting for OpenAI response…</div></div>`;
    const content = el('debugContent');
    if (content) content.prepend(el_);
    Debugger._pending.set(id, { el: el_, label, startTime: Date.now() });
    return id;
  },

  // ── Resolve a pending entry: remove spinner, log actual debug items ─────────
  resolvePending(pendingId, debugItems, error) {
    const p = Debugger._pending.get(pendingId);
    if (p) {
      p.el.remove();
      Debugger._pending.delete(pendingId);
    }
    if (error) {
      Debugger._addEntry(p?.label || 'API Call', {}, { error: { message: error.message } });
    } else if (debugItems && debugItems.length) {
      // Log each OpenAI sub-call (newest first order preserved by prepend in _addEntry)
      for (let i = debugItems.length - 1; i >= 0; i--) {
        const d = debugItems[i];
        Debugger._addEntry(d.step, d.payload, d.response);
      }
    }
  },

  // ── Core method: build one collapsible entry for a single OpenAI call ───────
  _addEntry(step, payload, response) {
    const content = el('debugContent');
    if (!content) return;

    const seq     = ++Debugger._seq;
    const time    = new Date().toLocaleTimeString();
    const model   = payload?.model || '—';
    const isError = !!(response?.error);
    const effort  = payload?.reasoning?.effort || null;
    const maxTok  = payload?.max_output_tokens || null;

    // Extract rich data before sanitising
    const promptText = Debugger._promptText(payload);
    const sentImgs   = Debugger._sentImages(payload);
    const respText   = Debugger._responseText(response);
    const respImg    = Debugger._responseImage(response);
    const usage      = response?.usage || null;

    // Archive for download
    Debugger._logs.push({ seq, step, time, model, promptText, respText, usage, isError });

    const safePayload  = Debugger._sanitize(payload  || {});
    const safeResponse = Debugger._sanitize(response || {});

    const thumbs = srcs => srcs.map(s =>
      `<img class="dbg-thumb" src="${s}" title="Click to zoom" onclick="this.classList.toggle('dbg-thumb-zoom')" />`
    ).join('');

    const metaTag = (lbl, val) =>
      `<span class="dbg-meta-tag">${escapeHtml(lbl)}: <b>${escapeHtml(String(val))}</b></span>`;

    const rawBlock = (lbl, obj) => `
      <details class="dbg-raw">
        <summary>${escapeHtml(lbl)}</summary>
        <pre class="dbg-pre">${escapeHtml(JSON.stringify(obj, null, 2))}</pre>
      </details>`;

    const sentMeta = [
      metaTag('model', model),
      effort ? metaTag('reasoning', effort) : '',
      maxTok ? metaTag('max_tokens', maxTok) : '',
      sentImgs.length ? metaTag('images_sent', sentImgs.length) : '',
    ].filter(Boolean).join('');

    const sentBody = `
      <div class="dbg-meta-row">${sentMeta}</div>
      ${promptText ? `<div class="dbg-label">Prompt</div><pre class="dbg-prompt-pre">${escapeHtml(promptText)}</pre>` : ''}
      ${sentImgs.length ? `<div class="dbg-label">Images sent (${sentImgs.length})</div><div class="dbg-thumbs">${thumbs(sentImgs)}</div>` : ''}
      ${rawBlock('Raw request JSON', safePayload)}`;

    const usageHtml = usage
      ? `<div class="dbg-usage">↑ ${usage.input_tokens ?? '?'} in &nbsp;·&nbsp; ↓ ${usage.output_tokens ?? '?'} out</div>`
      : '';

    const recvBody = `
      ${respText ? `<div class="dbg-label">Output text</div><pre class="dbg-resp-pre">${escapeHtml(respText)}</pre>` : ''}
      ${respImg  ? `<div class="dbg-label">Generated image</div><div class="dbg-thumbs">${thumbs([respImg])}</div>` : ''}
      ${usageHtml}
      ${isError  ? `<div class="dbg-error">${escapeHtml(JSON.stringify(response?.error))}</div>` : ''}
      ${rawBlock('Raw response JSON', safeResponse)}`;

    const entry = document.createElement('details');
    entry.className = 'dbg-entry';
    entry.open = true;
    entry.innerHTML = `
      <summary class="dbg-summary">
        <span class="dbg-seq">#${seq}</span>
        <span class="dbg-step-name">${escapeHtml(step)}</span>
        <span class="dbg-model-pill">${escapeHtml(model)}</span>
        <span class="dbg-time">${time}</span>
        <span class="dbg-status-dot ${isError ? 'err' : 'ok'}">${isError ? '✗' : '✓'}</span>
      </summary>
      <div class="dbg-body">
        <details class="dbg-section" open>
          <summary class="dbg-section-head sent">→ Sent to OpenAI</summary>
          <div class="dbg-section-body">${sentBody}</div>
        </details>
        <details class="dbg-section" open>
          <summary class="dbg-section-head recv">← Received from OpenAI</summary>
          <div class="dbg-section-body">${recvBody}</div>
        </details>
      </div>`;

    content.prepend(entry);

    const badge = el('dbgCount');
    if (badge) badge.textContent = Debugger._seq;
  },

  // ── Extract prompt text from a responses-API or image-gen payload ──────────
  _promptText(payload) {
    const content = payload?.input?.[0]?.content;
    if (Array.isArray(content)) {
      const t = content.find(c => c.type === 'input_text');
      if (t?.text) return t.text;
    }
    if (typeof payload?.prompt === 'string') return payload.prompt;
    return '';
  },

  // ── Extract sent image data URLs ───────────────────────────────────────────
  _sentImages(payload) {
    const content = payload?.input?.[0]?.content;
    if (!Array.isArray(content)) return [];
    return content
      .filter(c => c.type === 'input_image' && typeof c.image_url === 'string' && c.image_url.startsWith('data:'))
      .map(c => c.image_url);
  },

  // ── Extract text output from a responses-API reply ─────────────────────────
  _responseText(response) {
    if (Array.isArray(response?.output)) {
      for (const out of response.output) {
        if (out.type === 'message') {
          const t = (out.content || []).find(c => c.type === 'output_text');
          if (t?.text) return t.text;
        }
      }
    }
    return '';
  },

  // ── Extract generated image from image-gen/edit response ──────────────────
  _responseImage(response) {
    const b64 = response?.data?.[0]?.b64_json;
    return b64 ? `data:image/png;base64,${b64}` : null;
  },

  // ── Replace base64 blobs with size labels so raw JSON is readable ──────────
  _sanitize(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(v => Debugger._sanitize(v));
    const out = {};
    for (const k in obj) {
      const v = obj[k];
      if (typeof v === 'string' && v.length > 300 &&
          (v.startsWith('data:image') || /^[A-Za-z0-9+/]{200}/.test(v))) {
        out[k] = `[image ~${Math.round(v.length * 0.75 / 1024)}KB]`;
      } else if (typeof v === 'object') {
        out[k] = Debugger._sanitize(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  },

  // ── Download all logs as JSON ──────────────────────────────────────────────
  download() {
    const data = JSON.stringify(Debugger._logs, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = `poligrid-logs-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
    a.click();
  },

  // ── Clear all entries ──────────────────────────────────────────────────────
  clear() {
    const content = el('debugContent');
    if (content) content.innerHTML = '';
    Debugger._seq  = 0;
    Debugger._pSeq = 0;
    Debugger._logs = [];
    Debugger._pending.clear();
    const badge = el('dbgCount');
    if (badge) badge.textContent = '0';
  }
};

init();

function init() {
  // Phase 1 bindings
  dom.floorPlan.addEventListener("change", onFloorPlanPicked);
  dom.inspirationImages.addEventListener("change", onInspirationPicked);
  dom.analyzeBtn.addEventListener("click", onAnalyzePlan);

  // Context form — segmented controls
  document.querySelectorAll(".seg-control").forEach(ctrl => {
    ctrl.addEventListener("click", e => {
      const btn = e.target.closest(".seg-btn");
      if (!btn) return;
      ctrl.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const id = ctrl.id;
      if (id === "propTypeCtrl") {
        appState.context.propertyType = btn.dataset.val;
        const isComm = btn.dataset.val === "Commercial";
        el("configRowResidential").style.display = isComm ? "none" : "";
        el("configRowCommercial").style.display = isComm ? "" : "none";
        appState.context.bhk = isComm ? el("commCtrl").querySelector(".active").dataset.val : el("bhkCtrl").querySelector(".active").dataset.val;
      }
      if (id === "bhkCtrl" || id === "commCtrl") {
        appState.context.bhk = btn.dataset.val;
      }
    });
  });
  el("totalAreaInput")?.addEventListener("input", e => {
    appState.context.totalAreaM2 = parseFloat(e.target.value) || null;
  });
  el("ctxNotes")?.addEventListener("input", e => {
    appState.context.notes = e.target.value;
  });

  // Phase 2 bindings
  dom.addRoomBtn.addEventListener("click", () => roomEditor?.addRoom());
  dom.confirmRoomsBtn.addEventListener("click", onConfirmRooms);

  // Phase 3 bindings (Room Photos)
  dom.tabSelectP4.addEventListener("click", () => setMode("select", dom.tabSelectP4, dom.tabPin));
  dom.tabPin.addEventListener("click", () => setMode("pin", dom.tabSelectP4, dom.tabPin));
  dom.confirmPinsBtn.addEventListener("click", () => advancePhase(4));

  // Phase 4 bindings (Generate)
  dom.generateBtn.addEventListener("click", onGenerate);

  // Pin popover
  dom.pinPopoverClose.addEventListener("click", () => { dom.pinPopover.hidden = true; activePinId = null; });
  dom.pinPhotoInput.addEventListener("change", onPinPhotoUpload);
  dom.pinRoomLabel.addEventListener("input", onPinFieldChange);
  dom.pinFov.addEventListener("input", onPinFieldChange);
  dom.pinBrief.addEventListener("input", onPinFieldChange);

  // Output
  dom.closeOutput?.addEventListener("click", () => { dom.outputPanel.hidden = true; document.querySelector(".workspace")?.classList.remove("output-open"); });
  dom.downloadScene.addEventListener("click", () => {
    if (latestArtifacts) {
      downloadText("scene.json", JSON.stringify(latestArtifacts.scene, null, 2), "application/json");
      saveToDb("/api/project/save-scene", {
        projectId: appState.projectId,
        sceneJson: latestArtifacts.scene,
        boqCsv: latestArtifacts.boq.csv
      });
    }
  });
  dom.downloadBoq.addEventListener("click", () => {
    if (latestArtifacts) downloadText("boq.csv", latestArtifacts.boq.csv, "text/csv");
  });

  // Debug panel — toggle collapse, clear, download
  const debugPanel    = el("debugPanel");
  const debugToggleBtn = el("debugToggleBtn");
  el("debugHeader")?.addEventListener("click", () => {
    debugPanel.classList.toggle("collapsed");
    debugToggleBtn.textContent = debugPanel.classList.contains("collapsed") ? "▲" : "▼";
  });
  el("dbgClearBtn")?.addEventListener("click", e => {
    e.stopPropagation();
    Debugger.clear();
  });
  el("dbgDownloadBtn")?.addEventListener("click", e => {
    e.stopPropagation();
    Debugger.download();
  });

  // Clickable Checkpoint Pills
  for (let i = 1; i <= 4; i++) {
    const pill = el(`pill${i}`);
    if (pill) {
      pill.style.cursor = "pointer";
      pill.addEventListener("click", () => {
        if (!pill.disabled) {
          advancePhase(i);
          if (i === 1) {
            dom.roomEditorCanvas.hidden = true;
            dom.plannerCanvas.hidden = true;
          } else if (i === 2) {
            dom.roomEditorCanvas.hidden = false;
            dom.plannerCanvas.hidden = true;
            if (roomEditor) roomEditor.render();
          } else if (i >= 3) {
            dom.roomEditorCanvas.hidden = true;
            dom.plannerCanvas.hidden = false;
            if (planner) planner.render();
          }
        }
      });
    }
  }

  buildPalette();

  // Project name rename (debounced)
  let _renameTimer = null;
  el("projectNameInput")?.addEventListener("input", e => {
    clearTimeout(_renameTimer);
    _renameTimer = setTimeout(() => {
      saveToDb("/api/project/rename", { projectId: appState.projectId, name: e.target.value });
    }, 800);
  });

  // Global brief autosave (debounced)
  let _briefTimer = null;
  dom.globalBrief?.addEventListener("input", e => {
    clearTimeout(_briefTimer);
    _briefTimer = setTimeout(() => {
      saveToDb("/api/project/save-brief", { projectId: appState.projectId, globalBrief: e.target.value });
    }, 800);
  });

  // Back to projects
  el("backToProjects")?.addEventListener("click", showProjectPicker);

  // New project button
  el("newProjectBtn")?.addEventListener("click", () => {
    appState.projectId = generateUUID();
    el("projectNameInput").value = "";
    hideProjectPicker();
    advancePhase(1);
  });

  // Show project picker on load instead of jumping straight to phase 1
  showProjectPicker();
}

// ─── Phase 1: Upload + Analyse ─────────────────────────────────────────────────

function onFloorPlanPicked() {
  const file = dom.floorPlan.files?.[0];
  if (!file) return;
  appState.floorFile = file;
  dom.floorPlanName.textContent = file.name;
  dom.analyzeBtn.disabled = false;
}

function onInspirationPicked() {
  const files = Array.from(dom.inspirationImages.files || []);
  appState.inspirationFiles = files;
  dom.inspirationNames.textContent = files.length ? `${files.length} image(s)` : "Add inspiration images (optional)";
  dom.inspirationPreviews.innerHTML = "";

  // Save inspiration images to Supabase in the background
  if (files.length) {
    Promise.all(files.map(async (f, i) => ({
      base64: await readDataUrl(f),
      mimeType: f.type || "image/jpeg",
      fileName: f.name
    }))).then(images => {
      saveToDb("/api/project/save-inspiration", { projectId: appState.projectId, images });
    }).catch(e => console.warn("[DB] Inspiration upload failed:", e.message));
  }

  files.forEach(f => {
    const img = document.createElement("img");
    img.className = "insp-thumb";
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    reader.readAsDataURL(f);
    dom.inspirationPreviews.appendChild(img);
  });
}

async function onAnalyzePlan() {
  const file = appState.floorFile;
  if (!file) { alert("Upload a floor plan first."); return; }
  const PA = window.PoligridAnalysis;
  if (!PA) { alert("Analysis module not loaded."); return; }

  dom.analyzeBtn.disabled = true;
  dom.analysisChip.hidden = false;
  dom.analysisChip.textContent = "Rendering floor plan…";

  try {
    // Render floor plan to bgCanvas
    const bgCanvas = dom.floorBgCanvas;
    await renderFloorPlanToCanvas(file, bgCanvas);

    dom.analysisChip.textContent = "Analysing with AI…";

    // Run analysis
    const analysis = await PA.analyzeFloorPlan(bgCanvas, appState.context);
    appState.detectedRooms = analysis.rooms || [];
    appState.globalBoq = analysis.globalBoq || [];

    // Persist floor plan image + analysis to Supabase
    saveToDb("/api/project/save-analysis", {
      projectId: appState.projectId,
      floorPlanBase64: bgCanvas.toDataURL("image/png"),
      fileName: appState.floorFile?.name,
      analysis,
      context: appState.context
    });

    dom.analysisChip.textContent = `✓ ${analysis.rooms.length} room(s) · ${analysis.bhkType || ""} · ${analysis.totalAreaM2 || "?"}m²`;
    dom.analysisSummaryText.textContent = analysis.summary || "";
    dom.analysisSummaryWrap.hidden = false;

    // Size overlay canvases to match bgCanvas
    dom.roomEditorCanvas.width = bgCanvas.width;
    dom.roomEditorCanvas.height = bgCanvas.height;

    // Show canvas
    dom.canvasPlaceholder.hidden = true;
    dom.canvasWrap.hidden = false;

    // Init RoomEditor
    roomEditor = new RoomEditor(dom.roomEditorCanvas, bgCanvas, {
      onRoomsChange: onRoomsChange,
      onSelect: onRoomSelected
    });
    roomEditor.setRooms(analysis.rooms, bgCanvas.width, bgCanvas.height);

    // Build room chips in sidebar
    buildRoomChips(analysis.rooms);

    // Advance to Phase 2
    advancePhase(2);

  } catch (err) {
    dom.analysisChip.textContent = `⚠ ${err.message}`;
    dom.analyzeBtn.disabled = false;
    console.error(err);
  }
}

// ─── Phase 2: Room Editing ─────────────────────────────────────────────────────

function onRoomsChange(rooms) {
  appState.detectedRooms = rooms;
  buildRoomChips(rooms);
}

function onRoomSelected(room) {
  // When a room is selected in the editor, highlight its chip
  document.querySelectorAll(".room-chip").forEach(c => {
    c.classList.toggle("selected", room && c.dataset.id === room.label);
  });
}

function buildRoomChips(rooms) {
  dom.roomChipList.innerHTML = "";
  for (const room of rooms) {
    const col = ROOM_DOT_COLORS[room.roomType] || "#888";
    const chip = document.createElement("div");
    chip.className = "room-chip";
    chip.dataset.id = room.id || room.label;
    chip.innerHTML = `
      <span class="room-chip-dot" style="background:${col}"></span>
      <span class="room-chip-name">${escapeHtml(room.name || room.label)}</span>
      <span class="room-chip-dims">${room.widthM ? room.widthM.toFixed(1) + "×" + room.lengthM.toFixed(1) + "m" : "?"}</span>
      <button class="room-chip-del" data-id="${escapeHtml(room.id || room.label)}" title="Delete room">✕</button>`;
    chip.querySelector(".room-chip-del").addEventListener("click", e => {
      e.stopPropagation();
      roomEditor?.deleteRoom(chip.dataset.id);
    });
    chip.addEventListener("click", () => {
      // Select room in editor (by clicking we just highlight)
      document.querySelectorAll(".room-chip").forEach(c => c.classList.remove("selected"));
      chip.classList.add("selected");
    });
    dom.roomChipList.appendChild(chip);
  }
}

async function onConfirmRooms() {
  const rooms = roomEditor ? roomEditor.getRooms() : (appState.detectedRooms || []);
  appState.confirmedRooms = rooms;

  // Persist user-edited rooms to Supabase
  saveToDb("/api/project/save-rooms", { projectId: appState.projectId, rooms });

  if (!rooms.length) { alert("No rooms to confirm."); return; }

  // Check for missing dims
  const missing = rooms.filter(r => !r.widthM || !r.lengthM);
  if (missing.length) {
    const ok = confirm(`${missing.length} room(s) have no dimensions. Continue anyway?`);
    if (!ok) return;
  }

  dom.confirmRoomsBtn.disabled = true;

  try {
    dom.roomEditorCanvas.hidden = true;
    dom.plannerCanvas.hidden = false;
    dom.plannerCanvas.width = dom.floorBgCanvas.width;
    dom.plannerCanvas.height = dom.floorBgCanvas.height;

    // Init PlannerCanvas (only used for pinning now, no furniture dragging)
    planner = new PlannerCanvas(dom.plannerCanvas, {
      onStateChange: onSceneChange,
      onPinSelect: openPinPopover
    });
    planner.setFloorPlanImage(dom.floorBgCanvas);
    planner.setDetectedRooms(rooms);

    // No AI auto-place call here anymore. We use the furniture extracted during analysis.
    planner.furniturePlacements = [];
    const imgW = planner.bgImage ? planner.bgImage.width : 600;
    const imgH = planner.bgImage ? planner.bgImage.height : 600;

    for (const room of rooms) {
      if (!room.placements || !Array.isArray(room.placements)) continue;

      const rwM = room.bbox.wPct * imgW / planner.scale;
      const rhM = room.bbox.hPct * imgH / planner.scale;
      const rxM = room.bbox.xPct * imgW / planner.scale;
      const ryM = room.bbox.yPct * imgH / planner.scale;

      for (const p of room.placements) {
        // Map extracted types to sensible module geometry defaults if missing
        let hwM = (p.wPct || 0.2) * rwM;
        let hdM = (p.dPct || 0.2) * rhM;
        let hM = 0.9;
        let defaultModId = "custom";

        if (p.type === "seating") { hM = 0.8; defaultModId = "sofa-3"; }
        else if (p.type === "table") { hM = 0.75; defaultModId = "table-meet-s"; }
        else if (p.type === "cabinet") { hM = 2.1; defaultModId = "storage-tall"; }
        else if (p.type === "bed") { hM = 0.6; defaultModId = "custom"; } // add logic

        planner.furniturePlacements.push({
          id: `ext_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          moduleId: p.moduleId || defaultModId,
          label: p.label || p.type || "Item",
          xM: rxM + (p.xPct || 0.5) * rwM,
          yM: ryM + (p.yPct || 0.5) * rhM,
          wM: hwM,
          dM: hdM,
          hM: p.hM || hM,
          rotationY: p.rotationDeg ?? 0,
          color: FURN_COLORS[planner.furniturePlacements.length % FURN_COLORS.length],
          roomLabel: room.label,
          roomType: room.roomType || "other",
          wall: "center"
        });
      }
    }
    planner.render();

    refreshPlacedList();
    advancePhase(3);

    // Show chat panel
    if (dom.chatPanel) dom.chatPanel.hidden = false;

  } catch (err) {
    alert("Canvas population failed: " + err.message);
    console.error(err);
  } finally {
    dom.confirmRoomsBtn.disabled = false;
  }
}



// ─── Phase 3: Furniture + Chat ─────────────────────────────────────────────────

function setMode(mode, tab1, tab2) {
  if (!planner) return;
  planner.setMode(mode);
  // Phase 3 tabs
  if (tab1 && tab2) {
    tab1.classList.toggle("active", mode === "select");
    tab2.classList.toggle("active", mode !== "select");
  }
  dom.tabSelect?.classList.toggle("active", mode === "select");
  dom.tabDraw?.classList.toggle("active", mode === "draw");
  dom.tabSelectP4?.classList.toggle("active", mode === "select");
  dom.tabPin?.classList.toggle("active", mode === "pin");
}

function buildPalette() {
  if (!dom.furniturePalette) return;
  dom.furniturePalette.innerHTML = "";
  MODULE_LIBRARY.forEach((m, idx) => {
    const item = document.createElement("div");
    item.className = "palette-item";
    item.draggable = true;
    item.innerHTML = `
      <span class="palette-dot" style="background:${FURN_COLORS[idx % FURN_COLORS.length]}"></span>
      <span>${escapeHtml(m.label)}</span>
      <span class="palette-dims">${m.w}×${m.d}m</span>`;
    item.addEventListener("dragstart", () => planner?.startExternalDrop(m));
    item.addEventListener("click", () => {
      if (!planner) return;
      planner.addFurnitureFromSuggestion(MODULE_LIBRARY, { id: m.id, label: m.label }, null);
      refreshPlacedList();
    });
    dom.furniturePalette.appendChild(item);
  });
}

function onSceneChange(state) {
  refreshPlacedList();
  refreshPinsList();
  const hasPins = state.cameraPins && state.cameraPins.length > 0;
  dom.generateBtn.disabled = !hasPins;
  dom.downloadScene.disabled = false;
  
  if (state.selected?.type === "furniture") {
    const f = state.furniturePlacements?.find(x => x.id === state.selected.id);
    if (f && dom.selectionPanel) {
      dom.selectionPanel.hidden = false;
      if (dom.selectionLabel) dom.selectionLabel.textContent = f.label;
      if (dom.selectionDims) dom.selectionDims.textContent = `${f.wM.toFixed(2)}m × ${f.dM.toFixed(2)}m`;
    }
  } else {
    if (dom.selectionPanel) dom.selectionPanel.hidden = true;
  }
}

function refreshPlacedList() {
  if (!planner) return;
  const items = planner.furniturePlacements;
  if (dom.placedCount) dom.placedCount.textContent = items.length;
  if (dom.placedList) {
    dom.placedList.innerHTML = "";
    items.forEach((f, idx) => {
      const row = document.createElement("div");
      row.className = "placed-item";
      row.innerHTML = `
        <span class="placed-item-dot" style="background:${f.color}"></span>
        <span style="flex:1">${escapeHtml(f.label)}</span>
        <span style="font-size:9px;color:var(--text-dim)">${f.roomLabel || ""}</span>`;
      row.addEventListener("click", () => {
        if (!planner) return;
        planner.selected = { type: "furniture", id: f.id };
        planner.render();
      });
      dom.placedList.appendChild(row);
    });
  }
}

// ─── Chat ──────────────────────────────────────────────────────────────────────

async function onChatSend() {
  const msg = dom.chatInput.value.trim();
  if (!msg || !planner) return;
  dom.chatInput.value = "";
  addChatBubble(msg, "user");
  const thinking = addChatBubble("Thinking…", "ai thinking");

  try {
    const res = await postJson("/api/chat/placement", {
      message: msg,
      rooms: appState.confirmedRooms || [],
      currentPlacements: planner.furniturePlacements,
      moduleLibrary: MODULE_LIBRARY
    });
    thinking.textContent = res.reply || "";
    thinking.classList.remove("thinking");

    // Apply actions
    const actions = res.actions || [];
    if (!actions.length && res.action) actions.push(res.action);
    if (!actions.length) return;

    for (const action of actions) {
      const tag = document.createElement("span");
      tag.className = "chat-action-tag";

      if (action.action === "add") {
        const mod = MODULE_LIBRARY.find(m => m.id === action.moduleId) || {
          id: action.moduleId || "custom", label: action.label || "Item",
          w: action.wM || 1.2, d: action.dM || 0.6, h: 0.9,
          type: "cabinet", shelves: 0, partitions: 0, shutters: 0, drawers: 0
        };
        const room = (appState.confirmedRooms || []).find(r => r.label === action.roomLabel);
        const roomOffX = room ? (room.bbox.xPct * dom.floorBgCanvas.width / planner.scale) : 1;
        const roomOffY = room ? (room.bbox.yPct * dom.floorBgCanvas.height / planner.scale) : 1;
        planner.furniturePlacements.push({
          id: `chat_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          moduleId: mod.id,
          label: mod.label,
          xM: roomOffX + (action.xM || 1),
          yM: roomOffY + (action.yM || 1),
          wM: action.wM || mod.w,
          dM: action.dM || mod.d,
          hM: mod.h,
          rotationY: action.rotationDeg || 0,
          color: FURN_COLORS[planner.furniturePlacements.length % FURN_COLORS.length],
          roomLabel: action.roomLabel || "",
          roomType: room?.roomType || "other",
          wall: action.wall || "center"
        });
        planner.render();
        tag.textContent = `+ Added ${mod.label}`;

      } else if (action.action === "move") {
        const f = planner.furniturePlacements.find(x => x.id === action.id);
        if (f) { f.xM = action.xM || f.xM; f.yM = action.yM || f.yM; planner.render(); }
        tag.textContent = `↹ Moved ${f ? f.label : action.id}`;

      } else if (action.action === "remove") {
        const f = planner.furniturePlacements.find(x => x.id === action.id);
        planner.furniturePlacements = planner.furniturePlacements.filter(x => x.id !== action.id);
        planner.render();
        tag.textContent = `✕ Removed ${f ? f.label : action.id}`;

      } else if (action.action === "resize") {
        const f = planner.furniturePlacements.find(x => x.id === action.id);
        if (f) { if (action.wM) f.wM = action.wM; if (action.dM) f.dM = action.dM; planner.render(); }
        tag.textContent = `⇔ Resized ${f ? f.label : action.id}`;
      }

      if (tag.textContent) {
        thinking.appendChild(tag);
        // Add a line break after each tag to ensure vertical readability
        thinking.appendChild(document.createElement("br")); 
      }
    }
    refreshPlacedList();

  } catch (err) {
    thinking.textContent = `⚠ ${err.message}`;
    thinking.classList.remove("thinking");
  }
}

function addChatBubble(text, cls) {
  const b = document.createElement("div");
  b.className = `chat-bubble ${cls}`;
  b.textContent = text;
  dom.chatHistory.appendChild(b);
  dom.chatHistory.scrollTop = dom.chatHistory.scrollHeight;
  return b;
}

// ─── Phase 4: Camera pins ──────────────────────────────────────────────────────

function refreshPinsList() {
  if (!planner) return;
  const pins = planner.getCameraPinsWithFiles();
  dom.noPinsHint.hidden = pins.length > 0;
  dom.pinsList.innerHTML = "";
  for (const pin of pins) {
    const item = document.createElement("div");
    item.className = "pin-item";
    const hasPhoto = !!pin.photoDataUrl;
    item.innerHTML = `
      <div class="pin-item-head">
        ${hasPhoto ? `<img class="pin-item-thumb" src="${pin.photoDataUrl}" alt=""/>` : ""}
        <span class="pin-item-label">📷 ${escapeHtml(pin.roomLabel || "Untitled pin")}</span>
        <button class="pin-item-edit ghost-sm" data-id="${pin.id}">Edit</button>
      </div>
      <div class="pin-item-sub">FOV ${pin.fovDeg || 60}° · ${pin.brief ? pin.brief.slice(0, 40) : "No brief"}</div>`;
    item.querySelector(".pin-item-edit").addEventListener("click", () => openPinPopover(pin));
    dom.pinsList.appendChild(item);
  }
  dom.generateBtn.disabled = pins.length === 0;
}

function openPinPopover(pin) {
  activePinId = pin.id;
  dom.pinPopoverTitle.textContent = `Pin — ${pin.roomLabel || "Untitled"}`;
  dom.pinRoomLabel.value = pin.roomLabel || "";
  dom.pinFov.value = pin.fovDeg || 60;
  dom.pinBrief.value = pin.brief || "";
  dom.pinPhotoPreview.hidden = !pin.photoDataUrl;
  if (pin.photoDataUrl) {
    dom.pinPhotoPreview.innerHTML = `<img src="${pin.photoDataUrl}" alt="Photo preview"/>`;
  }
  dom.pinPhotoInput.value = ""; // Always reset so change event fires even if same file
  dom.pinPopover.hidden = false;
}

function onPinPhotoUpload() {
  if (!activePinId || !planner) return;
  const file = dom.pinPhotoInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    planner.updatePin(activePinId, { photoFile: file, photoDataUrl: e.target.result });
    dom.pinPhotoPreview.hidden = false;
    dom.pinPhotoPreview.innerHTML = `<img src="${e.target.result}" alt="Pin photo"/>`;
    refreshPinsList();

    // Persist pin with photo to Supabase
    const pin = planner.cameraPins?.find(p => p.id === activePinId);
    if (pin) {
      saveToDb("/api/project/save-pin", {
        projectId: appState.projectId,
        pin: {
          clientId: pin.id,
          xM: pin.xM, yM: pin.yM,
          angleDeg: pin.angleDeg, fovDeg: pin.fovDeg,
          roomLabel: pin.roomLabel, brief: pin.brief,
          photoDataUrl: e.target.result,
          photoMimeType: file.type || "image/jpeg",
          photoFileName: file.name
        }
      });
    }
  };
  reader.readAsDataURL(file);
}

function onPinFieldChange() {
  if (!activePinId || !planner) return;
  planner.updatePin(activePinId, {
    roomLabel: dom.pinRoomLabel.value,
    fovDeg: parseFloat(dom.pinFov.value) || 60,
    brief: dom.pinBrief.value
  });
  planner.render();
  refreshPinsList();

  // Persist updated pin to Supabase
  const pin = planner.cameraPins?.find(p => p.id === activePinId);
  if (pin) {
    saveToDb("/api/project/save-pin", {
      projectId: appState.projectId,
      pin: {
        clientId: pin.id,
        xM: pin.xM, yM: pin.yM,
        angleDeg: pin.angleDeg, fovDeg: pin.fovDeg,
        roomLabel: pin.roomLabel, brief: pin.brief,
        photoDataUrl: pin.photoDataUrl || null,
        photoMimeType: pin.photoFile?.type || null,
        photoFileName: pin.photoFile?.name || null
      }
    });
  }
}

// ─── Phase 5: Generate ─────────────────────────────────────────────────────────

function promptRoomDims(roomLabel) {
  const wStr = prompt(`Enter width for "${roomLabel}" (meters, e.g. 4.2):`, "4.2");
  if (wStr === null) return null;
  const lStr = prompt(`Enter length for "${roomLabel}" (meters, e.g. 3.5):`, "3.5");
  if (lStr === null) return null;
  const w = parseFloat(wStr), l = parseFloat(lStr);
  if (isNaN(w) || isNaN(l) || w <= 0 || l <= 0) { alert("Invalid dimensions."); return null; }
  return { w, l };
}

async function onGenerate() {
  if (!planner) { alert("Complete the floor plan setup first."); return; }

  const globalBrief = dom.globalBrief.value.trim();
  const pins = planner.getCameraPinsWithFiles();
  const confirmedRooms = appState.confirmedRooms || appState.detectedRooms || [];
  const renderSources = [];

  if (pins.length) {
    for (const pin of pins) {
      const roomLabel = pin.roomLabel || "unknown";
      const detectedRoom = confirmedRooms.find(r => r.label === roomLabel);
      let widthM = parseFloat(detectedRoom?.widthM);
      let lengthM = parseFloat(detectedRoom?.lengthM);
      if (!widthM || !lengthM) {
        const entered = promptRoomDims(roomLabel);
        if (!entered) return;
        widthM = entered.w; lengthM = entered.l;
        if (detectedRoom) { detectedRoom.widthM = widthM; detectedRoom.lengthM = lengthM; }
      }
      renderSources.push({
        pinId: pin.id, roomLabel, widthM, lengthM,
        archNotes: detectedRoom?.notes || "",
        walls: detectedRoom?.walls || [],
        roomType: detectedRoom?.roomType || "other",
        placements: planner.getPlacementsForRoom(roomLabel),
        brief: [pin.brief, globalBrief].filter(Boolean).join(". "),
        photoFile: pin.photoFile, photoDataUrl: pin.photoDataUrl,
        // Camera pin spatial data — MUST flow through for correct FOV/furniture visibility
        xM: pin.xM || 0,
        yM: pin.yM || 0,
        angleDeg: pin.angleDeg || 0,
        fovDeg: pin.fovDeg || 60
      });
    }
  } else {
    if (!confirmedRooms.length) { alert("Please analyse the floor plan first."); return; }
    for (const room of confirmedRooms) {
      if (room.roomType === "bathroom" || room.roomType === "utility") continue;
      let widthM = parseFloat(room.widthM), lengthM = parseFloat(room.lengthM);
      if (!widthM || !lengthM) {
        const entered = promptRoomDims(room.label);
        if (!entered) return;
        widthM = entered.w; lengthM = entered.l;
        room.widthM = widthM; room.lengthM = lengthM;
      }
      renderSources.push({
        pinId: null, roomLabel: room.label, widthM, lengthM,
        archNotes: room.notes || "", roomType: room.roomType,
        walls: room.walls || [],
        placements: planner.getPlacementsForRoom(room.label),
        brief: globalBrief || room.name,
        photoFile: null, photoDataUrl: null
      });
    }
  }

  if (!renderSources.length) { alert("Nothing to generate."); return; }

  dom.outputPanel.hidden = false;
  document.querySelector(".workspace")?.classList.add("output-open");
  dom.generateBtn.disabled = true;
  dom.generateBtn.textContent = "Generating…";
  dom.generateStatus.hidden = false;
  dom.generateStatus.textContent = "Extracting styles + preparing renders…";
  dom.statusBox.textContent = "";
  dom.roomResults.innerHTML = "";

  try {
    const inspirationDataUrls = await Promise.all(
      appState.inspirationFiles.map(f => readDataUrl(f))
    );
    const floorPlanBase64 = appState.floorFile ? await readDataUrl(appState.floorFile) : "";

    const roomGroups = {};
    for (const src of renderSources) {
      if (!roomGroups[src.roomLabel]) roomGroups[src.roomLabel] = [];
      roomGroups[src.roomLabel].push(src);
    }

    const roomResults = [];
    for (const [roomLabel, srcs] of Object.entries(roomGroups)) {
      dom.generateStatus.textContent = `Preparing: ${roomLabel}…`;
      try {
        const result = await generateRoom(srcs, inspirationDataUrls, floorPlanBase64);
        roomResults.push(result);
        drawRoomResult(result);
      } catch (err) {
        console.error(`Failed ${roomLabel}:`, err);
        dom.statusBox.textContent += `⚠ ${roomLabel}: ${err.message}\n`;
      }
    }

    // BOQ = floor plan structural items + furniture from AI renders (HYD premium pricing)
    const finalBoq = [...(appState.globalBoq || [])];

    // Add furniture placed by AI in each rendered room (deduped by label per room)
    for (const result of roomResults) {
      if (!Array.isArray(result.placements)) continue;
      const seen = new Set();
      for (const p of result.placements) {
        const key = `${result.room.label}:${(p.label || '').toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const isModular = p.type === 'cabinet' || p.type === 'study';
        const rate = HYD_FURNITURE_RATES[p.type] || HYD_FURNITURE_RATES.custom;
        finalBoq.push({
          category: isModular ? 'Modular furniture' : 'Loose furniture',
          item: `${p.label || 'Item'} — ${result.room.label}`,
          qty: 1,
          unit: 'pcs',
          rate,
          amount: rate
        });
      }
    }

    drawBoq(finalBoq);
    latestArtifacts = buildArtifacts(planner?.getSceneState() || {}, finalBoq);
    dom.downloadScene.disabled = false;
    dom.downloadBoq.disabled = false;
    dom.generateStatus.textContent = "✓ Done";

    // Persist furniture BOQ items (generated) and all placements to Supabase
    const furnitureBoq = finalBoq.filter(b =>
      b.category === "Modular furniture" || b.category === "Loose furniture"
    );
    saveToDb("/api/project/save-boq", {
      projectId: appState.projectId,
      boqItems: furnitureBoq
    });
    saveToDb("/api/project/save-placements", {
      projectId: appState.projectId,
      placements: planner?.furniturePlacements || []
    });

  } catch (err) {
    dom.generateStatus.textContent = `⚠ ${err.message}`;
    console.error(err);
  } finally {
    dom.generateBtn.disabled = false;
    dom.generateBtn.textContent = "✦ Generate Renders + BOQ";
  }
}

async function generateRoom(srcs, inspirationDataUrls, floorPlanBase64) {
  const mainSrc = srcs[0];

  const renders = [];
  const placements = []; // Accumulated across all views for BOQ

  const laminate = { name: "Matte Walnut", color: "#5a4d41", ratePerSqFt: 94 }; // default mock for BOQ

  for (let i = 0; i < srcs.length; i++) {
    const src = srcs[i];
    dom.generateStatus.textContent = `Generating: ${src.roomLabel} (${i + 1}/${srcs.length})…`;

    // Both image-to-image (with photo) and text-to-image (without photo) use the same endpoint now!
    const res = await postJson("/api/furnish-room", {
      emptyRoomBase64: src.photoDataUrl || "",
      inspirationBase64: inspirationDataUrls,
      floorPlanBase64: floorPlanBase64,
      cameraContext: {
        xM: src.xM,
        yM: src.yM,
        angleDeg: src.angleDeg,
        fovDeg: src.fovDeg
      },
      roomContext: {
        widthM:   src.widthM,
        lengthM:  src.lengthM,
        roomType: src.roomType,
        archNotes: src.archNotes || '',
        walls:    src.walls || []
      },
      mimeType: src.photoFile ? src.photoFile.type : "image/png",
      visionModel: "gpt-5.4",
      renderModel: "gpt-image-1.5",
      placements: src.placements || [],
      brief: src.brief
    });

    let finalDataUrl = res.dataUrl;
    // Only try to match aspect ratio if an original photo actually existed
    if (src.photoDataUrl) {
      try {
        finalDataUrl = await resizeImageToMatch(src.photoDataUrl, res.dataUrl);
      } catch (e) {
        console.warn("Resize to original dimensions failed:", e);
      }
    }

    renders.push({ name: src.photoDataUrl ? `Photo ${i + 1}` : `Generated ${i + 1}`, dataUrl: finalDataUrl, source: "openai" });

    // Persist render image to Supabase
    saveToDb("/api/project/save-render", {
      projectId: appState.projectId,
      pinClientId: src.pinId || null,
      roomLabel: src.roomLabel,
      dataUrl: finalDataUrl,
      modelUsed: "gpt-image-1.5",
      furnitureList: res.furnitureList || [],
      generationType: src.photoDataUrl ? "edit" : "generate"
    });

    // Accumulate the generated or floor-plan placements into the global BOQ
    const furnitureToAdd = (res.furnitureList && res.furnitureList.length) ? res.furnitureList : (src.placements || []);
    if (Array.isArray(furnitureToAdd)) {
      furnitureToAdd.forEach(p => placements.push({
        ...p,
        roomLabel: src.roomLabel
      }));
    }
  }

  return {
    room: { label: mainSrc.roomLabel, name: mainSrc.roomLabel, roomType: mainSrc.roomType, widthM: mainSrc.widthM, lengthM: mainSrc.lengthM },
    laminate, style: {}, placements, renders
  };
}

// ─── Draw Output ───────────────────────────────────────────────────────────────

function drawRoomResult(result) {
  const wrap = document.createElement("section");
  wrap.className = "room-result-card";
  const w = result.room.widthM, l = result.room.lengthM;

  wrap.innerHTML = `
    <div class="room-result-head">
      <span class="room-result-label">${escapeHtml(result.room.name || result.room.label)}</span>
      <span class="room-result-dims">${w ? w.toFixed(1) + "×" + l.toFixed(1) + "m" : ""} · ${escapeHtml(result.laminate.name)}</span>
    </div>`;

  for (const render of result.renders) {
    const imgWrap = document.createElement("div");
    imgWrap.className = "room-result-img-wrap";
    const img = document.createElement("img");
    img.src = render.dataUrl;
    img.className = "room-result-img";
    img.alt = `Render — ${result.room.label}`;
    imgWrap.appendChild(img);
    wrap.appendChild(imgWrap);
  }

  // Removed redundant piece-listing to save screen space so BOQ isn't pushed out of view

  dom.roomResults.appendChild(wrap);
}

function drawBoq(globalBoq) {
  dom.boqAccordionContainer.innerHTML = "";
  let grandTotal = 0;

  if (!globalBoq || !globalBoq.length) {
    dom.boqAccordionContainer.innerHTML = "<p>No BOQ data found in floor plan analysis.</p>";
    dom.grandTotal.textContent = "₹0";
    dom.placementSummary.textContent = "No placements identified.";
    return;
  }

  // Group by category
  const categories = {};
  for (const item of globalBoq) {
    const cat = item.category || "Uncategorized";
    if (!categories[cat]) categories[cat] = { total: 0, items: [] };
    const amt = parseFloat(item.amount) || 0;
    categories[cat].total += amt;
    categories[cat].items.push(item);
    grandTotal += amt;
  }

  // Build Accordions
  for (const [catName, catData] of Object.entries(categories)) {
    const details = document.createElement("details");
    details.className = "boq-accordion";
    
    const summary = document.createElement("summary");
    summary.className = "boq-accordion-header";
    summary.innerHTML = `
      <span class="boq-cat-name">${escapeHtml(catName)}</span>
      <span class="boq-cat-total">₹${catData.total.toLocaleString("en-IN")}</span>
    `;
    details.appendChild(summary);

    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap boq-accordion-content";
    
    // Build sub-table
    let rowsHtml = "";
    for (const line of catData.items) {
      const q = parseFloat(line.qty) || 0;
      const r = parseFloat(line.rate) || 0;
      const a = parseFloat(line.amount) || 0;
      rowsHtml += `
        <tr>
          <td>${escapeHtml(line.item || "Unknown")}</td>
          <td>${q.toFixed(2)}</td>
          <td>${escapeHtml(line.unit || "")}</td>
          <td>₹${r.toLocaleString("en-IN")}</td>
          <td>₹${a.toLocaleString("en-IN")}</td>
        </tr>`;
    }

    tableWrap.innerHTML = `
      <table>
        <thead>
          <tr><th>Item</th><th>Qty</th><th>Unit</th><th>Rate (₹)</th><th>Amount (₹)</th></tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
    
    details.appendChild(tableWrap);
    dom.boqAccordionContainer.appendChild(details);
  }

  dom.grandTotal.textContent = `₹${grandTotal.toLocaleString("en-IN")}`;

  // Placement summary updated to just list all items
  dom.placementSummary.textContent = globalBoq.map(p =>
    `[${p.category}] ${p.item}: ${p.qty} ${p.unit} @ ₹${p.rate}`
  ).join("\n");
}

function buildArtifacts(sceneState, globalBoq) {
  let grandTotal = 0;
  
  const csvHeader = "Category,Item,Qty,Unit,Rate INR,Amount INR\n";
  let csvLines = [];

  if (globalBoq && globalBoq.length) {
    const categories = {};
    for (const item of globalBoq) {
      const cat = item.category || "Uncategorized";
      if (!categories[cat]) categories[cat] = { total: 0, items: [] };
      const amt = parseFloat(item.amount) || 0;
      categories[cat].total += amt;
      categories[cat].items.push(item);
      grandTotal += amt;
    }

    for (const [catName, catData] of Object.entries(categories)) {
      for (const line of catData.items) {
        csvLines.push(`${escapeHtml(catName)},${escapeHtml(line.item)},${parseFloat(line.qty || 0).toFixed(2)},${escapeHtml(line.unit)},${parseFloat(line.rate || 0)},${parseFloat(line.amount || 0)}`);
      }
    }
  }

  const csv = csvHeader + csvLines.join("\n");
  return { scene: sceneState, boq: { lines: globalBoq || [], grandTotal, csv } };
}

// ─── Business logic ────────────────────────────────────────────────────────────

function pickLaminate(library, styleTags) {
  const norm = (styleTags || []).map(t => t.toLowerCase());
  let best = null, bestScore = -1;
  for (const lam of library) {
    const score = (lam.tags || []).filter(t => norm.includes(t.toLowerCase())).length;
    if (score > bestScore) { best = lam; bestScore = score; }
  }
  return best || library[0];
}

function pickModulesFromBrief(library, brief, widthM, lengthM) {
  const norm = (brief || "").toLowerCase();
  const roomArea = (widthM || 4) * (lengthM || 4);
  const picked = [];
  for (const m of library) {
    let score = 0;
    for (const kw of m.keywords || []) { if (norm.includes(kw)) score++; }
    if (score > 0) picked.push({ ...m, score: score + m.priority / 10 });
  }
  if (!picked.length && library.length) picked.push({ ...library[0], score: 0.1 });
  picked.sort((a, b) => b.score - a.score);
  const capped = [];
  let area = 0;
  for (const m of picked) {
    if (area + m.w * m.d <= roomArea * 0.5) { capped.push(m); area += m.w * m.d; }
  }
  return (capped.length ? capped : [picked[0]]).map(m => ({
    id: m.id, label: m.label, moduleId: m.id,
    xM: 0.3, yM: 0.3, wM: m.w, dM: m.d, hM: m.h,
    type: m.type, shelves: m.shelves, partitions: m.partitions,
    shutters: m.shutters, drawers: m.drawers,
    roomLabel: "", wall: "south"
  }));
}


// ─── Floor plan rendering ───────────────────────────────────────────────────────

async function renderFloorPlanToCanvas(file, targetCanvas) {
  if (!targetCanvas) return;
  if (file.type === "application/pdf") {
    await renderPdfFirstPage(file, targetCanvas);
  } else if (file.type.startsWith("image/")) {
    await renderImageToCanvas(file, targetCanvas);
  }
}

async function renderImageToCanvas(file, canvas) {
  const img = await readImage(file);
  const maxW = 960;
  const scale = img.width > maxW ? maxW / img.width : 1;
  canvas.width = Math.max(2, Math.round(img.width * scale));
  canvas.height = Math.max(2, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
}

async function renderPdfFirstPage(file, canvas) {
  const pdfjsLib = window.pdfjsLib;
  if (!pdfjsLib) throw new Error("PDF renderer not available.");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const maxW = 960;
  const unscaled = page.getViewport({ scale: 1 });
  const scale = unscaled.width > maxW ? maxW / unscaled.width : 1.25;
  const viewport = page.getViewport({ scale });
  canvas.width = Math.max(2, Math.round(viewport.width));
  canvas.height = Math.max(2, Math.round(viewport.height));
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

const _STEP_LABELS = {
  '/api/analyze/floorplan':  'Floor Plan Analysis',
  '/api/furnish-room':       'Furnish Room Pipeline',
  '/api/render/openai':      'Image Render',
  '/api/chat/placement':     'Chat Assistant',
  '/api/style/extract':      'Style Extraction',
  '/api/analyze/room-image': 'Room Image Match',
  '/api/furniture/autoplace':'Furniture Auto-Place',
};

// ─── Supabase / Project Persistence ──────────────────────────────────────────

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Fire-and-forget save. Errors are logged but never block the UI.
function saveToDb(url, body) {
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).then(r => {
    if (!r.ok) r.text().then(t => console.warn(`[DB] ${url} failed:`, t));
  }).catch(e => console.warn(`[DB] ${url} error:`, e.message));
}

// ─── Project Picker ───────────────────────────────────────────────────────────

function showProjectPicker() {
  el("projectPicker").classList.remove("hidden");
  loadProjectList();
}

function hideProjectPicker() {
  el("projectPicker").classList.add("hidden");
}

async function loadProjectList() {
  const list = el("projectPickerList");
  list.innerHTML = '<div class="proj-loading">Loading projects…</div>';
  try {
    const res = await fetch("/api/project/list");
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    renderProjectCards(data.projects || []);
  } catch (e) {
    list.innerHTML = `<div class="proj-loading">Could not load projects: ${e.message}</div>`;
  }
}

function renderProjectCards(projects) {
  const list = el("projectPickerList");
  if (!projects.length) {
    list.innerHTML = '<div class="proj-empty">No projects yet. Click <strong>+ New Project</strong> to start.</div>';
    return;
  }
  list.innerHTML = "";
  for (const p of projects) {
    const card = document.createElement("div");
    card.className = "proj-card";
    card.dataset.id = p.id;
    const date = new Date(p.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const meta = [p.property_type, p.bhk_type || p.bhk, p.total_area_m2 ? p.total_area_m2 + " m²" : null].filter(Boolean).join(" · ");
    card.innerHTML = `
      <div class="proj-card-thumb">
        ${p.thumbnail_url ? `<img src="${p.thumbnail_url}" alt="" loading="lazy" />` : '<div class="proj-card-thumb-empty">🏠</div>'}
      </div>
      <div class="proj-card-body">
        <div class="proj-card-name">${escapeHtml(p.name || "Untitled project")}</div>
        <div class="proj-card-meta">${escapeHtml(meta)}</div>
        ${p.summary ? `<div class="proj-card-summary">${escapeHtml(p.summary)}</div>` : ""}
        <div class="proj-card-date">${date}</div>
      </div>
    `;
    card.addEventListener("click", () => loadProject(p.id));
    list.appendChild(card);
  }
}

async function loadProject(id) {
  const list = el("projectPickerList");
  list.innerHTML = '<div class="proj-loading">Opening project…</div>';
  try {
    const res = await fetch(`/api/project/load?id=${id}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const proj = data.project;

    // Reset state for this project
    appState.projectId = id;
    appState.floorFile = null;
    appState.inspirationFiles = [];
    appState.detectedRooms = null;
    appState.confirmedRooms = null;
    appState.globalBoq = [];
    planner = null;
    roomEditor = null;
    latestArtifacts = null;

    // Restore context
    appState.context = {
      propertyType: proj.property_type || "Apartment",
      bhk: proj.bhk || "2BHK",
      totalAreaM2: proj.total_area_m2 || null,
      notes: proj.notes || ""
    };
    restoreContextForm(appState.context);

    // Restore project name in header
    el("projectNameInput").value = proj.name || "";

    hideProjectPicker();

    // Nothing persisted beyond context → go to phase 1
    if (!data.floorPlan?.url) {
      advancePhase(1);
      return;
    }

    // Load floor plan image to canvas
    const bgCanvas = dom.floorBgCanvas;
    try {
      await loadImageUrlToCanvas(data.floorPlan.url, bgCanvas);
    } catch (e) {
      console.warn("Could not load floor plan image:", e);
      advancePhase(1);
      return;
    }

    dom.roomEditorCanvas.width = bgCanvas.width;
    dom.roomEditorCanvas.height = bgCanvas.height;
    dom.canvasPlaceholder.hidden = true;
    dom.canvasWrap.hidden = false;

    // Restore rooms
    const rooms = (data.rooms || []).map(dbRoomToAppRoom);
    appState.detectedRooms = rooms;
    appState.confirmedRooms = rooms;
    appState.globalBoq = (data.boqItems || [])
      .filter(b => b.source === "floor_plan_analysis")
      .map(({ category, item, qty, unit, rate, amount }) => ({ category, item, qty, unit, rate, amount }));

    // Init RoomEditor
    roomEditor = new RoomEditor(dom.roomEditorCanvas, bgCanvas, {
      onRoomsChange: onRoomsChange,
      onSelect: onRoomSelected
    });
    roomEditor.setRooms(rooms, bgCanvas.width, bgCanvas.height);
    buildRoomChips(rooms);

    dom.analysisChip.hidden = false;
    dom.analysisChip.textContent = `✓ ${rooms.length} room(s) · ${proj.bhk_type || proj.bhk || ""} · ${proj.total_area_m2 || "?"}m²`;
    dom.analysisSummaryText.textContent = proj.summary || "";
    dom.analysisSummaryWrap.hidden = !proj.summary;

    advancePhase(2);

    // If project has camera pins, restore planner and advance to phase 3
    if (data.cameraPins && data.cameraPins.length > 0) {
      dom.roomEditorCanvas.hidden = true;
      dom.plannerCanvas.hidden = false;
      dom.plannerCanvas.width = bgCanvas.width;
      dom.plannerCanvas.height = bgCanvas.height;

      planner = new PlannerCanvas(dom.plannerCanvas, {
        onStateChange: onSceneChange,
        onPinSelect: openPinPopover
      });
      planner.setFloorPlanImage(bgCanvas);
      planner.setDetectedRooms(rooms);

      // Restore furniture placements
      planner.furniturePlacements = (data.furniturePlacements || []).map(p => ({
        id: p.client_id || generateUUID(),
        moduleId: p.module_id || "custom",
        label: p.label || "Item",
        type: p.type || "other",
        roomLabel: p.room_label || "",
        roomType: p.room_type || "",
        xM: p.x_m || 1, yM: p.y_m || 1,
        wM: p.w_m || 1, dM: p.d_m || 0.6, hM: p.h_m || 0.9,
        rotationY: p.rotation_y || 0,
        wall: p.wall || "south",
        color: p.color || FURN_COLORS[0],
        source: p.source || "manual"
      }));

      // Restore camera pins (photos loaded async below)
      planner.cameraPins = data.cameraPins.map(p => ({
        id: p.client_id,
        xM: p.x_m || 0, yM: p.y_m || 0,
        angleDeg: p.angle_deg || 0,
        fovDeg: p.fov_deg || 60,
        roomLabel: p.room_label || "",
        brief: p.brief || "",
        photoFile: null,
        photoDataUrl: null
      }));

      // Load pin photos in background
      for (const dbPin of data.cameraPins) {
        if (!dbPin.photo_url) continue;
        loadUrlToDataUrl(dbPin.photo_url).then(dataUrl => {
          if (!dataUrl || !planner) return;
          const pin = planner.cameraPins.find(p => p.id === dbPin.client_id);
          if (pin) { pin.photoDataUrl = dataUrl; planner.render(); refreshPinsList(); }
        }).catch(() => {});
      }

      planner.render();
      refreshPinsList();
      if (dom.chatPanel) dom.chatPanel.hidden = false;

      if (proj.global_brief) dom.globalBrief.value = proj.global_brief;

      advancePhase(3);
    }

  } catch (err) {
    console.error("loadProject failed:", err);
    list.innerHTML = `<div class="proj-loading">⚠ Failed to load: ${err.message}</div>`;
  }
}

// Convert a DB room row (snake_case columns) back to the app room shape
function dbRoomToAppRoom(r) {
  return {
    id: r.id,
    label: r.label,
    name: r.name,
    roomType: r.room_type,
    bbox: { xPct: r.bbox_x_pct, yPct: r.bbox_y_pct, wPct: r.bbox_w_pct, hPct: r.bbox_h_pct },
    widthM: r.width_m,
    lengthM: r.length_m,
    notes: r.notes,
    walls: r.walls || [],
    placements: r.fp_placements || []
  };
}

// Load a public URL (storage) into a canvas element (matches renderImageToCanvas dimensions)
async function loadImageUrlToCanvas(url, canvas) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const maxW = 960;
      const scale = img.width > maxW ? maxW / img.width : 1;
      canvas.width  = Math.max(2, Math.round(img.width  * scale));
      canvas.height = Math.max(2, Math.round(img.height * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve();
    };
    img.onerror = () => reject(new Error("Image failed to load from: " + url));
    img.src = url;
  });
}

// Fetch a URL and return it as a base64 data URL (for pin photos)
async function loadUrlToDataUrl(url) {
  const r = await fetch(url);
  if (!r.ok) return null;
  const blob = await r.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Fill the Phase 1 context form from an appState.context object
function restoreContextForm(ctx) {
  // Property type
  document.querySelectorAll("#propTypeCtrl .seg-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.val === ctx.propertyType);
  });
  const isComm = ctx.propertyType === "Commercial";
  el("configRowResidential").style.display = isComm ? "none" : "";
  el("configRowCommercial").style.display  = isComm ? "" : "none";
  // BHK / space type
  const ctrlId = isComm ? "commCtrl" : "bhkCtrl";
  document.querySelectorAll(`#${ctrlId} .seg-btn`).forEach(b => {
    b.classList.toggle("active", b.dataset.val === ctx.bhk);
  });
  // Area + notes
  if (el("totalAreaInput")) el("totalAreaInput").value = ctx.totalAreaM2 || "";
  if (el("ctxNotes"))       el("ctxNotes").value = ctx.notes || "";
}

async function postJson(url, body) {
  const stepLabel = _STEP_LABELS[url] || url;
  const pendingId = Debugger.pending(stepLabel);

  let json;
  try {
    const res  = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    try { json = JSON.parse(text); } catch { throw new Error(text.slice(0, 200)); }
    if (!res.ok) {
      const err = new Error(json?.error || `HTTP ${res.status}`);
      Debugger.resolvePending(pendingId, null, err);
      throw err;
    }
    Debugger.resolvePending(pendingId, json._debug || null, null);
    return json;
  } catch (err) {
    // Only call resolvePending if not already called above
    if (Debugger._pending.has(pendingId)) {
      Debugger.resolvePending(pendingId, null, err);
    }
    throw err;
  }
}

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = e.target.result;
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function resizeImageToMatch(originalDataUrl, generatedDataUrl) {
  return new Promise((resolve, reject) => {
    const origImg = new Image();
    origImg.crossOrigin = "anonymous";
    origImg.onload = () => {
      const genImg = new Image();
      genImg.crossOrigin = "anonymous";
      genImg.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = origImg.naturalWidth || origImg.width;
        canvas.height = origImg.naturalHeight || origImg.height;
        const ctx = canvas.getContext("2d");
        
        const ow = canvas.width;
        const oh = canvas.height;
        const gw = genImg.naturalWidth || genImg.width;
        const gh = genImg.naturalHeight || genImg.height;

        const canvasRatio = ow / oh;
        const genRatio = gw / gh;
        
        let drawWidth = gw;
        let drawHeight = gh;
        let offsetX = 0;
        let offsetY = 0;

        if (genRatio > canvasRatio) {
           drawWidth = gh * canvasRatio;
           offsetX = (gw - drawWidth) / 2;
        } else {
           drawHeight = gw / canvasRatio;
           offsetY = (gh - drawHeight) / 2;
        }

        ctx.drawImage(genImg, offsetX, offsetY, drawWidth, drawHeight, 0, 0, ow, oh);
        resolve(canvas.toDataURL("image/jpeg", 0.95));
      };
      genImg.onerror = reject;
      genImg.src = generatedDataUrl;
    };
    origImg.onerror = reject;
    origImg.src = originalDataUrl;
  });
}

function downloadText(name, content, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}
