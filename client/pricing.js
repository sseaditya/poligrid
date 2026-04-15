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

