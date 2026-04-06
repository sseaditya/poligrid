// ─── Designer Portal ──────────────────────────────────────────────────────────

let _session, _profile;
let _currentProjectId = null;
let _reviewDrawingId  = null;
let _allDesigners     = [];    // profiles with role=designer

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
      await AuthClient.requireAuth(["admin", "designer", "lead_designer"]));
  } catch { window.location.href = "/login"; return; }

  AuthClient.renderUserChip(_profile, document.getElementById("userChipWrap"));
  renderNav(_profile);

  const isLead = ["lead_designer", "admin"].includes(_profile.role);

  await Promise.all([
    loadProjects(),
    isLead ? loadDesigners() : Promise.resolve(),
  ]);

  // Show assignment panel for lead/admin
  if (isLead) {
    document.getElementById("assignmentPanel").hidden = false;
    document.getElementById("addAssignmentBtn").addEventListener("click", openAssignModal);
    document.getElementById("assignModalClose").addEventListener("click", closeAssignModal);
    document.getElementById("assignCancelBtn").addEventListener("click", closeAssignModal);
    document.getElementById("assignSaveBtn").addEventListener("click", handleAssignSave);
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
  document.getElementById("uploadBtn").addEventListener("click", () => { document.getElementById("uploadModal").hidden = false; });
  document.getElementById("uploadModalClose").addEventListener("click", closeUploadModal);
  document.getElementById("uploadCancelBtn").addEventListener("click", closeUploadModal);
  document.getElementById("uploadForm").addEventListener("submit", handleUpload);
  document.getElementById("reviewModalClose").addEventListener("click", () => { document.getElementById("reviewModal").hidden = true; });
  document.getElementById("reviewApproveBtn").addEventListener("click",  () => submitReview("approved"));
  document.getElementById("reviewRevisionBtn").addEventListener("click", () => submitReview("revision_requested"));
  document.getElementById("reviewRejectBtn").addEventListener("click",   () => submitReview("rejected"));
  document.getElementById("downloadZipBtn").addEventListener("click", handleZipDownload);
  document.getElementById("fileViewerClose").addEventListener("click", () => { document.getElementById("fileViewerModal").hidden = true; });
})();

// ─── Nav ─────────────────────────────────────────────────────────────────────
function renderNav(profile) {
  const nav = document.getElementById("dashNav");
  const links = [{ href: "/homepage", label: "Home" }, { href: "/projects", label: "Projects" }];
  if (["sales", "admin", "lead_designer"].includes(profile.role)) {
    links.push({ href: "/index", label: "Fitout Planner" });
  }
  links.push({ href: "/designer", label: "Drawings", active: true });
  if (profile.role === "admin") {
    links.push({ href: "/admin", label: "Admin" });
    links.push({ href: "/ceo",   label: "Dashboard" });
  }
  nav.innerHTML = links.map(l =>
    `<a class="dash-nav-link${l.active ? " active" : ""}" href="${l.href}">${l.label}</a>`
  ).join("");
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
    const sel = document.getElementById("assignDesignerSelect");
    sel.innerHTML = `<option value="">Select designer…</option>` +
      _allDesigners.map(u =>
        `<option value="${u.id}">${u.full_name} (${ROLE_LABELS[u.role] || u.role})</option>`
      ).join("");
  } catch { /* silently ignore */ }
}

const ROLE_LABELS = {
  sales: "Sales", designer: "Designer",
  lead_designer: "Lead Designer", admin: "Admin", ceo: "CEO",
};

function selectProject(projectId) {
  _currentProjectId = projectId;
  document.getElementById("uploadBtn").disabled = !projectId;
  document.getElementById("downloadZipBtn").disabled = !projectId;
  document.getElementById("progressWrap").hidden = !projectId;

  if (!projectId) {
    document.getElementById("drawingsHint").textContent = "Select a project to view drawings.";
    document.getElementById("drawingsHint").hidden = false;
    document.getElementById("drawingsByType").innerHTML = "";
    document.getElementById("assignmentList").innerHTML = `<p class="loading-hint">No drawing types assigned yet.</p>`;
    updateProgress([]);
    return;
  }
  loadAll(projectId);
}

async function loadAll(projectId) {
  const isLead = ["lead_designer", "admin"].includes(_profile.role);
  await Promise.all([
    loadDrawings(projectId),
    isLead ? loadAssignments(projectId) : loadProgressOnly(projectId),
  ]);
}

// Progress bar for non-lead roles (read-only, no assignment panel)
async function loadProgressOnly(projectId) {
  try {
    const res = await apiFetch(`/api/drawings/assignments?projectId=${projectId}`);
    const { assignments } = await res.json();
    updateProgress(assignments);
  } catch { updateProgress([]); }
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

    updateProgress(assignments);

    if (!assignments.length) {
      wrap.innerHTML = `<p class="loading-hint">No drawing types assigned yet. Use "+ Assign Drawing Type" to get started.</p>`;
      return;
    }

    wrap.innerHTML = `<div class="assignment-table">
      <div class="assignment-header">
        <span>Type</span><span>Designer</span><span>Deadline</span><span>Status</span><span></span>
      </div>
      ${assignments.map(a => assignmentRow(a)).join("")}
    </div>`;

    wrap.querySelectorAll(".delete-assignment-btn").forEach(btn => {
      btn.addEventListener("click", () => deleteAssignment(btn.dataset.id));
    });
  } catch {
    wrap.innerHTML = `<p class="loading-hint">Failed to load assignments.</p>`;
  }
}

