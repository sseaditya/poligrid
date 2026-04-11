// ─── Designer Portal ──────────────────────────────────────────────────────────

let _session, _profile;
let _currentProjectId = null;
let _reviewDrawingId  = null;
let _allDesigners     = [];    // profiles with role=designer
let _projectAssignments = [];   // assignments for the selected project

const DRAWING_TYPES = [
  { value: "civil",         label: "Civil" },
  { value: "electrical",    label: "Electrical" },
  { value: "plumbing",      label: "Plumbing" },
  { value: "hvac",          label: "HVAC" },
  { value: "firefighting",  label: "Fire Fighting" },
  { value: "architectural", label: "Architectural" },
  { value: "structural",    label: "Structural" },
  { value: "interior",      label: "Interior" },
  { value: "landscape",     label: "Landscape" },
  { value: "other",         label: "Other" },
];

// ─── Init ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    ({ session: _session, profile: _profile } =
      await AuthClient.requireAuth(["admin", "designer", "lead_designer", "ceo"]));
  } catch { window.location.href = "/login"; return; }

  AuthClient.renderUserChip(_profile, document.getElementById("userChipWrap"));
  renderTopNav();
  renderSidebar();

  const isLead = ["lead_designer", "admin"].includes(_profile.role);
  const isDesigner = _profile.role === "designer";

  await Promise.all([
    loadProjects(),
    isLead ? loadDesigners() : Promise.resolve(),
  ]);

  // Show assignment panel for lead/admin
  if (isLead) {
    document.getElementById("assignmentPanel").hidden = false;
    document.getElementById("leadTimelinePanel").hidden = false;
    document.getElementById("addAssignmentBtn").addEventListener("click", openAssignModal);
    document.getElementById("assignModalClose").addEventListener("click", closeAssignModal);
    document.getElementById("assignCancelBtn").addEventListener("click", closeAssignModal);
    document.getElementById("assignSaveBtn").addEventListener("click", handleAssignSave);
    document.getElementById("addAssignRowBtn").addEventListener("click", addAssignRow);
    await loadLeadTimeline();
  }

  if (isDesigner) {
    document.getElementById("myAssignmentPanel").hidden = false;
  }

  // Pre-select from URL
  const urlProjectId = new URLSearchParams(location.search).get("projectId");
  if (urlProjectId) {
    document.getElementById("projectSelect").value = urlProjectId;
    selectProject(urlProjectId);
  }

  // Start screen create-project buttons (designer only)
  document.getElementById("startCreateBtn")?.addEventListener("click", openCreateModal);
  document.getElementById("createModalClose")?.addEventListener("click", closeCreateModal);
  document.getElementById("createModalCancel")?.addEventListener("click", closeCreateModal);
  document.getElementById("createModalSubmit")?.addEventListener("click", handleCreateProject);

  document.getElementById("projectSelect").addEventListener("change", e => selectProject(e.target.value));
  document.getElementById("uploadBtn").addEventListener("click", () => openUploadModal());
  document.getElementById("uploadModalClose").addEventListener("click", closeUploadModal);
  document.getElementById("uploadCancelBtn").addEventListener("click", closeUploadModal);
  document.getElementById("uploadForm").addEventListener("submit", handleUpload);
  document.getElementById("reviewModalClose").addEventListener("click", () => { document.getElementById("reviewModal").hidden = true; });
  document.getElementById("reviewApproveBtn").addEventListener("click",  () => submitReview("approved"));
  document.getElementById("reviewRevisionBtn").addEventListener("click", () => submitReview("revision_requested"));
  document.getElementById("reviewRejectBtn").addEventListener("click",   () => submitReview("rejected"));
  document.getElementById("downloadZipBtn").addEventListener("click", handleZipDownload);
  document.getElementById("fileViewerClose").addEventListener("click", () => { document.getElementById("fileViewerModal").hidden = true; });

  wireDropZone();
})();

// ─── Top nav ──────────────────────────────────────────────────────────────────
function renderTopNav() {
  const nav = document.getElementById("dashNav");
  const links = [
    { href: "/homepage", label: "Home" },
    { href: "/projects",  label: "Projects" },
    { href: "/audit", label: "Audit Logs" },
    { href: "/designer",  label: "Drawings", active: true },
  ];
  if (_profile.role === "admin") {
    links.push({ href: "/admin", label: "Admin" });
    links.push({ href: "/ceo",   label: "Dashboard" });
  }
  nav.innerHTML = links.map(l =>
    `<a class="dash-nav-link${l.active ? " active" : ""}" href="${l.href}">${l.label}</a>`
  ).join("");
}

