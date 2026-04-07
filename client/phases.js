// ─── Phase state machine ─────────────────────────────────────────────────────

function advancePhase(n) {
  currentPhase = n;
  // Update pills
  for (let i = 1; i <= 5; i++) {
    const pill = el(`pill${i}`);
    if (!pill) continue;
    pill.classList.toggle("active", i === n);
    pill.classList.toggle("done", i < n);
  }
  // Connectors
  for (let i = 1; i <= 4; i++) {
    const conn = el(`conn${i}${i + 1}`);
    if (conn) conn.style.background = i < n ? "var(--success)" : "var(--border)";
  }
  // Show/hide panels
  for (let i = 1; i <= 5; i++) {
    const p = el(`panel${i}`);
    if (p) p.hidden = i !== n;
  }
}


// ─── Phase back navigation ───────────────────────────────────────────────────

function goBack(targetPhase) {
  advancePhase(targetPhase);
  if (targetPhase === 1) {
    dom.roomEditorCanvas.hidden = true;
    dom.plannerCanvas.hidden = true;
  } else if (targetPhase === 2) {
    dom.roomEditorCanvas.hidden = false;
    dom.plannerCanvas.hidden = true;
    if (roomEditor) roomEditor.render();
  } else if (targetPhase === 3 || targetPhase === 4) {
    dom.roomEditorCanvas.hidden = true;
    dom.plannerCanvas.hidden = false;
    
    // Auto-confirm rooms if planner isn't initialized yet
    if (!planner && appState.detectedRooms) {
      appState.confirmedRooms = roomEditor ? roomEditor.getRooms() : appState.detectedRooms;
      planner = new PlannerCanvas(dom.plannerCanvas, {
        onStateChange: onSceneChange,
        onPinSelect: openPinPopover
      });
      planner.setFloorPlanImage(dom.floorBgCanvas);
      planner.setDetectedRooms(appState.confirmedRooms);
    }
    
    if (planner) planner.render();
    if (dom.chatPanel) dom.chatPanel.hidden = false;
  }
  
  if (targetPhase === 5) {
    showResultsView();
  }
}


