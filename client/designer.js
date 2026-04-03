// ─── Designer Portal ──────────────────────────────────────────────────────────

let _session, _profile, _currentProjectId, _reviewDrawingId;

(async () => {
  try {
    ({ session: _session, profile: _profile } =
      await AuthClient.requireAuth(["admin", "designer", "lead_designer"]));
  } catch { return; }

  AuthClient.renderUserChip(_profile, document.getElementById("userChipWrap"));
  renderNav(_profile);

  await loadProjects();

  // Pre-select project from URL
  const urlProjectId = new URLSearchParams(location.search).get("projectId");
  if (urlProjectId) {
    document.getElementById("projectSelect").value = urlProjectId;
    selectProject(urlProjectId);
  }

  document.getElementById("projectSelect").addEventListener("change", e => selectProject(e.target.value));

  document.getElementById("uploadBtn").addEventListener("click", () => {
    document.getElementById("uploadModal").hidden = false;
  });

  document.getElementById("uploadModalClose").addEventListener("click", closeUploadModal);
  document.getElementById("uploadCancelBtn").addEventListener("click", closeUploadModal);
  document.getElementById("uploadForm").addEventListener("submit", handleUpload);

  document.getElementById("reviewModalClose").addEventListener("click", () => {
    document.getElementById("reviewModal").hidden = true;
  });
  document.getElementById("reviewApproveBtn").addEventListener("click",  () => submitReview("approved"));
  document.getElementById("reviewRevisionBtn").addEventListener("click", () => submitReview("revision_requested"));
  document.getElementById("reviewRejectBtn").addEventListener("click",   () => submitReview("rejected"));
})();

// ─── Nav ─────────────────────────────────────────────────────────────────────
function renderNav(profile) {
  const nav = document.getElementById("dashNav");
  const links = [{ href: "/homepage.html", label: "Home" }];

  if (["sales", "admin", "lead_designer"].includes(profile.role)) {
    links.push({ href: "/index.html", label: "Fitout Planner" });
  }
  links.push({ href: "/designer.html", label: "Drawings", active: true });
  if (profile.role === "admin") {
    links.push({ href: "/admin.html", label: "Admin" });
    links.push({ href: "/ceo.html",   label: "Dashboard" });
  }

  nav.innerHTML = links.map(l =>
    `<a class="dash-nav-link${l.active ? " active" : ""}" href="${l.href}">${l.label}</a>`
  ).join("");
}

// ─── Projects ─────────────────────────────────────────────────────────────────
async function loadProjects() {
  const select = document.getElementById("projectSelect");
  try {
    const res = await fetch("/api/project/list", {
      headers: { Authorization: `Bearer ${_session.access_token}` },
    });
    const { projects } = await res.json();
    if (!projects?.length) {
      select.innerHTML = `<option value="">No projects assigned</option>`;
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

function selectProject(projectId) {
  _currentProjectId = projectId;
  document.getElementById("uploadBtn").disabled = !projectId;
  if (!projectId) {
    document.getElementById("drawingsHint").textContent = "Select a project to view drawings.";
    document.getElementById("drawingsHint").hidden = false;
    document.getElementById("drawingsByType").innerHTML = "";
    return;
  }
  loadDrawings(projectId);
}

// ─── Drawings list ────────────────────────────────────────────────────────────
async function loadDrawings(projectId) {
  const hint = document.getElementById("drawingsHint");
  const wrap = document.getElementById("drawingsByType");
  hint.textContent = "Loading drawings…";
  hint.hidden = false;
  wrap.innerHTML = "";

  try {
    const res = await fetch(`/api/drawings/list?projectId=${projectId}`, {
      headers: { Authorization: `Bearer ${_session.access_token}` },
    });
    const { drawings } = await res.json();

    if (!drawings?.length) {
      hint.textContent = "No drawings yet. Upload the first one.";
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
        <div class="drawings-group-list">${items.map(drawingCard).join("")}</div>
      </div>
    `).join("");

    // Wire "View file" buttons (fetch signed URL then open)
    wrap.querySelectorAll(".view-file-btn").forEach(btn => {
      btn.addEventListener("click", () => openFile(btn.dataset.path, btn));
    });

    // Wire review buttons (lead_designer / admin only)
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
  // Most recent review comment (reviews are ordered desc in the query)
  const latestReview = d.drawing_reviews?.[0];
  const { icon, label, cls } = statusMeta(d.status);

  return `
    <div class="drawing-card status-border-${d.status}">
      <div class="drawing-card-top">
        <div class="drawing-card-info">
          <span class="drawing-title">${escHtml(d.title)}</span>
          <span class="drawing-meta">
            v${d.version_number}
            &nbsp;·&nbsp; ${escHtml(d.uploader?.full_name || "Unknown")}
            &nbsp;·&nbsp; ${fmtDate(d.created_at)}
            ${d.file_name ? `&nbsp;·&nbsp; <span class="drawing-filename">${escHtml(d.file_name)}</span>` : ""}
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
        <button class="ghost-sm view-file-btn" data-path="${escHtml(d.file_path)}">
          ↗ View file
        </button>
        ${canReview ? `
          <button class="primary-btn btn-sm review-btn" data-id="${d.id}" data-title="${escHtml(d.title)}">
            Review drawing
          </button>` : ""}
      </div>
    </div>
  `;
}

// ─── File viewing (fetches signed URL with auth, opens in new tab) ────────────
async function openFile(filePath, btn) {
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Opening…";
  try {
    const res = await fetch(`/api/drawings/signed-url?path=${encodeURIComponent(filePath)}`, {
      headers: { Authorization: `Bearer ${_session.access_token}` },
    });
    if (!res.ok) throw new Error("Could not generate link.");
    const { url } = await res.json();
    window.open(url, "_blank", "noreferrer");
  } catch (err) {
    alert("Could not open file: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
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

    const res = await fetch("/api/drawings/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${_session.access_token}` },
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
    loadDrawings(_currentProjectId);
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
    const res = await fetch("/api/drawings/review", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${_session.access_token}` },
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
    loadDrawings(_currentProjectId);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
    btns.forEach(b => b.disabled = false);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function statusMeta(status) {
  return {
    pending_review:     { icon: "⏳", label: "Pending Review",   cls: "badge-drawing-pending_review" },
    approved:           { icon: "✅", label: "Approved",          cls: "badge-drawing-approved" },
    rejected:           { icon: "❌", label: "Rejected",          cls: "badge-drawing-rejected" },
    revision_requested: { icon: "🔁", label: "Revision Needed",   cls: "badge-drawing-revision_requested" },
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

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, " ");
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
