// ─── Project Detail — Unified Role-Based Workspace ───────────────────────────

let _session, _profile, _project, _team, _drawings, _drawingStats;
let _projectId;
let _versions  = [];   // for renders / stage-1 concepts (sales, designer, lead, admin)
let _myTasks   = [];   // for designer
let _reviewDrawingId = null;

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

const DRAWING_STATUS_LABELS = {
  pending_review:     "Pending Review",
  approved:           "Approved",
  rejected:           "Rejected",
  revision_requested: "Revision",
};

// ── Role helpers ──────────────────────────────────────────────────────────────
const is = (...roles) => roles.includes(_profile?.role);
const can = {
  editProject:    () => is("admin", "lead_designer", "sales", "designer"),
  changeStatus:   () => is("admin", "lead_designer"),
  markPaid:       () => is("admin", "sales"),
  assignTeam:     () => is("admin", "lead_designer"),
  reviewDrawings: () => is("admin", "lead_designer"),
  uploadDrawings: () => is("admin", "lead_designer", "designer"),
  seeAIResults:   () => is("admin", "sales"),
  seeConcepts:    () => is("admin", "lead_designer", "designer"),
  seeDrawings:    () => is("admin", "lead_designer", "designer"),
  seeTasks:       () => is("designer"),
  fitoutPlanner:  () => is("admin", "lead_designer", "sales"),
  shareClient:    () => is("admin", "sales"),
};

// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  try {
    ({ session: _session, profile: _profile } = await AuthClient.requireAuth());
  } catch { window.location.href = "/login"; return; }

  _projectId = new URLSearchParams(location.search).get("id");
  if (!_projectId) { window.location.href = "/projects"; return; }

  AuthClient.renderUserChip(_profile, document.getElementById("userChipWrap"));
  renderNav();

  await loadAll();

  // Static modal wiring
  document.getElementById("editModalClose").addEventListener("click", closeEditModal);
  document.getElementById("editCancel").addEventListener("click", closeEditModal);
  document.getElementById("editSave").addEventListener("click", handleSaveDetails);
  document.getElementById("reviewModalClose").addEventListener("click", () => {
    document.getElementById("reviewModal").hidden = true;
  });
  document.getElementById("reviewApproveBtn").addEventListener("click",  () => submitReview("approved"));
  document.getElementById("reviewRevisionBtn").addEventListener("click", () => submitReview("revision_requested"));
  document.getElementById("reviewRejectBtn").addEventListener("click",   () => submitReview("rejected"));
})();

// ─── Data loading ─────────────────────────────────────────────────────────────
async function loadAll() {
  const main = document.getElementById("projectMain");
  try {
    // Base detail + optional parallel fetches
    const [detailRes, versionsRes, tasksRes] = await Promise.all([
      apiFetch(`/api/project/detail?id=${_projectId}`),
      apiFetch(`/api/project/versions?id=${_projectId}`).catch(() => null),
      can.seeTasks() ? apiFetch(`/api/tasks?projectId=${_projectId}&status=pending`).catch(() => null) : Promise.resolve(null),
    ]);

    if (!detailRes.ok) {
      const d = await detailRes.json();
      main.innerHTML = `<p class="loading-hint">${escHtml(d.error || "Failed to load project.")}</p>`;
      return;
    }

    const data = await detailRes.json();
    _project      = data.project;
    _team         = data.team;
    _drawings     = data.drawings;
    _drawingStats = data.drawingStats;

    if (versionsRes?.ok) {
      const vd = await versionsRes.json();
      _versions = vd.versions || [];
    }

    if (tasksRes?.ok) {
      const td = await tasksRes.json();
      _myTasks = td.tasks || [];
    }

    document.title = `Poligrid — ${_project.name || "Project"}`;
    render(data);
  } catch (err) {
    main.innerHTML = `<p class="loading-hint">Failed to load project.</p>`;
    console.error(err);
  }
}

