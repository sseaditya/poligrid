// ─── BOQ display + edit panel ────────────────────────────────────────────────

let _boqEditMode = 'edit';     // 'edit' | 'pdf'
let _boqEditCategory = null;   // null = all, string = filter to one category

function openBoqEditPanel(category = null, mode = 'edit') {
  _boqEditMode = mode;
  _boqEditCategory = category;

  // Build working copy, tagging each item with its origin so we can split on save
  const latestVer = _allVersions[_allVersions.length - 1] || {};
  const allItems = [
    ..._projectBoqItems.map(it => ({ ...it, _origin: "project" })),
    ...(latestVer.boqItems || []).map(it => ({ ...it, _origin: "version" }))
  ];

  // Filter to section if in edit mode with a category
  _editBoqData = category
    ? allItems.filter(it => (it.category || "Uncategorized") === category)
    : allItems;

  // Update title and hint
  const titleEl = el("boqEditTitle");
  const hintEl  = el("boqEditHint");
  if (mode === 'edit') {
    if (titleEl) titleEl.textContent = category ? `Edit: ${category}` : "Edit Items";
    if (hintEl)  hintEl.textContent  = category ? `Showing items in "${category}" only.` : "Edit all line items.";
  } else {
    if (titleEl) titleEl.textContent = "Export to PDF";
    if (hintEl)  hintEl.textContent  = "Changes here are only for this PDF unless you choose to save them.";
  }

  // Show/hide buttons per mode
  const saveBtn  = el("boqEditSave");
  const genBtn   = el("boqEditGenerate");
  const saveNote = el("boqEditSaveNote");
  if (saveBtn)  saveBtn.hidden  = (mode === 'pdf');
  if (genBtn)   genBtn.hidden   = (mode === 'edit');
  if (saveNote) saveNote.hidden = (mode === 'edit');

  // Populate project name field
  const nameInput = el("boqEditProjectName");
  if (nameInput) nameInput.value = el("projectNameInput")?.value?.trim() || "Interior Design Proposal";

  renderEditTable();
  el("boqEditOverlay").hidden = false;
}

function closeBoqEditPanel() {
  el("boqEditOverlay").hidden = true;
  _editBoqData = [];
}

function renderEditTable() {
  const tbody = el("boqEditBody");
  tbody.innerHTML = "";
  for (let i = 0; i < _editBoqData.length; i++) {
    tbody.appendChild(buildEditRow(i));
  }
  recalcEditTotal();
}

function buildEditRow(i) {
  const it = _editBoqData[i];
  const tr = document.createElement("tr");
  tr.dataset.idx = i;

  const fields = [
    { key: "category", type: "text",   width: "130px" },
    { key: "item",     type: "text",   width: "auto"  },
    { key: "qty",      type: "number", width: "60px"  },
    { key: "unit",     type: "text",   width: "60px"  },
    { key: "rate",     type: "number", width: "80px"  },
  ];

  for (const f of fields) {
    const td = document.createElement("td");
    const inp = document.createElement("input");
    inp.type = f.type;
    inp.className = "boq-edit-cell";
    inp.value = it[f.key] ?? "";
    if (f.width !== "auto") inp.style.width = f.width;
    if (f.type === "number") { inp.min = "0"; inp.step = "any"; }
    inp.addEventListener("input", () => {
      _editBoqData[i][f.key] = f.type === "number" ? parseFloat(inp.value) || 0 : inp.value;
      if (f.key === "qty" || f.key === "rate") {
        _editBoqData[i].amount = (_editBoqData[i].qty || 0) * (_editBoqData[i].rate || 0);
        // Refresh amount cell in same row
        const amtCell = tr.querySelector(".amount-cell");
        if (amtCell) amtCell.value = _editBoqData[i].amount.toLocaleString("en-IN");
        recalcEditTotal();
      }
    });
    td.appendChild(inp);
    tr.appendChild(td);
  }

  // Amount (read-only)
  const amtTd = document.createElement("td");
  const amtInp = document.createElement("input");
  amtInp.type = "text";
  amtInp.className = "boq-edit-cell amount-cell";
  amtInp.readOnly = true;
  amtInp.style.width = "90px";
  amtInp.value = (parseFloat(it.amount) || 0).toLocaleString("en-IN");
  amtTd.appendChild(amtInp);
  tr.appendChild(amtTd);

  // Delete button
  const delTd = document.createElement("td");
  const delBtn = document.createElement("button");
  delBtn.className = "boq-edit-del-btn";
  delBtn.title = "Remove row";
  delBtn.textContent = "×";
  delBtn.addEventListener("click", () => {
    _editBoqData.splice(i, 1);
    renderEditTable();
  });
  delTd.appendChild(delBtn);
  tr.appendChild(delTd);

  return tr;
}

