// ─── Granular furniture pricing ───────────────────────────────────────────────
function pricePlacement(p) {
  const lbl = (p.label || '').toLowerCase();
  const type = (p.type || '').toLowerCase();

  // ── Modular (built-in / fitted) ────────────────────────────────────────────
  if (/sliding.*wardrobe|wardrobe.*sliding/.test(lbl))          return { cat: 'Modular furniture', rate: 95000 };
  if (/wardrobe|almirah|closet/.test(lbl))                      return { cat: 'Modular furniture', rate: 85000 };
  if (/kitchen.*base|base.*cabinet|modular.*kitchen/.test(lbl)) return { cat: 'Modular furniture', rate: 48000 };
  if (/kitchen.*wall|wall.*cabinet|overhead.*cabinet/.test(lbl))return { cat: 'Modular furniture', rate: 32000 };
  if (/kitchen/.test(lbl))                                       return { cat: 'Modular furniture', rate: 75000 };
  if (/tv unit|tv cabinet|media unit|entertainment unit/.test(lbl)) return { cat: 'Modular furniture', rate: 70000 };
  if (/study.*hutch|desk.*hutch|study.*unit|work.*unit/.test(lbl)) return { cat: 'Modular furniture', rate: 55000 };
  if (/crockery unit|display unit|bar unit/.test(lbl))          return { cat: 'Modular furniture', rate: 65000 };
  if (/shoe rack|shoe cabinet/.test(lbl))                       return { cat: 'Modular furniture', rate: 28000 };
  if (/vanity unit|bathroom vanity|wash basin unit/.test(lbl))  return { cat: 'Modular furniture', rate: 38000 };
  if (/loft cabinet|loft storage/.test(lbl))                    return { cat: 'Modular furniture', rate: 22000 };
  if (/bookshelf|bookcase|wall shelf/.test(lbl))                return { cat: 'Modular furniture', rate: 40000 };

  // ── Seating ────────────────────────────────────────────────────────────────
  if (/sectional|l.shape.*sofa|corner.*sofa/.test(lbl))        return { cat: 'Loose furniture', rate: 110000 };
  if (/3.seat|three.seat/.test(lbl) && /sofa|couch/.test(lbl)) return { cat: 'Loose furniture', rate: 75000 };
  if (/2.seat|two.seat/.test(lbl) && /sofa|couch/.test(lbl))   return { cat: 'Loose furniture', rate: 52000 };
  if (/sofa|couch/.test(lbl))                                   return { cat: 'Loose furniture', rate: 68000 };
  if (/lounge chair|accent chair|arm chair|armchair/.test(lbl)) return { cat: 'Loose furniture', rate: 28000 };
  if (/dining chair|chair/.test(lbl))                           return { cat: 'Loose furniture', rate: 12000 };
  if (/bar stool|stool/.test(lbl))                              return { cat: 'Loose furniture', rate: 8000 };
  if (/ottoman|pouf/.test(lbl))                                 return { cat: 'Loose furniture', rate: 14000 };
  if (/bean bag/.test(lbl))                                     return { cat: 'Loose furniture', rate: 10000 };
  if (/office chair|study chair|desk chair/.test(lbl))         return { cat: 'Loose furniture', rate: 18000 };

  // ── Beds ───────────────────────────────────────────────────────────────────
  if (/king.*bed|super king/.test(lbl))                         return { cat: 'Loose furniture', rate: 72000 };
  if (/queen.*bed|double.*bed/.test(lbl))                       return { cat: 'Loose furniture', rate: 58000 };
  if (/single.*bed|twin.*bed/.test(lbl))                        return { cat: 'Loose furniture', rate: 38000 };
  if (/bed|cot/.test(lbl))                                      return { cat: 'Loose furniture', rate: 55000 };

  // ── Tables ─────────────────────────────────────────────────────────────────
  if (/dining.*table|dining table/.test(lbl))                   return { cat: 'Loose furniture', rate: 55000 };
  if (/coffee table|center table/.test(lbl))                    return { cat: 'Loose furniture', rate: 28000 };
  if (/side table|end table|bedside|nightstand/.test(lbl))      return { cat: 'Loose furniture', rate: 14000 };
  if (/console table|hallway table/.test(lbl))                  return { cat: 'Loose furniture', rate: 22000 };
  if (/study.*table|study.*desk|work.*desk|writing desk/.test(lbl)) return { cat: 'Loose furniture', rate: 24000 };
  if (/dressing table|vanity.*table/.test(lbl))                 return { cat: 'Loose furniture', rate: 32000 };

  // ── Decor & soft furnishings ───────────────────────────────────────────────
  if (/floor lamp/.test(lbl))                                   return { cat: 'Loose furniture', rate: 12000 };
  if (/table lamp/.test(lbl))                                   return { cat: 'Loose furniture', rate: 8000 };
  if (/pendant|chandelier/.test(lbl))                           return { cat: 'Loose furniture', rate: 22000 };
  if (/rug|carpet/.test(lbl))                                   return { cat: 'Loose furniture', rate: 22000 };
  if (/curtain|blind|drape/.test(lbl))                          return { cat: 'Loose furniture', rate: 18000 };
  if (/mirror/.test(lbl))                                       return { cat: 'Loose furniture', rate: 16000 };
  if (/art|painting|canvas|print/.test(lbl))                    return { cat: 'Loose furniture', rate: 14000 };
  if (/plant|pot|planter/.test(lbl))                            return { cat: 'Loose furniture', rate: 5000 };
  if (/vase|sculpture|figurine|decor/.test(lbl))               return { cat: 'Loose furniture', rate: 8000 };
  if (/throw|cushion|pillow/.test(lbl))                         return { cat: 'Loose furniture', rate: 3000 };

  // ── Type-level fallback ────────────────────────────────────────────────────
  const TYPE_FALLBACK = {
    cabinet: { cat: 'Modular furniture', rate: HYD_FURNITURE_RATES.cabinet },
    study:   { cat: 'Modular furniture', rate: HYD_FURNITURE_RATES.study },
    bed:     { cat: 'Loose furniture',   rate: HYD_FURNITURE_RATES.bed },
    seating: { cat: 'Loose furniture',   rate: HYD_FURNITURE_RATES.seating },
    table:   { cat: 'Loose furniture',   rate: HYD_FURNITURE_RATES.table },
    decor:   { cat: 'Loose furniture',   rate: HYD_FURNITURE_RATES.decor },
  };
  return TYPE_FALLBACK[type] || { cat: 'Loose furniture', rate: HYD_FURNITURE_RATES.custom };
}

// ─── Business logic helpers ───────────────────────────────────────────────────

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

