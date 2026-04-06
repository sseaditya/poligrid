// ─── Project Picker ───────────────────────────────────────────────────────────

function showProjectPicker() {
  el("projectPicker").classList.remove("hidden");
  loadProjectList();
}

function hideProjectPicker() {
  el("projectPicker").classList.add("hidden");
}

async function loadProjectList() {
  const list = el("projectPickerList");
  list.innerHTML = '<div class="proj-loading">Loading projects…</div>';
  try {
    const headers = await AuthClient.authHeader();
    const res = await fetch("/api/project/list", { headers });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    renderProjectCards(data.projects || []);
  } catch (e) {
    list.innerHTML = `<div class="proj-loading">Could not load projects: ${e.message}</div>`;
  }
}

const PROJ_STATUS_META = {
  active:        { label: "Active",         cls: "badge-proj-active" },
  advanced_paid: { label: "Advanced Paid",  cls: "badge-proj-adv-paid" },
  in_progress:   { label: "In Progress",    cls: "badge-proj-active" },
  completed:     { label: "Completed",      cls: "badge-proj-completed" },
  on_hold:       { label: "On Hold",        cls: "badge-proj-on_hold" },
  cancelled:     { label: "Cancelled",      cls: "badge-proj-cancelled" },
};

function renderProjectCards(projects) {
  const list = el("projectPickerList");
  if (!projects.length) {
    list.innerHTML = '<div class="proj-empty">No projects yet. Click <strong>+ New Project</strong> to start.</div>';
    return;
  }
  list.innerHTML = "";
  const profile = window._authProfile;
  const isSalesOrAdmin = profile && ["sales", "admin"].includes(profile.role);

  for (const p of projects) {
    const card = document.createElement("div");
    card.className = "proj-card";
    card.dataset.id = p.id;
    const date = new Date(p.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const meta = [p.property_type, p.bhk_type || p.bhk, p.total_area_m2 ? p.total_area_m2 + " m²" : null].filter(Boolean).join(" · ");
    const statusMeta = PROJ_STATUS_META[p.status] || null;

    // "Mark Advanced Paid" shown to sales/admin if not already advanced_paid or completed
    const showAdvPaidBtn = isSalesOrAdmin &&
      p.status !== "advanced_paid" &&
      p.status !== "completed" &&
      p.status !== "cancelled";

    card.innerHTML = `
      <div class="proj-card-thumb">
        ${p.thumbnail_url ? `<img src="${p.thumbnail_url}" alt="" loading="lazy" />` : '<div class="proj-card-thumb-empty">🏠</div>'}
      </div>
      <div class="proj-card-body">
        <div class="proj-card-name-row">
          <span class="proj-card-name">${escapeHtml(p.name || "Untitled project")}</span>
          ${statusMeta ? `<span class="badge ${statusMeta.cls} proj-status-badge">${statusMeta.label}</span>` : ""}
        </div>
        <div class="proj-card-meta">${escapeHtml(meta)}</div>
        ${p.summary ? `<div class="proj-card-summary">${escapeHtml(p.summary)}</div>` : ""}
        <div class="proj-card-footer">
          <span class="proj-card-date">${date}</span>
          ${showAdvPaidBtn ? `<button class="ghost-sm adv-paid-btn" data-id="${p.id}">Mark Advanced Paid</button>` : ""}
          <a class="ghost-sm" href="/designer.html?projectId=${p.id}" onclick="event.stopPropagation()">Drawings</a>
        </div>
      </div>
    `;

    card.addEventListener("click", () => loadProject(p.id));

    // "Mark Advanced Paid" should NOT open the project
    card.querySelectorAll(".adv-paid-btn").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        btn.disabled = true;
        btn.textContent = "Saving…";
        try {
          const headers = await AuthClient.authHeader();
          const res = await fetch("/api/project/update-status", {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ projectId: p.id, status: "advanced_paid" }),
          });
          if (!res.ok) throw new Error((await res.json()).error);
          p.status = "advanced_paid";
          // Re-render just this card's badge and button
          const badgeEl = card.querySelector(".proj-status-badge");
          const footerMeta = PROJ_STATUS_META["advanced_paid"];
          if (badgeEl) {
            badgeEl.className = `badge ${footerMeta.cls} proj-status-badge`;
            badgeEl.textContent = footerMeta.label;
          } else {
            card.querySelector(".proj-card-name-row").insertAdjacentHTML(
              "beforeend",
              `<span class="badge ${footerMeta.cls} proj-status-badge">${footerMeta.label}</span>`
            );
          }
          btn.remove();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "Mark Advanced Paid";
          alert("Failed: " + err.message);
        }
      });
    });

    list.appendChild(card);
  }
}