function recalcEditTotal() {
  const total = _editBoqData.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
  const totalEl = el("boqEditGrandTotal");
  if (totalEl) totalEl.textContent = "₹" + total.toLocaleString("en-IN");
}

async function generatePdfFromEditor() {
  const saveToDb = el("boqEditSaveToDb")?.checked;
  const projectName = el("boqEditProjectName")?.value?.trim() || el("projectNameInput")?.value?.trim() || "Interior Design Proposal";

  // Recalculate amounts to be safe
  const finalBoq = _editBoqData.map(it => ({
    ...it,
    amount: (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0)
  }));

  if (saveToDb) {
    const latestVer = _allVersions[_allVersions.length - 1] || {};
    const projectItems = finalBoq.filter(it => it._origin === "project").map(({ _origin, ...rest }) => rest);
    const versionItems = finalBoq.filter(it => it._origin !== "project").map(({ _origin, ...rest }) => rest);
    try {
      await fetch("/api/project/update-boq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: appState.projectId,
          versionId: latestVer.id || null,
          projectItems,
          versionItems
        })
      });
      // Sync in-memory state
      _projectBoqItems = projectItems;
      if (latestVer.boqItems !== undefined) latestVer.boqItems = versionItems;
      appState.globalBoq = projectItems;
      const combinedBoq = [...projectItems, ...versionItems];
      drawBoq(combinedBoq);
      latestArtifacts = buildArtifacts(planner?.getSceneState() || {}, combinedBoq);
    } catch (e) {
      console.error("[BOQ Edit] Save to DB failed:", e);
    }
  }

  closeBoqEditPanel();

  if (!window.DeckGenerator) return;
  const btn = el("downloadDeckBtn");
  const msg = el("deckProgressMsg");
  try {
    if (btn) btn.disabled = true;
    const overrideBoq = finalBoq.map(({ _origin, ...rest }) => rest);
    await window.DeckGenerator.generate({
      appState,
      allVersions: _allVersions,
      activeCameraPins: _activeCameraPins,
      projectBoqItems: _projectBoqItems,
      projectName,
      overrideBoq,
    });
  } catch (e) {
    console.error("[Deck] Generation failed:", e);
    if (msg) { msg.textContent = "PDF failed: " + e.message; setTimeout(() => { msg.textContent = ""; }, 6000); }
    if (btn) btn.disabled = false;
  }
}

