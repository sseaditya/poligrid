// analysis.js — Poligrid floor plan analysis + placement map module

// ─── Constants ───────────────────────────────────────────────────────────────

const ROOM_TYPE_COLORS = {
  bedroom:  { fill: "rgba(180,120,220,0.22)", stroke: "#8a4db5", label: "#6a2d9a" },
  living:   { fill: "rgba(80,180,120,0.22)",  stroke: "#2e8b57", label: "#1e5e38" },
  kitchen:  { fill: "rgba(240,160,60,0.22)",  stroke: "#c97820", label: "#8a5010" },
  bathroom: { fill: "rgba(60,160,220,0.22)",  stroke: "#2080c0", label: "#105890" },
  dining:   { fill: "rgba(220,100,100,0.22)", stroke: "#c04040", label: "#8a2020" },
  study:    { fill: "rgba(80,160,200,0.22)",  stroke: "#3070a0", label: "#104060" },
  balcony:  { fill: "rgba(100,200,180,0.22)", stroke: "#288070", label: "#0e5040" },
  foyer:    { fill: "rgba(200,180,100,0.22)", stroke: "#a09020", label: "#605800" },
  utility:  { fill: "rgba(160,160,160,0.22)", stroke: "#707070", label: "#404040" },
  other:    { fill: "rgba(160,140,200,0.22)", stroke: "#6050a0", label: "#3a2d70" }
};

const FURNITURE_COLORS = [
  "#3a6a5a", "#b86d35", "#5a6a9a", "#9a5a6a",
  "#6a9a5a", "#9a8a3a", "#5a8a9a", "#9a6a9a"
];

// ─── Floor Plan Analysis ──────────────────────────────────────────────────────

async function analyzeFloorPlan(canvas, context) {
  const imageBase64 = canvasToPngBase64(canvas);
  // Use postJson so the Debugger panel captures this call (postJson is defined in client/utils.js)
  const result = await postJson("/api/analyze/floorplan", { imageBase64, mimeType: "image/png", context });
  return result.analysis; // { rooms, totalAreaM2, bhkType, orientation, summary, globalBoq }
}

// ─── Room Image Matching ──────────────────────────────────────────────────────

async function matchRoomImage(photoFile, planCanvas, detectedRooms) {
  const roomImageBase64 = await fileToBase64(photoFile);
  const roomImageMime = photoFile.type || "image/jpeg";
  let floorplanBase64 = "";
  let floorplanMime = "image/png";
  if (planCanvas) {
    floorplanBase64 = canvasToPngBase64(planCanvas);
  }
  const response = await fetch("/api/analyze/room-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      roomImageBase64,
      roomImageMime,
      floorplanBase64,
      floorplanMime,
      rooms: (detectedRooms || []).map(r => ({ label: r.label, name: r.name, roomType: r.roomType }))
    })
  });
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    throw new Error(parsed?.error || "Room matching failed.");
  }
  return parsed.match; // { matchedLabel, matchedName, confidence, reasoning }
}

// ─── Floor Plan Overlay Drawing ───────────────────────────────────────────────

/**
 * Draw detected room bounding boxes over the floor plan canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {Array} rooms - from analysis result
 * @param {string|null} selectedLabel - currently selected room (highlighted)
 * @param {Object} overrides - { [label]: {x,y,w,h} } pixel-space override coords
 */
function drawRoomOverlay(canvas, rooms, selectedLabel, overrides) {
  if (!canvas || !rooms) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  for (const room of rooms) {
    const colors = ROOM_TYPE_COLORS[room.roomType] || ROOM_TYPE_COLORS.other;
    const override = overrides && overrides[room.label];

    let rx, ry, rw, rh;
    if (override) {
      rx = override.x; ry = override.y; rw = override.w; rh = override.h;
    } else {
      rx = room.bbox.xPct * W;
      ry = room.bbox.yPct * H;
      rw = room.bbox.wPct * W;
      rh = room.bbox.hPct * H;
    }

    const isSelected = room.label === selectedLabel;

    ctx.save();
    // Fill
    ctx.fillStyle = colors.fill;
    ctx.fillRect(rx, ry, rw, rh);

    // Border
    ctx.strokeStyle = isSelected ? "#00e5ff" : colors.stroke;
    ctx.lineWidth = isSelected ? 3 : 1.5;
    ctx.setLineDash(isSelected ? [] : [6, 3]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);

    // Label background
    const labelText = room.label;
    const dimText = `${room.widthM || "?"}m × ${room.lengthM || "?"}m`;
    ctx.font = "bold 13px 'Space Grotesk', sans-serif";
    const lw = Math.max(ctx.measureText(labelText).width, ctx.measureText(dimText).width) + 16;
    const lh = 36;
    const lx = rx + 6;
    const ly = ry + 6;

    ctx.fillStyle = isSelected ? "rgba(0,229,255,0.9)" : "rgba(255,255,255,0.88)";
    roundRect(ctx, lx, ly, lw, lh, 6);
    ctx.fill();

    // Label text
    ctx.fillStyle = isSelected ? "#003040" : colors.label;
    ctx.font = "bold 13px 'Space Grotesk', sans-serif";
    ctx.fillText(labelText, lx + 8, ly + 14);
    ctx.font = "11px 'Space Grotesk', sans-serif";
    ctx.fillStyle = "#444";
    ctx.fillText(dimText, lx + 8, ly + 28);

    ctx.restore();
  }
}

