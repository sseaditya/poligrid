// ─── DOM helper ───────────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }


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
  pinAngle: el("pinAngle"),
  pinFov: el("pinFov"),
  pinBrief: el("pinBrief"),
  // Results view
  outputPanel: el("resultsView"),
  closeOutput: el("closeOutput"),
  roomResults: el("roomResults"),
  statusBox: el("statusBox"),
  boqAccordionContainer: el("boqAccordionContainer"),
  grandTotal: el("grandTotal"),
  placementSummary: el("placementSummary"),
  downloadScene: el("downloadScene"),
  downloadBoq: el("downloadBoq"),
  downloadDeck: el("downloadDeckBtn"),
  // Version UI
  versionTabsBar: el("versionTabsBar"),
  versionTabs: el("versionTabs"),
  resultsBriefSection: el("resultsBriefSection"),
  resultsBriefText: el("resultsBriefText"),
  regenInspirationInput: el("regenInspirationInput"),
  regenInspirationPreviews: el("regenInspirationPreviews"),
};


// ─── Mutable app state ────────────────────────────────────────────────────────

let currentPhase = 1;
let planner = null;
// Version management
let _allVersions = [];        // All versions for the current project (full objects with renders/BOQ)
let _activeCameraPins = [];   // DB camera pin objects (with photo_url) for render display
let _projectBoqItems = [];    // Project-level floor plan BOQ items (shared across all versions)
let roomEditor = null;
let activePinId = null;
let latestArtifacts = null;
let _editBoqData = []; // Working copy of BOQ being edited in the edit panel
let _disabledBoqCategories = new Set(); // Categories hidden by user in results view
let _lastDrawnBoq = []; // Full BOQ last passed to drawBoq (for toggle recalc)
let _pinSaveTimer = null; // Debounce timer for angle-drag saves
let _inspirationDataUrls = [];

const appState = {
  projectId: generateUUID(),  // unique ID for this session, persisted to Supabase
  // Phase 1
  floorFile: null,
  inspirationFiles: [],
  storedInspirationUrls: [], // Public URLs of inspiration images from DB (loaded project)
  inspirationStoragePaths: [], // Storage paths of inspiration images (for version creation reference)
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
  // Version tracking
  currentVersionId: null, // Version ID for the current generate operation
};
