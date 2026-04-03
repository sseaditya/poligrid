// ─── Results view helpers ─────────────────────────────────────────────────────

function showResultsView() {
  el("resultsView").hidden = false;
  // Pre-fill regen brief with current global brief
  const regenBriefInput = el("regenBriefInput");
  if (regenBriefInput) regenBriefInput.value = dom.globalBrief?.value || "";
  el("regenerateSection").hidden = false;
  const scroll = el("resultsScroll");
  if (scroll) scroll.scrollTop = 0;
}

function hideResultsView() {
  el("resultsView").hidden = true;
}

// ─── Version UI ────────────────────────────────────────────────────────────────

// Builds/re-builds the version tab bar. Activates the tab at `activeIndex` (default: last).
function renderVersionsUI(versions, cameraPins, activeIndex) {
  _allVersions = versions || [];
  _activeCameraPins = cameraPins || [];

  const bar = dom.versionTabsBar;
  const tabs = dom.versionTabs;
  if (!bar || !tabs) return;

  if (_allVersions.length === 0) { bar.hidden = true; return; }

  bar.hidden = false;
  tabs.innerHTML = "";

  _allVersions.forEach((v, idx) => {
    const tab = document.createElement("button");
    tab.className = "version-tab";
    tab.dataset.versionId = v.id;
    const date = new Date(v.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
    tab.innerHTML = `<span class="version-tab-num">V${v.version_number}</span><span class="version-tab-date">${date}</span>`;
    tab.addEventListener("click", () => {
      tabs.querySelectorAll(".version-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      showVersion(v);
    });
    tabs.appendChild(tab);
  });

  const targetIdx = activeIndex !== undefined ? activeIndex : _allVersions.length - 1;
  const tabEls = tabs.querySelectorAll(".version-tab");
  if (tabEls[targetIdx]) tabEls[targetIdx].classList.add("active");
}

// Renders the content for a specific version (renders, inspiration, brief, BOQ).
function showVersion(version) {
  if (!version) return;

  // Brief
  const briefSection = dom.resultsBriefSection;
  const briefText = dom.resultsBriefText;
  if (briefSection && briefText) {
    if (version.design_brief) {
      briefText.textContent = version.design_brief;
      briefSection.hidden = false;
    } else {
      briefSection.hidden = true;
    }
  }

  // Pre-fill regen brief so user can iterate
  const regenBriefInput = el("regenBriefInput");
  if (regenBriefInput) regenBriefInput.value = version.design_brief || dom.globalBrief?.value || "";

  // Inspiration strip
  const strip = el("resultsInspirationStrip");
  const inspSection = el("resultsInspiration");
  if (strip && inspSection) {
    strip.innerHTML = "";
    const urls = version.inspirationUrls || [];
    if (urls.length) {
      urls.forEach(url => {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "Inspiration";
        img.addEventListener("click", () => openLightbox(url));
        strip.appendChild(img);
      });
      inspSection.hidden = false;
    } else {
      inspSection.hidden = true;
    }
  }

  // Render cards
  dom.roomResults.innerHTML = "";
  const renders = version.renders || [];
  if (renders.length > 0) {
    drawVersionRenders(renders, _activeCameraPins);
  } else {
    dom.roomResults.innerHTML = '<p class="results-empty-msg">No renders saved for this version.</p>';
  }

  // BOQ: project-level (floor plan) + version-specific (furniture)
  const combinedBoq = [..._projectBoqItems, ...(version.boqItems || [])];
  drawBoq(combinedBoq);
  if (combinedBoq.length > 0) {
    dom.downloadBoq.disabled = false;
    if (dom.downloadDeck) dom.downloadDeck.disabled = false;
    latestArtifacts = buildArtifacts(planner?.getSceneState() || {}, combinedBoq);
    dom.downloadScene.disabled = false;
  }
}

// Draws render cards from DB render objects grouped by room.
function drawVersionRenders(renders, cameraPins) {
  // Group by room_label
  const roomMap = {};
  for (const r of renders) {
    const key = r.room_label || "Unknown Room";
    if (!roomMap[key]) roomMap[key] = [];
    roomMap[key].push(r);
  }

  for (const [roomLabel, roomRenders] of Object.entries(roomMap)) {
    const card = document.createElement("div");
    card.className = "render-room-card";

    // Find matching room dims
    const room = (appState.confirmedRooms || appState.detectedRooms || []).find(r => r.label === roomLabel || r.name === roomLabel);
    const w = room?.widthM, l = room?.lengthM;

    const header = document.createElement("div");
    header.className = "render-card-header";
    const headerMain = document.createElement("div");
    headerMain.className = "render-card-header-main";
    headerMain.innerHTML = `
      <h2 class="render-card-title">${escapeHtml(roomLabel)}</h2>
      ${w ? `<span class="render-card-meta">${parseFloat(w).toFixed(1)} × ${parseFloat(l).toFixed(1)} m</span>` : ""}`;
    header.appendChild(headerMain);
    const mapSnippet = buildFloorPlanSnippetForCard(roomLabel);
    if (mapSnippet) {
      const mapWrap = document.createElement("div");
      mapWrap.className = "render-card-mapwrap";
      const mapImg = document.createElement("img");
      mapImg.src = mapSnippet;
      mapImg.className = "render-card-minimap";
      mapImg.alt = "Floor plan";
      mapImg.addEventListener("click", () => openLightbox(mapSnippet));
      mapWrap.appendChild(mapImg);
      header.appendChild(mapWrap);
    }
    card.appendChild(header);

    roomRenders.forEach(render => {
      // Find matching camera pin to get reference photo URL and angle info
      const pin = (cameraPins || []).find(p => p.client_id === render.camera_pin_client_id);
      const refPhotoUrl = pin?.photo_url || null;

      const compareWrap = document.createElement("div");
      compareWrap.className = "render-compare-wrap";

      // BEFORE cell: reference photo, or floor plan snippet when no reference photo
      const beforeCell = document.createElement("div");
      beforeCell.className = "render-compare-cell";
      if (refPhotoUrl) {
        const beforeImg = document.createElement("img");
        beforeImg.src = refPhotoUrl;
        beforeImg.alt = "Reference photo";
        beforeImg.addEventListener("click", () => openLightbox(refPhotoUrl));
        beforeCell.appendChild(beforeImg);
        const lbl = document.createElement("span");
        lbl.className = "render-cell-label";
        lbl.textContent = "Reference";
        beforeCell.appendChild(lbl);
      } else {
        const lbl = document.createElement("span");
        lbl.className = "render-cell-label";
        lbl.textContent = "No reference photo";
        beforeCell.appendChild(lbl);
      }
      if (pin?.angle_deg !== undefined) {
        const angleBadge = document.createElement("span");
        angleBadge.className = "render-cell-angle";
        angleBadge.textContent = `${pin.angle_deg}° · ${pin.fov_deg || 60}° FOV`;
        beforeCell.appendChild(angleBadge);
      }
      compareWrap.appendChild(beforeCell);

      const afterCell = document.createElement("div");
      afterCell.className = "render-compare-cell";
      const afterImg = document.createElement("img");
      afterImg.src = render.url;
      afterImg.alt = `Furnished — ${roomLabel}`;
      afterImg.addEventListener("click", () => openLightbox(render.url));
      afterCell.appendChild(afterImg);
      const lbl = document.createElement("span");
      lbl.className = "render-cell-label";
      lbl.textContent = "Furnished";
      afterCell.appendChild(lbl);
      compareWrap.appendChild(afterCell);

      card.appendChild(compareWrap);
    });

    dom.roomResults.appendChild(card);
  }
}

// Returns inspiration data URLs: from uploaded files, stored public URLs (fetched), or [].
async function getInspirationDataUrls() {
  if (appState.inspirationFiles.length > 0) {
    return Promise.all(appState.inspirationFiles.map(f => readDataUrl(f)));
  }
  if (appState.storedInspirationUrls.length > 0) {
    const results = await Promise.allSettled(
      appState.storedInspirationUrls.map(url => loadUrlToDataUrl(url))
    );
    return results.filter(r => r.status === "fulfilled" && r.value).map(r => r.value);
  }
  return [];
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function openLightbox(src) {
  const lb = document.createElement("div");
  lb.className = "img-lightbox";
  lb.innerHTML = `<img src="${src}" alt=""/><button class="img-lightbox-close">✕</button>`;
  lb.addEventListener("click", e => {
    if (e.target === lb || e.target.classList.contains("img-lightbox-close")) lb.remove();
  });
  document.body.appendChild(lb);
}

// ─── Live render cards (during generation) ───────────────────────────────────

function drawRoomResult(result) {
  const roomName = escapeHtml(result.room.name || result.room.label);
  const w = result.room.widthM, l = result.room.lengthM;

  // Search for an existing card for this room
  let card = null;
  const existingCards = Array.from(dom.roomResults.querySelectorAll(".render-room-card"));
  for (const c of existingCards) {
    const title = c.querySelector(".render-card-title");
    if (title && title.textContent === roomName) {
      card = c;
      break;
    }
  }

  if (!card) {
    card = document.createElement("div");
    card.className = "render-room-card";

    // Header with floor plan minimap
    const header = document.createElement("div");
    header.className = "render-card-header";
    const headerMain = document.createElement("div");
    headerMain.className = "render-card-header-main";
    headerMain.innerHTML = `
      <h2 class="render-card-title">${roomName}</h2>
      <span class="render-card-meta">${w ? w.toFixed(1) + " × " + l.toFixed(1) + " m" : ""} · ${escapeHtml(result.laminate?.name || "")}</span>`;
    header.appendChild(headerMain);
    const mapSnippet = buildFloorPlanSnippetForCard(result.room.label);
    if (mapSnippet) {
      const mapWrap = document.createElement("div");
      mapWrap.className = "render-card-mapwrap";
      const mapImg = document.createElement("img");
      mapImg.src = mapSnippet;
      mapImg.className = "render-card-minimap";
      mapImg.alt = "Floor plan";
      mapImg.addEventListener("click", () => openLightbox(mapSnippet));
      mapWrap.appendChild(mapImg);
      header.appendChild(mapWrap);
    }
    card.appendChild(header);
    dom.roomResults.appendChild(card);
  }

  // Prepend new renders to the top of this room's card (below header)
  let insertRef = card.children.length > 1 ? card.children[1] : null;

  result.renders.forEach((render, i) => {
    const sourcePhoto = result.sourcePhotos?.[i] || null;
    const pinInfo = result.cameraPins?.[i] || {};

    const compareWrap = document.createElement("div");
    compareWrap.className = "render-compare-wrap";

    // BEFORE cell: reference photo, or floor plan snippet when no reference photo
    const beforeCell = document.createElement("div");
    beforeCell.className = "render-compare-cell";
    if (sourcePhoto) {
      const beforeImg = document.createElement("img");
      beforeImg.src = sourcePhoto;
      beforeImg.alt = "Reference photo";
      beforeImg.addEventListener("click", () => openLightbox(sourcePhoto));
      beforeCell.appendChild(beforeImg);
      const beforeLabel = document.createElement("span");
      beforeLabel.className = "render-cell-label";
      beforeLabel.textContent = "Reference";
      beforeCell.appendChild(beforeLabel);
    } else {
      const beforeLabel = document.createElement("span");
      beforeLabel.className = "render-cell-label";
      beforeLabel.textContent = "No reference photo";
      beforeCell.appendChild(beforeLabel);
    }
    if (pinInfo.angleDeg !== undefined) {
      const angleBadge = document.createElement("span");
      angleBadge.className = "render-cell-angle";
      angleBadge.textContent = `${pinInfo.angleDeg}° · ${pinInfo.fovDeg || 60}° FOV`;
      beforeCell.appendChild(angleBadge);
    }
    compareWrap.appendChild(beforeCell);

    // AFTER cell
    const afterCell = document.createElement("div");
    afterCell.className = "render-compare-cell";
    const afterImg = document.createElement("img");
    afterImg.src = render.dataUrl;
    afterImg.alt = `Furnished — ${result.room.label}`;
    afterImg.addEventListener("click", () => openLightbox(render.dataUrl));
    afterCell.appendChild(afterImg);
    const afterLabel = document.createElement("span");
    afterLabel.className = "render-cell-label";
    afterLabel.textContent = "Furnished";
    afterCell.appendChild(afterLabel);
    compareWrap.appendChild(afterCell);

    if (insertRef) {
      card.insertBefore(compareWrap, insertRef);
    } else {
      card.appendChild(compareWrap);
    }
  });
}