// ─── Main render ──────────────────────────────────────────────────────────────
function render({ project, team, drawings, drawingStats, thumbnailUrl, rendersCount }) {
  const statusLabel = STATUS_OPTIONS.find(o => o.value === project.status)?.label || project.status;
  const createdDate = fmt(project.created_at);
  const updatedDate = fmt(project.updated_at);
  const meta = [project.property_type, project.bhk, project.bhk_type,
    project.total_area_m2 ? project.total_area_m2 + " m²" : null].filter(Boolean).join("  ·  ");

  const statusHtml = can.changeStatus()
    ? `<select class="ctx-input ctx-input-sm status-inline-select" id="statusSelect">
        ${STATUS_OPTIONS.map(o => `<option value="${o.value}" ${project.status === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
       </select>`
    : `<span class="badge badge-proj-${project.status}">${statusLabel}</span>`;

  const advPaidHtml = project.advance_payment_done
    ? `<span class="badge badge-advance" style="display:inline-flex;align-items:center;gap:4px">
         <span class="material-symbols-outlined" style="font-size:13px">payments</span> Advance Paid
       </span>`
    : can.markPaid()
      ? `<button class="ghost-btn btn-sm" id="markPaidBtn" style="gap:5px">
           <span class="material-symbols-outlined" style="font-size:14px">payments</span> Mark Advance Paid
         </button>`
      : "";

  const heroActionBtns = [];
  if (can.editProject())
    heroActionBtns.push(`<button class="ghost-btn btn-sm" id="editDetailsBtn">
      <span class="material-symbols-outlined" style="font-size:14px">edit</span> Edit
    </button>`);

  document.getElementById("projectMain").innerHTML = `
    <!-- ── Hero ─────────────────────────────────────────────────────────────── -->
    <div class="proj-detail-hero">
      <div class="proj-detail-title-row">
        <div>
          <p class="proj-hero-stage">
            <span class="material-symbols-outlined">home_work</span>
            ${escHtml(project.property_type || "Project")}${project.bhk ? " · " + escHtml(project.bhk) : ""}
          </p>
          <h1 class="proj-detail-name">${escHtml(project.name || "Untitled")}</h1>
          ${project.client_name ? `<p class="proj-detail-client">
            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle">person</span>
            ${escHtml(project.client_name)}
          </p>` : ""}
        </div>
        <div class="proj-detail-hero-actions">
          <div class="proj-detail-status-wrap">${statusHtml}</div>
          ${advPaidHtml}
          ${heroActionBtns.join("")}
        </div>
      </div>
      ${meta ? `<p class="proj-detail-meta">${escHtml(meta)}</p>` : ""}
      <p class="proj-detail-dates">Created ${createdDate} · Updated ${updatedDate}</p>
    </div>

    <!-- ── Workspace grid ────────────────────────────────────────────────────── -->
    <div class="proj-workspace-layout">

      <!-- ── MAIN COLUMN ───────────────────────────────────────────────────── -->
      <div class="proj-workspace-main">
        ${buildMainSections(project, drawings, drawingStats)}
      </div>

      <!-- ── SIDEBAR ───────────────────────────────────────────────────────── -->
      <div class="proj-workspace-sidebar">
        ${buildSidebarSections(project, team, drawingStats, thumbnailUrl)}
      </div>

    </div>`;

  wireInteractions(project);
}

// ─── Main column sections ─────────────────────────────────────────────────────
function buildMainSections(project, drawings, drawingStats) {
  const parts = [];

  // 1. AI Results & Estimate — sales + admin
  if (can.seeAIResults()) {
    parts.push(buildAISection(project));
  }

  // 2. Stage 1 Reference Concepts — designer + lead + admin
  if (can.seeConcepts()) {
    parts.push(buildConceptsSection());
  }

  // 3. Technical Drawings table — designer + lead + admin
  if (can.seeDrawings()) {
    parts.push(buildDrawingsSection(drawings, project));
  }

  if (!parts.length) {
    parts.push(`<div class="dash-section"><p class="loading-hint">No content available for your role on this project.</p></div>`);
  }

  return parts.join("");
}

// ── AI Results & Estimate ─────────────────────────────────────────────────────
function buildAISection(project) {
  // Use latest version with renders
  const latestWithRenders = [..._versions].reverse().find(v => v.renders?.length > 0);
  const renders = latestWithRenders?.renders || [];
  const boqTotal = latestWithRenders?.boqItems?.reduce((s, b) => s + (b.amount || 0), 0) || 0;
  const hasEstimate = boqTotal > 0;

  const renderCards = renders.slice(0, 4).map((r, i) => `
    <div class="proj-concept-card">
      ${r.url
        ? `<img class="proj-concept-img" src="${escHtml(r.url)}" alt="Concept ${i + 1}" loading="lazy" />`
        : `<div class="proj-concept-placeholder"><span class="material-symbols-outlined">auto_awesome</span></div>`}
      <div class="proj-concept-body">
        <p class="proj-concept-num">Concept ${String(i + 1).padStart(2, "0")}</p>
        <p class="proj-concept-name">${escHtml(r.name || `Design ${i + 1}`)}</p>
      </div>
    </div>`).join("");

  const emptyRenders = renders.length === 0 ? `
    <div style="grid-column:1/-1;padding:24px;text-align:center;background:var(--color-surface-container-low);border-radius:var(--radius-lg)">
      <span class="material-symbols-outlined" style="font-size:36px;color:var(--color-on-surface-variant);opacity:0.35;display:block;margin-bottom:8px">auto_awesome</span>
      <p style="font-size:13px;color:var(--color-on-surface-variant)">No renders generated yet. Open the Fitout Planner to generate AI designs.</p>
    </div>` : "";

  return `
    <div class="dash-section">
      <div class="dash-section-head">
        <div class="dash-section-icon">
          <span class="material-symbols-outlined">auto_awesome</span>
          <h2 class="dash-section-title">AI Results & Estimate</h2>
        </div>
        ${renders.length > 0 ? `<a class="ghost-sm" href="/index?id=${project.id}">Open Planner →</a>` : ""}
      </div>

      <div class="proj-ai-header">
        <div class="proj-estimate-block">
          <p class="proj-estimate-label">Estimated Project Cost</p>
          ${hasEstimate
            ? `<p class="proj-estimate-value">₹${boqTotal.toLocaleString("en-IN")}</p>
               <p class="proj-estimate-sub">Based on latest AI estimate · Hyd premium rates</p>`
            : `<p style="font-size:14px;color:var(--color-on-surface-variant);margin-top:4px">Estimate not generated yet</p>`}
        </div>
        ${hasEstimate ? `<span class="proj-ai-badge">
          <span class="material-symbols-outlined" style="font-size:13px">check_circle</span>
          ESTIMATE READY
        </span>` : ""}
      </div>

      <div class="proj-concept-grid">
        ${renderCards}
        ${emptyRenders}
      </div>

      ${renders.length > 0 ? `
        <div class="proj-report-list">
          <div class="proj-report-item">
            <span class="material-symbols-outlined proj-report-icon">payments</span>
            <div class="proj-report-info">
              <p class="proj-report-name">Cost Estimate Report</p>
              <p class="proj-report-meta">PDF · Auto-generated from BOQ</p>
            </div>
            <a class="ghost-sm proj-report-dl" href="/index?id=${project.id}" title="View in Fitout Planner">
              <span class="material-symbols-outlined" style="font-size:16px">open_in_new</span>
            </a>
          </div>
          <div class="proj-report-item">
            <span class="material-symbols-outlined proj-report-icon">description</span>
            <div class="proj-report-info">
              <p class="proj-report-name">Design Specifications</p>
              <p class="proj-report-meta">Room-by-room breakdown + BOQ</p>
            </div>
            <a class="ghost-sm proj-report-dl" href="/index?id=${project.id}" title="View in Fitout Planner">
              <span class="material-symbols-outlined" style="font-size:16px">open_in_new</span>
            </a>
          </div>
        </div>` : ""}
    </div>`;
}

// ── Stage 1 Reference Concepts ────────────────────────────────────────────────
function buildConceptsSection() {
  // Flatten inspiration images from all versions (unique by URL)
  const seen = new Set();
  const allRenders = [];
  for (const v of _versions) {
    for (const r of v.renders || []) {
      if (r.url && !seen.has(r.url)) {
        seen.add(r.url);
        allRenders.push(r);
      }
    }
  }

  const cards = allRenders.slice(0, 4).map((r, i) => `
    <div class="proj-concept-ref-card">
      <img class="proj-concept-ref-img" src="${escHtml(r.url)}" alt="Concept ${i + 1}" loading="lazy" />
      <div class="proj-concept-ref-body">
        <p class="proj-concept-ref-label">${escHtml(r.name || "Design " + (i + 1))}</p>
      </div>
    </div>`).join("");

  return `
    <div class="dash-section">
      <div class="dash-section-head">
        <div class="dash-section-icon">
          <span class="material-symbols-outlined">photo_library</span>
          <h2 class="dash-section-title">Stage 1 — Reference Concepts</h2>
        </div>
        <span class="proj-stage-locked">
          <span class="material-symbols-outlined" style="font-size:12px">lock</span>
          Locked for Editing
        </span>
      </div>
      ${allRenders.length > 0
        ? `<div class="proj-concept-ref-grid">${cards}</div>
           ${allRenders.length > 4 ? `<p class="loading-hint" style="margin-top:8px">${allRenders.length - 4} more concepts in Fitout Planner</p>` : ""}`
        : `<p class="loading-hint">No concepts generated yet. Sales team generates these in the Fitout Planner after the floor plan is processed.</p>`}
    </div>`;
}

// ── Technical Drawings ────────────────────────────────────────────────────────
function buildDrawingsSection(drawings, project) {
  const isLead = can.reviewDrawings();

  const drawingRows = drawings.map(d => {
    const statusClass = {
      pending_review: "badge-drawing-pending_review",
      approved: "badge-drawing-approved",
      rejected: "badge-drawing-rejected",
      revision_requested: "badge-drawing-revision_requested",
    }[d.status] || "badge-drawing-pending_review";

    const uploaderName = d.uploader?.full_name || "—";
    const typeLabel = DRAWING_TYPE_LABELS[d.drawing_type] || d.drawing_type || "—";
    const statusLabel = DRAWING_STATUS_LABELS[d.status] || d.status;

    let actionHtml = "";
    if (isLead) {
      if (d.status === "pending_review") {
        actionHtml = `<button class="primary-btn btn-sm review-verify-btn" data-id="${d.id}" data-title="${escHtml(d.title)}" style="width:auto;white-space:nowrap">
          <span class="material-symbols-outlined" style="font-size:13px">verified</span> Verify Now
        </button>`;
      } else if (d.status === "revision_requested") {
        actionHtml = `<button class="ghost-btn btn-sm review-verify-btn" data-id="${d.id}" data-title="${escHtml(d.title)}" style="white-space:nowrap">
          <span class="material-symbols-outlined" style="font-size:13px">rate_review</span> Review Changes
        </button>`;
      } else if (d.status === "approved") {
        actionHtml = `<span style="font-size:12px;color:var(--success);display:flex;align-items:center;gap:4px">
          <span class="material-symbols-outlined" style="font-size:14px">check_circle</span>Verified
        </span>`;
      } else {
        actionHtml = `<button class="ghost-btn btn-sm review-verify-btn" data-id="${d.id}" data-title="${escHtml(d.title)}" style="white-space:nowrap">Review</button>`;
      }
    }

    return `
      <tr>
        <td>
          <p class="proj-tbl-title">${escHtml(d.title || d.file_name || "Untitled")}</p>
          <p class="proj-tbl-sub">${escHtml(typeLabel)} · ${escHtml(d.file_name || "")}</p>
        </td>
        ${isLead ? `<td class="proj-tbl-sub">${escHtml(uploaderName)}</td>` : ""}
        <td><span class="badge ${statusClass}">${statusLabel}</span></td>
        <td class="proj-tbl-sub">${fmt(d.created_at)}</td>
        ${isLead ? `<td><div class="proj-tbl-actions">${actionHtml}</div></td>` : ""}
      </tr>`;
  }).join("");

  const pendingCount = drawings.filter(d => d.status === "pending_review").length;

  return `
    <div class="dash-section">
      <div class="dash-section-head">
        <div class="dash-section-icon">
          <span class="material-symbols-outlined">architecture</span>
          <div>
            <h2 class="dash-section-title">Technical Drawings</h2>
            ${pendingCount > 0 && isLead ? `<p class="dash-section-hint">${pendingCount} drawing${pendingCount > 1 ? "s" : ""} awaiting verification</p>` : ""}
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          ${can.uploadDrawings()
            ? `<a class="ghost-btn btn-sm" href="/designer?projectId=${project.id}" style="gap:5px">
                 <span class="material-symbols-outlined" style="font-size:14px">upload_file</span> Upload Drawing
               </a>` : ""}
          <a class="ghost-sm" href="/designer?projectId=${project.id}">Manage →</a>
        </div>
      </div>

      ${drawings.length > 0
        ? `<div class="proj-drawings-wrap">
             <table class="proj-drawings-tbl">
               <thead>
                 <tr>
                   <th>Drawing</th>
                   ${isLead ? "<th>Designer</th>" : ""}
                   <th>Status</th>
                   <th>Uploaded</th>
                   ${isLead ? "<th>Action</th>" : ""}
                 </tr>
               </thead>
               <tbody>${drawingRows}</tbody>
             </table>
           </div>`
        : `<div style="padding:24px;text-align:center;background:var(--color-surface-container-low);border-radius:var(--radius-lg)">
             <span class="material-symbols-outlined" style="font-size:32px;color:var(--color-on-surface-variant);opacity:0.35;display:block;margin-bottom:8px">architecture</span>
             <p style="font-size:13px;color:var(--color-on-surface-variant)">No drawings uploaded yet.</p>
             ${can.uploadDrawings()
               ? `<a class="ghost-btn btn-sm" href="/designer?projectId=${project.id}" style="margin-top:12px;display:inline-flex;gap:5px">
                    <span class="material-symbols-outlined" style="font-size:14px">upload_file</span> Upload First Drawing
                  </a>` : ""}
           </div>`}
    </div>`;
}

// ─── Sidebar sections ─────────────────────────────────────────────────────────
function buildSidebarSections(project, team, drawingStats, thumbnailUrl) {
  const parts = [];

  // 1. Quick Links
  parts.push(buildQuickLinks(project));

  // 2. Approval pipeline — designer, lead, admin
  if (can.seeDrawings()) {
    parts.push(buildApprovalPipeline(drawingStats, project));
  }

  // 3. Property Details — all
  parts.push(buildPropertyDetails(project));

  // 4. Floor Plan — all (if available)
  if (thumbnailUrl) {
    parts.push(buildFloorPlan(thumbnailUrl));
  }

  // 5. Team — lead + admin
  if (can.assignTeam()) {
    parts.push(buildTeamSection(team, project));
  }

  // 6. My Tasks — designer
  if (can.seeTasks()) {
    parts.push(buildTasksSection());
  }

  return parts.join("");
}

// ── Quick Links ───────────────────────────────────────────────────────────────
function buildQuickLinks(project) {
  const links = [];

  if (can.fitoutPlanner()) {
    links.push(`<a class="proj-quick-link" href="/index?id=${project.id}">
      <span class="material-symbols-outlined">design_services</span>
      <span class="proj-quick-link-label">Fitout Planner</span>
      <span class="material-symbols-outlined proj-quick-link-arrow">arrow_forward</span>
    </a>`);
  }

  if (can.seeDrawings() || can.uploadDrawings()) {
    links.push(`<a class="proj-quick-link" href="/designer?projectId=${project.id}">
      <span class="material-symbols-outlined">architecture</span>
      <span class="proj-quick-link-label">Drawings Manager</span>
      <span class="material-symbols-outlined proj-quick-link-arrow">arrow_forward</span>
    </a>`);
  }

  if (can.shareClient()) {
    links.push(`<button class="proj-quick-link" id="shareClientBtn" style="background:none;width:100%;text-align:left;cursor:pointer;border:1px solid var(--color-outline-variant)">
      <span class="material-symbols-outlined">share</span>
      <span class="proj-quick-link-label">Share with Client</span>
      <span class="material-symbols-outlined proj-quick-link-arrow">arrow_forward</span>
    </button>`);
  }

  if (!links.length) return "";

  return `
    <div class="dash-section" style="gap:12px">
      <h2 class="dash-section-title">Quick Actions</h2>
      <div class="proj-quick-links">${links.join("")}</div>
    </div>`;
}

// ── Approval pipeline ─────────────────────────────────────────────────────────
function buildApprovalPipeline(drawingStats, project) {
  const total = drawingStats.total;
  const approvedPct = total ? Math.round((drawingStats.approved / total) * 100) : 0;
  const pendingPct  = total ? Math.round((drawingStats.pending / total) * 100) : 0;

  // Determine phase states
  const phase1Done   = drawingStats.approved > 0;
  const phase2Active = drawingStats.pending > 0;
  const phase2Done   = total > 0 && drawingStats.approved === total;
  const phase3Done   = phase2Done;

  const step = (icon, state, title, desc) => `
    <div class="proj-pipeline-step">
      <div class="proj-pipeline-dot ${state}">
        <span class="material-symbols-outlined" style="font-size:15px">${icon}</span>
      </div>
      <div class="proj-pipeline-info">
        <p class="proj-pipeline-ttl">${title}</p>
        <p class="proj-pipeline-desc">${desc}</p>
      </div>
    </div>`;

  return `
    <div class="dash-section">
      <div class="dash-section-head">
        <div class="dash-section-icon">
          <span class="material-symbols-outlined">verified</span>
          <h2 class="dash-section-title">Approval Status</h2>
        </div>
        <span style="font-size:13px;font-weight:700;color:var(--color-on-surface)">${approvedPct}%</span>
      </div>

      ${total > 0 ? `
        <div class="draw-progress-track" style="margin-bottom:12px">
          <div class="draw-progress-fill-approved" style="width:${approvedPct}%"></div>
          <div class="draw-progress-fill-pending"  style="width:${pendingPct}%"></div>
        </div>
        <div class="draw-stat-row" style="margin-bottom:16px">
          <span class="draw-stat-chip approved">${drawingStats.approved} Approved</span>
          ${drawingStats.pending  ? `<span class="draw-stat-chip pending">${drawingStats.pending} Pending</span>`   : ""}
          ${drawingStats.revision ? `<span class="draw-stat-chip revision">${drawingStats.revision} Revision</span>` : ""}
          ${drawingStats.rejected ? `<span class="draw-stat-chip rejected">${drawingStats.rejected} Rejected</span>` : ""}
        </div>` : ""}

      <div class="proj-pipeline">
        ${step("check_circle", phase1Done ? "done" : "pending",
          "Initial Upload",
          phase1Done
            ? `${drawingStats.approved} drawing${drawingStats.approved !== 1 ? "s" : ""} approved`
            : total > 0 ? `${total} drawing${total !== 1 ? "s" : ""} uploaded, awaiting review` : "No drawings uploaded yet")}
        ${step("rate_review", phase2Done ? "done" : phase2Active ? "active" : "pending",
          "Design Lead Review",
          phase2Done
            ? "All drawings verified"
            : phase2Active
              ? `${drawingStats.pending} drawing${drawingStats.pending !== 1 ? "s" : ""} awaiting verification`
              : "Pending prior stage")}
        ${step("task_alt", phase3Done ? "done" : "pending",
          "Final Approval",
          phase3Done ? "Complete — ready to proceed" : "Pending full verification")}
      </div>

      ${can.reviewDrawings() && drawingStats.pending > 0
        ? `<a class="ghost-btn btn-sm" href="/designer?projectId=${project.id}" style="margin-top:4px">
             Execute Batch Review →
           </a>` : ""}
    </div>`;
}

// ── Property Details ──────────────────────────────────────────────────────────
function buildPropertyDetails(project) {
  const fields = [
    ["Type",          project.property_type],
    ["BHK",           project.bhk],
    ["Configuration", project.bhk_type],
    ["Area",          project.total_area_m2 ? project.total_area_m2 + " m²" : null],
    ["Orientation",   project.orientation],
  ].filter(([, v]) => v);

  return `
    <div class="dash-section">
      <div class="dash-section-icon" style="margin-bottom:4px">
        <span class="material-symbols-outlined">home</span>
        <h2 class="dash-section-title">Property Details</h2>
      </div>
      <div class="proj-info-grid">
        ${fields.map(([l, v]) => `
          <div class="proj-info-item">
            <span class="proj-info-label">${l}</span>
            <span class="proj-info-value">${escHtml(v)}</span>
          </div>`).join("")}
      </div>
      ${project.global_brief ? `
        <div style="margin-top:12px">
          <p class="proj-info-label">Design Brief</p>
          <p style="font-size:13px;color:var(--text-dim);margin-top:4px;white-space:pre-wrap;line-height:1.5">${escHtml(project.global_brief)}</p>
        </div>` : ""}
    </div>`;
}

// ── Floor Plan ────────────────────────────────────────────────────────────────
function buildFloorPlan(thumbnailUrl) {
  return `
    <div class="dash-section" style="gap:12px">
      <div class="dash-section-icon">
        <span class="material-symbols-outlined">map</span>
        <h2 class="dash-section-title">Floor Plan</h2>
      </div>
      <img class="proj-detail-floorplan" src="${escHtml(thumbnailUrl)}" alt="Floor plan" />
    </div>`;
}

// ── Team ──────────────────────────────────────────────────────────────────────
function buildTeamSection(team, project) {
  const chips = team.length
    ? `<div class="team-chips" id="teamChips">
        ${team.map(t => `
          <div class="team-chip">
            <span class="team-chip-name">${escHtml(t.profile?.full_name || "Unknown")}</span>
            <span class="team-chip-role role-${t.profile?.role}">${ROLE_LABELS[t.profile?.role] || t.profile?.role || ""}</span>
            <button class="ghost-sm danger-sm unassign-btn" data-uid="${t.user_id}" title="Remove">✕</button>
          </div>`).join("")}
       </div>`
    : `<p class="loading-hint">No team members assigned.</p>`;

  return `
    <div class="dash-section">
      <div class="dash-section-head">
        <div class="dash-section-icon">
          <span class="material-symbols-outlined">group</span>
          <h2 class="dash-section-title">Team</h2>
        </div>
        <button class="ghost-sm" id="assignTeamBtn">+ Assign</button>
      </div>
      <div id="teamSection">${chips}</div>
      <div id="assignRow" hidden style="margin-top:8px;display:flex;gap:8px;align-items:flex-end">
        <label class="field-label" style="flex:1">
          Add member
          <select class="ctx-input" id="assignUserSelect">
            <option value="">Loading…</option>
          </select>
        </label>
        <button class="primary-btn btn-sm" id="assignConfirmBtn" style="width:auto">Assign</button>
        <button class="ghost-sm" id="assignCancelBtn">Cancel</button>
      </div>
    </div>`;
}

// ── My Tasks ──────────────────────────────────────────────────────────────────
function buildTasksSection() {
  if (!_myTasks.length) {
    return `
      <div class="dash-section" style="gap:12px">
        <div class="dash-section-icon">
          <span class="material-symbols-outlined">task_alt</span>
          <h2 class="dash-section-title">My Tasks</h2>
        </div>
        <p class="loading-hint">No pending tasks for this project.</p>
      </div>`;
  }

  const rows = _myTasks.map(t => {
    const dotColor = t.priority === "high" ? "var(--color-error)" : t.priority === "low" ? "var(--success)" : "var(--gold)";
    return `
      <div class="proj-task-row">
        <div class="proj-task-dot" style="background:${dotColor}"></div>
        <div class="proj-task-body">
          <p class="proj-task-title">${escHtml(t.title)}</p>
          ${t.due_date ? `<p class="proj-task-meta">Due ${fmt(t.due_date)}</p>` : ""}
        </div>
        <span class="badge badge-drawing-${t.status === "completed" ? "approved" : "pending_review"}">${t.status === "completed" ? "Done" : "Pending"}</span>
      </div>`;
  }).join("");

  return `
    <div class="dash-section" style="gap:12px">
      <div class="dash-section-icon">
        <span class="material-symbols-outlined">task_alt</span>
        <h2 class="dash-section-title">My Tasks</h2>
      </div>
      <div class="proj-task-list">${rows}</div>
    </div>`;
}

// ─── Wire interactions ────────────────────────────────────────────────────────
function wireInteractions(project) {
  // Status change
  if (can.changeStatus()) {
    document.getElementById("statusSelect")?.addEventListener("change", handleStatusChange);
  }

  // Advance payment
  if (!project.advance_payment_done && can.markPaid()) {
    document.getElementById("markPaidBtn")?.addEventListener("click", handleMarkPaid);
  }

  // Edit details
  if (can.editProject()) {
    document.getElementById("editDetailsBtn")?.addEventListener("click", openEditModal);
  }

  // Share button (copy project URL to clipboard as placeholder)
  document.getElementById("shareClientBtn")?.addEventListener("click", () => {
    navigator.clipboard?.writeText(location.href);
    alert("Project link copied to clipboard.");
  });

  // Drawing review buttons
  if (can.reviewDrawings()) {
    document.querySelectorAll(".review-verify-btn").forEach(btn => {
      btn.addEventListener("click", () => openReviewModal(btn.dataset.id, btn.dataset.title));
    });
  }

  // Team assign
  if (can.assignTeam()) {
    document.getElementById("assignTeamBtn")?.addEventListener("click", openAssignRow);
    document.getElementById("assignCancelBtn")?.addEventListener("click", closeAssignRow);
    document.getElementById("assignConfirmBtn")?.addEventListener("click", handleAssign);
    document.querySelectorAll(".unassign-btn").forEach(btn => {
      btn.addEventListener("click", () => handleUnassign(btn.dataset.uid));
    });
    loadUsersForAssign();
  }
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
function renderNav() {
  const nav = document.getElementById("dashNav");
  const links = [
    { href: "/homepage", label: "Home" },
    { href: "/projects", label: "Projects" },
  ];
  if (is("sales", "admin", "lead_designer")) links.push({ href: "/projects", label: "Fitout Planner" });
  if (is("designer", "lead_designer", "admin")) links.push({ href: "/designer", label: "Drawings" });
  if (is("admin")) {
    links.push({ href: "/admin", label: "Admin" });
    links.push({ href: "/ceo", label: "Dashboard" });
  }
  if (is("ceo")) links.push({ href: "/ceo", label: "Dashboard" });

  nav.innerHTML = links.map(l =>
    `<a class="dash-nav-link" href="${l.href}">${l.label}</a>`
  ).join("");
}

// ─── Status change ────────────────────────────────────────────────────────────
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
      e.target.value = _project.status;
    } else {
      _project.status = newStatus;
    }
  } catch {
    e.target.value = _project.status;
  }
}

// ─── Mark advance paid ────────────────────────────────────────────────────────
async function handleMarkPaid() {
  const btn = document.getElementById("markPaidBtn");
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    const res = await apiFetch("/api/project/advance-payment", {
      method: "POST",
      body: JSON.stringify({ projectId: _projectId, done: true }),
    });
    if (res.ok) await loadAll();
    else { btn.disabled = false; btn.textContent = "Mark Advance Paid"; }
  } catch {
    btn.disabled = false; btn.textContent = "Mark Advance Paid";
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

  btn.disabled = true; btn.textContent = "Saving…";
  try {
    const res = await apiFetch("/api/project/update", { method: "POST", body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Save failed.");
    closeEditModal();
    await loadAll();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
    btn.disabled = false; btn.textContent = "Save Changes";
  }
}

// ─── Drawing review modal ─────────────────────────────────────────────────────
function openReviewModal(drawingId, title) {
  _reviewDrawingId = drawingId;
  document.getElementById("reviewDrawingTitle").textContent = title || "Drawing";
  document.getElementById("reviewComments").value = "";
  document.getElementById("reviewError").hidden = true;
  document.getElementById("reviewModal").hidden = false;
}

async function submitReview(status) {
  const btns  = [document.getElementById("reviewApproveBtn"), document.getElementById("reviewRevisionBtn"), document.getElementById("reviewRejectBtn")];
  const errEl = document.getElementById("reviewError");
  errEl.hidden = true;
  btns.forEach(b => b.disabled = true);

  try {
    const res = await apiFetch("/api/drawings/review", {
      method: "POST",
      body: JSON.stringify({
        drawingId: _reviewDrawingId,
        status,
        comments: document.getElementById("reviewComments").value.trim() || undefined,
      }),
    });
    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error || "Review failed.");
    }
    document.getElementById("reviewModal").hidden = true;
    await loadAll();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}

// ─── Team assign / unassign ───────────────────────────────────────────────────
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
  btn.disabled = true; btn.textContent = "Assigning…";
  try {
    const res = await apiFetch("/api/project/assign-user", {
      method: "POST",
      body: JSON.stringify({ projectId: _projectId, userId }),
    });
    if (res.ok) { closeAssignRow(); await loadAll(); }
  } finally {
    btn.disabled = false; btn.textContent = "Assign";
  }
}

async function handleUnassign(userId) {
  if (!confirm("Remove this team member from the project?")) return;
  try {
    await apiFetch("/api/project/unassign-user", {
      method: "POST",
      body: JSON.stringify({ projectId: _projectId, userId }),
    });
    await loadAll();
  } catch { /* silent */ }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

function fmt(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function escHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
