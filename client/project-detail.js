// ─── Project Detail — Stitch-matched unified role-based workspace ─────────────

let _session, _profile, _project, _team, _drawings, _drawingStats;
let _projectId;
let _versions          = [];
let _myTasks           = [];
let _drawingAssignments = [];
let _reviewDrawingId   = null;

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
  seeAIResults:   () => is("admin", "sales", "lead_designer", "designer"),
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
  renderTopNav();

  await loadAll();

  // Static modal wiring
  document.getElementById("editModalClose").addEventListener("click", closeEditModal);
  document.getElementById("editCancel").addEventListener("click", closeEditModal);
  document.getElementById("editSave").addEventListener("click", handleSaveDetails);
  document.getElementById("reviewModalClose").addEventListener("click",
    () => { document.getElementById("reviewModal").hidden = true; });
  document.getElementById("reviewApproveBtn").addEventListener("click",  () => submitReview("approved"));
  document.getElementById("reviewRevisionBtn").addEventListener("click", () => submitReview("revision_requested"));
  document.getElementById("reviewRejectBtn").addEventListener("click",   () => submitReview("rejected"));
})();

// ─── Data loading ─────────────────────────────────────────────────────────────
async function loadAll() {
  const main = document.getElementById("projectMain");
  try {
    const [detailRes, versionsRes, tasksRes, daRes] = await Promise.all([
      apiFetch(`/api/project/detail?id=${_projectId}`),
      apiFetch(`/api/project/versions?id=${_projectId}`).catch(() => null),
      can.seeTasks()
        ? apiFetch(`/api/tasks?projectId=${_projectId}&status=pending`).catch(() => null)
        : Promise.resolve(null),
      can.assignTeam()
        ? apiFetch(`/api/drawings/assignments?projectId=${_projectId}`).catch(() => null)
        : Promise.resolve(null),
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

    if (versionsRes?.ok) { const vd = await versionsRes.json(); _versions = vd.versions || []; }
    if (tasksRes?.ok)    { const td = await tasksRes.json();    _myTasks  = td.tasks || []; }
    if (daRes?.ok)       { const dd = await daRes.json();       _drawingAssignments = dd.assignments || []; }

    document.title = `Poligrid — ${_project.name || "Project"}`;
    renderSidebar(_project);
    render(data);
  } catch (err) {
    main.innerHTML = `<p class="loading-hint">Failed to load project.</p>`;
    console.error(err);
  }
}

// ─── Top nav ──────────────────────────────────────────────────────────────────
function renderTopNav() {
  const nav = document.getElementById("dashNav");
  const homeHref = {
    admin:         "/admin_home",
    ceo:           "/ceo",
    designer:      "/designer_home",
    lead_designer: "/lead_designer_home",
    sales:         "/projects",
  }[_profile.role] || "/homepage";
  const links = [
    { href: homeHref,    label: "Home" },
    { href: "/projects", label: "Projects" },
  ];
  if (["admin", "lead_designer"].includes(_profile.role)) links.push({ href: "/audit", label: "Audit Logs" });
  if (is("admin")) links.push({ href: "/admin", label: "Admin" });
  if (is("ceo", "admin")) links.push({ href: "/ceo", label: "Dashboard" });

  nav.innerHTML = links.map(l =>
    `<a class="dash-nav-link" href="${l.href}">${l.label}</a>`
  ).join("");
}

// ─── Left sidebar ─────────────────────────────────────────────────────────────
function renderSidebar(project) {
  const sidebar = document.getElementById("projSidebar");
  if (!sidebar) return;

  const roleLabel = ROLE_LABELS[_profile.role] || _profile.role;

  const navLinks = [];
  navLinks.push({ icon: "home_work", label: "Overview", href: "#", active: true });
  if (can.fitoutPlanner())
    navLinks.push({ icon: "design_services", label: "Fitout Planner", href: `/index?id=${project.id}` });
  if (can.seeDrawings() || can.uploadDrawings())
    navLinks.push({ icon: "architecture", label: "Drawings", href: `/designer?projectId=${project.id}` });
  navLinks.push({ icon: "history", label: "Audit Log", href: `/audit?projectId=${project.id}` });

  const homeHref2 = {
    admin:         "/admin_home",
    ceo:           "/ceo",
    designer:      "/designer_home",
    lead_designer: "/lead_designer_home",
    sales:         "/projects",
  }[_profile.role] || "/homepage";
  const bottomLinks = [
    { icon: "folder_open", label: "All Projects", href: "/projects" },
    { icon: "cottage",     label: "Home",         href: homeHref2 },
  ];

  const isCollapsed = localStorage.getItem("leftSidebarCollapsed") === "1";
  if (isCollapsed) sidebar.classList.add("collapsed");

  sidebar.innerHTML = `
    <div class="proj-sidebar-topbar">
      <button id="leftSidebarToggleBtn" class="proj-sidebar-collapse-btn"
        title="${isCollapsed ? "Expand sidebar" : "Collapse sidebar"}">
        <span class="material-symbols-outlined">${isCollapsed ? "left_panel_open" : "left_panel_close"}</span>
      </button>
    </div>

    <div class="proj-sidebar-ctx">
      <div class="proj-sidebar-ctx-icon">
        <span class="material-symbols-outlined">home_work</span>
      </div>
      <div class="proj-sidebar-ctx-name">${escHtml(project.name || "Project")}</div>
      <div class="proj-sidebar-ctx-sub">${escHtml(roleLabel)}</div>
    </div>

    <p class="proj-sidebar-label">Workspace</p>
    ${navLinks.map(l => `
      <a class="proj-sidebar-link${l.active ? " active" : ""}" href="${l.href}">
        <span class="material-symbols-outlined">${l.icon}</span>
        <span>${l.label}</span>
      </a>`).join("")}

    ${is("admin") ? `
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

  // Wire collapse toggle
  document.getElementById("leftSidebarToggleBtn")?.addEventListener("click", () => {
    const collapsed = sidebar.classList.toggle("collapsed");
    localStorage.setItem("leftSidebarCollapsed", collapsed ? "1" : "0");
    const btn = document.getElementById("leftSidebarToggleBtn");
    btn.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
    btn.querySelector(".material-symbols-outlined").textContent =
      collapsed ? "left_panel_open" : "left_panel_close";
  });
}

// ─── Main render ──────────────────────────────────────────────────────────────
function render({ project, drawingStats, thumbnailUrl }) {
  const statusLabel = STATUS_OPTIONS.find(o => o.value === project.status)?.label || project.status;
  const createdDate = fmt(project.created_at);
  const updatedDate = fmt(project.updated_at);
  const meta = [project.property_type, project.bhk, project.bhk_type,
    project.total_area_m2 ? project.total_area_m2 + " m²" : null].filter(Boolean).join("  ·  ");

  const statusHtml = can.changeStatus()
    ? `<select class="ctx-input ctx-input-sm status-inline-select" id="statusSelect">
        ${STATUS_OPTIONS.map(o =>
          `<option value="${o.value}" ${project.status === o.value ? "selected" : ""}>${o.label}</option>`
        ).join("")}
       </select>`
    : `<span class="badge badge-proj-${project.status}">${statusLabel}</span>`;

  const advPaidHtml = project.advance_payment_done
    ? `<span class="badge badge-advance" style="display:inline-flex;align-items:center;gap:4px">
         <span class="material-symbols-outlined" style="font-size:13px">payments</span> Advance Paid
       </span>`
    : can.markPaid()
      ? `<button class="ghost-btn btn-sm" id="markPaidBtn">
           <span class="material-symbols-outlined" style="font-size:14px">payments</span> Mark Advance Paid
         </button>`
      : "";

  document.getElementById("projectMain").innerHTML = `
    <!-- ── Hero ──────────────────────────────────────────────────────────────── -->
    <div class="proj-detail-hero" style="margin-bottom:28px">
      <nav style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-on-surface-variant);margin-bottom:10px">
        <a href="/projects" style="color:inherit;text-decoration:none;transition:color 0.15s" onmouseover="this.style.color='var(--color-primary)'" onmouseout="this.style.color=''">Projects</a>
        <span class="material-symbols-outlined" style="font-size:13px">chevron_right</span>
        <span style="color:var(--color-primary)">${escHtml(project.name || "Project")}</span>
      </nav>
      <div class="proj-detail-title-row">
        <div>
          <h1 class="proj-detail-name">${escHtml(project.name || "Untitled")}</h1>
          ${project.client_name
            ? `<p class="proj-detail-client" style="display:flex;align-items:center;gap:4px">
                 <span class="material-symbols-outlined" style="font-size:14px">person</span>
                 ${escHtml(project.client_name)}
               </p>`
            : ""}
        </div>
        <div class="proj-detail-hero-actions">
          <div class="proj-detail-status-wrap">${statusHtml}</div>
          ${advPaidHtml}
          <a class="ghost-btn btn-sm" href="/audit?projectId=${project.id}">
            <span class="material-symbols-outlined" style="font-size:14px">history</span> Audit Log
          </a>
          ${can.editProject()
            ? `<button class="ghost-btn btn-sm" id="editDetailsBtn">
                 <span class="material-symbols-outlined" style="font-size:14px">edit</span> Edit
               </button>` : ""}
        </div>
      </div>
      ${meta ? `<p class="proj-detail-meta">${escHtml(meta)}</p>` : ""}
      <p class="proj-detail-dates">Created ${createdDate} · Updated ${updatedDate}</p>
    </div>

    <!-- ── Workspace controls ───────────────────────────────────────────────────── -->
    <div class="proj-workspace-controls">
      <button id="rightSidebarToggleBtn" class="proj-panel-toggle" title="Toggle details panel">
        <span class="material-symbols-outlined" style="font-size:16px" id="rightPanelIcon">right_panel_close</span>
        <span id="rightPanelLabel">Details</span>
      </button>
    </div>

    <!-- ── Workspace grid ─────────────────────────────────────────────────────── -->
    <div class="proj-workspace-layout" id="workspaceLayout">
      <div class="proj-workspace-main">
        ${buildMainSections(project)}
      </div>
      <div class="proj-workspace-sidebar">
        ${buildRightSidebar(project, drawingStats, thumbnailUrl)}
      </div>
    </div>`;

  wireInteractions(project);
}

// ─── Main column ──────────────────────────────────────────────────────────────
function buildMainSections(project) {
  const parts = [];
  if (can.seeAIResults()) parts.push(buildAISection(project));
  if (can.seeConcepts())  parts.push(buildConceptsSection(project));
  if (can.seeDrawings())  parts.push(buildDrawingsSection(_drawings, project));
  if (!parts.length)
    parts.push(`<div class="dash-section"><p class="loading-hint">No content available for your role.</p></div>`);
  return parts.join("");
}

// ── AI Results & Estimate ─────────────────────────────────────────────────────
function buildAISection(project) {
  const latest = [..._versions].reverse().find(v => v.renders?.length > 0);
  const renders = latest?.renders || [];
  const boqTotal = latest?.boqItems?.reduce((s, b) => s + (b.amount || 0), 0) || 0;

  const renderCards = renders.slice(0, 4).map((r, i) => `
    <div class="proj-concept-card">
      <div class="proj-concept-img-wrap">
        ${r.url
          ? `<img src="${escHtml(r.url)}" alt="Concept ${i+1}" loading="lazy" />`
          : `<div style="display:flex;align-items:center;justify-content:center;height:100%">
               <span class="material-symbols-outlined" style="font-size:40px;opacity:.25">auto_awesome</span>
             </div>`}
        <div class="proj-concept-img-overlay">
          <div class="proj-concept-img-label">${escHtml(r.name || `Concept 0${i+1}`)}</div>
        </div>
      </div>
      <div class="proj-concept-body">
        <p class="proj-concept-num">Concept ${String(i+1).padStart(2,"0")}</p>
        <p class="proj-concept-name">${escHtml(r.name || "Design " + (i+1))}</p>
      </div>
    </div>`).join("");

  return `
    <div class="dash-section">
      <div class="dash-section-head" style="margin-bottom:20px">
        <div>
          <div class="dash-section-icon">
            <span class="material-symbols-outlined" style="color:#6b46c1">auto_awesome</span>
            <h2 class="dash-section-title">AI-Generated Visuals & Estimate</h2>
          </div>
          <p class="dash-section-hint" style="margin-top:4px">High-fidelity design synthesis based on project parameters</p>
        </div>
        ${renders.length
          ? `<button class="ghost-sm">Download All</button>`
          : `<a class="ghost-sm" href="/index?id=${project.id}">Generate →</a>`}
      </div>

      ${boqTotal > 0 ? `
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:20px">
          <div>
            <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--color-on-surface-variant);margin-bottom:4px">Estimated Project Cost</p>
            <p style="font-family:var(--font-headline);font-size:34px;font-weight:800;letter-spacing:-.02em;line-height:1;color:var(--color-on-surface)">₹${boqTotal.toLocaleString("en-IN")}</p>
            <p style="font-size:12px;color:var(--success);font-weight:600;margin-top:4px">Based on Hyd premium rates</p>
          </div>
          <span style="display:inline-flex;align-items:center;gap:5px;background:var(--color-tertiary-container);color:var(--color-on-tertiary-container);padding:5px 12px;border-radius:var(--radius-full);font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">
            <span class="material-symbols-outlined" style="font-size:13px;font-variation-settings:'FILL' 1">check_circle</span>
            Estimate Ready
          </span>
        </div>` : ""}

      ${renders.length > 0
        ? `<div class="proj-concept-grid">${renderCards}</div>`
        : `<div style="padding:40px 24px;text-align:center;background:var(--color-surface-container-low);border-radius:12px">
             <span class="material-symbols-outlined" style="font-size:40px;color:var(--color-on-surface-variant);opacity:.3;display:block;margin-bottom:12px">auto_awesome</span>
             <p style="font-size:13px;color:var(--color-on-surface-variant)">No renders generated yet.</p>
             <a class="ghost-btn btn-sm" href="/index?id=${project.id}" style="margin-top:12px;display:inline-flex">Open Fitout Planner →</a>
           </div>`}

      ${renders.length > 0 ? `
        <div class="proj-report-list">
          <div class="proj-report-item">
            <span class="material-symbols-outlined proj-report-icon">payments</span>
            <div class="proj-report-info">
              <p class="proj-report-name">Cost Estimate Report</p>
              <p class="proj-report-meta">BOQ — all rooms · Hyd premium pricing</p>
            </div>
            <a class="ghost-sm" href="/index?id=${project.id}">
              <span class="material-symbols-outlined" style="font-size:15px">open_in_new</span>
            </a>
          </div>
          <div class="proj-report-item">
            <span class="material-symbols-outlined proj-report-icon">description</span>
            <div class="proj-report-info">
              <p class="proj-report-name">Design Specifications</p>
              <p class="proj-report-meta">Room breakdown · Material specs</p>
            </div>
            <a class="ghost-sm" href="/index?id=${project.id}">
              <span class="material-symbols-outlined" style="font-size:15px">open_in_new</span>
            </a>
          </div>
        </div>` : ""}
    </div>`;
}

// ── Stage 1 Reference Concepts ────────────────────────────────────────────────
function buildConceptsSection(project) {
  const seen = new Set();
  const allRenders = [];
  for (const v of _versions) {
    for (const r of v.renders || []) {
      if (r.url && !seen.has(r.url)) { seen.add(r.url); allRenders.push(r); }
    }
  }

  const cards = allRenders.slice(0, 4).map((r, i) => `
    <div class="proj-concept-ref-card">
      <div class="proj-ref-img-wrap">
        <img src="${escHtml(r.url)}" alt="Concept ${i+1}" loading="lazy" />
        <div class="proj-ref-overlay"></div>
        <div class="proj-ref-label">
          <div class="proj-ref-label-inner">${escHtml(r.name || "Design " + (i+1))}</div>
        </div>
      </div>
      <div class="proj-concept-ref-body">
        <p class="proj-concept-ref-label">AI Concept · ${allRenders.length} variations</p>
      </div>
    </div>`).join("");

  return `
    <div class="dash-section">
      <div class="dash-section-head">
        <div>
          <div class="dash-section-icon">
            <span class="material-symbols-outlined">photo_library</span>
            <h2 class="dash-section-title">Stage 1 Reference</h2>
          </div>
          <p class="dash-section-hint" style="margin-top:4px">AI-generated concepts from initial brief</p>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          ${allRenders.length > 4
            ? `<button class="ghost-sm">View All ${allRenders.length}</button>` : ""}
          <span class="proj-stage-locked">
            <span class="material-symbols-outlined" style="font-size:12px">lock</span>
            Locked
          </span>
        </div>
      </div>
      ${allRenders.length > 0
        ? `<div class="proj-concept-ref-grid">${cards}</div>`
        : `<div style="padding:32px 24px;text-align:center;background:var(--color-surface-container-low);border-radius:12px;margin-top:4px">
             <span class="material-symbols-outlined" style="font-size:36px;opacity:.3;display:block;margin-bottom:8px">photo_library</span>
             <p style="font-size:13px;color:var(--color-on-surface-variant)">No concepts generated yet. Sales team generates these from the Fitout Planner.</p>
           </div>`}
    </div>`;
}

// ── Technical Drawings ────────────────────────────────────────────────────────
function buildDrawingsSection(drawings, project) {
  const isLead = can.reviewDrawings();

  // Latest version per drawing type only
  const latestByType = {};
  for (const d of drawings) {
    const ex = latestByType[d.drawing_type];
    if (!ex || (d.version_number ?? 0) > (ex.version_number ?? 0)) {
      latestByType[d.drawing_type] = d;
    }
  }
  const latest = Object.values(latestByType);
  const pendingCount = latest.filter(d => d.status === "pending_review").length;

  const rows = latest.map(d => {
    const sc = {
      pending_review:     "badge-drawing-pending_review",
      approved:           "badge-drawing-approved",
      rejected:           "badge-drawing-rejected",
      revision_requested: "badge-drawing-revision_requested",
    }[d.status] || "badge-drawing-pending_review";

    let reviewHtml = "";
    if (isLead) {
      if (d.status === "pending_review") {
        reviewHtml = `<button class="primary-btn btn-sm review-verify-btn"
          data-id="${d.id}" data-title="${escHtml(d.title)}"
          style="width:auto;white-space:nowrap;background:linear-gradient(135deg,#6b46c1,#4c1d95);color:#fff">
          <span class="material-symbols-outlined" style="font-size:13px">verified</span> Verify
        </button>`;
      } else if (d.status === "revision_requested") {
        reviewHtml = `<button class="ghost-btn btn-sm review-verify-btn"
          data-id="${d.id}" data-title="${escHtml(d.title)}" style="white-space:nowrap">
          <span class="material-symbols-outlined" style="font-size:13px">rate_review</span> Review
        </button>`;
      } else if (d.status === "approved") {
        reviewHtml = `<span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--success);font-weight:600">
          <span class="material-symbols-outlined" style="font-size:14px;font-variation-settings:'FILL' 1">check_circle</span>Verified
        </span>`;
      } else {
        reviewHtml = `<button class="ghost-btn btn-sm review-verify-btn"
          data-id="${d.id}" data-title="${escHtml(d.title)}">Review</button>`;
      }
    }

    const filePath  = escHtml(d.file_path || "");
    const fileName  = escHtml(d.file_name || (d.drawing_type + ".pdf"));
    const typeLabel = escHtml(DRAWING_TYPE_LABELS[d.drawing_type] || d.drawing_type);
    const viewDl = d.file_path ? `
      <button class="ghost-sm drawing-view-btn" data-path="${filePath}" data-name="${typeLabel}" title="View drawing"
        style="display:inline-flex;align-items:center;gap:4px;padding:5px 10px">
        <span class="material-symbols-outlined" style="font-size:14px">visibility</span>
        <span style="font-size:12px">View</span>
      </button>
      <button class="ghost-sm drawing-dl-btn" data-path="${filePath}" data-name="${fileName}" title="Download"
        style="display:inline-flex;align-items:center;gap:4px;padding:5px 10px">
        <span class="material-symbols-outlined" style="font-size:14px">download</span>
        <span style="font-size:12px">Download</span>
      </button>` : "";

    return `
      <tr>
        <td class="px-4 py-3">
          <p class="proj-tbl-title">${escHtml(DRAWING_TYPE_LABELS[d.drawing_type] || d.drawing_type)}</p>
          <p class="proj-tbl-sub">v${d.version_number ?? 1} · ${fmt(d.created_at)}</p>
        </td>
        ${isLead ? `<td class="px-4 py-3"><p class="proj-tbl-sub">${escHtml(d.uploader?.full_name || "—")}</p></td>` : ""}
        <td class="px-4 py-3"><span class="badge ${sc}">${DRAWING_STATUS_LABELS[d.status] || d.status}</span></td>
        <td class="px-4 py-3">
          <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end;flex-wrap:wrap">
            ${viewDl}
            ${reviewHtml}
          </div>
        </td>
      </tr>`;
  }).join("");

  const filePaths = latest.filter(d => d.file_path).map(d => d.file_path);

  return `
    <div class="dash-section" style="padding:0;overflow:hidden">
      <div style="padding:24px 24px 16px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <div class="dash-section-icon">
            <span class="material-symbols-outlined">architecture</span>
            <h2 class="dash-section-title">Technical Drawings</h2>
          </div>
          ${pendingCount > 0 && isLead
            ? `<p class="dash-section-hint" style="margin-top:4px">${pendingCount} drawing${pendingCount > 1 ? "s" : ""} awaiting verification</p>`
            : `<p class="dash-section-hint" style="margin-top:4px">Latest version per type</p>`}
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          ${filePaths.length > 0
            ? `<button class="ghost-btn btn-sm drawing-dl-all-btn" data-project-id="${project.id}" style="gap:5px">
                 <span class="material-symbols-outlined" style="font-size:14px">folder_zip</span> Download All
               </button>` : ""}
          ${can.uploadDrawings()
            ? `<a class="ghost-btn btn-sm" href="/designer?projectId=${project.id}" style="gap:5px">
                 <span class="material-symbols-outlined" style="font-size:14px">upload_file</span> Upload
               </a>` : ""}
          <a class="ghost-sm" href="/designer?projectId=${project.id}">Manage →</a>
        </div>
      </div>

      ${latest.length > 0 ? `
        <div class="proj-drawings-wrap" style="border-top:1px solid var(--color-surface-container)">
          <table class="proj-drawings-tbl" style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:rgba(242,244,244,0.6)">
                <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--color-on-surface-variant)">Type</th>
                ${isLead ? `<th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--color-on-surface-variant)">Designer</th>` : ""}
                <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--color-on-surface-variant)">Status</th>
                <th style="padding:10px 16px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--color-on-surface-variant)">Actions</th>
              </tr>
            </thead>
            <tbody style="divide-y:var(--color-surface-container)">${rows}</tbody>
          </table>
        </div>`
      : `<div style="padding:40px 24px;text-align:center;background:var(--color-surface-container-low)">
           <span class="material-symbols-outlined" style="font-size:36px;opacity:.3;display:block;margin-bottom:8px">architecture</span>
           <p style="font-size:13px;color:var(--color-on-surface-variant)">No drawings uploaded yet.</p>
           ${can.uploadDrawings()
             ? `<a class="ghost-btn btn-sm" href="/designer?projectId=${project.id}" style="margin-top:12px;display:inline-flex;gap:5px">
                  <span class="material-symbols-outlined" style="font-size:14px">upload_file</span> Upload First Drawing
                </a>` : ""}
         </div>`}
    </div>`;
}

