// planner-canvas.js — Interactive floor plan workspace
// Manages: furniture layers, camera pins, drag/resize/rotate, NL furniture add
// Exports: window.PlannerCanvas constructor

(function () {

// ─── Constants ───────────────────────────────────────────────────────────────

const GRID = 0.05;          // 5cm snap grid (meters)
const PIN_RADIUS = 10;      // camera pin dot radius px
const HANDLE_SIZE = 10;     // resize handle px
const DEFAULT_FOV = 60;     // default field of view degrees
const HOVER_ALPHA = 0.15;

const ROOM_COLORS = {
  bedroom:  { fill: "rgba(180,120,220,0.18)", stroke: "#8a4db5" },
  living:   { fill: "rgba(80,180,120,0.18)",  stroke: "#2e8b57" },
  kitchen:  { fill: "rgba(240,160,60,0.18)",  stroke: "#c97820" },
  bathroom: { fill: "rgba(60,160,220,0.18)",  stroke: "#2080c0" },
  dining:   { fill: "rgba(220,100,100,0.18)", stroke: "#c04040" },
  study:    { fill: "rgba(80,160,200,0.18)",  stroke: "#3070a0" },
  balcony:  { fill: "rgba(100,200,180,0.18)", stroke: "#288070" },
  foyer:    { fill: "rgba(200,180,100,0.18)", stroke: "#a09020" },
  utility:  { fill: "rgba(160,160,160,0.18)", stroke: "#707070" },
  other:    { fill: "rgba(160,140,200,0.18)", stroke: "#6050a0" }
};

const FURN_COLORS = [
  "#3a6a5a","#b86d35","#5a6a9a","#9a5a6a",
  "#6a9a5a","#9a8a3a","#5a8a9a","#9a6a9a","#6a5a8a","#8a6a3a"
];

let _idSeq = 1;
function uid() { return `pc_${_idSeq++}`; }
function snap(v, g) { return Math.round(v / g) * g; }

// ─── PlannerCanvas ────────────────────────────────────────────────────────────

class PlannerCanvas {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.opts = opts; // { onStateChange, onPinSelect }

    // Scale: pixels per meter
    this.scale = 60;
    this.offsetX = 40; // canvas px where x=0m lives
    this.offsetY = 40;

    // Data
    this.bgImage = null;        // ImageData of bare floor plan
    this.detectedRooms = [];
    this.furniturePlacements = []; // { id, moduleId, label, xM, yM, wM, dM, rotationY, color, roomLabel }
    this.cameraPins = [];          // { id, xM, yM, angleDeg, fovDeg, photoFile, photoDataUrl, roomLabel, brief }

    // Interaction
    this.mode = "select";  // "select" | "pin" | "add-furniture"
    this.selected = null;  // { type:"furniture"|"pin", id }
    this.hovered = null;

    this._drag = null;     // active drag state
    this._pendingDrop = null; // module being dragged from palette

    this._bindEvents();
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  setFloorPlanImage(canvas) {
    // Capture the bare floor plan render as a background image
    const tmp = document.createElement("canvas");
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    tmp.getContext("2d").drawImage(canvas, 0, 0);
    this.bgImage = tmp;

    // Scale canvas to floor plan size
    this.canvas.width = canvas.width + this.offsetX * 2;
    this.canvas.height = canvas.height + this.offsetY * 2;
    this.render();
  }

  setDetectedRooms(rooms) {
    this.detectedRooms = rooms || [];
    this.render();
  }

  // ── Auto-place all furniture from detected rooms ───────────────────────────

  autoPlaceAll(moduleLibrary) {
    this.furniturePlacements = [];

    for (const room of this.detectedRooms) {
      if (room.roomType === "bathroom" || room.roomType === "utility") continue;

      const widthM = room.widthM || 3.5;
      const lengthM = room.lengthM || 3.5;
      const brief = `${room.name} ${room.roomType}`;

      const selected = this._pickModules(moduleLibrary, brief, widthM * lengthM);
      const placed = this._placeModulesInRoom(selected, widthM, lengthM);

      // room top-left in meters (from bbox)
      const rxM = room.bbox.xPct * (this.bgImage ? this.bgImage.width : 600) / this.scale;
      const ryM = room.bbox.yPct * (this.bgImage ? this.bgImage.height : 600) / this.scale;

      placed.forEach((p, idx) => {
        this.furniturePlacements.push({
          id: uid(),
          moduleId: p.module.id,
          label: p.module.label,
          xM: rxM + p.x,
          yM: ryM + p.z,
          wM: p.module.w,
          dM: p.module.d,
          hM: p.module.h,
          rotationY: p.rotationY,
          color: FURN_COLORS[this.furniturePlacements.length % FURN_COLORS.length],
          roomLabel: room.label,
          roomType: room.roomType,
          wall: p.wall
        });
      });
    }

    this.render();
    this._notifyChange();
  }

  _pickModules(moduleLibrary, brief, roomArea) {
    const norm = brief.toLowerCase();
    const picked = [];
    for (const m of moduleLibrary) {
      let score = 0;
      for (const kw of m.keywords || []) {
        if (norm.includes(kw)) score++;
      }
      if (score > 0) picked.push({ ...m, score: score + m.priority / 10 });
    }
    if (!picked.length) {
      const fallback = moduleLibrary.find(m => m.id === "tv_unit") || moduleLibrary[0];
      if (fallback) picked.push({ ...fallback, score: 0.1 });
    }
    picked.sort((a, b) => b.score - a.score);
    const capped = [];
    let area = 0;
    for (const m of picked) {
      if (area + m.w * m.d <= roomArea * 0.55) {
        capped.push(m);
        area += m.w * m.d;
      }
    }
    return capped.length ? capped : [picked[0]];
  }

  _placeModulesInRoom(modules, roomW, roomL) {
    const clear = 0.28, gaps = 0.08;
    const walls = {
      south: { used: clear, cap: roomW - clear, axis: "x" },
      north: { used: clear, cap: roomW - clear, axis: "x" },
      west:  { used: clear, cap: roomL - clear, axis: "z" },
      east:  { used: clear, cap: roomL - clear, axis: "z" }
    };
    const placements = [];
    for (const module of modules) {
      const candidates = ["south","north","west","east"]
        .map(n => ({ name: n, avail: walls[n].cap - walls[n].used }))
        .sort((a, b) => b.avail - a.avail);

      for (const c of candidates) {
        const wall = walls[c.name];
        if (c.avail < module.w + gaps) continue;
        const slot = wall.used + module.w / 2;
        let x = roomW / 2, z = roomL / 2, rotY = 0;
        if (c.name === "south")   { x = slot; z = module.d / 2 + 0.02; rotY = 0; }
        else if (c.name === "north") { x = slot; z = roomL - module.d / 2 - 0.02; rotY = 180; }
        else if (c.name === "west")  { x = module.d / 2 + 0.02; z = slot; rotY = 90; }
        else if (c.name === "east")  { x = roomW - module.d / 2 - 0.02; z = slot; rotY = -90; }
        placements.push({ module, wall: c.name, x, z, rotationY: rotY });
        wall.used += module.w + gaps;
        break;
      }
    }
    return placements;
  }

  // ── Add furniture by NL (called after server returns suggestions) ──────────

  addFurnitureFromSuggestion(moduleLibrary, suggestion, targetRoomLabel) {
    const module = moduleLibrary.find(m => m.id === suggestion.id);
    if (!module) return null;

    // Find target room
    const room = targetRoomLabel
      ? this.detectedRooms.find(r => r.label === targetRoomLabel)
      : this.detectedRooms[0];

    let xM = 1, yM = 1;
    if (room && this.bgImage) {
      xM = room.bbox.xPct * this.bgImage.width / this.scale + (room.widthM || 3) / 2;
      yM = room.bbox.yPct * this.bgImage.height / this.scale + (room.lengthM || 3) / 2;
    }

    const piece = {
      id: uid(),
      moduleId: module.id,
      label: module.label,
      xM, yM,
      wM: module.w, dM: module.d, hM: module.h,
      rotationY: 0,
      color: FURN_COLORS[this.furniturePlacements.length % FURN_COLORS.length],
      roomLabel: room?.label || "",
      roomType: room?.roomType || "other",
      wall: "center"
    };
    this.furniturePlacements.push(piece);
    this.selected = { type: "furniture", id: piece.id };
    this.render();
    this._notifyChange();
    return piece;
  }

  // ── Drop furniture from external palette drag ──────────────────────────────

  startExternalDrop(module) {
    this._pendingDrop = module;
    this.canvas.style.cursor = "copy";
  }

  // ── Camera Pins ────────────────────────────────────────────────────────────

  addCameraPin(xM, yM) {
    const pin = {
      id: uid(),
      xM, yM,
      angleDeg: 0,
      fovDeg: DEFAULT_FOV,
      photoFile: null,
      photoDataUrl: null,
      roomLabel: this._roomAtPoint(xM, yM),
      brief: ""
    };
    this.cameraPins.push(pin);
    this.selected = { type: "pin", id: pin.id };
    this.render();
    this._notifyChange();
    if (this.opts.onPinSelect) this.opts.onPinSelect(pin);
    return pin;
  }

  updatePin(id, updates) {
    const pin = this.cameraPins.find(p => p.id === id);
    if (!pin) return;
    Object.assign(pin, updates);
    this.render();
    this._notifyChange();
  }

  removeSelected() {
    if (!this.selected) return;
    if (this.selected.type === "furniture") {
      this.furniturePlacements = this.furniturePlacements.filter(f => f.id !== this.selected.id);
    } else if (this.selected.type === "pin") {
      this.cameraPins = this.cameraPins.filter(p => p.id !== this.selected.id);
    }
    this.selected = null;
    this.render();
    this._notifyChange();
  }

  rotateSelected() {
    if (!this.selected || this.selected.type !== "furniture") return;
    const f = this.furniturePlacements.find(f => f.id === this.selected.id);
    if (!f) return;
    f.rotationY = ((f.rotationY || 0) + 90) % 360;
    // Swap w/d on 90/270
    if (f.rotationY % 180 !== 0) { [f.wM, f.dM] = [f.dM, f.wM]; }
    this.render();
    this._notifyChange();
  }

  setMode(mode) {
    this.mode = mode;
    this.canvas.style.cursor = mode === "pin" ? "crosshair" : "default";
    this.selected = null;
    this.render();
  }

  // ── Coordinate helpers ─────────────────────────────────────────────────────

  pxToM(px, py) {
    return {
      x: (px - this.offsetX) / this.scale,
      y: (py - this.offsetY) / this.scale
    };
  }

  mToPx(xM, yM) {
    return {
      px: this.offsetX + xM * this.scale,
      py: this.offsetY + yM * this.scale
    };
  }

  _roomAtPoint(xM, yM) {
    if (!this.bgImage) return "";
    const imgW = this.bgImage.width, imgH = this.bgImage.height;
    for (const room of this.detectedRooms) {
      const rx = room.bbox.xPct * imgW / this.scale;
      const ry = room.bbox.yPct * imgH / this.scale;
      const rw = room.bbox.wPct * imgW / this.scale;
      const rh = room.bbox.hPct * imgH / this.scale;
      if (xM >= rx && xM <= rx + rw && yM >= ry && yM <= ry + rh) return room.label;
    }
    return "";
  }

  // ── Hit test ───────────────────────────────────────────────────────────────

  _hitFurniture(mx, my) {
    for (let i = this.furniturePlacements.length - 1; i >= 0; i--) {
      const f = this.furniturePlacements[i];
      const hw = f.wM / 2, hd = f.dM / 2;
      if (mx >= f.xM - hw && mx <= f.xM + hw && my >= f.yM - hd && my <= f.yM + hd) {
        return f;
      }
    }
    return null;
  }

  _hitPin(mx, my) {
    const r = PIN_RADIUS / this.scale;
    const alen = 28 / this.scale;
    for (let i = this.cameraPins.length - 1; i >= 0; i--) {
      const p = this.cameraPins[i];
      const dx = mx - p.xM, dy = my - p.yM;
      if (Math.sqrt(dx*dx + dy*dy) <= r * 1.8) return p;
      
      const tipX = p.xM + alen * Math.sin(p.angleDeg * Math.PI / 180);
      const tipY = p.yM - alen * Math.cos(p.angleDeg * Math.PI / 180);
      if (Math.abs(mx - tipX) < 0.3 && Math.abs(my - tipY) < 0.3) return p;
    }
    return null;
  }

  _hitResizeHandle(mx, my, f) {
    const { px: fpx, py: fpy } = this.mToPx(f.xM + f.wM / 2, f.yM + f.dM / 2);
    const pt = this._canvasPointRaw(null); // won't use this path directly
    const hW = HANDLE_SIZE / this.scale;
    return (Math.abs(mx - (f.xM + f.wM / 2)) < hW && Math.abs(my - (f.yM + f.dM / 2)) < hW);
  }

  // ── Event binding ──────────────────────────────────────────────────────────

  _bindEvents() {
    this.canvas.addEventListener("mousedown", this._onDown.bind(this));
    this.canvas.addEventListener("mousemove", this._onMove.bind(this));
    this.canvas.addEventListener("mouseup",   this._onUp.bind(this));
    this.canvas.addEventListener("mouseleave", this._onUp.bind(this));
    this.canvas.addEventListener("dblclick",  this._onDblClick.bind(this));

    // External palette drop
    this.canvas.addEventListener("dragover", e => {
      if (this._pendingDrop) { e.preventDefault(); this.canvas.style.cursor = "copy"; }
    });
    this.canvas.addEventListener("drop", e => {
      e.preventDefault();
      if (!this._pendingDrop) return;
      const pt = this._evPt(e);
      const m = this.pxToM(pt.x, pt.y);
      const module = this._pendingDrop;
      this._pendingDrop = null;
      this.canvas.style.cursor = "default";
      this.furniturePlacements.push({
        id: uid(), moduleId: module.id, label: module.label,
        xM: snap(m.x, GRID), yM: snap(m.y, GRID),
        wM: module.w, dM: module.d, hM: module.h,
        rotationY: 0,
        color: FURN_COLORS[this.furniturePlacements.length % FURN_COLORS.length],
        roomLabel: this._roomAtPoint(m.x, m.y),
        roomType: "other", wall: "center"
      });
      this.render();
      this._notifyChange();
    });

    window.addEventListener("keydown", e => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (document.activeElement === this.canvas || document.activeElement === document.body) {
          this.removeSelected();
        }
      }
      if (e.key === "r" || e.key === "R") this.rotateSelected();
    });
  }

  _evPt(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (this.canvas.width / r.width),
      y: (e.clientY - r.top) * (this.canvas.height / r.height)
    };
  }

  _onDown(e) {
    const pt = this._evPt(e);
    const m = this.pxToM(pt.x, pt.y);

    if (this.mode === "pin") {
      this.addCameraPin(snap(m.x, GRID), snap(m.y, GRID));
      return;
    }

    // Check pin first (higher priority)
    const hitPin = this._hitPin(m.x, m.y);
    if (hitPin) {
      this.selected = { type: "pin", id: hitPin.id };
      this._drag = {
        type: "pin-move", id: hitPin.id,
        ox: m.x - hitPin.xM, oy: m.y - hitPin.yM,
        startPt: m
      };
      // Detect if near the arrow tip for angle drag
      const alen = 28 / this.scale; // arrow length in meters
      const tipX = hitPin.xM + alen * Math.sin(hitPin.angleDeg * Math.PI / 180);
      const tipY = hitPin.yM - alen * Math.cos(hitPin.angleDeg * Math.PI / 180);
      if (Math.abs(m.x - tipX) < 0.3 && Math.abs(m.y - tipY) < 0.3) {
        this._drag = { type: "pin-rotate", id: hitPin.id };
      }
      this.render();
      return;
    }

    const hitF = this._hitFurniture(m.x, m.y);
    if (hitF) {
      this.selected = { type: "furniture", id: hitF.id };

      // Check resize handle (bottom-right)
      const hrx = hitF.xM + hitF.wM / 2, hry = hitF.yM + hitF.dM / 2;
      const hDist = Math.sqrt((m.x - hrx)**2 + (m.y - hry)**2);
      if (hDist < HANDLE_SIZE / this.scale * 1.5) {
        this._drag = { type: "resize", id: hitF.id, origW: hitF.wM, origD: hitF.dM, startPt: m };
      } else {
        this._drag = { type: "move", id: hitF.id, ox: m.x - hitF.xM, oy: m.y - hitF.yM };
      }
      this.render();
      return;
    }

    this.selected = null;
    this.render();
  }

  _onMove(e) {
    const pt = this._evPt(e);
    const m = this.pxToM(pt.x, pt.y);

    if (!this._drag) {
      // Hover detection
      const hitF = this._hitFurniture(m.x, m.y);
      const hitP = this._hitPin(m.x, m.y);
      this.hovered = hitF ? { type: "furniture", id: hitF.id } : hitP ? { type: "pin", id: hitP.id } : null;
      this.canvas.style.cursor = this.mode === "pin" ? "crosshair" : (this.hovered ? "grab" : "default");
      this.render();
      return;
    }

    const drag = this._drag;

    if (drag.type === "move") {
      const f = this.furniturePlacements.find(f => f.id === drag.id);
      if (f) {
        f.xM = snap(m.x - drag.ox, GRID);
        f.yM = snap(m.y - drag.oy, GRID);
        f.roomLabel = this._roomAtPoint(f.xM, f.yM);
      }
    } else if (drag.type === "resize") {
      const f = this.furniturePlacements.find(f => f.id === drag.id);
      if (f) {
        const dx = m.x - drag.startPt.x, dy = m.y - drag.startPt.y;
        f.wM = Math.max(0.3, snap(drag.origW + dx * 2, GRID));
        f.dM = Math.max(0.3, snap(drag.origD + dy * 2, GRID));
      }
    } else if (drag.type === "pin-move") {
      const p = this.cameraPins.find(p => p.id === drag.id);
      if (p) {
        p.xM = snap(m.x - drag.ox, GRID);
        p.yM = snap(m.y - drag.oy, GRID);
        p.roomLabel = this._roomAtPoint(p.xM, p.yM);
      }
    } else if (drag.type === "pin-rotate") {
      const p = this.cameraPins.find(p => p.id === drag.id);
      if (p) {
        const dx = m.x - p.xM, dy = m.y - p.yM;
        p.angleDeg = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
      }
    }

    this.render();
  }

  _onUp() {
    if (this._drag) {
      this._drag = null;
      this._notifyChange();
    }
    this.canvas.style.cursor = this.mode === "pin" ? "crosshair" : "default";
  }

  _onDblClick(e) {
    const pt = this._evPt(e);
    const m = this.pxToM(pt.x, pt.y);
    const hitPin = this._hitPin(m.x, m.y);
    if (hitPin && this.opts.onPinSelect) {
      this.opts.onPinSelect(hitPin);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  render() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background checkerboard
    ctx.fillStyle = "#f0ede8";
    ctx.fillRect(0, 0, W, H);

    // Floor plan image
    if (this.bgImage) {
      ctx.drawImage(this.bgImage, this.offsetX, this.offsetY);
    }

    // Room overlays (subtle)
    for (const room of this.detectedRooms) {
      if (!this.bgImage) break;
      const col = ROOM_COLORS[room.roomType] || ROOM_COLORS.other;
      const rx = this.offsetX + room.bbox.xPct * this.bgImage.width;
      const ry = this.offsetY + room.bbox.yPct * this.bgImage.height;
      const rw = room.bbox.wPct * this.bgImage.width;
      const rh = room.bbox.hPct * this.bgImage.height;
      ctx.save();
      ctx.fillStyle = col.fill;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = col.stroke;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
      // Room label
      ctx.font = "bold 11px 'Space Grotesk', sans-serif";
      ctx.fillStyle = col.stroke;
      ctx.fillText(room.label, rx + 5, ry + 14);
      ctx.restore();
    }

    // Furniture
    for (const f of this.furniturePlacements) {
      const { px, py } = this.mToPx(f.xM, f.yM);
      const fw = f.wM * this.scale;
      const fd = f.dM * this.scale;
      const isSel = this.selected?.type === "furniture" && this.selected?.id === f.id;
      const isHov = this.hovered?.type === "furniture" && this.hovered?.id === f.id;

      ctx.save();
      ctx.translate(px, py);

      // Shadow
      ctx.shadowColor = "rgba(0,0,0,0.22)";
      ctx.shadowBlur = isSel ? 12 : 5;
      ctx.shadowOffsetY = 2;

      // Fill
      ctx.fillStyle = hexRgba(f.color, isSel ? 0.92 : isHov ? 0.82 : 0.72);
      rRect(ctx, -fw/2, -fd/2, fw, fd, 5);
      ctx.fill();

      ctx.shadowColor = "transparent";

      // Border
      ctx.strokeStyle = isSel ? "#00e5ff" : f.color;
      ctx.lineWidth = isSel ? 2.5 : 1.5;
      rRect(ctx, -fw/2, -fd/2, fw, fd, 5);
      ctx.stroke();

      // Resize handle (bottom-right)
      if (isSel) {
        ctx.fillStyle = "#00e5ff";
        ctx.fillRect(fw/2 - HANDLE_SIZE/2, fd/2 - HANDLE_SIZE/2, HANDLE_SIZE, HANDLE_SIZE);
      }

      // Label
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.max(9, Math.min(12, fw/9))}px 'Space Grotesk', sans-serif`;
      ctx.textAlign = "center";
      const lines = wrapTxt(f.label, fw - 8, ctx);
      const lh = 13;
      lines.forEach((line, li) => {
        ctx.fillText(line, 0, -((lines.length - 1) * lh / 2) + li * lh + 3);
      });

      // Dims
      ctx.font = "9px 'Space Grotesk', sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText(`${f.wM.toFixed(1)}×${f.dM.toFixed(1)}m`, 0, fd/2 - 4);

      ctx.restore();
    }

    // Camera Pins
    for (const pin of this.cameraPins) {
      const { px, py } = this.mToPx(pin.xM, pin.yM);
      const isSel = this.selected?.type === "pin" && this.selected?.id === pin.id;
      const fovRad = (pin.fovDeg || DEFAULT_FOV) * Math.PI / 180;
      const angleRad = pin.angleDeg * Math.PI / 180;
      const coneLen = 52;

      ctx.save();
      ctx.translate(px, py);

      // FOV cone
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, coneLen, angleRad - Math.PI/2 - fovRad/2, angleRad - Math.PI/2 + fovRad/2);
      ctx.closePath();
      ctx.fillStyle = isSel ? "rgba(0,229,255,0.22)" : "rgba(255,180,0,0.18)";
      ctx.fill();
      ctx.strokeStyle = isSel ? "#00e5ff" : "#e0a000";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Direction arrow
      const ax = Math.sin(angleRad) * 28;
      const ay = -Math.cos(angleRad) * 28;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(ax, ay);
      ctx.strokeStyle = isSel ? "#00e5ff" : "#c08000";
      ctx.lineWidth = 2;
      ctx.stroke();
      // Arrowhead
      const aAngle = Math.atan2(ay, ax);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - 8*Math.cos(aAngle - 0.4), ay - 8*Math.sin(aAngle - 0.4));
      ctx.lineTo(ax - 8*Math.cos(aAngle + 0.4), ay - 8*Math.sin(aAngle + 0.4));
      ctx.closePath();
      ctx.fillStyle = isSel ? "#00e5ff" : "#c08000";
      ctx.fill();

      // Pin dot
      ctx.beginPath();
      ctx.arc(0, 0, PIN_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isSel ? "#00e5ff" : (pin.photoFile ? "#3a6a5a" : "#e0a000");
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Camera icon or photo thumbnail
      if (pin.photoDataUrl) {
        // Tiny thumbnail inside dot
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, PIN_RADIUS - 2, 0, Math.PI * 2);
        ctx.clip();
        const img = new Image();
        img.src = pin.photoDataUrl;
        ctx.drawImage(img, -(PIN_RADIUS-2), -(PIN_RADIUS-2), (PIN_RADIUS-2)*2, (PIN_RADIUS-2)*2);
        ctx.restore();
      } else {
        // Camera symbol
        ctx.fillStyle = "#fff";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("📷", 0, 4);
      }

      // Pin label
      ctx.font = "bold 10px 'Space Grotesk', sans-serif";
      ctx.fillStyle = isSel ? "#00e5ff" : "#555";
      ctx.textAlign = "left";
      ctx.fillText(pin.roomLabel || `pin`, PIN_RADIUS + 4, 4);

      ctx.restore();
    }

    // Mode hint
    if (this.mode === "pin") {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, H - 28, W, 28);
      ctx.fillStyle = "#fff";
      ctx.font = "12px 'Space Grotesk', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("📷 Camera Pin Mode — click to place, drag arrow to set direction, double-click pin to edit", W/2, H - 10);
      ctx.restore();
    }
  }

  // ── State export ───────────────────────────────────────────────────────────

  getSceneState() {
    return {
      detectedRooms: this.detectedRooms,
      furniturePlacements: this.furniturePlacements,
      cameraPins: this.cameraPins.map(p => ({ ...p, photoFile: undefined })) // don't serialize File
    };
  }

  getCameraPinsWithFiles() {
    return this.cameraPins;
  }

  getPlacementsForRoom(roomLabel) {
    return this.furniturePlacements.filter(f => f.roomLabel === roomLabel);
  }

  _notifyChange() {
    if (this.opts.onStateChange) this.opts.onStateChange(this.getSceneState());
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rRect(ctx, x, y, w, h, r) {
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

function hexRgba(hex, a) {
  const c = hex.replace("#","");
  const r = parseInt(c.slice(0,2),16), g = parseInt(c.slice(2,4),16), b = parseInt(c.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}

function wrapTxt(text, maxW, ctx) {
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

window.PlannerCanvas = PlannerCanvas;

})();