// ─── Interactive Room Box Editor ──────────────────────────────────────────────

/**
 * Makes room bounding boxes draggable/resizable on the canvas.
 * Returns a cleanup function.
 */
function startRoomBoxEditor(canvas, rooms, detectedRooms, overlayBase, onChange) {
  const HANDLE_SIZE = 12;
  let dragging = null; // { room, mode: 'move'|'resize', startPt, origRect }
  let overrides = {}; // pixel-space: { [label]: {x,y,w,h} }

  function getRoomRect(room) {
    if (overrides[room.label]) return { ...overrides[room.label] };
    return {
      x: room.bbox.xPct * canvas.width,
      y: room.bbox.yPct * canvas.height,
      w: room.bbox.wPct * canvas.width,
      h: room.bbox.hPct * canvas.height
    };
  }

  function redraw() {
    if (overlayBase) {
      canvas.getContext("2d").putImageData(overlayBase, 0, 0);
    }
    drawRoomOverlay(canvas, rooms, dragging?.room?.label || null, overrides);
    // Draw resize handles
    const ctx = canvas.getContext("2d");
    for (const room of rooms) {
      const r = getRoomRect(room);
      ctx.save();
      ctx.fillStyle = "#00e5ff";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      // bottom-right handle
      ctx.beginPath();
      ctx.rect(r.x + r.w - HANDLE_SIZE / 2, r.y + r.h - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  function ptInHandle(pt, room) {
    const r = getRoomRect(room);
    const hx = r.x + r.w - HANDLE_SIZE;
    const hy = r.y + r.h - HANDLE_SIZE;
    return pt.x >= hx && pt.x <= hx + HANDLE_SIZE * 1.5 &&
           pt.y >= hy && pt.y <= hy + HANDLE_SIZE * 1.5;
  }

  function ptInRoom(pt, room) {
    const r = getRoomRect(room);
    return pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h;
  }

  const onDown = (ev) => {
    const pt = canvasPoint(canvas, ev);
    for (const room of rooms) {
      if (ptInHandle(pt, room)) {
        const r = getRoomRect(room);
        dragging = { room, mode: "resize", startPt: pt, origRect: { ...r } };
        return;
      }
    }
    for (const room of rooms) {
      if (ptInRoom(pt, room)) {
        const r = getRoomRect(room);
        dragging = { room, mode: "move", startPt: pt, origRect: { ...r } };
        return;
      }
    }
  };

  const onMove = (ev) => {
    if (!dragging) return;
    const pt = canvasPoint(canvas, ev);
    const dx = pt.x - dragging.startPt.x;
    const dy = pt.y - dragging.startPt.y;
    const { origRect, room, mode } = dragging;

    if (mode === "move") {
      overrides[room.label] = {
        x: origRect.x + dx, y: origRect.y + dy,
        w: origRect.w, h: origRect.h
      };
    } else {
      overrides[room.label] = {
        x: origRect.x, y: origRect.y,
        w: Math.max(40, origRect.w + dx),
        h: Math.max(40, origRect.h + dy)
      };
    }
    redraw();
  };

  const onUp = () => {
    if (!dragging) return;
    const r = overrides[dragging.room.label];
    // Convert pixel overrides back to % and notify
    if (r && onChange) {
      onChange(dragging.room.label, {
        xPct: r.x / canvas.width, yPct: r.y / canvas.height,
        wPct: r.w / canvas.width, hPct: r.h / canvas.height
      });
    }
    dragging = null;
  };

  canvas.addEventListener("mousedown", onDown);
  canvas.addEventListener("mousemove", onMove);
  canvas.addEventListener("mouseup", onUp);
  canvas.addEventListener("mouseleave", onUp);
  canvas.style.cursor = "crosshair";
  redraw();

  return function cleanup() {
    canvas.removeEventListener("mousedown", onDown);
    canvas.removeEventListener("mousemove", onMove);
    canvas.removeEventListener("mouseup", onUp);
    canvas.removeEventListener("mouseleave", onUp);
    canvas.style.cursor = "";
  };
}

// ─── 2D Placement Map ─────────────────────────────────────────────────────────

const PLACEMENT_GRID = 0.1; // 10cm snap grid

/**
 * Draw a 2D top-down placement map on a canvas element.
 * @param {HTMLCanvasElement} canvas
 * @param {Object} room - { widthM, lengthM, label, name }
 * @param {Array} placements - from placeModules()
 * @param {string|null} selectedId - highlighted module id
 */
function renderPlacementMap(canvas, room, placements, selectedId) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext("2d");

  const roomW = room.widthM || 4.2;
  const roomL = room.lengthM || 4.2;

  // Padding in canvas pixels
  const PAD = 40;
  const scale = Math.min((W - PAD * 2) / roomW, (H - PAD * 2) / roomL);
  const ox = (W - roomW * scale) / 2;
  const oy = (H - roomL * scale) / 2;

  // Background
  ctx.fillStyle = "#f5f2ee";
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = "rgba(0,0,0,0.07)";
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= roomW; gx += 0.5) {
    const px = ox + gx * scale;
    ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px, oy + roomL * scale); ctx.stroke();
  }
  for (let gz = 0; gz <= roomL; gz += 0.5) {
    const py = oy + gz * scale;
    ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(ox + roomW * scale, py); ctx.stroke();
  }

  // Room outline
  ctx.strokeStyle = "#1f1f1a";
  ctx.lineWidth = 3;
  ctx.strokeRect(ox, oy, roomW * scale, roomL * scale);

  // Dimension labels
  ctx.fillStyle = "#5f5a4d";
  ctx.font = "12px 'Space Grotesk', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${roomW}m`, ox + roomW * scale / 2, oy - 10);
  ctx.save();
  ctx.translate(ox - 12, oy + roomL * scale / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`${roomL}m`, 0, 0);
  ctx.restore();

  // Door/window hint (compass rose placeholder)
  ctx.font = "10px 'Space Grotesk', sans-serif";
  ctx.fillStyle = "#aaa";
  ctx.fillText("N↑", ox + roomW * scale - 16, oy + 14);
  ctx.textAlign = "left";

  // Furniture
  placements.forEach((entry, idx) => {
    const m = entry.module;
    const color = FURNITURE_COLORS[idx % FURNITURE_COLORS.length];
    const isSelected = m.id === selectedId;

    // Determine pixel rect (entry.x/z are center coords in meters)
    const alongX = Math.abs(entry.rotationY) !== 90;
    const fw = (alongX ? m.w : m.d) * scale;
    const fd = (alongX ? m.d : m.w) * scale;

    const px = ox + entry.x * scale - fw / 2;
    const pz = oy + entry.z * scale - fd / 2;

    ctx.save();

    // Shadow
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;

    // Fill
    ctx.fillStyle = hexToRgba(color, isSelected ? 0.9 : 0.72);
    roundRect(ctx, px, pz, fw, fd, 5);
    ctx.fill();

    ctx.shadowColor = "transparent";

    // Border
    ctx.strokeStyle = isSelected ? "#00e5ff" : color;
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    roundRect(ctx, px, pz, fw, fd, 5);
    ctx.stroke();

    // Label
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.max(10, Math.min(13, fw / 8))}px 'Space Grotesk', sans-serif`;
    ctx.textAlign = "center";
    const lines = wrapText(m.label, fw - 8, ctx);
    const lineH = 14;
    const textY = pz + fd / 2 - (lines.length - 1) * lineH / 2;
    lines.forEach((line, li) => {
      ctx.fillText(line, px + fw / 2, textY + li * lineH);
    });

    // Dimension text
    ctx.font = "10px 'Space Grotesk', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    const dimLabel = `${(alongX ? m.w : m.d).toFixed(1)}×${(alongX ? m.d : m.w).toFixed(1)}m`;
    ctx.fillText(dimLabel, px + fw / 2, pz + fd - 5);

    ctx.restore();
  });

  // Room name
  ctx.fillStyle = "rgba(31,31,26,0.5)";
  ctx.font = "bold 13px 'Space Grotesk', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${room.label}${room.name ? ` — ${room.name}` : ""}`, 10, H - 10);
}