// ─── Right sidebar ────────────────────────────────────────────────────────────
function buildRightSidebar(project, drawingStats, thumbnailUrl) {
  const parts = [];

  // Approval pipeline — designer, lead, admin
  if (can.seeDrawings()) parts.push(buildApprovalPipeline(drawingStats, project));

  // Quick actions (share / AI rerun for sales)
  if (can.shareClient()) parts.push(buildShareCard(project));

  // Property details — all
  parts.push(buildPropertyDetails(project));

  // Floor plan — all (if exists)
  if (thumbnailUrl) parts.push(buildFloorPlan(thumbnailUrl));

  // Team — lead + admin
  if (can.assignTeam()) parts.push(buildTeamSection(_team, project));

  // My Tasks — designer
  if (can.seeTasks()) parts.push(buildTasksSection());

  return parts.join("");
}

// ── Approval pipeline ─────────────────────────────────────────────────────────
function buildApprovalPipeline(ds, project) {
  const total = ds.total;
  const approvedPct = total ? Math.round((ds.approved / total) * 100) : 0;
  const pendingPct  = total ? Math.round((ds.pending  / total) * 100) : 0;

  const phase2Active = ds.pending > 0;
  const phase2Done   = total > 0 && ds.approved === total;
  const phase3Done   = phase2Done;

  const step = (icon, state, title, desc) => `
    <div class="proj-pipeline-step">
      <div class="proj-pipeline-dot ${state}">
        <span class="material-symbols-outlined" style="font-size:14px;font-variation-settings:'FILL' ${state === "done" ? 1 : 0},'wght' 400">${icon}</span>
      </div>
      <div class="proj-pipeline-info">
        <p class="proj-pipeline-ttl">${title}</p>
        <p class="proj-pipeline-desc">${desc}</p>
      </div>
    </div>`;

  return `
    <div class="dash-section">
      <div class="dash-section-head" style="margin-bottom:16px">
        <div class="dash-section-icon">
          <span class="material-symbols-outlined">verified</span>
          <h2 class="dash-section-title">Approval Status</h2>
        </div>
        <span style="font-family:var(--font-headline);font-size:15px;font-weight:800;color:var(--color-on-surface)">${approvedPct}%</span>
      </div>

      ${total > 0 ? `
        <div>
          <div class="draw-progress-track" style="margin-bottom:8px">
            <div class="draw-progress-fill-approved" style="width:${approvedPct}%"></div>
            <div class="draw-progress-fill-pending"  style="width:${pendingPct}%"></div>
          </div>
          <p style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:var(--color-on-surface-variant)">Status: ${phase2Done ? "Complete" : phase2Active ? "In Progress" : "Pending"}</p>
        </div>` : ""}

      <div class="proj-pipeline" style="margin-top:20px">
        ${step("check_circle", ds.approved > 0 ? "done" : "pending",
          "Client Verification",
          ds.approved > 0 ? `${ds.approved} drawing${ds.approved > 1 ? "s" : ""} approved` : "Awaiting drawings")}
        ${step("rate_review", phase2Done ? "done" : phase2Active ? "active" : "pending",
          "Design Lead Review",
          phase2Done ? "All drawings verified" : phase2Active ? `${ds.pending} pending verification` : "Pending prior stage")}
        ${step("task_alt", phase3Done ? "done" : "pending",
          "Final Approval",
          phase3Done ? "Complete — ready to proceed" : "Pending full verification")}
      </div>

      ${can.reviewDrawings() && ds.pending > 0 ? `
        <a class="ghost-btn btn-sm" href="/designer?projectId=${project.id}" style="margin-top:8px">
          Execute Batch Review →
        </a>` : ""}
    </div>`;
}

