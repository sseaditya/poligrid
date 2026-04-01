// ─── Static libraries, palettes and rate cards ──────────────────────────────

const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-1.5";

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

// ─── Init ──────────────────────────────────────────────────────────────────────

// ─── HYD furniture rates (Hyderabad premium market, INR) ──────────────────────
// Granular label-based pricing; falls back to type-level rates
const HYD_FURNITURE_RATES = {
  // Modular (built-in / fitted)
  cabinet: 65000,   // generic built-in cabinet
  study:   55000,   // study unit
  // Loose (free-standing)
  bed:     58000,
  seating: 65000,
  table:   32000,
  decor:   10000,
  custom:  32000
};


const _STEP_LABELS = {
  '/api/analyze/floorplan':             'Floor Plan Analysis',
  '/api/project/generate-boq':          'Structural Pricing (BOQ)',
  '/api/furnish-room':                  'Furnish Room Pipeline',
  '/api/render/openai':                 'Image Render',
  '/api/chat/placement':                'Chat Assistant',
  '/api/style/extract':                 'Style Extraction',
  '/api/analyze/room-image':            'Room Image Match',
  '/api/furniture/autoplace':           'Furniture Auto-Place',
  '/api/inspire/extract-furnish-style': 'Inspiration Style (once)',
};
