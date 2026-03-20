// room-editor.js — Phase 2: Interactive room boundary editor
// Manages: room rectangle drag/resize, add/delete rooms, rename
// Exports: window.RoomEditor

(function () {

const EDGE_HIT = 10;        // px from edge to trigger resize
const MIN_DIM  = 40;        // minimum room px dimension
const ROOM_COLORS = {
  bedroom:  { fill: "rgba(180,120,220,0.22)", stroke: "#8a4db5" },
  living:   { fill: "rgba(80,180,120,0.22)",  stroke: "#2e8b57" },
  kitchen:  { fill: "rgba(240,160,60,0.22)",  stroke: "#c97820" },
  bathroom: { fill: "rgba(60,160,220,0.22)",  stroke: "#2080c0" },
  dining:   { fill: "rgba(220,100,100,0.22)", stroke: "#c04040" },
  study:    { fill: "rgba(80,160,200,0.22)",  stroke: "#3070a0" },
  balcony:  { fill: "rgba(100,200,180,0.22)", stroke: "#288070" },
  foyer:    { fill: "rgba(200,180,100,0.22)", stroke: "#a09020" },
  utility:  { fill: "rgba(160,160,160,0.22)", stroke: "#707070" },
  office:   { fill: "rgba(100,140,220,0.22)", stroke: "#4060c0" },
  conference: { fill: "rgba(220,140,100,0.22)", stroke: "#c06040" },
  workstation: { fill: "rgba(140,220,100,0.22)", stroke: "#60c040" },
  reception: { fill: "rgba(220,100,220,0.22)", stroke: "#c040c0" },
  pantry:   { fill: "rgba(240,200,80,0.22)", stroke: "#d0a020" },
  store:    { fill: "rgba(160,160,160,0.22)", stroke: "#808080" },
  retail:   { fill: "rgba(255,120,150,0.22)", stroke: "#d05070" },
  other:    { fill: "rgba(160,140,200,0.22)", stroke: "#6050a0" }
};

let _seq = 1;
function uid() { return `room_${_seq++}`; }

class RoomEditor {
  constructor(canvas, bgCanvas, opts = {}) {
    // canvas = overlay canvas (same size as bgCanvas)
    // bgCanvas = the rendered floor plan canvas
    this.canvas = canvas;
    this.bgCanvas = bgCanvas;
    this.ctx = canvas.getContext("2d");
    this.opts = opts; // { onRoomsChange }

    this.rooms = [];          // [{ id, label, name, roomType, xPx, yPx, wPx, hPx, widthM, lengthM, notes }]
    this.selected = null;     // room id
    this._drag = null;        // { type: "move"|"resize-{nw,ne,sw,se,n,s,e,w}", id, ... }
    this._addMode = false;    // drawing new room
    this._addStart = null;
    this._renameInput = null; // floating input DOM element

    this._bind();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  setRooms(analysisRooms, imgW, imgH) {
    // Convert from bbox-fraction format → pixel format
    this.rooms = analysisRooms.map(r => ({
      id: uid(),
      label: r.label,
      name:  r.name || r.label,
      roomType: r.roomType || "other",
      xPx: Math.round(r.bbox.xPct * imgW),
      yPx: Math.round(r.bbox.yPct * imgH),
      wPx: Math.round(r.bbox.wPct * imgW),
      hPx: Math.round(r.bbox.hPct * imgH),
      widthM:  r.widthM  || null,
      lengthM: r.lengthM || null,
      notes: r.notes || ""
    }));
    this.render();
    this._notify();
  }

  getRooms() {
    // Export back to fraction format (relative to bgCanvas)
    const W = this.bgCanvas.width, H = this.bgCanvas.height;
    return this.rooms.map(r => ({
      id: r.id,
      label: r.label,
      name:  r.name,
      roomType: r.roomType,
      bbox: {
        xPct: r.xPx / W,
        yPct: r.yPx / H,
        wPct: r.wPx / W,
        hPct: r.hPx / H
      },
      widthM:  r.widthM,
      lengthM: r.lengthM,
      notes:   r.notes
    }));
  }

  addRoom() {
    this._addMode = true;
    this.canvas.style.cursor = "crosshair";
    this._closeRename();
  }

  deleteRoom(idOrLabel) {
    this.rooms = this.rooms.filter(r => r.id !== idOrLabel && r.label !== idOrLabel);
    if (this.selected === idOrLabel) this.selected = null;
    this.render();
    this._notify();
  }

  updateDims(id, widthM, lengthM) {
    const r = this.rooms.find(r => r.id === id);
    if (!r) return;
    r.widthM = widthM;
    r.lengthM = lengthM;
    this.render();
    this._notify();
  }

  getSelected() {
    return this.rooms.find(r => r.id === this.selected) || null;
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  render() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    for (const room of this.rooms) {
      const col = ROOM_COLORS[room.roomType] || ROOM_COLORS.other;
      const isSel = room.id === this.selected;

      ctx.save();

      // Fill
      ctx.fillStyle = col.fill;
      ctx.fillRect(room.xPx, room.yPx, room.wPx, room.hPx);

      // Border
      ctx.strokeStyle = isSel ? "#00e5ff" : col.stroke;
      ctx.lineWidth   = isSel ? 2.5 : 1.5;
      ctx.setLineDash(isSel ? [] : [5, 3]);
      ctx.strokeRect(room.xPx, room.yPx, room.wPx, room.hPx);
      ctx.setLineDash([]);

      // Resize handles (8-point) when selected
      if (isSel) {
        this._drawHandles(room);
      }

      // Label badge
      const bx = room.xPx + 6, by = room.yPx + 6;
      const label = room.name || room.label;
      ctx.font = "bold 11px 'Space Grotesk', sans-serif";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = isSel ? "#00e5ff" : col.stroke;
      ctx.fillRect(bx - 3, by - 12, tw + 8, 16);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, bx + 1, by);

      // Dims
      if (room.widthM && room.lengthM) {
        ctx.font = "10px 'Space Grotesk', sans-serif";
        ctx.fillStyle = isSel ? "#00e5ff" : col.stroke;
        ctx.fillText(`${room.widthM.toFixed(1)}×${room.lengthM.toFixed(1)}m`,
          room.xPx + 6, room.yPx + room.hPx - 6);
      }

      ctx.restore();
    }
  }

  _drawHandles(room) {
    const ctx = this.ctx;
    const S = 8;
    const pts = this._handles(room);
    for (const [hx, hy] of Object.values(pts)) {
      ctx.fillStyle = "#00e5ff";
      ctx.strokeStyle = "#006080";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(hx - S/2, hy - S/2, S, S);
      ctx.fill();
      ctx.stroke();
    }
  }

  _handles(room) {
    const { xPx: x, yPx: y, wPx: w, hPx: h } = room;
    const mx = x + w/2, my = y + h/2;
    return {
      nw: [x,    y   ], n: [mx,   y   ], ne: [x+w,  y   ],
      w:  [x,    my  ],                   e: [x+w,  my  ],
      sw: [x,    y+h ], s: [mx,   y+h ], se: [x+w,  y+h ]
    };
  }

  // ── Events ───────────────────────────────────────────────────────────────────

  _bind() {
    this.canvas.addEventListener("mousedown",  e => this._onDown(e));
    this.canvas.addEventListener("mousemove",  e => this._onMove(e));
    this.canvas.addEventListener("mouseup",    e => this._onUp(e));
    this.canvas.addEventListener("dblclick",   e => this._onDbl(e));
  }

  _pt(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (this.canvas.width  / r.width),
      y: (e.clientY - r.top)  * (this.canvas.height / r.height)
    };
  }

  _onDown(e) {
    const { x, y } = this._pt(e);
    this._closeRename();

    if (this._addMode) {
      this._addStart = { x, y };
      return;
    }

    // Check handles of selected room
    if (this.selected) {
      const sel = this.rooms.find(r => r.id === this.selected);
      if (sel) {
        const handles = this._handles(sel);
        const S = 10;
        for (const [hname, [hx, hy]] of Object.entries(handles)) {
          if (Math.abs(x - hx) < S && Math.abs(y - hy) < S) {
            this._drag = {
              type: `resize-${hname}`, id: sel.id,
              ox: x, oy: y,
              origX: sel.xPx, origY: sel.yPx,
              origW: sel.wPx, origH: sel.hPx,
              origWidthM: sel.widthM, origLengthM: sel.lengthM
            };
            return;
          }
        }
      }
    }

    // Check room interior (top-to-bottom, topmost wins)
    for (let i = this.rooms.length - 1; i >= 0; i--) {
      const r = this.rooms[i];
      if (x >= r.xPx && x <= r.xPx + r.wPx && y >= r.yPx && y <= r.yPx + r.hPx) {
        this.selected = r.id;
        this._drag = { type: "move", id: r.id, ox: x - r.xPx, oy: y - r.yPx };
        this.render();
        this._emitSelect(r);
        return;
      }
    }

    this.selected = null;
    this.render();
    this._emitSelect(null);
  }

  _onMove(e) {
    const { x, y } = this._pt(e);

    if (this._addMode && this._addStart) {
      const W = this.canvas.width, H = this.canvas.height;
      const rx = Math.min(x, this._addStart.x), ry = Math.min(y, this._addStart.y);
      const rw = Math.abs(x - this._addStart.x), rh = Math.abs(y - this._addStart.y);
      this.render();
      const ctx = this.ctx;
      ctx.strokeStyle = "#00e5ff";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(0,229,255,0.08)";
      ctx.fillRect(rx, ry, rw, rh);
      return;
    }

    if (!this._drag) {
      // Cursor hint
      const cur = this._cursorForPoint(x, y);
      this.canvas.style.cursor = cur;
      return;
    }

    const d = this._drag;
    const room = this.rooms.find(r => r.id === d.id);
    if (!room) return;

    if (d.type === "move") {
      room.xPx = Math.round(x - d.ox);
      room.yPx = Math.round(y - d.oy);
    } else {
      const dx = x - d.ox, dy = y - d.oy;
      const ht = d.type.replace("resize-", "");
      let { origX: rx, origY: ry, origW: rw, origH: rh } = d;

      if (ht.includes("n")) { ry = Math.min(d.origY + d.origH - MIN_DIM, d.origY + dy); rh = d.origH - (ry - d.origY); }
      if (ht.includes("s")) { rh = Math.max(MIN_DIM, d.origH + dy); }
      if (ht.includes("w")) { rx = Math.min(d.origX + d.origW - MIN_DIM, d.origX + dx); rw = d.origW - (rx - d.origX); }
      if (ht.includes("e")) { rw = Math.max(MIN_DIM, d.origW + dx); }

      room.xPx = Math.round(rx); room.yPx = Math.round(ry);
      room.wPx = Math.round(rw); room.hPx = Math.round(rh);

      // Recalculate meters proportionally to image
      const W = this.bgCanvas.width, H = this.bgCanvas.height;
      // If we have at least one valid meter reading, scale proportionally
      if (d.origWidthM)  room.widthM  = parseFloat((d.origWidthM  * room.wPx / d.origW).toFixed(2));
      if (d.origLengthM) room.lengthM = parseFloat((d.origLengthM * room.hPx / d.origH).toFixed(2));
    }

    this.render();
  }

  _onUp(e) {
    const { x, y } = this._pt(e);

    if (this._addMode && this._addStart) {
      let rx = Math.min(x, this._addStart.x), ry = Math.min(y, this._addStart.y);
      let rw = Math.abs(x - this._addStart.x), rh = Math.abs(y - this._addStart.y);
      if (rw <= 10 || rh <= 10) {
        rx = x - 50; ry = y - 50; rw = 100; rh = 100;
      }
      const id = uid();
      const newRoom = {
        id, label: `Room ${this.rooms.length + 1}`,
        name: `Room ${this.rooms.length + 1}`,
        roomType: "other",
        xPx: Math.round(rx), yPx: Math.round(ry),
        wPx: Math.round(rw), hPx: Math.round(rh),
        widthM: null, lengthM: null, notes: ""
      };
      this.rooms.push(newRoom);
      this.selected = id;
      this._emitSelect(newRoom);
      
      this._addMode = false;
      this._addStart = null;
      this.canvas.style.cursor = "default";
      this.render();
      this._notify();
      return;
    }

    if (this._drag) {
      this._drag = null;
      this._notify();
    }

    this.canvas.style.cursor = this._cursorForPoint(x, y);
  }

  _onDbl(e) {
    const { x, y } = this._pt(e);
    for (let i = this.rooms.length - 1; i >= 0; i--) {
      const r = this.rooms[i];
      if (x >= r.xPx && x <= r.xPx + r.wPx && y >= r.yPx && y <= r.yPx + r.hPx) {
        this._openRename(r, e.clientX, e.clientY);
        return;
      }
    }
  }

  _cursorForPoint(x, y) {
    if (this._addMode) return "crosshair";
    if (this.selected) {
      const sel = this.rooms.find(r => r.id === this.selected);
      if (sel) {
        const handles = this._handles(sel);
        const S = 10;
        for (const [hname, [hx, hy]] of Object.entries(handles)) {
          if (Math.abs(x - hx) < S && Math.abs(y - hy) < S) {
            const curMap = { nw:"nw-resize", ne:"ne-resize", sw:"sw-resize", se:"se-resize",
                             n:"n-resize", s:"s-resize", w:"w-resize", e:"e-resize" };
            return curMap[hname] || "crosshair";
          }
        }
      }
    }
    for (let i = this.rooms.length - 1; i >= 0; i--) {
      const r = this.rooms[i];
      if (x >= r.xPx && x <= r.xPx + r.wPx && y >= r.yPx && y <= r.yPx + r.hPx) return "move";
    }
    return "default";
  }

  // ── Rename popover ───────────────────────────────────────────────────────────

  _openRename(room, cx, cy) {
    this._closeRename();
    const inp = document.createElement("div");
    inp.id = "roomRenamePopover";
    inp.style.cssText = [
      "position:fixed", `left:${cx}px`, `top:${cy}px`,
      "z-index:9999", "background:#1a1a2e", "border:1px solid #00e5ff",
      "border-radius:8px", "padding:12px", "min-width:220px",
      "box-shadow:0 8px 32px rgba(0,0,0,0.5)", "font-family:'Space Grotesk',sans-serif"
    ].join(";");
    inp.innerHTML = `
      <div style="color:#aaa;font-size:11px;margin-bottom:6px">Edit room</div>
      <input id="_re_name" value="${room.name}" style="width:100%;background:#111;border:1px solid #333;border-radius:4px;padding:5px 8px;color:#fff;font-size:13px;margin-bottom:8px" placeholder="Room name"/>
      <select id="_re_type" style="width:100%;background:#111;border:1px solid #333;border-radius:4px;padding:5px 8px;color:#fff;font-size:13px;margin-bottom:8px">
        ${["bedroom","living","kitchen","bathroom","dining","study","balcony","foyer","utility","office","conference","workstation","reception","pantry","store","retail","other"].map(t =>
          `<option value="${t}" ${room.roomType===t?"selected":""}>${t}</option>`).join("")}
      </select>
      <div style="display:flex;gap:6px">
        <input id="_re_w" type="number" value="${room.widthM||""}" placeholder="W (m)" step="0.1" min="0.5"
          style="flex:1;background:#111;border:1px solid #333;border-radius:4px;padding:5px 6px;color:#fff;font-size:12px"/>
        <input id="_re_l" type="number" value="${room.lengthM||""}" placeholder="L (m)" step="0.1" min="0.5"
          style="flex:1;background:#111;border:1px solid #333;border-radius:4px;padding:5px 6px;color:#fff;font-size:12px"/>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button id="_re_save" style="flex:1;background:#00e5ff;color:#000;border:none;border-radius:5px;padding:6px;font-size:12px;cursor:pointer;font-weight:700">Save</button>
        <button id="_re_del" style="background:#ff4444;color:#fff;border:none;border-radius:5px;padding:6px 10px;font-size:12px;cursor:pointer">Delete</button>
        <button id="_re_cancel" style="background:#333;color:#ccc;border:none;border-radius:5px;padding:6px 10px;font-size:12px;cursor:pointer">✕</button>
      </div>`;
    document.body.appendChild(inp);
    this._renameInput = inp;

    inp.querySelector("#_re_save").onclick = () => {
      room.name      = inp.querySelector("#_re_name").value || room.name;
      room.label     = room.name;
      room.roomType  = inp.querySelector("#_re_type").value;
      room.widthM    = parseFloat(inp.querySelector("#_re_w").value) || room.widthM;
      room.lengthM   = parseFloat(inp.querySelector("#_re_l").value) || room.lengthM;
      this._closeRename();
      this.render();
      this._notify();
      this._emitSelect(room);
    };
    inp.querySelector("#_re_del").onclick = () => {
      this.deleteRoom(room.id);
      this._closeRename();
    };
    inp.querySelector("#_re_cancel").onclick = () => this._closeRename();
  }

  _closeRename() {
    if (this._renameInput) {
      this._renameInput.remove();
      this._renameInput = null;
    }
  }

  // ── Internal helpers ─────────────────────────────────────────────────────────

  _notify() {
    if (this.opts.onRoomsChange) this.opts.onRoomsChange(this.getRooms());
  }

  _emitSelect(room) {
    if (this.opts.onSelect) this.opts.onSelect(room);
  }
}

window.RoomEditor = RoomEditor;

})();
