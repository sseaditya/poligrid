// ─── Phase 5: Generate renders + BOQ ─────────────────────────────────────────

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
  dom.generateBtn.disabled = true;
  dom.generateBtn.textContent = "Generating…";
  dom.generateStatus.hidden = false;
  dom.generateStatus.textContent = "Preparing renders…";
  dom.statusBox.textContent = "Loading inspiration images…";

  try {
    // Resolve inspiration: from uploaded files or stored public URLs (for loaded projects)
    const inspirationDataUrls = await getInspirationDataUrls();
    _inspirationDataUrls = inspirationDataUrls;

    // Create a new project version before generation starts
    dom.statusBox.textContent = "Creating design version…";
    appState.currentVersionId = null;
    try {
      let regenImages = null;
      if (appState.inspirationFiles.length > 0) {
        regenImages = await Promise.all(appState.inspirationFiles.map(async f => ({
          base64: await readDataUrl(f),
          mimeType: f.type || "image/jpeg",
          fileName: f.name
        })));
      }
      const vRes = await postJson("/api/project/create-version", {
        projectId: appState.projectId,
        designBrief: globalBrief,
        regenInspirationImages: regenImages,
        // When no new files, lock the current stored paths so the version always has an explicit reference
        regenExistingInspirationPaths: !regenImages && appState.inspirationStoragePaths.length
          ? appState.inspirationStoragePaths
          : null
      });
      appState.currentVersionId = vRes.version?.id || null;
    } catch (e) {
      console.warn("[versions] Failed to create version:", e.message);
    }

    showResultsView();
    dom.roomResults.innerHTML = "";

    // Extract inspiration style AFTER results panel opens so it's visible in the logger
    dom.statusBox.textContent = "Analysing inspiration style…";
    console.log(`[Poligrid] extractInspirationStyle → POST /api/inspire/extract-furnish-style (${inspirationDataUrls.length} images)`);
    const precomputedStyleGuidance = await extractInspirationStyle(inspirationDataUrls);
    console.log(`[Poligrid] extractInspirationStyle ✓ ${precomputedStyleGuidance.length} chars`);

    const roomGroups = {};
    for (const src of renderSources) {
      if (!roomGroups[src.roomLabel]) roomGroups[src.roomLabel] = [];
      roomGroups[src.roomLabel].push(src);
    }

    const allRooms = appState.confirmedRooms || appState.detectedRooms || [];

    const roomResults = [];
    for (const [roomLabel, srcs] of Object.entries(roomGroups)) {
      const statusMsg = `Generating render: ${roomLabel}…`;
      dom.generateStatus.textContent = statusMsg;
      dom.statusBox.textContent = statusMsg;
      try {
        const targetRoom = allRooms.find(r => r.label === roomLabel || r.name === roomLabel);
        const floorPlanBase64 = buildRoomFloorPlanSnippet(targetRoom, allRooms);
        const result = await generateRoom(srcs, inspirationDataUrls, floorPlanBase64, precomputedStyleGuidance);
        roomResults.push(result);
        drawRoomResult(result);
      } catch (err) {
        console.error(`Failed ${roomLabel}:`, err);
        dom.statusBox.textContent += `⚠ ${roomLabel}: ${err.message}\n`;
      }
    }

    // BOQ = floor plan structural items + furniture from AI renders (HYD premium pricing)
    const finalBoq = [...(appState.globalBoq || [])];

    // Add furniture from AI renders — use AI-provided rateINR, fall back to label-based lookup
    for (const result of roomResults) {
      if (!Array.isArray(result.placements)) continue;
      const seen = new Set();
      for (const p of result.placements) {
        const key = `${result.room.label}:${(p.label || '').toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // AI provides rateINR and category; pricePlacement is the fallback
        const aiRate = p.rateINR && p.rateINR > 0 ? p.rateINR : null;
        const { cat, rate: fallbackRate } = pricePlacement(p);
        const cat_ = p.category || cat;
        const rate = aiRate || fallbackRate;
        finalBoq.push({
          category: cat_,
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
    if (dom.downloadDeck) dom.downloadDeck.disabled = false;
    dom.generateStatus.textContent = "✓ Generation complete";
    dom.statusBox.textContent = "";

    // Persist furniture BOQ (version-specific) and placements
    const furnitureBoq = finalBoq.filter(b =>
      b.category === "Modular furniture" || b.category === "Loose furniture"
    );
    saveToDb("/api/project/save-boq", {
      projectId: appState.projectId,
      boqItems: furnitureBoq,
      versionId: appState.currentVersionId || null
    });
    saveToDb("/api/project/save-placements", {
      projectId: appState.projectId,
      placements: planner?.furniturePlacements || []
    });

    // Refresh version tabs so the new version appears
    try {
      const freshData = await fetch(`/api/project/versions?id=${appState.projectId}`).then(r => r.json());
      if (freshData.versions) {
        _projectBoqItems = appState.globalBoq || [];
        renderVersionsUI(freshData.versions, _activeCameraPins, freshData.versions.length - 1);
        // Populate inspiration for the newly rendered version using current _inspirationDataUrls
        const latestVer = freshData.versions[freshData.versions.length - 1];
        if (latestVer) {
          // Merge in-memory inspiration URLs (data URLs from current session)
          latestVer.inspirationUrls = _inspirationDataUrls.length
            ? _inspirationDataUrls
            : latestVer.inspirationUrls;
          showVersion(latestVer);
        }
      }
    } catch (e) {
      console.warn("[versions] Failed to refresh version tabs:", e.message);
    }

  } catch (err) {
    dom.generateStatus.textContent = `⚠ ${err.message}`;
    console.error(err);
  } finally {
    dom.generateBtn.disabled = false;
    dom.generateBtn.textContent = "✦ Generate Renders + BOQ";
  }
}

// Builds a cropped+composited floor plan snippet for a target room.
// Composites the BG canvas + room editor overlay, then crops to the target
// room bbox expanded by ~50% padding so neighbouring rooms are visible.
// Falls back to the full composited floor plan if no bbox is available.
function buildRoomFloorPlanSnippet(targetRoom, allRooms) {
  const bgCanvas = dom.floorBgCanvas;
  const overlayCanvas = document.getElementById("roomEditorCanvas");
  if (!bgCanvas || bgCanvas.width === 0) return "";

  // Composite BG + overlay + planner (camera FOV cones) into a temp canvas
  const comp = document.createElement("canvas");
  comp.width  = bgCanvas.width;
  comp.height = bgCanvas.height;
  const ctx = comp.getContext("2d");
  ctx.drawImage(bgCanvas, 0, 0);
  if (overlayCanvas && overlayCanvas.width === bgCanvas.width) {
    ctx.drawImage(overlayCanvas, 0, 0);
  }
  // Include planner canvas so camera pins + FOV cones are visible to the AI
  const plannerCv = dom.plannerCanvas;
  if (plannerCv && !plannerCv.hidden && plannerCv.width === bgCanvas.width) {
    ctx.drawImage(plannerCv, 0, 0);
  }

  // If no bbox, return full composited image
  if (!targetRoom?.bbox) return comp.toDataURL("image/png");

  const W = comp.width, H = comp.height;
  const b = targetRoom.bbox;

  // Find bounding box that also encloses all adjacent rooms (rooms that share a wall label)
  const adjacentLabels = new Set();
  (targetRoom.walls || []).forEach(w => {
    if (w.adjacentRoomLabel) adjacentLabels.add(w.adjacentRoomLabel);
  });

  let minX = b.xPct, minY = b.yPct;
  let maxX = b.xPct + b.wPct, maxY = b.yPct + b.hPct;

  for (const room of (allRooms || [])) {
    if (!room.bbox) continue;
    if (room === targetRoom || adjacentLabels.has(room.label) || adjacentLabels.has(room.name)) {
      minX = Math.min(minX, room.bbox.xPct);
      minY = Math.min(minY, room.bbox.yPct);
      maxX = Math.max(maxX, room.bbox.xPct + room.bbox.wPct);
      maxY = Math.max(maxY, room.bbox.yPct + room.bbox.hPct);
    }
  }

  // Add 30% padding around the combined region
  const padX = (maxX - minX) * 0.30, padY = (maxY - minY) * 0.30;
  const cx = Math.max(0, (minX - padX) * W);
  const cy = Math.max(0, (minY - padY) * H);
  const cw = Math.min(W - cx, (maxX - minX + padX * 2) * W);
  const ch = Math.min(H - cy, (maxY - minY + padY * 2) * H);

  // Crop to a square output (max 800px) to keep token cost low
  const size = Math.min(800, Math.max(cw, ch));
  const out = document.createElement("canvas");
  out.width = size; out.height = size;
  const octx = out.getContext("2d");
  octx.fillStyle = "#f5f3ee";
  octx.fillRect(0, 0, size, size);
  // Center the crop inside the square
  const scale = Math.min(size / cw, size / ch);
  const dx = (size - cw * scale) / 2;
  const dy = (size - ch * scale) / 2;
  octx.drawImage(comp, cx, cy, cw, ch, dx, dy, cw * scale, ch * scale);

  return out.toDataURL("image/jpeg", 0.88);
}

// Builds a small floor plan snippet for render card display — returns dataUrl or "".
function buildFloorPlanSnippetForCard(roomLabel) {
  const allRooms = appState.confirmedRooms || appState.detectedRooms || [];
  const targetRoom = allRooms.find(r => r.label === roomLabel || r.name === roomLabel);
  return buildRoomFloorPlanSnippet(targetRoom, allRooms);
}

// Extracts inspiration style guidance once (before the per-room loop) to avoid redundant API calls.
async function extractInspirationStyle(inspirationDataUrls) {
  if (!inspirationDataUrls || inspirationDataUrls.length === 0) return "";
  try {
    const res = await postJson("/api/inspire/extract-furnish-style", {
      inspirationBase64: inspirationDataUrls,
      visionModel: "gpt-5.4"
    });
    return res.styleGuidance || "";
  } catch (e) {
    console.warn("Inspiration style pre-extraction failed:", e.message);
    return "";
  }
}

async function generateRoom(srcs, inspirationDataUrls, floorPlanBase64, precomputedStyleGuidance) {
  const mainSrc = srcs[0];

  const renders = [];
  const placements = []; // Accumulated across all views for BOQ

  const laminate = { name: "Matte Walnut", color: "#5a4d41", ratePerSqFt: 94 }; // default mock for BOQ

  for (let i = 0; i < srcs.length; i++) {
    const src = srcs[i];
    dom.generateStatus.textContent = `Generating: ${src.roomLabel} (${i + 1}/${srcs.length})…`;

    // Both image-to-image (with photo) and text-to-image (without photo) use the same endpoint now!
    console.log(`[Poligrid] furnish-room → POST /api/furnish-room room=${src.roomLabel} hasPhoto=${!!src.photoDataUrl} inspirationImages=${inspirationDataUrls.length}`);
    const res = await postJson("/api/furnish-room", {
      emptyRoomBase64: src.photoDataUrl || "",
      inspirationBase64: inspirationDataUrls,
      precomputedStyleGuidance: precomputedStyleGuidance || "",
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

    // Persist render image to Supabase (link to current version)
    saveToDb("/api/project/save-render", {
      projectId: appState.projectId,
      pinClientId: src.pinId || null,
      roomLabel: src.roomLabel,
      dataUrl: finalDataUrl,
      modelUsed: "gpt-image-1.5",
      furnitureList: res.furnitureList || [],
      generationType: src.photoDataUrl ? "edit" : "generate",
      versionId: appState.currentVersionId || null
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
    laminate, style: {}, placements, renders,
    sourcePhotos: srcs.map(s => s.photoDataUrl || null),
    cameraPins: srcs.map(s => ({ xM: s.xM, yM: s.yM, angleDeg: s.angleDeg, fovDeg: s.fovDeg }))
  };
}

// ─── Draw Output ───────────────────────────────────────────────────────────────