// ── Share card ────────────────────────────────────────────────────────────────
function buildShareCard(project) {
  return `
    <div class="dash-section" style="gap:12px">
      <div class="dash-section-icon">
        <span class="material-symbols-outlined">share</span>
        <h2 class="dash-section-title">Client Actions</h2>
      </div>
      <button class="ghost-btn btn-sm" id="shareClientBtn" style="width:100%;justify-content:center;gap:6px">
        <span class="material-symbols-outlined" style="font-size:15px">share</span>
        Share with Client
      </button>
      <a class="ghost-btn btn-sm" href="/index?id=${project.id}" style="width:100%;justify-content:center;gap:6px">
        <span class="material-symbols-outlined" style="font-size:15px">design_services</span>
        Open Fitout Planner
      </a>
    </div>`;
}

// ── Property details ──────────────────────────────────────────────────────────
function buildPropertyDetails(project) {
  const fields = [
    ["Type",        project.property_type],
    ["BHK",         project.bhk],
    ["Config",      project.bhk_type],
    ["Area",        project.total_area_m2 ? project.total_area_m2 + " m²" : null],
    ["Orientation", project.orientation],
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
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--color-surface-container)">
          <p class="proj-info-label" style="margin-bottom:4px">Design Brief</p>
          <p style="font-size:13px;color:var(--color-on-surface-variant);white-space:pre-wrap;line-height:1.55">${escHtml(project.global_brief)}</p>
        </div>` : ""}
    </div>`;
}