// ─── Left sidebar ─────────────────────────────────────────────────────────────
function renderSidebar() {
  const sidebar = document.getElementById("projSidebar");
  if (!sidebar) return;

  const urlProjectId = new URLSearchParams(location.search).get("projectId");
  const roleLabel = ROLE_LABELS[_profile.role] || _profile.role;
  const isCollapsed = localStorage.getItem("leftSidebarCollapsed") === "1";
  if (isCollapsed) sidebar.classList.add("collapsed");

  const navLinks = [];
  if (urlProjectId) {
    navLinks.push({ icon: "home_work", label: "Back to Project", href: `/project?id=${urlProjectId}` });
  }
  navLinks.push({ icon: "architecture", label: "Drawings", href: "#", active: true });
  if (["lead_designer", "admin"].includes(_profile.role)) {
    navLinks.push({ icon: "design_services", label: "Fitout Planner", href: urlProjectId ? `/index?id=${urlProjectId}` : "/index" });
  }
  navLinks.push({
    icon: "history",
    label: "Audit Log",
    href: urlProjectId ? `/audit?projectId=${urlProjectId}` : "/audit",
    id: "sidebarAuditLink",
  });

  const bottomLinks = [
    { icon: "folder_open", label: "All Projects", href: "/projects" },
    { icon: "cottage",     label: "Home",          href: "/homepage" },
  ];

  sidebar.innerHTML = `
    <div class="proj-sidebar-topbar">
      <button id="leftSidebarToggleBtn" class="proj-sidebar-collapse-btn"
        title="${isCollapsed ? "Expand sidebar" : "Collapse sidebar"}">
        <span class="material-symbols-outlined">${isCollapsed ? "left_panel_open" : "left_panel_close"}</span>
      </button>
    </div>

    <div class="proj-sidebar-ctx">
      <div class="proj-sidebar-ctx-icon">
        <span class="material-symbols-outlined">architecture</span>
      </div>
      <div class="proj-sidebar-ctx-name" id="sidebarProjectName">Drawings</div>
      <div class="proj-sidebar-ctx-sub">${escHtml(roleLabel)}</div>
    </div>

    <p class="proj-sidebar-label">Workspace</p>
    ${navLinks.map(l => `
      <a class="proj-sidebar-link${l.active ? " active" : ""}" href="${l.href}"${l.id ? ` id="${l.id}"` : ""}>
        <span class="material-symbols-outlined">${l.icon}</span>
        <span>${l.label}</span>
      </a>`).join("")}

    ${_profile.role === "admin" ? `
      <p class="proj-sidebar-label">Admin</p>
      <a class="proj-sidebar-link" href="/admin">
        <span class="material-symbols-outlined">manage_accounts</span>
        <span>Admin Panel</span>
      </a>
      <a class="proj-sidebar-link" href="/ceo">
        <span class="material-symbols-outlined">analytics</span>
        <span>CEO Dashboard</span>
      </a>` : ""}

    <hr class="proj-sidebar-divider" />

    <div class="proj-sidebar-bottom">
      ${bottomLinks.map(l => `
        <a class="proj-sidebar-link" href="${l.href}">
          <span class="material-symbols-outlined">${l.icon}</span>
          <span>${l.label}</span>
        </a>`).join("")}
    </div>`;

  document.getElementById("leftSidebarToggleBtn")?.addEventListener("click", () => {
    const collapsed = sidebar.classList.toggle("collapsed");
    localStorage.setItem("leftSidebarCollapsed", collapsed ? "1" : "0");
    const btn = document.getElementById("leftSidebarToggleBtn");
    btn.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
    btn.querySelector(".material-symbols-outlined").textContent =
      collapsed ? "left_panel_open" : "left_panel_close";
  });
}

// ─── Projects ─────────────────────────────────────────────────────────────────
async function loadProjects() {
  const select = document.getElementById("projectSelect");
  try {
    const res = await apiFetch("/api/project/list");
    const { projects } = await res.json();
    if (!projects?.length) {
      select.innerHTML = `<option value="">No projects assigned</option>`;
      // Show start screen for plain designers
      if (_profile.role === "designer") {
        document.getElementById("designerStartScreen").hidden = false;
        document.getElementById("uploadBtn").disabled = true;
        document.getElementById("downloadZipBtn").disabled = true;
      }
      return;
    }
    select.innerHTML =
      `<option value="">Select a project…</option>` +
      projects.map(p =>
        `<option value="${p.id}">${p.name || "Untitled"}${p.client_name ? " · " + p.client_name : ""}</option>`
      ).join("");
  } catch {
    select.innerHTML = `<option value="">Error loading projects</option>`;
  }
}

// ─── Load designers (for assignment modal) ────────────────────────────────────
async function loadDesigners() {
  try {
    const res = await apiFetch("/api/users/list");
    const { users } = await res.json();
    _allDesigners = (users || []).filter(u =>
      ["designer", "lead_designer", "admin"].includes(u.role) && u.is_active
    );
  } catch { /* silently ignore */ }
}

const ROLE_LABELS = {
  sales: "Sales", designer: "Designer",
  lead_designer: "Lead Designer", admin: "Admin", ceo: "CEO",
};

function selectProject(projectId) {
  _currentProjectId = projectId;
  _projectAssignments = [];
  document.getElementById("uploadBtn").disabled = !projectId;
  document.getElementById("downloadZipBtn").disabled = !projectId;
  document.getElementById("progressWrap").hidden = !projectId;

  // Update sidebar context name
  const sel = document.getElementById("projectSelect");
  const selectedText = sel.options[sel.selectedIndex]?.text || "Drawings";
  const projectName = selectedText.split(" · ")[0]; // strip client name
  const sidebarNameEl = document.getElementById("sidebarProjectName");
  if (sidebarNameEl) sidebarNameEl.textContent = projectId ? projectName : "Drawings";
  const sidebarAuditLink = document.getElementById("sidebarAuditLink");
  if (sidebarAuditLink) {
    sidebarAuditLink.href = projectId ? `/audit?projectId=${projectId}` : "/audit";
  }

  // Update subtitle
  const subtitle = document.getElementById("designerSubtitle");
  if (subtitle) subtitle.textContent = projectId
    ? `Managing drawings for ${escHtml(projectName)}`
    : "Select a project to manage drawings";

  if (!projectId) {
    document.getElementById("drawingsHint").textContent = "Select a project to view drawings.";
    document.getElementById("drawingsHint").hidden = false;
    document.getElementById("drawingsByType").innerHTML = "";
    document.getElementById("assignmentList").innerHTML = `<p class="loading-hint">No drawing types assigned yet.</p>`;
    document.getElementById("myAssignmentList").innerHTML = `<p class="loading-hint">Select a project to view your assignments.</p>`;
    setDesignerUploadTypes([]);
    updateProgress([]);
    return;
  }
  loadAll(projectId);
}

async function loadAll(projectId) {
  const isLead = ["lead_designer", "admin"].includes(_profile.role);
  // Assignments must load first so _projectAssignments is populated before drawings render
  await (isLead ? loadAssignments(projectId) : loadProgressOnly(projectId));
  const loads = [loadDrawings(projectId)];
  if (isLead) loads.push(loadLeadTimeline());
  await Promise.all(loads);
}