async function loadProject(id) {
  const list = el("projectPickerList");
  list.innerHTML = '<div class="proj-loading">Opening project…</div>';
  try {
    const res = await fetch(`/api/project/load?id=${id}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const proj = data.project;

    // Reset app state for this project — wipe ALL stale data before loading new project
    appState.projectId = id;
    appState.floorFile = null;
    appState.inspirationFiles = [];
    appState.storedInspirationUrls = [];
    appState.inspirationStoragePaths = [];
    appState.detectedRooms = null;
    appState.confirmedRooms = null;
    appState.globalBoq = [];
    appState.currentVersionId = null;
    _allVersions = [];
    _activeCameraPins = [];
    _projectBoqItems = [];
    _inspirationDataUrls = [];
    planner = null;
    roomEditor = null;
    latestArtifacts = null;

    // Clear results UI so no old project data is ever visible
    hideResultsView();
    el("roomResults").innerHTML = "";
    el("versionTabsBar").hidden = true;
    el("versionTabs").innerHTML = "";
    drawBoq([]);
    el("resultsInspirationStrip") && (el("resultsInspirationStrip").innerHTML = "");
    el("resultsInspiration") && (el("resultsInspiration").hidden = true);
    el("resultsBriefSection") && (el("resultsBriefSection").hidden = true);

    // Restore context
    appState.context = {
      propertyType: proj.property_type || "Apartment",
      bhk: proj.bhk || "2BHK",
      totalAreaM2: proj.total_area_m2 || null,
      notes: proj.notes || ""
    };
    restoreContextForm(appState.context);
    el("projectNameInput").value = proj.name || "";
    hideProjectPicker();

    if (!data.floorPlan?.url) {
      advancePhase(1);
      return;
    }

    // Load floor plan image to canvas
    const bgCanvas = dom.floorBgCanvas;
    try {
      await loadImageUrlToCanvas(data.floorPlan.url, bgCanvas);
    } catch (e) {
      console.warn("Could not load floor plan image:", e);
      advancePhase(1);
      return;
    }

    dom.roomEditorCanvas.width = bgCanvas.width;
    dom.roomEditorCanvas.height = bgCanvas.height;
    dom.canvasPlaceholder.hidden = true;
    dom.canvasWrap.hidden = false;

    // Restore rooms and project-level BOQ (floor plan analysis)
    const rooms = (data.rooms || []).map(dbRoomToAppRoom);
    appState.detectedRooms = rooms;
    appState.confirmedRooms = rooms;
    appState.globalBoq = (data.boqItems || []).map(
      ({ category, item, qty, unit, rate, amount }) => ({ category, item, qty, unit, rate, amount })
    );
    _projectBoqItems = appState.globalBoq;

    // Store project-level inspiration URLs and storage paths (for reuse when regenerating)
    appState.storedInspirationUrls = (data.inspirationImages || []).map(i => i.url).filter(Boolean);
    appState.inspirationStoragePaths = (data.inspirationImages || []).map(i => i.storage_path).filter(Boolean);

    // Restore inspiration thumbnails in the phase 1 UI
    if (appState.storedInspirationUrls.length > 0) {
      dom.inspirationNames.textContent = `${appState.storedInspirationUrls.length} image(s) saved`;
      dom.inspirationPreviews.innerHTML = "";
      appState.storedInspirationUrls.forEach(url => {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "Inspiration";
        img.className = "insp-thumb";
        dom.inspirationPreviews.appendChild(img);
      });
    }

    // Store camera pins (DB format with photo_url) for render display
    _activeCameraPins = data.cameraPins || [];

    // Init RoomEditor
    roomEditor = new RoomEditor(dom.roomEditorCanvas, bgCanvas, {
      onRoomsChange: onRoomsChange,
      onSelect: onRoomSelected
    });
    roomEditor.setRooms(rooms, bgCanvas.width, bgCanvas.height);
    buildRoomChips(rooms);

    dom.analysisChip.hidden = false;
    dom.analysisChip.textContent = `✓ ${rooms.length} room(s) · ${proj.bhk_type || proj.bhk || ""} · ${proj.total_area_m2 || "?"}m²`;
    dom.analysisSummaryText.textContent = proj.summary || "";
    dom.analysisSummaryWrap.hidden = !proj.summary;

    advancePhase(2);

    // Restore planner and pins if camera pins exist
    if (data.cameraPins && data.cameraPins.length > 0) {
      dom.roomEditorCanvas.hidden = true;
      dom.plannerCanvas.hidden = false;
      dom.plannerCanvas.width = bgCanvas.width;
      dom.plannerCanvas.height = bgCanvas.height;

      planner = new PlannerCanvas(dom.plannerCanvas, {
        onStateChange: onSceneChange,
        onPinSelect: openPinPopover
      });
      planner.setFloorPlanImage(bgCanvas);
      planner.setDetectedRooms(rooms);

      planner.furniturePlacements = (data.furniturePlacements || []).map(p => ({
        id: p.client_id || generateUUID(),
        moduleId: p.module_id || "custom",
        label: p.label || "Item",
        type: p.type || "other",
        roomLabel: p.room_label || "",
        roomType: p.room_type || "",
        xM: p.x_m || 1, yM: p.y_m || 1,
        wM: p.w_m || 1, dM: p.d_m || 0.6, hM: p.h_m || 0.9,
        rotationY: p.rotation_y || 0,
        wall: p.wall || "south",
        color: p.color || FURN_COLORS[0],
        source: p.source || "manual"
      }));

      planner.cameraPins = data.cameraPins.map(p => ({
        id: p.client_id,
        xM: p.x_m || 0, yM: p.y_m || 0,
        angleDeg: p.angle_deg || 0,
        fovDeg: p.fov_deg || 60,
        roomLabel: p.room_label || "",
        brief: p.brief || "",
        photoFile: null,
        photoDataUrl: null,
        existingPhotoPath: p.photo_storage_path || null
      }));

      // Load pin photos in background (for editing; render display uses photo_url from DB)
      for (const dbPin of data.cameraPins) {
        if (!dbPin.photo_url) continue;
        loadUrlToDataUrl(dbPin.photo_url).then(dataUrl => {
          if (!dataUrl || !planner) return;
          const pin = planner.cameraPins.find(p => p.id === dbPin.client_id);
          if (pin) { pin.photoDataUrl = dataUrl; planner.render(); refreshPinsList(); }
        }).catch(() => {});
      }

      planner.render();
      refreshPinsList();
      if (dom.chatPanel) dom.chatPanel.hidden = false;
      if (proj.global_brief) dom.globalBrief.value = proj.global_brief;

      // Advance to phase 4 (generate panel) so all phase pills are enabled
      advancePhase(4);

      // If the project has saved versions with renders, show results view
      const versions = data.versions || [];
      const hasRenders = versions.some(v => v.renders && v.renders.length > 0);
      if (versions.length > 0 && hasRenders) {
        showResultsView();
        renderVersionsUI(versions, data.cameraPins);
        // Show the latest version
        const latest = versions[versions.length - 1];
        showVersion(latest);
      }
    }

  } catch (err) {
    console.error("loadProject failed:", err);
    list.innerHTML = `<div class="proj-loading">⚠ Failed to load: ${err.message}</div>`;
  }
}

// Convert a DB room row (snake_case columns) back to the app room shape