// ── Floor plan ────────────────────────────────────────────────────────────────
function buildFloorPlan(url) {
  return `
    <div class="dash-section" style="gap:12px;padding:16px">
      <div class="dash-section-icon">
        <span class="material-symbols-outlined">map</span>
        <h2 class="dash-section-title">Floor Plan</h2>
      </div>
      <img class="proj-detail-floorplan" src="${escHtml(url)}" alt="Floor plan" />
    </div>`;
}

// ── Team ──────────────────────────────────────────────────────────────────────
function buildTeamSection(team, project) {
  // Group drawing assignments by assignee user_id
  const byAssignee = {};
  for (const a of _drawingAssignments) {
    const uid = a.assigned_to || a.assignee?.id;
    if (!byAssignee[uid]) byAssignee[uid] = [];
    byAssignee[uid].push(a);
  }

  const statusDot = s => ({
    approved: "var(--success)",
    pending_review: "var(--gold)",
    revision_requested: "var(--color-error)",
  }[s] || "var(--color-on-surface-variant)");

  const memberCards = team.map(t => {
    const uid = t.user_id;
    const name = t.profile?.full_name || "Unknown";
    const role = t.profile?.role || "";
    const assignments = byAssignee[uid] || [];

    const typeChips = assignments.map(a => {
      const label = DRAWING_TYPE_LABELS[a.drawing_type] || a.drawing_type;
      const dlStr = a.deadline ? ` · ${fmt(a.deadline)}` : "";
      return `
        <span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;
          padding:3px 10px;border-radius:var(--radius-full);
          background:var(--color-surface-container);color:var(--color-on-surface)">
          <span style="width:5px;height:5px;border-radius:50%;flex-shrink:0;
            background:${statusDot(a.status)}"></span>
          ${escHtml(label)}${dlStr ? `<span style="color:var(--color-on-surface-variant);font-weight:400">${escHtml(dlStr)}</span>` : ""}
          <button class="reassign-chip-btn" data-id="${a.id}" data-type="${escHtml(a.drawing_type)}"
            style="background:none;border:none;cursor:pointer;padding:0 2px;line-height:1;
              color:var(--color-primary);margin-left:2px;font-size:10px;font-weight:700"
            title="Reassign to a different designer">↺</button>
          <button class="del-drawing-assign-btn" data-id="${a.id}"
            style="background:none;border:none;cursor:pointer;padding:0;line-height:1;
              color:var(--color-on-surface-variant);margin-left:0;font-size:11px"
            title="Remove assignment">✕</button>
        </span>`;
    }).join("");

    return `
      <div style="padding:12px;background:var(--color-surface-container-low);border-radius:10px">
        <div style="display:flex;align-items:center;gap:10px;
          margin-bottom:${assignments.length > 0 ? "8px" : "0"}">
          <div style="width:34px;height:34px;border-radius:50%;background:var(--color-primary-container);
            display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <span class="material-symbols-outlined" style="font-size:16px;color:var(--color-primary)">person</span>
          </div>
          <div style="flex:1;min-width:0">
            <p style="font-size:13px;font-weight:700;color:var(--color-on-surface);
              margin:0;line-height:1.2">${escHtml(name)}</p>
            <span class="team-chip-role role-${role}" style="font-size:10px">
              ${ROLE_LABELS[role] || role}</span>
          </div>
          <button class="ghost-sm danger-sm unassign-btn" data-uid="${uid}"
            title="Remove from project">✕</button>
        </div>
        ${assignments.length > 0
          ? `<div style="display:flex;flex-wrap:wrap;gap:4px">${typeChips}</div>`
          : `<p style="font-size:11px;color:var(--color-on-surface-variant);margin:0">
               No drawing types assigned yet.</p>`}
      </div>`;
  }).join("");

  return `
    <div class="dash-section">
      <div class="dash-section-head" style="margin-bottom:14px">
        <div class="dash-section-icon">
          <span class="material-symbols-outlined">group</span>
          <h2 class="dash-section-title">Team & Assignments</h2>
        </div>
        <button class="ghost-sm" id="openAssignDesignerBtn"
          style="display:flex;align-items:center;gap:4px">
          <span class="material-symbols-outlined" style="font-size:14px">person_add</span>
          Assign
        </button>
      </div>
      <div id="teamSection" style="display:flex;flex-direction:column;gap:8px">
        ${team.length
          ? memberCards
          : `<p class="loading-hint">No team members assigned yet.</p>`}
      </div>
    </div>`;
}

