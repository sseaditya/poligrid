// ─── Utilities ────────────────────────────────────────────────────────────────

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Fire-and-forget save. Errors are logged but never block the UI.
function saveToDb(url, body) {
  (async () => {
    const authHeaders = window.AuthClient ? await AuthClient.authHeader() : {};
    return fetch(url, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  })().then(r => {
    if (!r.ok) r.text().then(t => console.warn(`[DB] ${url} failed:`, t));
  }).catch(e => console.warn(`[DB] ${url} error:`, e.message));
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
    const authHeaders = window.AuthClient ? await AuthClient.authHeader() : {};
    const res  = await fetch(url, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
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