async function saveBoqEdits() {
  const latestVer = _allVersions[_allVersions.length - 1] || {};

  const finalItems = _editBoqData.map(it => ({
    ...it,
    amount: (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0)
  }));

  let newProjectItems = [..._projectBoqItems];
  let newVersionItems = [...(latestVer.boqItems || [])];

  if (_boqEditCategory) {
    // Replace only items belonging to this category
    newProjectItems = newProjectItems.filter(it => (it.category || "Uncategorized") !== _boqEditCategory);
    newVersionItems = newVersionItems.filter(it => (it.category || "Uncategorized") !== _boqEditCategory);
    for (const it of finalItems) {
      const { _origin, ...rest } = it;
      if (_origin === "project") newProjectItems.push(rest);
      else newVersionItems.push(rest);
    }
  } else {
    newProjectItems = finalItems.filter(it => it._origin === "project").map(({ _origin, ...rest }) => rest);
    newVersionItems = finalItems.filter(it => it._origin !== "project").map(({ _origin, ...rest }) => rest);
  }

  try {
    await fetch("/api/project/update-boq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: appState.projectId,
        versionId: latestVer.id || null,
        projectItems: newProjectItems,
        versionItems: newVersionItems
      })
    });
    _projectBoqItems = newProjectItems;
    if (latestVer.boqItems !== undefined) latestVer.boqItems = newVersionItems;
    appState.globalBoq = newProjectItems;
    const combinedBoq = [...newProjectItems, ...newVersionItems];
    drawBoq(combinedBoq);
    latestArtifacts = buildArtifacts(planner?.getSceneState() || {}, combinedBoq);
  } catch (e) {
    console.error("[BOQ Edit] Save failed:", e);
  }

  closeBoqEditPanel();
}

// Wire up edit panel buttons (called once DOM is ready)
function initBoqEditPanel() {
  el("boqEditClose")?.addEventListener("click", closeBoqEditPanel);
  el("boqEditCancel")?.addEventListener("click", closeBoqEditPanel);
  el("boqEditSave")?.addEventListener("click", saveBoqEdits);
  el("boqEditGenerate")?.addEventListener("click", generatePdfFromEditor);
  el("boqEditAddRow")?.addEventListener("click", () => {
    _editBoqData.push({ category: _boqEditCategory || "", item: "", qty: 1, unit: "LS", rate: 0, amount: 0, _origin: "version" });
    renderEditTable();
  });
  // Export PDF button in results opens panel in pdf mode (all items)
  el("boqExportPdfBtn")?.addEventListener("click", () => openBoqEditPanel(null, 'pdf'));
  // Close on backdrop click
  el("boqEditOverlay")?.addEventListener("click", e => {
    if (e.target === el("boqEditOverlay")) closeBoqEditPanel();
  });
}