// ── My Tasks ──────────────────────────────────────────────────────────────────
function buildTasksSection() {
  return `
    <div class="dash-section" style="gap:12px">
      <div class="dash-section-icon">
        <span class="material-symbols-outlined">task_alt</span>
        <h2 class="dash-section-title">Pending Tasks</h2>
      </div>
      ${_myTasks.length ? `
        <div class="proj-task-list">
          ${_myTasks.map(t => {
            const dotColor = t.priority === "high" ? "var(--color-error)"
              : t.priority === "low" ? "var(--success)" : "var(--gold)";
            return `
              <div class="proj-task-row">
                <div class="proj-task-dot" style="background:${dotColor}"></div>
                <div class="proj-task-body">
                  <p class="proj-task-title">${escHtml(t.title)}</p>
                  ${t.due_date ? `<p class="proj-task-meta">Due ${fmt(t.due_date)}</p>` : ""}
                </div>
              </div>`;
          }).join("")}
        </div>`
      : `<p class="loading-hint">No pending tasks for this project.</p>`}
    </div>`;
}

// ─── Wire interactions ────────────────────────────────────────────────────────
function wireInteractions(project) {
  if (can.changeStatus())
    document.getElementById("statusSelect")?.addEventListener("change", handleStatusChange);

  if (!project.advance_payment_done && can.markPaid())
    document.getElementById("markPaidBtn")?.addEventListener("click", handleMarkPaid);

  if (can.editProject())
    document.getElementById("editDetailsBtn")?.addEventListener("click", openEditModal);

  document.getElementById("shareClientBtn")?.addEventListener("click", () => {
    navigator.clipboard?.writeText(location.href);
    alert("Project link copied to clipboard.");
  });

  if (can.reviewDrawings()) {
    document.querySelectorAll(".review-verify-btn").forEach(btn => {
      btn.addEventListener("click", () => openReviewModal(btn.dataset.id, btn.dataset.title));
    });
  }

  if (can.assignTeam()) {
    document.getElementById("openAssignDesignerBtn")?.addEventListener("click", openAssignDesignerModal);
    document.getElementById("assignDesignerModalClose")?.addEventListener("click", closeAssignDesignerModal);
    document.getElementById("assignDesignerCancelBtn")?.addEventListener("click", closeAssignDesignerModal);
    document.getElementById("assignDesignerConfirmBtn")?.addEventListener("click", handleAssignDesigner);
    document.getElementById("modalAddDrawingRowBtn")?.addEventListener("click", addDrawingTypeRow);
    document.getElementById("modalDesignerSelect")?.addEventListener("change", updateDesignerTeamNote);
    document.querySelectorAll(".unassign-btn").forEach(btn => {
      btn.addEventListener("click", () => handleUnassign(btn.dataset.uid));
    });
    document.querySelectorAll(".del-drawing-assign-btn").forEach(btn => {
      btn.addEventListener("click", () => handleDrawingAssignmentDelete(btn.dataset.id));
    });
    document.querySelectorAll(".reassign-chip-btn").forEach(btn => {
      btn.addEventListener("click", () => openReassignDrawingModal(btn.dataset.id, btn.dataset.type));
    });
  }

  // ── Drawing viewer modal ──────────────────────────────────────────────────
  const viewerModal   = document.getElementById("drawingViewerModal");
  const viewerIframe  = document.getElementById("drawingViewerIframe");
  const viewerImg     = document.getElementById("drawingViewerImg");
  const viewerTitle   = document.getElementById("drawingViewerTitle");
  const viewerDlBtn   = document.getElementById("drawingViewerDlBtn");
  const viewerClose   = document.getElementById("drawingViewerClose");

  function openDrawingViewer(url, title, dlHref) {
    viewerTitle.textContent = title || "Drawing";
    viewerDlBtn.href = dlHref || url;
    viewerDlBtn.download = title || "drawing";
    const isImage = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url);
    if (isImage) {
      viewerIframe.style.display = "none";
      viewerImg.style.display = "block";
      viewerImg.src = url;
    } else {
      viewerImg.style.display = "none";
      viewerIframe.style.display = "block";
      viewerIframe.src = url;
    }
    viewerModal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  function closeDrawingViewer() {
    viewerModal.style.display = "none";
    viewerIframe.src = "about:blank";
    viewerImg.src = "";
    document.body.style.overflow = "";
  }

  if (viewerClose) viewerClose.addEventListener("click", closeDrawingViewer);
  if (viewerModal) viewerModal.addEventListener("click", e => {
    if (e.target === viewerModal) closeDrawingViewer();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && viewerModal && viewerModal.style.display !== "none") closeDrawingViewer();
  });

  // Drawing view / download buttons
  document.querySelectorAll(".drawing-view-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const win = window.open("", "_blank");
      try {
        const res = await apiFetch(`/api/drawings/signed-url?path=${encodeURIComponent(btn.dataset.path)}`);
        const { url } = await res.json();
        win.location.href = url;
      } catch { win.close(); alert("Could not open drawing."); }
    });
  });
  document.querySelectorAll(".drawing-dl-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        const res = await apiFetch(`/api/drawings/download?path=${encodeURIComponent(btn.dataset.path)}&name=${encodeURIComponent(btn.dataset.name)}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = btn.dataset.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } catch { alert("Could not download drawing."); }
    });
  });

  document.querySelectorAll(".drawing-dl-all-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const projectId = btn.dataset.projectId;
      btn.disabled = true;
      btn.textContent = "Preparing…";
      try {
        const res = await apiFetch(`/api/drawings/download-zip?projectId=${encodeURIComponent(projectId)}`);
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed"); }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `drawings_${projectId}.zip`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } catch (err) { alert("Could not download drawings: " + err.message); }
      finally { btn.disabled = false; btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px">folder_zip</span> Download All`; }
    });
  });

  // Right sidebar toggle
  const workspaceLayout = document.getElementById("workspaceLayout");
  const rightToggleBtn  = document.getElementById("rightSidebarToggleBtn");
  const rightPanelIcon  = document.getElementById("rightPanelIcon");
  const rightPanelLabel = document.getElementById("rightPanelLabel");
  const rightCollapsed  = localStorage.getItem("rightSidebarCollapsed") === "1";
  if (rightCollapsed && workspaceLayout) {
    workspaceLayout.classList.add("right-collapsed");
    if (rightPanelIcon) rightPanelIcon.textContent = "right_panel_open";
    if (rightPanelLabel) rightPanelLabel.textContent = "Details";
  }
  rightToggleBtn?.addEventListener("click", () => {
    const collapsed = workspaceLayout.classList.toggle("right-collapsed");
    localStorage.setItem("rightSidebarCollapsed", collapsed ? "1" : "0");
    if (rightPanelIcon) rightPanelIcon.textContent = collapsed ? "right_panel_open" : "right_panel_close";
  });
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
  } catch { e.target.value = _project.status; }
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
  } catch { btn.disabled = false; btn.textContent = "Mark Advance Paid"; }
}