// ─── All phase init + event handlers ────────────────────────────────────────
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
  dom.pinAngle?.addEventListener("input", onPinFieldChange);
  dom.pinFov.addEventListener("input", onPinFieldChange);
  dom.pinBrief.addEventListener("input", onPinFieldChange);

  // Back buttons per phase
  el("backBtn2")?.addEventListener("click", () => goBack(1));
  el("backBtn3")?.addEventListener("click", () => goBack(2));
  el("backBtn4")?.addEventListener("click", () => goBack(3));

  // Results view: close → go back to phase 4 (edit)
  dom.closeOutput?.addEventListener("click", () => {
    hideResultsView();
    goBack(4);
  });

  // Regen inspiration image preview
  dom.regenInspirationInput?.addEventListener("change", () => {
    const files = Array.from(dom.regenInspirationInput.files || []);
    const previews = dom.regenInspirationPreviews;
    if (!previews) return;
    previews.innerHTML = "";
    files.forEach(f => {
      const img = document.createElement("img");
      img.className = "insp-thumb";
      const reader = new FileReader();
      reader.onload = e => { img.src = e.target.result; };
      reader.readAsDataURL(f);
      previews.appendChild(img);
    });
  });

  // Generate New Version button
  el("regenBtn")?.addEventListener("click", async () => {
    const regenBtn = el("regenBtn");
    const regenBrief = el("regenBriefInput")?.value?.trim();
    const newFiles = Array.from(dom.regenInspirationInput?.files || []);

    // Apply new brief to global brief field (used by onGenerate)
    if (regenBrief && dom.globalBrief) dom.globalBrief.value = regenBrief;

    // If new inspiration files uploaded, replace current inspiration
    if (newFiles.length > 0) {
      appState.inspirationFiles = newFiles;
      appState.storedInspirationUrls = []; // clear stored so new files take precedence
    }

    if (regenBtn) { regenBtn.disabled = true; regenBtn.textContent = "Generating new version…"; }
    el("resultsScroll")?.scrollTo({ top: 0, behavior: "smooth" });
    await onGenerate();
    if (regenBtn) { regenBtn.disabled = false; regenBtn.textContent = "✦ Generate New Version"; }
    // Reset regen inputs after generation
    if (dom.regenInspirationInput) dom.regenInspirationInput.value = "";
    if (dom.regenInspirationPreviews) dom.regenInspirationPreviews.innerHTML = "";
  });
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

  dom.downloadDeck?.addEventListener("click", () => {
    if (!window.DeckGenerator) return;
    openBoqEditPanel();
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

  // Clickable Checkpoint Pills and Panel Headers
  for (let i = 1; i <= 5; i++) {
    const pill = el(`pill${i}`);
    if (pill) {
      pill.style.cursor = "pointer";
      pill.addEventListener("click", () => {
        hideResultsView();
        goBack(i);
      });
    }
  }
  document.querySelectorAll(".panel-head").forEach((head, index) => {
    head.addEventListener("click", () => {
      const p = index + 1; // panels 1 to 4
      hideResultsView();
      goBack(p);
    });
  });

  // View existing renders button
  el("viewExistingRendersBtn")?.addEventListener("click", () => {
    if (appState.existingRendersData && appState.existingRendersData.length) {
      dom.resultsView.hidden = false;
    }
  });

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
    // Reset all state
    appState.projectId = generateUUID();
    appState.floorFile = null;
    appState.inspirationFiles = [];
    appState.storedInspirationUrls = [];
    appState.inspirationStoragePaths = [];
    appState.context = { propertyType: "Apartment", bhk: "2BHK", totalAreaM2: null, notes: "" };
    appState.detectedRooms = null;
    appState.confirmedRooms = null;
    appState.globalBoq = [];
    appState.currentVersionId = null;
    _allVersions = [];
    _activeCameraPins = [];
    _projectBoqItems = [];
    _inspirationDataUrls = [];

    // Reset UI
    el("projectNameInput").value = "";
    el("floorPlanName").textContent = "Click or drag floor plan PDF / image";
    el("floorPlan").value = "";
    el("inspirationNames").textContent = "Add inspiration images (optional)";
    el("inspirationImages").value = "";
    el("inspirationPreviews").innerHTML = "";
    restoreContextForm(appState.context);
    el("globalBrief").value = "";
    el("analyzeBtn").disabled = true;
    el("analysisChip").hidden = true;
    el("analysisSummaryWrap").hidden = true;
    el("roomChipList").innerHTML = "";
    el("pinsList").innerHTML = "";
    el("noPinsHint").hidden = false;

    // Reset canvas
    dom.canvasWrap.hidden = true;
    dom.canvasPlaceholder.hidden = false;
    if (roomEditor) roomEditor.setRooms([], 0, 0);
    if (planner) { planner.furniturePlacements = []; planner.cameraPins = []; planner.detectedRooms = []; planner.render?.(); }
    planner = null;
    const bgCtx = dom.floorBgCanvas?.getContext("2d");
    if (bgCtx) bgCtx.clearRect(0, 0, dom.floorBgCanvas.width, dom.floorBgCanvas.height);

    // Reset results
    hideResultsView();
    el("roomResults").innerHTML = "";
    el("statusBox").textContent = "";
    el("versionTabsBar").hidden = true;
    el("versionTabs").innerHTML = "";
    drawBoq([]);
    el("resultsInspirationStrip") && (el("resultsInspirationStrip").innerHTML = "");
    el("resultsInspiration") && (el("resultsInspiration").hidden = true);
    el("resultsBriefSection") && (el("resultsBriefSection").hidden = true);

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

    // Run analysis (rooms + dimensions)
    const analysis = await PA.analyzeFloorPlan(bgCanvas, appState.context);
    appState.detectedRooms = analysis.rooms || [];
    console.log(`[Poligrid] Floor plan analysis complete: ${appState.detectedRooms.length} rooms`);

    // Generate structural pricing as a separate, dedicated call
    dom.analysisChip.textContent = "Generating structural pricing…";
    let globalBoq = analysis.globalBoq || []; // fallback to whatever analysis returned
    try {
      const boqResult = await postJson("/api/project/generate-boq", {
        floorPlanBase64: bgCanvas.toDataURL("image/png"),
        rooms: appState.detectedRooms,
        context: { ...appState.context, totalAreaM2: analysis.totalAreaM2 }
      });
      if (boqResult.globalBoq && boqResult.globalBoq.length > 0) {
        globalBoq = boqResult.globalBoq;
      }
    } catch (e) {
      console.warn("[Poligrid] Structural BOQ generation failed, using analysis fallback:", e.message);
    }
    appState.globalBoq = globalBoq;
    _projectBoqItems = globalBoq;
    console.log(`[Poligrid] Structural BOQ: ${globalBoq.length} items`);

    // Persist floor plan image + analysis + structural BOQ to Supabase
    saveToDb("/api/project/save-analysis", {
      projectId: appState.projectId,
      floorPlanBase64: bgCanvas.toDataURL("image/png"),
      fileName: appState.floorFile?.name,
      analysis: { ...analysis, globalBoq },
      context: appState.context
    });

    dom.analysisChip.textContent = `✓ ${analysis.rooms.length} room(s) · ${analysis.bhkType || ""} · ${analysis.totalAreaM2 || "?"}m² · ${globalBoq.length} BOQ items`;
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
  // Debounce-save all pins so angle drags (and position drags) are persisted
  clearTimeout(_pinSaveTimer);
  _pinSaveTimer = setTimeout(saveAllPins, 800);
  // Sync angle field in open popover if user dragged the arrow tip on canvas
  if (activePinId && dom.pinAngle && !dom.pinPopover.hidden) {
    const activePin = planner?.cameraPins?.find(p => p.id === activePinId);
    if (activePin) dom.pinAngle.value = Math.round(activePin.angleDeg || 0);
  }
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
    const hasPhoto_badge = hasPhoto
      ? `<span class="pin-badge photo">📷 Photo</span>`
      : `<span class="pin-badge no-photo">No photo</span>`;
    item.innerHTML = `
      <div class="pin-item-head">
        ${hasPhoto ? `<img class="pin-item-thumb" src="${pin.photoDataUrl}" alt=""/>` : `<div class="pin-item-thumb-empty">📍</div>`}
        <div class="pin-item-info">
          <span class="pin-item-label">${escapeHtml(pin.roomLabel || "Untitled pin")}</span>
          <div class="pin-item-meta">${hasPhoto_badge} · ${Math.round(pin.angleDeg || 0)}° · FOV ${pin.fovDeg || 60}°</div>
        </div>
        <button class="pin-item-edit ghost-sm" data-id="${pin.id}">Edit</button>
      </div>
      ${pin.brief ? `<div class="pin-item-brief">${escapeHtml(pin.brief.slice(0, 60))}${pin.brief.length > 60 ? "…" : ""}</div>` : ""}`;
    item.querySelector(".pin-item-edit").addEventListener("click", () => openPinPopover(pin));
    dom.pinsList.appendChild(item);
  }
  dom.generateBtn.disabled = pins.length === 0;
}