function drawBoq(globalBoq) {
  _lastDrawnBoq = globalBoq || [];
  dom.boqAccordionContainer.innerHTML = "";
  let grandTotal = 0;

  if (!globalBoq || !globalBoq.length) {
    dom.boqAccordionContainer.innerHTML = "<p>No BOQ data found in floor plan analysis.</p>";
    dom.grandTotal.textContent = "₹0";
    dom.placementSummary.textContent = "No placements identified.";
    return;
  }

  // Group by category
  const categories = {};
  for (const item of globalBoq) {
    const cat = item.category || "Uncategorized";
    if (!categories[cat]) categories[cat] = { total: 0, items: [] };
    const amt = parseFloat(item.amount) || 0;
    categories[cat].total += amt;
    categories[cat].items.push(item);
    if (!_disabledBoqCategories.has(cat)) grandTotal += amt;
  }

  // Build Accordions
  for (const [catName, catData] of Object.entries(categories)) {
    const isDisabled = _disabledBoqCategories.has(catName);
    const details = document.createElement("details");
    details.className = "boq-accordion" + (isDisabled ? " boq-accordion-disabled" : "");
    if (!isDisabled) details.open = false;

    const summary = document.createElement("summary");
    summary.className = "boq-accordion-header";

    // Checkbox to toggle category on/off
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "boq-cat-toggle";
    chk.checked = !isDisabled;
    chk.title = "Include this category";
    chk.addEventListener("click", e => e.stopPropagation()); // prevent accordion toggle
    chk.addEventListener("change", e => {
      e.stopPropagation();
      if (e.target.checked) {
        _disabledBoqCategories.delete(catName);
      } else {
        _disabledBoqCategories.add(catName);
      }
      drawBoq(_lastDrawnBoq); // redraw with updated disabled state
      _persistBoqDisabledState(); // save to DB
    });

    // Edit button
    const editBtn = document.createElement("button");
    editBtn.className = "boq-cat-edit-btn";
    editBtn.title = "Edit this section";
    editBtn.textContent = "✎";
    editBtn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      openBoqEditPanel(catName, 'edit');
    });

    summary.appendChild(chk);
    const nameSpan = document.createElement("span");
    nameSpan.className = "boq-cat-name";
    nameSpan.textContent = catName;
    summary.appendChild(nameSpan);
    const totalSpan = document.createElement("span");
    totalSpan.className = "boq-cat-total" + (isDisabled ? " boq-cat-total-disabled" : "");
    totalSpan.textContent = `₹${catData.total.toLocaleString("en-IN")}`;
    summary.appendChild(totalSpan);
    summary.appendChild(editBtn);
    details.appendChild(summary);

    const tableWrap = document.createElement("div");
    tableWrap.className = "table-wrap boq-accordion-content";

    // Build sub-table
    let rowsHtml = "";
    for (const line of catData.items) {
      const q = parseFloat(line.qty) || 0;
      const r = parseFloat(line.rate) || 0;
      const a = parseFloat(line.amount) || 0;
      rowsHtml += `
        <tr>
          <td>${escapeHtml(line.item || "Unknown")}</td>
          <td>${q.toFixed(2)}</td>
          <td>${escapeHtml(line.unit || "")}</td>
          <td>₹${r.toLocaleString("en-IN")}</td>
          <td>₹${a.toLocaleString("en-IN")}</td>
        </tr>`;
    }

    tableWrap.innerHTML = `
      <table>
        <thead>
          <tr><th>Item</th><th>Qty</th><th>Unit</th><th>Rate (₹)</th><th>Amount (₹)</th></tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;

    details.appendChild(tableWrap);
    dom.boqAccordionContainer.appendChild(details);
  }

  dom.grandTotal.textContent = `₹${grandTotal.toLocaleString("en-IN")}`;

  // Placement summary for download
  dom.placementSummary.textContent = globalBoq
    .filter(p => !_disabledBoqCategories.has(p.category || "Uncategorized"))
    .map(p => `[${p.category}] ${p.item}: ${p.qty} ${p.unit} @ ₹${p.rate}`)
    .join("\n");
}

function _persistBoqDisabledState() {
  if (!appState.projectId) return;
  // Save only the enabled items to DB
  const enabledProjectItems = _projectBoqItems.filter(
    it => !_disabledBoqCategories.has(it.category || "Uncategorized")
  );
  const latestVer = _allVersions[_allVersions.length - 1] || {};
  const enabledVersionItems = (latestVer.boqItems || []).filter(
    it => !_disabledBoqCategories.has(it.category || "Uncategorized")
  );
  fetch("/api/project/update-boq", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: appState.projectId,
      versionId: latestVer.id || null,
      projectItems: enabledProjectItems,
      versionItems: enabledVersionItems
    })
  }).catch(e => console.warn("[BOQ toggle] DB save failed:", e.message));
}

function buildArtifacts(sceneState, globalBoq) {
  let grandTotal = 0;
  
  const csvHeader = "Category,Item,Qty,Unit,Rate INR,Amount INR\n";
  let csvLines = [];

  if (globalBoq && globalBoq.length) {
    const categories = {};
    for (const item of globalBoq) {
      const cat = item.category || "Uncategorized";
      if (!categories[cat]) categories[cat] = { total: 0, items: [] };
      const amt = parseFloat(item.amount) || 0;
      categories[cat].total += amt;
      categories[cat].items.push(item);
      grandTotal += amt;
    }

    for (const [catName, catData] of Object.entries(categories)) {
      for (const line of catData.items) {
        csvLines.push(`${escapeHtml(catName)},${escapeHtml(line.item)},${parseFloat(line.qty || 0).toFixed(2)},${escapeHtml(line.unit)},${parseFloat(line.rate || 0)},${parseFloat(line.amount || 0)}`);
      }
    }
  }

  const csv = csvHeader + csvLines.join("\n");
  return { scene: sceneState, boq: { lines: globalBoq || [], grandTotal, csv } };
}