// ─── Edit modal ───────────────────────────────────────────────────────────────
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
function closeEditModal() { document.getElementById("editModal").hidden = true; }

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
    closeEditModal(); await loadAll();
  } catch (err) {
    errEl.textContent = err.message; errEl.hidden = false;
    btn.disabled = false; btn.textContent = "Save Changes";
  }
}

// ─── Review modal ─────────────────────────────────────────────────────────────
function openReviewModal(drawingId, title) {
  _reviewDrawingId = drawingId;
  document.getElementById("reviewDrawingTitle").textContent = title || "Drawing";
  document.getElementById("reviewComments").value = "";
  document.getElementById("reviewError").hidden = true;
  document.getElementById("reviewModal").hidden = false;
}

async function submitReview(status) {
  const btns = ["reviewApproveBtn","reviewRevisionBtn","reviewRejectBtn"]
    .map(id => document.getElementById(id));
  const errEl = document.getElementById("reviewError");
  errEl.hidden = true;
  btns.forEach(b => b.disabled = true);
  try {
    const res = await apiFetch("/api/drawings/review", {
      method: "POST",
      body: JSON.stringify({
        drawingId: _reviewDrawingId, status,
        comments: document.getElementById("reviewComments").value.trim() || undefined,
      }),
    });
    if (!res.ok) { const { error } = await res.json(); throw new Error(error || "Review failed."); }
    document.getElementById("reviewModal").hidden = true;
    await loadAll();
  } catch (err) {
    errEl.textContent = err.message; errEl.hidden = false;
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}

// ─── Assign Designer modal ────────────────────────────────────────────────────
async function openAssignDesignerModal() {
  const modal = document.getElementById("assignDesignerModal");
  const sel   = document.getElementById("modalDesignerSelect");

  sel.innerHTML = `<option value="">Loading…</option>`;
  document.getElementById("modalDrawingRows").innerHTML = "";
  document.getElementById("modalNoRowsHint").hidden = false;
  document.getElementById("assignDesignerError").hidden = true;
  document.getElementById("modalAssignNotes").value = "";
  document.getElementById("designerTeamNote").hidden = true;
  modal.hidden = false;

  try {
    const res = await apiFetch("/api/users/list");
    const { users } = await res.json();
    const teamIds = new Set(_team.map(t => t.user_id));
    const eligible = (users || []).filter(u =>
      ["designer", "lead_designer", "admin"].includes(u.role));
    sel.innerHTML = `<option value="">Select a designer…</option>` +
      eligible.map(u => {
        const inTeam = teamIds.has(u.id);
        return `<option value="${u.id}" data-in-team="${inTeam}">` +
          `${escHtml(u.full_name)}${inTeam ? " (on team)" : ""} — ${ROLE_LABELS[u.role] || u.role}</option>`;
      }).join("");
  } catch {
    sel.innerHTML = `<option value="">Failed to load users</option>`;
  }

  addDrawingTypeRow();
}

function closeAssignDesignerModal() {
  document.getElementById("assignDesignerModal").hidden = true;
}

function updateDesignerTeamNote() {
  const sel  = document.getElementById("modalDesignerSelect");
  const note = document.getElementById("designerTeamNote");
  const opt  = sel.options[sel.selectedIndex];
  if (!opt?.value) { note.hidden = true; return; }
  const inTeam = opt.dataset.inTeam === "true";
  note.hidden = false;
  note.style.background = inTeam
    ? "var(--color-tertiary-container)" : "var(--color-surface-container)";
  note.style.color = inTeam
    ? "var(--color-on-tertiary-container)" : "var(--color-on-surface-variant)";
  note.textContent = inTeam
    ? "Already on the team — new drawing assignments will be added."
    : "Will be added to the project team automatically.";
}

function _getModalSelectedTypes(exceptRow) {
  const rows = document.querySelectorAll("#modalDrawingRows > div");
  const selected = new Set();
  for (const r of rows) {
    if (r === exceptRow) continue;
    const v = r.querySelector(".modal-drawing-type-sel")?.value;
    if (v) selected.add(v);
  }
  return selected;
}

function addDrawingTypeRow() {
  const wrap = document.getElementById("modalDrawingRows");
  document.getElementById("modalNoRowsHint").hidden = true;

  // Already assigned in DB + selected in other rows in this modal
  const assignedInDb    = new Set(_drawingAssignments.map(a => a.drawing_type));
  const selectedInModal = _getModalSelectedTypes(null);
  const excluded        = new Set([...assignedInDb, ...selectedInModal]);
  const available       = Object.entries(DRAWING_TYPE_LABELS).filter(([k]) => !excluded.has(k));

  if (!available.length) {
    const errEl = document.getElementById("assignDesignerError");
    errEl.textContent = "All drawing types are already assigned. Use Reassign on existing assignments to change designer.";
    errEl.hidden = false;
    return;
  }

  const row = document.createElement("div");
  row.style.cssText = "display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end";
  row.innerHTML = `
    <label class="field-label" style="margin:0">Drawing Type
      <select class="ctx-input modal-drawing-type-sel">
        <option value="">Select type…</option>
        ${available.map(([k, v]) => `<option value="${k}">${escHtml(v)}</option>`).join("")}
      </select>
    </label>
    <label class="field-label" style="margin:0">Deadline
      <input class="ctx-input modal-drawing-deadline-inp" type="date" />
    </label>
    <button class="ghost-sm danger-sm" type="button" title="Remove"
      style="align-self:flex-end;margin-bottom:1px">✕</button>`;

  row.querySelector("button").addEventListener("click", () => {
    row.remove();
    if (!wrap.children.length) document.getElementById("modalNoRowsHint").hidden = false;
    document.getElementById("assignDesignerError").hidden = true;
  });

  wrap.appendChild(row);
}

async function handleAssignDesigner() {
  const designerId = document.getElementById("modalDesignerSelect")?.value;
  const notes      = document.getElementById("modalAssignNotes")?.value.trim() || undefined;
  const errEl      = document.getElementById("assignDesignerError");
  const btn        = document.getElementById("assignDesignerConfirmBtn");
  errEl.hidden = true;

  if (!designerId) {
    errEl.textContent = "Please select a designer."; errEl.hidden = false; return;
  }
  const rowEls = Array.from(document.getElementById("modalDrawingRows").children);
  if (!rowEls.length) {
    errEl.textContent = "Add at least one drawing type."; errEl.hidden = false; return;
  }
  const assignments = rowEls.map(r => ({
    drawingType: r.querySelector(".modal-drawing-type-sel")?.value,
    deadline:    r.querySelector(".modal-drawing-deadline-inp")?.value || null,
  }));
  if (assignments.some(a => !a.drawingType)) {
    errEl.textContent = "Select a drawing type for all rows."; errEl.hidden = false; return;
  }
  const typesSeen = new Set();
  for (const a of assignments) {
    if (typesSeen.has(a.drawingType)) {
      errEl.textContent = `"${DRAWING_TYPE_LABELS[a.drawingType] || a.drawingType}" selected more than once — each type can only be assigned once.`;
      errEl.hidden = false; return;
    }
    typesSeen.add(a.drawingType);
  }

  btn.disabled = true;
  btn.textContent = "Assigning…";

  try {
    // Add to team first if not already on it
    const teamIds = new Set(_team.map(t => t.user_id));
    if (!teamIds.has(designerId)) {
      const addRes = await apiFetch("/api/project/assign-user", {
        method: "POST",
        body: JSON.stringify({ projectId: _projectId, userId: designerId }),
      });
      if (!addRes.ok) {
        const d = await addRes.json();
        throw new Error(d.error || "Failed to add designer to team.");
      }
    }
    // Upsert each drawing assignment
    for (const { drawingType, deadline } of assignments) {
      const res = await apiFetch("/api/drawings/assignments/upsert", {
        method: "POST",
        body: JSON.stringify({
          projectId: _projectId, drawingType,
          assignedTo: designerId,
          deadline: deadline || undefined, notes,
        }),
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || `Failed to assign ${drawingType}.`);
      }
    }
    closeAssignDesignerModal();
    await loadAll();
  } catch (err) {
    errEl.textContent = err.message; errEl.hidden = false;
    btn.disabled = false;
    btn.innerHTML =
      `<span class="material-symbols-outlined" style="font-size:15px">person_add</span> Assign Designer`;
  }
}

async function handleUnassign(userId) {
  if (!confirm("Remove this team member from the project?")) return;
  try {
    await apiFetch("/api/project/unassign-user", {
      method: "POST", body: JSON.stringify({ projectId: _projectId, userId }),
    });
    await loadAll();
  } catch { /* silent */ }
}

async function handleDrawingAssignmentDelete(assignmentId) {
  if (!confirm("Remove this drawing assignment?")) return;
  try {
    await apiFetch("/api/drawings/assignments/delete", {
      method: "POST", body: JSON.stringify({ assignmentId }),
    });
    await loadAll();
  } catch { /* silent */ }
}

// ─── Reassign drawing type to a different designer (inline modal) ─────────────
let _reassignModal = null;

async function openReassignDrawingModal(assignmentId, drawingType) {
  // Remove existing modal if open
  _reassignModal?.remove();

  const existing   = _drawingAssignments.find(a => a.id === assignmentId);
  const currentDl  = existing?.deadline ? existing.deadline.slice(0, 10) : "";
  const currentUid = existing?.assigned_to || existing?.assignee?.id || "";
  const typeLabel  = DRAWING_TYPE_LABELS[drawingType] || drawingType;

  const modal = document.createElement("div");
  modal.style.cssText = "position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;padding:24px";
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;max-width:440px;width:100%;box-shadow:0 24px 48px rgba(0,0,0,0.14);padding:28px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div>
          <h3 style="font-family:Manrope,sans-serif;font-weight:800;font-size:16px;margin:0">Reassign ${escHtml(typeLabel)}</h3>
          <p style="font-size:12px;color:var(--color-on-surface-variant);margin:4px 0 0">Change the designer or deadline for this drawing type</p>
        </div>
        <button id="reassignModalClose" style="background:none;border:none;cursor:pointer;font-size:18px;color:#5a6061">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <label class="field-label" style="margin:0">New Designer
          <select class="ctx-input" id="reassignDesignerSel">
            <option value="">Loading…</option>
          </select>
        </label>
        <label class="field-label" style="margin:0">Deadline (optional)
          <input class="ctx-input" id="reassignDeadlineInp" type="date" value="${currentDl}" />
        </label>
        <div id="reassignError" style="display:none;color:var(--color-error);font-size:12px;padding:8px 12px;background:#fff0f0;border-radius:6px"></div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px">
          <button id="reassignCancelBtn" style="padding:9px 18px;background:#f2f4f4;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer">Cancel</button>
          <button id="reassignSaveBtn" style="padding:9px 18px;background:linear-gradient(135deg,#526258,#46564c);color:#eafcef;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">Save</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(modal);
  _reassignModal = modal;

  const close = () => { modal.remove(); _reassignModal = null; };
  modal.querySelector("#reassignModalClose").addEventListener("click", close);
  modal.querySelector("#reassignCancelBtn").addEventListener("click", close);
  modal.addEventListener("click", e => { if (e.target === modal) close(); });

  // Load designers
  const sel = modal.querySelector("#reassignDesignerSel");
  try {
    const res = await apiFetch("/api/users/list");
    const { users } = await res.json();
    const eligible = (users || []).filter(u => ["designer", "lead_designer", "admin"].includes(u.role));
    sel.innerHTML = `<option value="">Select designer…</option>` +
      eligible.map(u =>
        `<option value="${u.id}" ${u.id === currentUid ? "selected" : ""}>${escHtml(u.full_name)} — ${ROLE_LABELS[u.role] || u.role}</option>`
      ).join("");
  } catch {
    sel.innerHTML = `<option value="">Failed to load</option>`;
  }

  modal.querySelector("#reassignSaveBtn").addEventListener("click", async () => {
    const newDesignerId = sel.value;
    const newDeadline   = modal.querySelector("#reassignDeadlineInp").value || null;
    const errEl         = modal.querySelector("#reassignError");
    const saveBtn       = modal.querySelector("#reassignSaveBtn");
    if (!newDesignerId) { errEl.textContent = "Please select a designer."; errEl.style.display = ""; return; }
    errEl.style.display = "none";
    saveBtn.disabled = true; saveBtn.textContent = "Saving…";
    try {
      const res = await apiFetch("/api/drawings/assignments/upsert", {
        method: "POST",
        body: JSON.stringify({ projectId: _projectId, drawingType, assignedTo: newDesignerId, deadline: newDeadline }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reassign.");
      close();
      await loadAll();
    } catch (err) {
      errEl.textContent = err.message; errEl.style.display = "";
      saveBtn.disabled = false; saveBtn.textContent = "Save";
    }
  });
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