function openPinPopover(pin) {
  activePinId = pin.id;
  dom.pinPopoverTitle.textContent = `Pin — ${pin.roomLabel || "Untitled"}`;
  dom.pinRoomLabel.value = pin.roomLabel || "";
  if (dom.pinAngle) dom.pinAngle.value = Math.round(pin.angleDeg || 0);
  dom.pinFov.value = pin.fovDeg || 60;
  dom.pinBrief.value = pin.brief || "";
  dom.pinPhotoPreview.hidden = !pin.photoDataUrl;
  if (pin.photoDataUrl) {
    dom.pinPhotoPreview.innerHTML = `<img src="${pin.photoDataUrl}" alt="Photo preview"/>`;
  }
  dom.pinPhotoInput.value = ""; // Always reset so change event fires even if same file
  dom.pinPopover.hidden = false;
}

function saveAllPins() {
  if (!planner || !appState.projectId) return;
  for (const pin of planner.cameraPins) {
    saveToDb("/api/project/save-pin", {
      projectId: appState.projectId,
      pin: {
        clientId: pin.id,
        xM: pin.xM, yM: pin.yM,
        angleDeg: pin.angleDeg, fovDeg: pin.fovDeg,
        roomLabel: pin.roomLabel, brief: pin.brief,
        existingPhotoPath: pin.existingPhotoPath || null
        // No photoDataUrl — server will preserve existing photo_storage_path
      }
    });
  }
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

    // Persist pin with photo to Supabase and capture the stored path
    const pin = planner.cameraPins?.find(p => p.id === activePinId);
    if (pin) {
      fetch("/api/project/save-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        })
      }).then(r => r.json()).then(data => {
        if (data.photoStoragePath && pin) pin.existingPhotoPath = data.photoStoragePath;
      }).catch(() => {});
    }
  };
  reader.readAsDataURL(file);
}

function onPinFieldChange() {
  if (!activePinId || !planner) return;
  const angleVal = dom.pinAngle ? (parseFloat(dom.pinAngle.value) || 0) : null;
  const updates = {
    roomLabel: dom.pinRoomLabel.value,
    fovDeg: parseFloat(dom.pinFov.value) || 60,
    brief: dom.pinBrief.value
  };
  if (angleVal !== null) updates.angleDeg = ((angleVal % 360) + 360) % 360;
  planner.updatePin(activePinId, updates);
  // Keep the angle input in sync with canvas (in case it was dragged and popover opened after)
  if (dom.pinAngle) {
    const pin = planner.cameraPins?.find(p => p.id === activePinId);
    if (pin) dom.pinAngle.value = Math.round(pin.angleDeg || 0);
  }
  planner.render();
  refreshPinsList();

  // Persist updated pin to Supabase (no photo data here — photos are saved by onPinPhotoUpload)
  const pin = planner.cameraPins?.find(p => p.id === activePinId);
  if (pin) {
    saveToDb("/api/project/save-pin", {
      projectId: appState.projectId,
      pin: {
        clientId: pin.id,
        xM: pin.xM, yM: pin.yM,
        angleDeg: pin.angleDeg, fovDeg: pin.fovDeg,
        roomLabel: pin.roomLabel, brief: pin.brief,
        existingPhotoPath: pin.existingPhotoPath || null
      }
    });
  }
}


// ─── Boot ────────────────────────────────────────────────────────────────────
(async () => {
  let profile;
  try {
    ({ profile } = await AuthClient.requireAuth(['sales', 'lead_designer', 'admin']));
  } catch {
    window.location.href = '/login';
    return;
  }

  AuthClient.renderUserChip(profile, document.getElementById('userChipWrap'));

  init();
  initBoqEditPanel();

  // URL-based routing
  const params = new URLSearchParams(location.search);
  const projectId = params.get('id');
  if (projectId) {
    // Linked directly to a project (e.g. from homepage)
    await loadProject(projectId);
  } else if (params.get('new')) {
    // "New project" shortcut — skip the picker and start fresh
    el('newProjectBtn')?.click();
  } else {
    showProjectPicker();
  }
})();