// Progress bar for non-lead roles (read-only, no assignment panel)
async function loadProgressOnly(projectId) {
  try {
    const res = await apiFetch(`/api/drawings/assignments?projectId=${projectId}`);
    const { assignments } = await res.json();
    _projectAssignments = assignments || [];
    updateProgress(assignments);
    loadMyAssignments(assignments || []);
  } catch {
    _projectAssignments = [];
    updateProgress([]);
    loadMyAssignments([]);
  }
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function updateProgress(assignments) {
  const total    = assignments.length;
  const approved = assignments.filter(a => a.status === "approved").length;
  const review   = assignments.filter(a => a.status === "pending_review").length;

  const fracEl   = document.getElementById("progressFraction");
  const fillApp  = document.getElementById("progressFillApproved");
  const fillRev  = document.getElementById("progressFillReview");

  fracEl.textContent = `${approved} / ${total} approved`;
  fillApp.style.width = total ? `${(approved / total) * 100}%` : "0%";
  fillRev.style.width = total ? `${(review  / total) * 100}%` : "0%";

  // Complete project badge
  if (total > 0 && approved === total) {
    fracEl.textContent = `✓ All ${total} drawings approved`;
    fracEl.style.color = "var(--success)";
  } else {
    fracEl.style.color = "";
  }
}

// ─── Assignments ──────────────────────────────────────────────────────────────
async function loadAssignments(projectId) {
  if (!["lead_designer", "admin"].includes(_profile.role)) return;
  const wrap = document.getElementById("assignmentList");
  try {
    const res = await apiFetch(`/api/drawings/assignments?projectId=${projectId}`);
    const { assignments } = await res.json();
    _projectAssignments = assignments || [];

    updateProgress(assignments);

    if (!assignments.length) {
      wrap.innerHTML = `<p class="loading-hint">No drawing types assigned yet. Use "+ Assign Drawing Type" to get started.</p>`;
      return;
    }

    wrap.innerHTML = `<div class="assignment-table">
      <div class="assignment-header">
        <span>Type</span><span>Designer</span><span>Assigned</span><span>Deadline</span><span>Submitted</span><span>Completed</span><span>Status</span><span></span>
      </div>
      ${assignments.map(a => assignmentRow(a)).join("")}
    </div>`;

    wrap.querySelectorAll(".delete-assignment-btn").forEach(btn => {
      btn.addEventListener("click", () => deleteAssignment(btn.dataset.id));
    });
    wrap.querySelectorAll(".reassign-btn").forEach(btn => {
      btn.addEventListener("click", () => openReassignInline(btn.dataset.id));
    });
  } catch {
    wrap.innerHTML = `<p class="loading-hint">Failed to load assignments.</p>`;
  }
}

function assignmentRow(a) {
  const { icon, label, cls } = assignmentStatusMeta(a.status);
  const assignedAt  = fmtDateTime(a.assigned_at || a.created_at);
  const deadline    = fmtDateOnly(a.deadline);
  const submittedAt = fmtDateTime(a.submitted_at);
  const completedAt = fmtDateTime(a.completed_at);
  const isOverdue   = a.deadline && a.status !== "approved" && new Date(a.deadline) < new Date();
  const rowId       = `asgn-row-${a.id}`;
  return `
    <div class="assignment-row" id="${rowId}" data-id="${a.id}" data-type="${escHtml(a.drawing_type)}" data-project="${escHtml(a.project_id || _currentProjectId)}">
      <span class="assignment-type">${capitalize(a.drawing_type)}</span>
      <span class="assignment-designer">${escHtml(a.assignee?.full_name || "Unassigned")}</span>
      <span class="assignment-time">${assignedAt}</span>
      <span class="assignment-deadline${isOverdue ? " overdue" : ""}">${deadline}${isOverdue ? " ⚠" : ""}</span>
      <span class="assignment-time">${submittedAt}</span>
      <span class="assignment-time">${completedAt}</span>
      <span class="badge ${cls}">${icon} ${label}</span>
      <div style="display:flex;gap:4px">
        <button class="ghost-sm reassign-btn" data-id="${a.id}" title="Change designer or deadline"
          style="font-size:11px;padding:2px 8px;color:var(--primary)">Reassign</button>
        <button class="ghost-sm danger-sm delete-assignment-btn" data-id="${a.id}" title="Remove assignment">✕</button>
      </div>
    </div>`;
}

function openReassignInline(assignmentId) {
  const rowEl = document.getElementById(`asgn-row-${assignmentId}`);
  if (!rowEl) return;
  if (rowEl.querySelector(".reassign-inline-form")) return; // already open

  const drawingType  = rowEl.dataset.type;
  const projectId    = rowEl.dataset.project || _currentProjectId;
  const existing     = _projectAssignments.find(a => a.id === assignmentId);
  const currentDesId = existing?.assigned_to || existing?.assignee?.id || "";
  const currentDl    = existing?.deadline ? existing.deadline.slice(0, 10) : "";

  const form = document.createElement("div");
  form.className = "reassign-inline-form";
  form.style.cssText = "grid-column:1/-1;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 0 4px;border-top:1px solid var(--color-surface-container);margin-top:4px";
  form.innerHTML = `
    <span style="font-size:11px;font-weight:700;color:var(--color-on-surface-variant)">Reassign ${capitalize(drawingType)}:</span>
    <select class="ctx-input reassign-designer-sel" style="font-size:12px;flex:1;min-width:160px">
      <option value="">Select designer…</option>
      ${_allDesigners.map(u =>
        `<option value="${u.id}" ${u.id === currentDesId ? "selected" : ""}>${escHtml(u.full_name)} — ${ROLE_LABELS[u.role] || u.role}</option>`
      ).join("")}
    </select>
    <input class="ctx-input reassign-deadline-inp" type="date" value="${currentDl}" title="Deadline" style="font-size:12px;width:140px" />
    <button class="primary-btn btn-sm reassign-save-btn" style="width:auto;padding:4px 14px;font-size:12px">Save</button>
    <button class="ghost-sm reassign-cancel-btn" style="font-size:12px">Cancel</button>
    <span class="reassign-error" style="color:var(--color-error);font-size:11px;display:none"></span>`;

  rowEl.appendChild(form);

  form.querySelector(".reassign-cancel-btn").addEventListener("click", () => form.remove());
  form.querySelector(".reassign-save-btn").addEventListener("click", async () => {
    const newDesignerId = form.querySelector(".reassign-designer-sel").value;
    const newDeadline   = form.querySelector(".reassign-deadline-inp").value || null;
    const errSpan       = form.querySelector(".reassign-error");
    const saveBtn       = form.querySelector(".reassign-save-btn");

    if (!newDesignerId) { errSpan.textContent = "Select a designer."; errSpan.style.display = ""; return; }
    errSpan.style.display = "none";
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";

    try {
      const res = await apiFetch("/api/drawings/assignments/upsert", {
        method: "POST",
        body: JSON.stringify({ projectId, drawingType, assignedTo: newDesignerId, deadline: newDeadline }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reassign.");
      await loadAssignments(projectId);
    } catch (err) {
      errSpan.textContent = err.message;
      errSpan.style.display = "";
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
    }
  });
}

async function loadLeadTimeline() {
  if (!["lead_designer", "admin"].includes(_profile.role)) return;
  const wrap = document.getElementById("leadTimelineList");
  try {
    const res = await apiFetch("/api/drawings/assignments?mine=1");
    const { assignments } = await res.json();
    if (!assignments?.length) {
      wrap.innerHTML = `<p class="loading-hint">You have not assigned any drawings yet.</p>`;
      return;
    }

    wrap.innerHTML = `<div class="assignment-table assignment-table-wide">
      <div class="assignment-header">
        <span>Project</span><span>Type</span><span>Designer</span><span>Assigned</span><span>Submitted</span><span>Completed</span><span>Status</span>
      </div>
      ${assignments.map(a => {
        const { icon, label, cls } = assignmentStatusMeta(a.status);
        return `
          <div class="assignment-row">
            <span class="assignment-project">${escHtml(a.project?.name || "Unknown project")}</span>
            <span class="assignment-type">${capitalize(a.drawing_type)}</span>
            <span class="assignment-designer">${escHtml(a.assignee?.full_name || "Unassigned")}</span>
            <span class="assignment-time">${fmtDateTime(a.assigned_at || a.created_at)}</span>
            <span class="assignment-time">${fmtDateTime(a.submitted_at)}</span>
            <span class="assignment-time">${fmtDateTime(a.completed_at)}</span>
            <span class="badge ${cls}">${icon} ${label}</span>
          </div>`;
      }).join("")}
    </div>`;
  } catch {
    wrap.innerHTML = `<p class="loading-hint">Failed to load assignment timeline.</p>`;
  }
}

function loadMyAssignments(assignments) {
  if (_profile.role !== "designer") return;
  const wrap = document.getElementById("myAssignmentList");
  const sorted = [...assignments].sort((a, b) =>
    new Date(b.assigned_at || b.created_at || 0) - new Date(a.assigned_at || a.created_at || 0)
  );
  const uploadableTypes = sorted
    .filter(a => ["assigned", "revision_requested"].includes(a.status))
    .map(a => a.drawing_type);
  setDesignerUploadTypes(uploadableTypes);
  document.getElementById("uploadBtn").disabled = !_currentProjectId || uploadableTypes.length === 0;

  if (!sorted.length) {
    wrap.innerHTML = `<p class="loading-hint">No drawings assigned to you for this project yet.</p>`;
    return;
  }

  wrap.innerHTML = `<div class="assignment-table">
    <div class="assignment-header">
      <span>Type</span><span>Assigned By</span><span>Assigned</span><span>Deadline</span><span>Submitted</span><span>Completed</span><span>Status</span><span></span>
    </div>
    ${sorted.map(a => myAssignmentRow(a)).join("")}
  </div>`;

  wrap.querySelectorAll(".assignment-upload-btn").forEach(btn => {
    btn.addEventListener("click", () => openUploadModal(btn.dataset.drawingType || ""));
  });
}

function myAssignmentRow(a) {
  const { icon, label, cls } = assignmentStatusMeta(a.status);
  const isOverdue = a.deadline && a.status !== "approved" && new Date(a.deadline) < new Date();

  let actionHtml;
  if (a.status === "assigned") {
    actionHtml = `<button class="primary-btn btn-sm assignment-upload-btn" data-drawing-type="${escHtml(a.drawing_type)}">Upload</button>`;
  } else if (a.status === "revision_requested") {
    actionHtml = `<button class="primary-btn btn-sm assignment-upload-btn" data-drawing-type="${escHtml(a.drawing_type)}" style="background:linear-gradient(135deg,#d97706,#92400e)">Replace File</button>`;
  } else if (a.status === "pending_review") {
    actionHtml = `<span class="assignment-action-hint">Awaiting review</span>`;
  } else if (a.status === "approved") {
    actionHtml = `<span class="assignment-action-hint" style="color:var(--success);font-weight:600">✓ Finalised</span>`;
  } else {
    actionHtml = `<span class="assignment-action-hint">—</span>`;
  }

  return `
    <div class="assignment-row">
      <span class="assignment-type">${capitalize(a.drawing_type)}</span>
      <span class="assignment-designer">${escHtml(a.assigner?.full_name || "Lead Designer")}</span>
      <span class="assignment-time">${fmtDateTime(a.assigned_at || a.created_at)}</span>
      <span class="assignment-deadline${isOverdue ? " overdue" : ""}">${fmtDateOnly(a.deadline)}${isOverdue ? " ⚠" : ""}</span>
      <span class="assignment-time">${fmtDateTime(a.submitted_at)}</span>
      <span class="assignment-time">${fmtDateTime(a.completed_at)}</span>
      <span class="badge ${cls}">${icon} ${label}</span>
      ${actionHtml}
    </div>`;
}

async function deleteAssignment(assignmentId) {
  if (!confirm("Remove this drawing assignment?")) return;
  try {
    await apiFetch("/api/drawings/assignments/delete", {
      method: "POST",
      body: JSON.stringify({ assignmentId }),
    });
    loadAll(_currentProjectId);
  } catch (err) {
    alert("Failed to remove: " + err.message);
  }
}

// ─── Assign modal (multi-row) ─────────────────────────────────────────────────
function openAssignModal() {
  const rowsWrap = document.getElementById("assignRows");
  rowsWrap.innerHTML = "";
  document.getElementById("assignError").hidden = true;

  // Show how many types are still available
  const assignedTypes = new Set(_projectAssignments.map(a => a.drawing_type));
  const remaining = DRAWING_TYPES.filter(t => !assignedTypes.has(t.value));
  const headerNote = document.getElementById("assignModalSubtitle");
  if (headerNote) {
    if (remaining.length === 0) {
      headerNote.textContent = "All drawing types are already assigned. Use Reassign on the existing assignments to change designer.";
    } else {
      headerNote.textContent = `${assignedTypes.size} type${assignedTypes.size !== 1 ? "s" : ""} already assigned — showing only unassigned types below.`;
    }
  }

  document.getElementById("assignModal").hidden = false;

  if (remaining.length === 0) {
    document.getElementById("addAssignRowBtn").hidden = true;
    return;
  }
  document.getElementById("addAssignRowBtn").hidden = false;
  addAssignRow(); // start with one empty row
}

function closeAssignModal() {
  document.getElementById("assignModal").hidden = true;
  document.getElementById("addAssignRowBtn").hidden = false;
}

/** Returns drawing types already selected in the assign modal rows (excluding the given row). */
function _getSelectedTypesInModal(exceptRow) {
  const rows = document.querySelectorAll(".assign-type-row");
  const selected = new Set();
  for (const r of rows) {
    if (r === exceptRow) continue;
    const v = r.querySelector(".assign-row-type")?.value;
    if (v) selected.add(v);
  }
  return selected;
}

const DRAWING_TYPE_ICONS = {
  civil: "construction", electrical: "bolt", plumbing: "water_drop",
  hvac: "air", firefighting: "local_fire_department", architectural: "home",
  structural: "foundation", interior: "chair", landscape: "park", other: "architecture",
};

function addAssignRow() {
  const wrap = document.getElementById("assignRows");

  // Already assigned in DB + already selected in other rows in this modal
  const assignedInDb    = new Set(_projectAssignments.map(a => a.drawing_type));
  const selectedInModal = _getSelectedTypesInModal(null);
  const excluded        = new Set([...assignedInDb, ...selectedInModal]);
  const available       = DRAWING_TYPES.filter(t => !excluded.has(t.value));

  if (!available.length) {
    const errEl = document.getElementById("assignError");
    errEl.textContent = "All drawing types are already assigned or selected above.";
    errEl.hidden = false;
    return;
  }

  const row = document.createElement("div");
  row.className = "assign-type-row";
  row.innerHTML = `
    <div class="assign-type-row-icon">
      <span class="material-symbols-outlined">architecture</span>
    </div>
    <div class="assign-type-row-fields">
      <select class="ctx-input assign-row-type" style="font-size:13px">
        <option value="">Drawing type…</option>
        ${available.map(t => `<option value="${t.value}">${t.label}</option>`).join("")}
      </select>
      <select class="ctx-input assign-row-designer" style="font-size:13px">
        <option value="">Assign to…</option>
        ${_allDesigners.map(u =>
          `<option value="${u.id}">${escHtml(u.full_name)} — ${ROLE_LABELS[u.role] || u.role}</option>`
        ).join("")}
      </select>
      <input class="ctx-input assign-row-deadline" type="date" title="Deadline (optional)" style="font-size:13px" />
    </div>
    <button type="button" class="ghost-sm danger-sm assign-row-del" title="Remove row">
      <span class="material-symbols-outlined" style="font-size:15px">close</span>
    </button>`;

  const typeSelect = row.querySelector(".assign-row-type");
  const iconWrap   = row.querySelector(".assign-type-row-icon");

  // Update icon + hide the "Add" button if nothing left to add
  typeSelect.addEventListener("change", () => {
    iconWrap.querySelector(".material-symbols-outlined").textContent =
      DRAWING_TYPE_ICONS[typeSelect.value] || "architecture";
    // Check if all types are now covered
    const assignedInDb2    = new Set(_projectAssignments.map(a => a.drawing_type));
    const selectedInModal2 = _getSelectedTypesInModal(null);
    const remaining = DRAWING_TYPES.filter(t => !assignedInDb2.has(t.value) && !selectedInModal2.has(t.value));
    document.getElementById("addAssignRowBtn").hidden = remaining.length === 0;
    document.getElementById("assignError").hidden = true;
  });

  row.querySelector(".assign-row-del").addEventListener("click", () => {
    row.remove();
    document.getElementById("addAssignRowBtn").hidden = false;
    document.getElementById("assignError").hidden = true;
    if (!wrap.children.length) addAssignRow();
  });

  wrap.appendChild(row);
}

async function handleAssignSave() {
  const rows = document.querySelectorAll(".assign-type-row");
  const errEl = document.getElementById("assignError");
  const btn   = document.getElementById("assignSaveBtn");
  errEl.hidden = true;

  const toSave = [];
  for (const row of rows) {
    const drawingType = row.querySelector(".assign-row-type").value;
    const assignedTo  = row.querySelector(".assign-row-designer").value || null;
    const deadline    = row.querySelector(".assign-row-deadline").value || null;
    if (drawingType && assignedTo) toSave.push({ drawingType, assignedTo, deadline });
    else if (drawingType && !assignedTo) {
      errEl.textContent = `Please select a designer for "${drawingType}".`;
      errEl.hidden = false;
      return;
    }
  }

  if (!toSave.length) {
    errEl.textContent = "Add at least one drawing type with a designer.";
    errEl.hidden = false;
    return;
  }

  // Prevent duplicate types in the same batch
  const typesSeen = new Set();
  for (const a of toSave) {
    if (typesSeen.has(a.drawingType)) {
      errEl.textContent = `Duplicate drawing type "${a.drawingType}" — each type can only be assigned once per project.`;
      errEl.hidden = false;
      return;
    }
    typesSeen.add(a.drawingType);
  }

  btn.disabled = true;
  btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:15px">hourglass_empty</span> Saving…`;

  try {
    for (const a of toSave) {
      const res = await apiFetch("/api/drawings/assignments/upsert", {
        method: "POST",
        body: JSON.stringify({ projectId: _currentProjectId, ...a }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save assignment.");
    }
    closeAssignModal();
    loadAll(_currentProjectId);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:15px">person_add</span> Save Assignments`;
  }
}

// ─── Drawings list ────────────────────────────────────────────────────────────
async function loadDrawings(projectId) {
  const hint = document.getElementById("drawingsHint");
  const wrap = document.getElementById("drawingsByType");
  hint.textContent = "Loading drawings…";
  hint.hidden = false;
  wrap.innerHTML = "";

  try {
    const res = await apiFetch(`/api/drawings/list?projectId=${projectId}`);
    const { drawings } = await res.json();

    if (!drawings?.length) {
      hint.textContent = "No drawings uploaded yet.";
      return;
    }
    hint.hidden = true;

    // Group by drawing type, sorted newest version first within each group
    const byType = {};
    for (const d of drawings) {
      (byType[d.drawing_type] = byType[d.drawing_type] || []).push(d);
    }
    for (const type in byType) {
      byType[type].sort((a, b) => (b.version_number ?? 0) - (a.version_number ?? 0));
    }

    // Build a map of assignment status per drawing type so cards know the real state
    const assignmentStatusByType = {};
    for (const a of _projectAssignments) {
      assignmentStatusByType[a.drawing_type] = a.status;
    }

    wrap.innerHTML = Object.entries(byType).map(([type, items]) => `
      <div class="drawings-group">
        <h3 class="drawings-group-title">${capitalize(type)}</h3>
        <div class="drawings-group-list">${items.map((d, idx) => drawingCard(d, idx === 0, assignmentStatusByType[type])).join("")}</div>
      </div>
    `).join("");

    wrap.querySelectorAll(".view-file-btn").forEach(btn => {
      btn.addEventListener("click", () => openFileViewer(btn.dataset.path, btn.dataset.name));
    });
    wrap.querySelectorAll(".download-file-btn").forEach(btn => {
      btn.addEventListener("click", () => downloadFile(btn.dataset.path, btn.dataset.name));
    });

    if (["lead_designer", "admin"].includes(_profile.role)) {
      wrap.querySelectorAll(".review-btn").forEach(btn => {
        btn.addEventListener("click", () => openReviewModal(btn.dataset.id, btn.dataset.title));
      });
    }
    // Wire replace buttons on cards (designer only, revision_requested)
    if (_profile.role === "designer") {
      wrap.querySelectorAll(".assignment-upload-btn").forEach(btn => {
        btn.addEventListener("click", () => openUploadModal(btn.dataset.drawingType || ""));
      });
    }
  } catch {
    hint.textContent = "Failed to load drawings.";
  }
}

function drawingCard(d, isLatest = false, assignmentStatus = null) {
  // Lead can review only the latest pending_review drawing
  const canReview = ["lead_designer", "admin"].includes(_profile.role)
    && d.status === "pending_review"
    && isLatest;
  // Designer can replace only if the ASSIGNMENT is revision_requested (not older drawing rows)
  const canReplace = _profile.role === "designer"
    && assignmentStatus === "revision_requested"
    && isLatest
    && d.uploaded_by === _profile.id;
  const latestReview = d.drawing_reviews?.[0];
  const { icon, label, cls } = statusMeta(d.status);
  const ext = (d.file_name || "").split(".").pop().toLowerCase();
  const canPreview = ["pdf", "png", "jpg", "jpeg", "gif", "webp"].includes(ext);
  const fileSize = d.file_size_bytes ? fmtBytes(d.file_size_bytes) : null;

  return `
    <div class="drawing-card status-${d.status}${isLatest ? " drawing-card-latest" : " drawing-card-old"}">
      <div class="drawing-card-top">
        <div class="drawing-card-info">
          <span class="drawing-title">${escHtml(d.title)}</span>
          <span class="drawing-meta">
            <strong>v${d.version_number ?? 1}</strong>${isLatest ? ' <span class="drawing-latest-badge">LATEST</span>' : ' <span class="drawing-old-badge">SUPERSEDED</span>'}
            &nbsp;·&nbsp; ${escHtml(d.uploader?.full_name || "Unknown")}
            &nbsp;·&nbsp; ${fmtDate(d.created_at)}
            ${d.file_name ? `&nbsp;·&nbsp; <span class="drawing-filename">${escHtml(d.file_name)}</span>` : ""}
            ${fileSize ? `&nbsp;·&nbsp; ${fileSize}` : ""}
          </span>
          ${d.description ? `<span class="drawing-desc">${escHtml(d.description)}</span>` : ""}
        </div>
        <span class="badge ${cls}">${icon} ${label}</span>
      </div>

      ${latestReview?.comments ? `
        <div class="drawing-review-comment">
          <span class="review-comment-icon">💬</span>
          <em>"${escHtml(latestReview.comments)}"</em>
          <span class="review-comment-by">— ${escHtml(latestReview.reviewer?.full_name || "Reviewer")}</span>
        </div>` : ""}

      <div class="drawing-card-actions">
        ${canPreview ? `
          <button class="ghost-sm view-file-btn"
            data-path="${escHtml(d.file_path)}"
            data-name="${escHtml(d.file_name || d.title)}">
            ↗ View
          </button>` : ""}
        <button class="ghost-sm download-file-btn"
          data-path="${escHtml(d.file_path)}"
          data-name="${escHtml(d.file_name || d.title)}">
          ↓ Download
        </button>
        ${canReview ? `
          <button class="primary-btn btn-sm review-btn"
            data-id="${d.id}"
            data-title="${escHtml(d.title)}">
            Review
          </button>` : ""}
        ${canReplace ? `
          <button class="primary-btn btn-sm assignment-upload-btn"
            data-drawing-type="${escHtml(d.drawing_type)}"
            style="background:linear-gradient(135deg,#d97706,#92400e)">
            Replace File
          </button>` : ""}
      </div>
    </div>`;
}

// ─── File viewer ──────────────────────────────────────────────────────────────
async function openFileViewer(filePath, fileName) {
  try {
    const res = await apiFetch(`/api/drawings/signed-url?path=${encodeURIComponent(filePath)}`);
    const { url } = await res.json();
    window.open(url, "_blank");
  } catch (err) {
    alert("Could not open file: " + err.message);
  }
}

// ─── Individual file download (server-proxied, forces attachment) ──────────────
async function downloadFile(filePath, fileName) {
  try {
    const res = await apiFetch(`/api/drawings/download?path=${encodeURIComponent(filePath)}&name=${encodeURIComponent(fileName || "drawing")}`);
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Download failed"); }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fileName || "drawing";
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    alert("Download failed: " + err.message);
  }
}

// ─── ZIP download (server-side — no CORS, no JSZip needed) ───────────────────
async function handleZipDownload() {
  if (!_currentProjectId) return;
  const btn = document.getElementById("downloadZipBtn");
  btn.disabled = true;
  btn.textContent = "Building ZIP…";

  try {
    const res = await apiFetch(`/api/drawings/download-zip?projectId=${_currentProjectId}`);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `Server error ${res.status}`);
    }
    const blob = await res.blob();
    const projectName = document.getElementById("projectSelect").selectedOptions[0]?.text || "project";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${projectName.replace(/[^a-z0-9_\- ]/gi, "_")}_drawings.zip`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (err) {
    alert("ZIP download failed: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "↓ Download ZIP";
  }
}

// ─── Upload ───────────────────────────────────────────────────────────────────
function setDesignerUploadTypes(types) {
  if (_profile.role !== "designer") return;
  const sel = document.getElementById("drawingType");
  const unique = [...new Set(types)];
  if (!unique.length) {
    sel.innerHTML = `<option value="">No assigned drawing types in this project</option>`;
    sel.value = "";
    return;
  }
  sel.innerHTML =
    `<option value="">Select type…</option>` +
    unique.map(t => `<option value="${t}">${capitalize(t)}</option>`).join("");
}

function openUploadModal(prefillType = "") {
  if (!_currentProjectId) return;
  document.getElementById("uploadForm").reset();
  const errEl = document.getElementById("uploadError");
  const submitBtn = document.getElementById("uploadSubmitBtn");
  const modalTitle = document.getElementById("uploadModalTitle");
  errEl.hidden = true;
  submitBtn.disabled = false;

  if (_profile.role === "designer") {
    const uploadableAssignments = _projectAssignments
      .filter(a => ["assigned", "revision_requested"].includes(a.status));
    const uploadableTypes = uploadableAssignments.map(a => a.drawing_type);
    setDesignerUploadTypes(uploadableTypes);

    if (!uploadableTypes.length) {
      errEl.textContent = "No uploadable drawing assignments found for this project. Either all drawings are approved or awaiting review.";
      errEl.hidden = false;
      submitBtn.disabled = true;
    }

    // Update modal title: "Replace Drawing" if this is a revision
    const prefillAssignment = prefillType
      ? uploadableAssignments.find(a => a.drawing_type === prefillType)
      : null;
    const isRevision = prefillAssignment?.status === "revision_requested";
    if (modalTitle) {
      modalTitle.textContent = isRevision ? "Replace Drawing" : "Upload Drawing";
    }
    if (isRevision) {
      submitBtn.style.background = "linear-gradient(135deg,#d97706,#92400e)";
      submitBtn.textContent = "Replace File";
    } else {
      submitBtn.style.background = "";
      submitBtn.textContent = "Upload";
    }
  }

  if (prefillType) {
    document.getElementById("drawingType").value = prefillType;
  }

  document.getElementById("uploadModal").hidden = false;
}

function closeUploadModal() {
  document.getElementById("uploadModal").hidden = true;
  document.getElementById("uploadForm").reset();
  document.getElementById("uploadError").hidden = true;
  // Reset drop zone
  const chip = document.getElementById("uploadFileChip");
  const zone = document.getElementById("uploadDropZone");
  if (chip) chip.hidden = true;
  if (zone) zone.hidden = false;
  const title = document.getElementById("uploadModalTitle");
  if (title) title.textContent = "Upload Drawing";
  const submitBtn = document.getElementById("uploadSubmitBtn");
  if (submitBtn) {
    submitBtn.style.background = "";
    submitBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size:15px">upload_file</span> Upload Drawing`;
  }
}

async function handleUpload(e) {
  e.preventDefault();
  const btn   = document.getElementById("uploadSubmitBtn");
  const errEl = document.getElementById("uploadError");
  errEl.hidden = true;
  btn.disabled = true;
  btn.textContent = "Uploading…";

  try {
    const file = document.getElementById("drawingFile").files[0];
    if (!file) throw new Error("No file selected.");
    const fileBase64 = await fileToBase64(file);

    const res = await apiFetch("/api/drawings/upload", {
      method: "POST",
      body: JSON.stringify({
        projectId:      _currentProjectId,
        drawingType:    document.getElementById("drawingType").value,
        title:          document.getElementById("drawingTitle").value.trim(),
        description:    document.getElementById("drawingDesc").value.trim(),
        fileBase64,
        fileName:       file.name,
        fileSizeBytes:  file.size,
      }),
    });

    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error || "Upload failed.");
    }

    closeUploadModal();
    loadAll(_currentProjectId);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Upload";
  }
}

// ─── Review ───────────────────────────────────────────────────────────────────
function openReviewModal(drawingId, title) {
  _reviewDrawingId = drawingId;
  document.getElementById("reviewDrawingTitle").textContent = title;
  document.getElementById("reviewComments").value = "";
  document.getElementById("reviewError").hidden = true;
  document.getElementById("reviewModal").hidden = false;
}

async function submitReview(status) {
  const errEl = document.getElementById("reviewError");
  errEl.hidden = true;
  const btnIds = ["reviewApproveBtn", "reviewRevisionBtn", "reviewRejectBtn"];
  const btns = btnIds.map(id => document.getElementById(id));
  btns.forEach(b => b.disabled = true);

  try {
    const res = await apiFetch("/api/drawings/review", {
      method: "POST",
      body: JSON.stringify({
        drawingId: _reviewDrawingId,
        status,
        comments: document.getElementById("reviewComments").value.trim(),
      }),
    });
    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error || "Review failed.");
    }
    document.getElementById("reviewModal").hidden = true;
    loadAll(_currentProjectId);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
    btns.forEach(b => b.disabled = false);
  }
}

// ─── Drop zone ────────────────────────────────────────────────────────────────
function wireDropZone() {
  const zone     = document.getElementById("uploadDropZone");
  const fileInput = document.getElementById("drawingFile");
  const chip     = document.getElementById("uploadFileChip");
  const nameEl   = document.getElementById("uploadFileName");
  const sizeEl   = document.getElementById("uploadFileSize");
  const iconEl   = document.getElementById("uploadFileIcon");
  const clearBtn = document.getElementById("uploadFileClear");

  if (!zone) return;

  zone.addEventListener("click", () => fileInput.click());
  zone.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") fileInput.click(); });

  zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    const file = e.dataTransfer?.files[0];
    if (file) applyFile(file);
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (file) applyFile(file);
  });

  clearBtn?.addEventListener("click", () => {
    fileInput.value = "";
    chip.hidden = true;
    zone.hidden = false;
  });

  function applyFile(file) {
    // Sync file to the input via DataTransfer (where supported)
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
    } catch { /* Safari fallback — file comes from input already */ }

    const ext = file.name.split(".").pop().toLowerCase();
    iconEl.textContent = ext === "pdf"
      ? "picture_as_pdf"
      : ["png","jpg","jpeg","gif","webp"].includes(ext) ? "image" : "description";
    nameEl.textContent = file.name;
    sizeEl.textContent = fmtBytes(file.size);
    chip.hidden = false;
    zone.hidden = true;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function apiFetch(url, opts = {}) {
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${_session.access_token}`,
      ...(opts.headers || {}),
    },
  });
}

function statusMeta(status) {
  return {
    pending_review:     { icon: "⏳", label: "Pending Review",  cls: "badge-drawing-pending_review" },
    approved:           { icon: "✅", label: "Approved",         cls: "badge-drawing-approved" },
    rejected:           { icon: "❌", label: "Rejected",         cls: "badge-drawing-rejected" },
    revision_requested: { icon: "🔁", label: "Revision Needed",  cls: "badge-drawing-revision_requested" },
  }[status] || { icon: "·", label: status, cls: "" };
}

function assignmentStatusMeta(status) {
  return {
    assigned:           { icon: "📋", label: "Not Uploaded",    cls: "badge-drawing-pending_review" },
    pending_review:     { icon: "⏳", label: "Under Review",    cls: "badge-drawing-pending_review" },
    approved:           { icon: "✅", label: "Approved",         cls: "badge-drawing-approved" },
    rejected:           { icon: "❌", label: "Rejected",         cls: "badge-drawing-rejected" },
    revision_requested: { icon: "🔁", label: "Revision Needed",  cls: "badge-drawing-revision_requested" },
  }[status] || { icon: "·", label: status, cls: "" };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateOnly(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtBytes(n) {
  if (n == null) return "";
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
  return (n / 1048576).toFixed(1) + " MB";
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, " ");
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Create project modal (designer start screen) ─────────────────────────────
function openCreateModal() {
  document.getElementById("createProjectName").value = "";
  document.getElementById("createProjectClient").value = "";
  document.getElementById("createProjectError2").hidden = true;
  document.getElementById("createProjectModal2").hidden = false;
}

function closeCreateModal() {
  document.getElementById("createProjectModal2").hidden = true;
}

async function handleCreateProject() {
  const name   = document.getElementById("createProjectName").value.trim();
  const client = document.getElementById("createProjectClient").value.trim();
  const errEl  = document.getElementById("createProjectError2");
  const btn    = document.getElementById("createModalSubmit");
  errEl.hidden = true;

  if (!name) { errEl.textContent = "Project name is required."; errEl.hidden = false; return; }

  btn.disabled = true;
  btn.textContent = "Creating…";
  try {
    const res = await apiFetch("/api/project/create", {
      method: "POST",
      body: JSON.stringify({ name, clientName: client || undefined }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create project.");
    // Reload page with the new project selected
    window.location.href = `/designer?projectId=${data.projectId}`;
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
    btn.disabled = false;
    btn.textContent = "Create & Open";
  }
}