function assignmentRow(a) {
  const { icon, label, cls } = assignmentStatusMeta(a.status);
  const deadline = a.deadline
    ? new Date(a.deadline + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "—";
  const isOverdue = a.deadline && a.status !== "approved" && new Date(a.deadline) < new Date();
  return `
    <div class="assignment-row">
      <span class="assignment-type">${capitalize(a.drawing_type)}</span>
      <span class="assignment-designer">${escHtml(a.assignee?.full_name || "Unassigned")}</span>
      <span class="assignment-deadline${isOverdue ? " overdue" : ""}">${deadline}${isOverdue ? " ⚠" : ""}</span>
      <span class="badge ${cls}">${icon} ${label}</span>
      <button class="ghost-sm danger-sm delete-assignment-btn" data-id="${a.id}" title="Remove assignment">✕</button>
    </div>`;
}

async function deleteAssignment(assignmentId) {
  if (!confirm("Remove this drawing assignment?")) return;
  try {
    await apiFetch("/api/drawings/assignments/delete", {
      method: "POST",
      body: JSON.stringify({ assignmentId }),
    });
    loadAssignments(_currentProjectId);
  } catch (err) {
    alert("Failed to remove: " + err.message);
  }
}

// ─── Assign modal ─────────────────────────────────────────────────────────────
function openAssignModal() {
  document.getElementById("assignDrawingType").value = "";
  document.getElementById("assignDesignerSelect").value = "";
  document.getElementById("assignDeadline").value = "";
  document.getElementById("assignNotes").value = "";
  document.getElementById("assignError").hidden = true;
  document.getElementById("assignModal").hidden = false;
}

function closeAssignModal() {
  document.getElementById("assignModal").hidden = true;
}

async function handleAssignSave() {
  const drawingType  = document.getElementById("assignDrawingType").value;
  const assignedTo   = document.getElementById("assignDesignerSelect").value || null;
  const deadline     = document.getElementById("assignDeadline").value || null;
  const notes        = document.getElementById("assignNotes").value.trim() || null;
  const errEl        = document.getElementById("assignError");
  const btn          = document.getElementById("assignSaveBtn");
  errEl.hidden = true;

  if (!drawingType) { errEl.textContent = "Please select a drawing type."; errEl.hidden = false; return; }

  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    const res = await apiFetch("/api/drawings/assignments/upsert", {
      method: "POST",
      body: JSON.stringify({ projectId: _currentProjectId, drawingType, assignedTo, deadline, notes }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    closeAssignModal();
    loadAssignments(_currentProjectId);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Assignment";
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

    // Group by drawing type
    const byType = {};
    for (const d of drawings) {
      (byType[d.drawing_type] = byType[d.drawing_type] || []).push(d);
    }

    wrap.innerHTML = Object.entries(byType).map(([type, items]) => `
      <div class="drawings-group">
        <h3 class="drawings-group-title">${capitalize(type)}</h3>
        <div class="drawings-group-list">${items.map(d => drawingCard(d)).join("")}</div>
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
  } catch {
    hint.textContent = "Failed to load drawings.";
  }
}

function drawingCard(d) {
  const canReview = ["lead_designer", "admin"].includes(_profile.role) && d.status === "pending_review";
  const latestReview = d.drawing_reviews?.[0];
  const { icon, label, cls } = statusMeta(d.status);
  const ext = (d.file_name || "").split(".").pop().toLowerCase();
  const canPreview = ["pdf", "png", "jpg", "jpeg", "gif", "webp"].includes(ext);
  const fileSize = d.file_size_bytes ? fmtBytes(d.file_size_bytes) : null;

  return `
    <div class="drawing-card status-${d.status}">
      <div class="drawing-card-top">
        <div class="drawing-card-info">
          <span class="drawing-title">${escHtml(d.title)}</span>
          <span class="drawing-meta">
            v${d.version_number}
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
      </div>
    </div>`;
}

// ─── File viewer ──────────────────────────────────────────────────────────────
async function openFileViewer(filePath, fileName) {
  const modal   = document.getElementById("fileViewerModal");
  const titleEl = document.getElementById("fileViewerTitle");
  const bodyEl  = document.getElementById("fileViewerBody");
  const loadEl  = document.getElementById("fileViewerLoading");
  const dlBtn   = document.getElementById("fileViewerDownload");

  titleEl.textContent = fileName || "Drawing";
  bodyEl.innerHTML = "";
  loadEl.style.display = "flex";
  loadEl.innerHTML = `<div class="fv-spinner"></div><span>Loading…</span>`;
  modal.hidden = false;

  // Wire up the download button in the header
  dlBtn.onclick = () => downloadFile(filePath, fileName);

  try {
    const res = await apiFetch(`/api/drawings/signed-url?path=${encodeURIComponent(filePath)}`);
    const { url } = await res.json();
    loadEl.style.display = "none";

    const ext = (fileName || "").split(".").pop().toLowerCase();

    if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = fileName;
      img.className = "file-viewer-image";
      img.onload = () => { loadEl.style.display = "none"; };
      bodyEl.appendChild(img);
    } else if (ext === "pdf") {
      const iframe = document.createElement("iframe");
      iframe.src = url;
      iframe.className = "file-viewer-iframe";
      iframe.title = fileName;
      bodyEl.appendChild(iframe);
    } else {
      bodyEl.innerHTML = `
        <div class="file-viewer-download-prompt">
          <div class="file-viewer-icon">📄</div>
          <p class="drawing-title">${escHtml(fileName)}</p>
          <p class="text-dim">This file type cannot be previewed in the browser.</p>
        </div>`;
    }
  } catch (err) {
    loadEl.innerHTML = `<span style="color:var(--danger)">Could not load file: ${escHtml(err.message)}</span>`;
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
function closeUploadModal() {
  document.getElementById("uploadModal").hidden = true;
  document.getElementById("uploadForm").reset();
  document.getElementById("uploadError").hidden = true;
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