/**
 * Make placement map interactive: drag furniture pieces.
 * Returns cleanup function.
 */
function makePlacementMapInteractive(canvas, room, placements, onPlacementsChange) {
  const roomW = room.widthM || 4.2;
  const roomL = room.lengthM || 4.2;
  const PAD = 40;
  const scale = Math.min((canvas.width - PAD * 2) / roomW, (canvas.height - PAD * 2) / roomL);
  const ox = (canvas.width - roomW * scale) / 2;
  const oy = (canvas.height - roomL * scale) / 2;

  // Working copy
  let currentPlacements = placements.map(p => ({ ...p, module: { ...p.module } }));
  let dragging = null;
  let selectedId = null;

  function meterFromPx(px, py) {
    return { x: (px - ox) / scale, z: (py - oy) / scale };
  }

  function pxFromMeter(x, z) {
    return { px: ox + x * scale, py: oy + z * scale };
  }

  function hitTest(ptPx) {
    for (let i = currentPlacements.length - 1; i >= 0; i--) {
      const entry = currentPlacements[i];
      const m = entry.module;
      const alongX = Math.abs(entry.rotationY) !== 90;
      const fw = (alongX ? m.w : m.d) * scale;
      const fd = (alongX ? m.d : m.w) * scale;
      const { px, py } = pxFromMeter(entry.x, entry.z);
      if (ptPx.x >= px - fw / 2 && ptPx.x <= px + fw / 2 &&
          ptPx.y >= py - fd / 2 && ptPx.y <= py + fd / 2) {
        return i;
      }
    }
    return -1;
  }

  function redraw() {
    renderPlacementMap(canvas, room, currentPlacements, selectedId);
  }

  const onDown = (ev) => {
    const pt = canvasPoint(canvas, ev);
    const idx = hitTest(pt);
    if (idx >= 0) {
      selectedId = currentPlacements[idx].module.id;
      const m = meterFromPx(pt.x, pt.y);
      dragging = {
        idx,
        offsetX: m.x - currentPlacements[idx].x,
        offsetZ: m.z - currentPlacements[idx].z
      };
    } else {
      selectedId = null;
    }
    redraw();
  };

  const onMove = (ev) => {
    if (!dragging) return;
    const pt = canvasPoint(canvas, ev);
    const m = meterFromPx(pt.x, pt.y);
    const entry = currentPlacements[dragging.idx];
    const newX = snapGrid(m.x - dragging.offsetX, PLACEMENT_GRID);
    const newZ = snapGrid(m.z - dragging.offsetZ, PLACEMENT_GRID);
    // Clamp within room
    const module = entry.module;
    const alongX = Math.abs(entry.rotationY) !== 90;
    const hw = (alongX ? module.w : module.d) / 2;
    const hd = (alongX ? module.d : module.w) / 2;
    entry.x = Math.max(hw, Math.min(roomW - hw, newX));
    entry.z = Math.max(hd, Math.min(roomL - hd, newZ));
    redraw();
  };

  const onUp = () => {
    if (dragging) {
      dragging = null;
      if (onPlacementsChange) onPlacementsChange(currentPlacements);
    }
  };

  canvas.addEventListener("mousedown", onDown);
  canvas.addEventListener("mousemove", onMove);
  canvas.addEventListener("mouseup", onUp);
  canvas.addEventListener("mouseleave", onUp);
  canvas.style.cursor = "grab";
  redraw();

  return {
    cleanup() {
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("mouseleave", onUp);
      canvas.style.cursor = "";
    },
    getPlacements() { return currentPlacements; },
    flipSelected() {
      if (!selectedId) return;
      const entry = currentPlacements.find(p => p.module.id === selectedId);
      if (!entry) return;
      entry.rotationY = entry.rotationY === 0 ? 90 : (entry.rotationY === 90 ? 180 : (entry.rotationY === 180 ? -90 : 0));
      redraw();
      if (onPlacementsChange) onPlacementsChange(currentPlacements);
    },
    removeSelected() {
      if (!selectedId) return;
      currentPlacements = currentPlacements.filter(p => p.module.id !== selectedId);
      selectedId = null;
      redraw();
      if (onPlacementsChange) onPlacementsChange(currentPlacements);
    }
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function canvasToPngBase64(canvas) {
  const dataUrl = canvas.toDataURL("image/png");
  return dataUrl.split(",")[1] || "";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error(`Could not read: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function canvasPoint(canvas, ev) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - rect.left) * (canvas.width / rect.width),
    y: (ev.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function hexToRgba(hex, alpha) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function snapGrid(val, grid) {
  return Math.round(val / grid) * grid;
}

function wrapText(text, maxWidth, ctx) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Export to window for use by index.html client modules
window.PoligridAnalysis = {
  analyzeFloorPlan,
  matchRoomImage,
  drawRoomOverlay,
  startRoomBoxEditor,
  renderPlacementMap,
  makePlacementMapInteractive,
  canvasToPngBase64
};
