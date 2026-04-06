// ─── Project Detail Page ───────────────────────────────────────────────────────

let _session, _profile, _project, _team, _drawings, _drawingStats;
let _projectId;

const STATUS_OPTIONS = [
  { value: "active",        label: "Active" },
  { value: "advanced_paid", label: "Advance Paid" },
  { value: "in_progress",   label: "In Progress" },
  { value: "completed",     label: "Completed" },
  { value: "on_hold",       label: "On Hold" },
  { value: "cancelled",     label: "Cancelled" },
];

const ROLE_LABELS = {
  admin: "Admin", sales: "Sales", designer: "Designer",
  lead_designer: "Lead Designer", ceo: "CEO",
};

const DRAWING_TYPE_LABELS = {
  civil: "Civil", electrical: "Electrical", plumbing: "Plumbing",
  hvac: "HVAC", firefighting: "Fire Fighting", architectural: "Architectural",
  structural: "Structural", interior: "Interior", landscape: "Landscape", other: "Other",
};

(async () => {
  try {
    ({ session: _session, profile: _profile } = await AuthClient.requireAuth());
  } catch { window.location.href = "/login"; return; }

  _projectId = new URLSearchParams(location.search).get("id");
  if (!_projectId) { window.location.href = "/projects"; return; }

  AuthClient.renderUserChip(_profile, document.getElementById("userChipWrap"));
  renderNav(_profile);

  await loadDetail();

  // Edit modal wiring
  document.getElementById("editModalClose").addEventListener("click", closeEditModal);
  document.getElementById("editCancel").addEventListener("click", closeEditModal);
  document.getElementById("editSave").addEventListener("click", handleSaveDetails);
})();

function renderNav(profile) {
  const nav = document.getElementById("dashNav");
  const links = [
    { href: "/homepage", label: "Home" },
    { href: "/projects", label: "Projects" },
  ];
  if (["sales", "admin", "lead_designer"].includes(profile.role)) {
    links.push({ href: "/index", label: "Fitout Planner" });
  }
  if (["designer", "lead_designer", "admin"].includes(profile.role)) {
    links.push({ href: "/designer", label: "Drawings" });
  }
  if (profile.role === "admin") {
    links.push({ href: "/admin", label: "Admin" });
    links.push({ href: "/ceo", label: "Dashboard" });
  }
  if (profile.role === "ceo") {
    links.push({ href: "/ceo", label: "Dashboard" });
  }
  nav.innerHTML = links.map(l =>
    `<a class="dash-nav-link${l.active ? " active" : ""}" href="${l.href}">${l.label}</a>`
  ).join("");
}

async function loadDetail() {
  const main = document.getElementById("projectMain");
  try {
    const res = await apiFetch(`/api/project/detail?id=${_projectId}`);
    if (!res.ok) {
      const d = await res.json();
      main.innerHTML = `<p class="loading-hint">${escHtml(d.error || "Failed to load project.")}</p>`;
      return;
    }
    const data = await res.json();
    _project      = data.project;
    _team         = data.team;
    _drawings     = data.drawings;
    _drawingStats = data.drawingStats;

    document.title = `Poligrid — ${_project.name || "Project"}`;
    renderDetail(data);
  } catch (err) {
    main.innerHTML = `<p class="loading-hint">Failed to load project.</p>`;
  }
}

function renderDetail({ project, team, drawings, drawingStats, thumbnailUrl, rendersCount }) {
  const canEdit   = ["admin", "lead_designer", "sales", "designer"].includes(_profile.role);
  const canStatus = ["admin", "lead_designer"].includes(_profile.role);
  const canPay    = ["admin", "sales"].includes(_profile.role);
  const canAssign = ["admin", "lead_designer"].includes(_profile.role);

  const statusLabel  = STATUS_OPTIONS.find(o => o.value === project.status)?.label || project.status;
  const date         = new Date(project.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const createdDate  = new Date(project.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  const meta = [project.property_type, project.bhk, project.bhk_type,
    project.total_area_m2 ? project.total_area_m2 + " m²" : null].filter(Boolean).join("  ·  ");

  // Progress bar
  const total       = drawingStats.total;
  const approvedPct = total ? Math.round((drawingStats.approved / total) * 100) : 0;
  const pendingPct  = total ? Math.round((drawingStats.pending / total) * 100) : 0;

  // Group drawings by type
  const byType = {};
  for (const d of drawings) {
    if (!byType[d.drawing_type]) byType[d.drawing_type] = [];
    byType[d.drawing_type].push(d);
  }

  const statusSelectHtml = canStatus
    ? `<select class="ctx-input ctx-input-sm status-inline-select" id="statusSelect">
        ${STATUS_OPTIONS.map(o => `<option value="${o.value}" ${project.status === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
      </select>`
    : `<span class="badge badge-proj-${project.status}">${statusLabel}</span>`;

  document.getElementById("projectMain").innerHTML = `
    <!-- ── Hero ── -->
    <div class="proj-detail-hero">
      <div class="proj-detail-title-row">
        <div>
          <h1 class="proj-detail-name">${escHtml(project.name || "Untitled")}</h1>
          ${project.client_name ? `<p class="proj-detail-client">${escHtml(project.client_name)}</p>` : ""}
        </div>
        <div class="proj-detail-hero-actions">
          <div class="proj-detail-status-wrap">
            ${statusSelectHtml}
          </div>
          ${project.advance_payment_done
            ? `<span class="badge badge-advance" title="Advance payment received">₹ Advance Paid</span>`
            : canPay
              ? `<button class="ghost-btn btn-sm" id="markPaidBtn">Mark Advance Paid</button>`
              : ""}
          ${canEdit ? `<button class="ghost-btn btn-sm" id="editDetailsBtn">Edit Details</button>` : ""}
        </div>
      </div>
      ${meta ? `<p class="proj-detail-meta">${escHtml(meta)}</p>` : ""}
      <p class="proj-detail-dates">Created ${createdDate} · Updated ${date}</p>
    </div>

    <!-- ── Quick Actions ── -->
    <div class="proj-detail-actions-bar">
      ${["sales", "admin", "lead_designer"].includes(_profile.role)
        ? `<a class="primary-btn btn-sm" href="/index?id=${project.id}">Open Fitout Planner →</a>` : ""}
      ${["designer", "lead_designer", "admin"].includes(_profile.role)
        ? `<a class="ghost-btn btn-sm" href="/designer?projectId=${project.id}">View Drawings →</a>` : ""}
    </div>

    <div class="proj-detail-grid">

      <!-- ── Team ── -->
      <div class="dash-section proj-detail-section">
        <div class="dash-section-head">
          <h2 class="dash-section-title">Team</h2>
          ${canAssign ? `<button class="ghost-sm" id="assignTeamBtn">+ Assign Member</button>` : ""}
        </div>
        <div id="teamSection">
          ${team.length
            ? `<div class="team-chips" id="teamChips">
                ${team.map(t => `
                  <div class="team-chip">
                    <span class="team-chip-name">${escHtml(t.profile?.full_name || "Unknown")}</span>
                    <span class="team-chip-role role-${t.profile?.role}">${ROLE_LABELS[t.profile?.role] || t.profile?.role || ""}</span>
                    ${canAssign ? `<button class="ghost-sm danger-sm unassign-btn" data-uid="${t.user_id}" title="Remove">✕</button>` : ""}
                  </div>`).join("")}
              </div>`
            : `<p class="loading-hint">No team members assigned yet.</p>`}
        </div>

        ${canAssign ? `
          <div id="assignRow" hidden style="margin-top:12px;display:flex;gap:8px;align-items:flex-end">
            <label class="field-label" style="flex:1">
              Assign member
              <select class="ctx-input" id="assignUserSelect">
                <option value="">Loading users…</option>
              </select>
            </label>
            <button class="primary-btn btn-sm" id="assignConfirmBtn">Assign</button>
            <button class="ghost-sm" id="assignCancelBtn">Cancel</button>
          </div>` : ""}
      </div>

      <!-- ── Drawings Progress ── -->
      <div class="dash-section proj-detail-section">
        <div class="dash-section-head">
          <h2 class="dash-section-title">Drawings</h2>
          <a class="ghost-sm" href="/designer?projectId=${project.id}">Manage →</a>
        </div>
        ${total > 0 ? `
          <div class="draw-stat-summary">
            <div class="draw-progress-track" style="margin-bottom:8px">
              <div class="draw-progress-fill-approved" style="width:${approvedPct}%"></div>
              <div class="draw-progress-fill-pending"  style="width:${pendingPct}%"></div>
            </div>
            <div class="draw-stat-row">
              <span class="draw-stat-chip approved">${drawingStats.approved} Approved</span>
              <span class="draw-stat-chip pending">${drawingStats.pending} Pending</span>
              ${drawingStats.revision ? `<span class="draw-stat-chip revision">${drawingStats.revision} Revision</span>` : ""}
              ${drawingStats.rejected ? `<span class="draw-stat-chip rejected">${drawingStats.rejected} Rejected</span>` : ""}
              <span class="draw-stat-chip total">${total} Total</span>
            </div>
          </div>
          <div class="draw-type-list">
            ${Object.entries(byType).map(([type, items]) => {
              const approved = items.filter(d => d.status === "approved").length;
              return `
                <div class="draw-type-row">
                  <span class="draw-type-label">${escHtml(DRAWING_TYPE_LABELS[type] || type)}</span>
                  <div class="draw-type-items">
                    ${items.map(d => `
                      <span class="badge badge-drawing-${d.status}" title="${escHtml(d.title)}">v${items.indexOf(d) + 1}</span>
                    `).join("")}
                  </div>
                  <span class="draw-type-count">${approved}/${items.length}</span>
                </div>`;
            }).join("")}
          </div>
        ` : `<p class="loading-hint">No drawings uploaded yet.</p>`}
      </div>

      <!-- ── Property Details ── -->
      <div class="dash-section proj-detail-section">
        <div class="dash-section-head">
          <h2 class="dash-section-title">Property Details</h2>
        </div>
        <div class="proj-info-grid">
          <div class="proj-info-item">
            <span class="proj-info-label">Type</span>
            <span class="proj-info-value">${escHtml(project.property_type || "—")}</span>
          </div>
          <div class="proj-info-item">
            <span class="proj-info-label">BHK</span>
            <span class="proj-info-value">${escHtml(project.bhk || "—")}</span>
          </div>
          <div class="proj-info-item">
            <span class="proj-info-label">Configuration</span>
            <span class="proj-info-value">${escHtml(project.bhk_type || "—")}</span>
          </div>
          <div class="proj-info-item">
            <span class="proj-info-label">Area</span>
            <span class="proj-info-value">${project.total_area_m2 ? project.total_area_m2 + " m²" : "—"}</span>
          </div>
          <div class="proj-info-item">
            <span class="proj-info-label">Orientation</span>
            <span class="proj-info-value">${escHtml(project.orientation || "—")}</span>
          </div>
          <div class="proj-info-item">
            <span class="proj-info-label">Renders</span>
            <span class="proj-info-value">${rendersCount}</span>
          </div>
        </div>
        ${project.global_brief ? `
          <div style="margin-top:12px">
            <p class="proj-info-label">Design Brief</p>
            <p style="font-size:13px;color:var(--text-dim);margin-top:4px;white-space:pre-wrap">${escHtml(project.global_brief)}</p>
          </div>` : ""}
      </div>

      <!-- ── Floor Plan ── -->
      <div class="dash-section proj-detail-section">
        <div class="dash-section-head">
          <h2 class="dash-section-title">Floor Plan</h2>
        </div>
        ${thumbnailUrl
          ? `<img class="proj-detail-floorplan" src="${escHtml(thumbnailUrl)}" alt="Floor plan" />`
          : `<p class="loading-hint">No floor plan uploaded yet.</p>`}
      </div>

    </div>`;

  // Wire status change
  if (canStatus) {
    document.getElementById("statusSelect")?.addEventListener("change", handleStatusChange);
  }

  // Wire advance payment
  if (!project.advance_payment_done && canPay) {
    document.getElementById("markPaidBtn")?.addEventListener("click", handleMarkPaid);
  }

  // Wire edit button
  if (canEdit) {
    document.getElementById("editDetailsBtn")?.addEventListener("click", openEditModal);
  }

  // Wire team assign
  if (canAssign) {
    document.getElementById("assignTeamBtn")?.addEventListener("click", openAssignRow);
    document.getElementById("assignCancelBtn")?.addEventListener("click", closeAssignRow);
    document.getElementById("assignConfirmBtn")?.addEventListener("click", handleAssign);
    document.querySelectorAll(".unassign-btn").forEach(btn => {
      btn.addEventListener("click", () => handleUnassign(btn.dataset.uid));
    });
    loadUsersForAssign();
  }
}

async function handleStatusChange(e) {
  const newStatus = e.target.value;
  try {
    const res = await apiFetch("/api/project/update-status", {
      method: "POST",
      body: JSON.stringify({ projectId: _projectId, status: newStatus }),
    });
    if (!res.ok) {
      const d = await res.json();
      alert(d.error || "Failed to update status.");
      e.target.value = _project.status; // revert
    } else {
      _project.status = newStatus;
    }
  } catch {
    e.target.value = _project.status;
  }
}

async function handleMarkPaid() {
  const btn = document.getElementById("markPaidBtn");
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    const res = await apiFetch("/api/project/advance-payment", {
      method: "POST",
      body: JSON.stringify({ projectId: _projectId, done: true }),
    });
    if (res.ok) {
      _project.advance_payment_done = true;
      await loadDetail(); // re-render
    } else {
      btn.disabled = false;
      btn.textContent = "Mark Advance Paid";
    }
  } catch {
    btn.disabled = false;
    btn.textContent = "Mark Advance Paid";
  }
}

// ─── Edit details modal ───────────────────────────────────────────────────────
function openEditModal() {
  document.getElementById("editName").value         = _project.name || "";
  document.getElementById("editClient").value       = _project.client_name || "";
  document.getElementById("editPropertyType").value = _project.property_type || "";
  document.getElementById("editBhk").value          = _project.bhk || "";
  document.getElementById("editBhkType").value      = _project.bhk_type || "";
  document.getElementById("editArea").value         = _project.total_area_m2 || "";
  document.getElementById("editBrief").value        = _project.global_brief || "";
  document.getElementById("editError").hidden       = true;
  document.getElementById("editModal").hidden       = false;
}

function closeEditModal() {
  document.getElementById("editModal").hidden = true;
}

async function handleSaveDetails() {
  const btn   = document.getElementById("editSave");
  const errEl = document.getElementById("editError");
  errEl.hidden = true;

  const body = {
    projectId:    _projectId,
    name:         document.getElementById("editName").value.trim() || undefined,
    clientName:   document.getElementById("editClient").value.trim() || undefined,
    propertyType: document.getElementById("editPropertyType").value.trim() || undefined,
    bhk:          document.getElementById("editBhk").value.trim() || undefined,
    bhkType:      document.getElementById("editBhkType").value.trim() || undefined,
    totalAreaM2:  parseFloat(document.getElementById("editArea").value) || undefined,
    globalBrief:  document.getElementById("editBrief").value.trim() || undefined,
  };

  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    const res = await apiFetch("/api/project/update", { method: "POST", body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Save failed.");
    closeEditModal();
    await loadDetail();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
    btn.disabled = false;
    btn.textContent = "Save Changes";
  }
}

// ─── Team assignment ──────────────────────────────────────────────────────────
async function loadUsersForAssign() {
  try {
    const res = await apiFetch("/api/users/list");
    const { users } = await res.json();
    const select = document.getElementById("assignUserSelect");
    if (!select) return;
    const assignedIds = new Set(_team.map(t => t.user_id));
    select.innerHTML = `<option value="">Select a user…</option>` +
      (users || [])
        .filter(u => !assignedIds.has(u.id))
        .map(u => `<option value="${u.id}">${escHtml(u.full_name)} (${ROLE_LABELS[u.role] || u.role})</option>`)
        .join("");
  } catch { /* silent */ }
}

function openAssignRow() {
  const row = document.getElementById("assignRow");
  if (row) { row.hidden = false; row.style.display = "flex"; }
}

function closeAssignRow() {
  const row = document.getElementById("assignRow");
  if (row) row.hidden = true;
}

async function handleAssign() {
  const userId = document.getElementById("assignUserSelect")?.value;
  if (!userId) return;
  const btn = document.getElementById("assignConfirmBtn");
  btn.disabled = true;
  btn.textContent = "Assigning…";
  try {
    const res = await apiFetch("/api/project/assign-user", {
      method: "POST",
      body: JSON.stringify({ projectId: _projectId, userId }),
    });
    if (res.ok) {
      closeAssignRow();
      await loadDetail();
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "Assign";
  }
}

async function handleUnassign(userId) {
  if (!confirm("Remove this team member from the project?")) return;
  try {
    await apiFetch("/api/project/unassign-user", {
      method: "POST",
      body: JSON.stringify({ projectId: _projectId, userId }),
    });
    await loadDetail();
  } catch { /* silent */ }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const session = await AuthClient.getSession();
  return fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(opts.headers || {}),
    },
  });
}

function escHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
