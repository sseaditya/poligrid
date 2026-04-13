// ─── Projects List Page ────────────────────────────────────────────────────────

let _session, _profile;
let _allProjects   = [];
let _drawingSummary = {};   // { [projectId]: { total, approved, pending_review, revision_requested } }

const STATUS_LABELS = {
  active:        "Active",
  advanced_paid: "Advance Paid",
  in_progress:   "In Progress",
  completed:     "Completed",
  on_hold:       "On Hold",
  cancelled:     "Cancelled",
};

const STATUS_CLS = {
  active:        "text-primary bg-primary-container",
  advanced_paid: "text-secondary bg-secondary-container",
  in_progress:   "text-tertiary bg-tertiary-container",
  completed:     "text-primary bg-primary-container",
  on_hold:       "text-on-surface-variant bg-surface-container",
  cancelled:     "text-error bg-[#fff0f0]",
};

(async () => {
  AppNav.mountSidebar("PROJECTS");

  try {
    ({ session: _session, profile: _profile } = await AuthClient.requireAuth());
  } catch { window.location.href = "/login"; return; }

  AppNav.renderSidebar(_profile, document.getElementById("sidebarNav"));
  AppNav.renderMobileNav(_profile, document.getElementById("mobileNav"));
  AppNav.setupUserSection(_profile);
  AppNav.setupCollapse();

  // Also wire topbar profile links (projects.html has both sidebarProfileLink + topbarProfileLink)
  const slug = (_profile.email || "").split("@")[0].toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const profileUrl = `/profile/${slug}`;
  const sidebarProfileEl = document.getElementById("sidebarProfileLink");
  const topbarProfileEl  = document.getElementById("topbarProfileLink");
  if (sidebarProfileEl) sidebarProfileEl.href = profileUrl;
  if (topbarProfileEl)  topbarProfileEl.href  = profileUrl;
  const img = document.getElementById("userAvatarImg");
  if (img && _profile.avatar_url) img.src = _profile.avatar_url;

  // New project button — visible to roles that can create
  if (["admin", "sales", "designer", "lead_designer"].includes(_profile.role)) {
    const btn = document.getElementById("newProjectBtn");
    btn.hidden = false;
    btn.addEventListener("click", openCreateModal);
  }

  document.getElementById("createProjectClose").addEventListener("click", closeCreateModal);
  document.getElementById("createProjectCancel").addEventListener("click", closeCreateModal);
  document.getElementById("createProjectSubmit").addEventListener("click", handleCreateProject);
  document.getElementById("searchInput").addEventListener("input", renderTable);
  document.getElementById("statusFilter").addEventListener("change", renderTable);

  // Load projects first, then drawing summary (needs project IDs)
  await loadProjects();
  renderTable();                       // first paint with no drawing data
  await loadDrawingSummary();
  renderTable();                       // repaint with drawing progress
})();


// ─── Data Loading ─────────────────────────────────────────────────────────────
async function loadProjects() {
  try {
    const res = await apiFetch("/api/project/list");
    const { projects } = await res.json();
    _allProjects = projects || [];
    const countEl = document.getElementById("projectCount");
    countEl.textContent = _allProjects.length + " projects";
    countEl.classList.remove("hidden");
  } catch {
    _allProjects = [];
  }
}

async function loadDrawingSummary() {
  // Only fetch for roles that see drawings column
  if (!["designer", "lead_designer", "admin"].includes(_profile.role)) return;
  if (!_allProjects.length) return;
  try {
    const ids = _allProjects.map(p => p.id).join(",");
    const res = await apiFetch(`/api/drawings/project-summary?projectIds=${encodeURIComponent(ids)}`);
    if (res.ok) {
      const data = await res.json();
      _drawingSummary = data.summary || {};
    }
  } catch { /* non-fatal */ }
}

// ─── Table Render ─────────────────────────────────────────────────────────────
function renderTable() {
  const container = document.getElementById("projectsTable");
  const search    = document.getElementById("searchInput").value.toLowerCase().trim();
  const status    = document.getElementById("statusFilter").value;
  const role      = _profile.role;

  let list = _allProjects;
  if (search) {
    list = list.filter(p =>
      (p.name || "").toLowerCase().includes(search) ||
      (p.client_name || "").toLowerCase().includes(search)
    );
  }
  if (status) {
    list = list.filter(p => p.status === status);
  }

  if (!list.length) {
    container.innerHTML = `
      <div class="bg-surface-container-lowest rounded-xl p-12 flex flex-col items-center gap-3 text-center">
        <span class="material-symbols-outlined text-4xl text-on-surface-variant/40">folder_open</span>
        <p class="font-headline font-bold text-on-background">${_allProjects.length ? "No projects match your filter." : "No projects yet."}</p>
        <p class="font-body text-sm text-on-surface-variant">Try adjusting your search or status filter.</p>
      </div>`;
    return;
  }

  const showDrawings = ["designer", "lead_designer", "admin"].includes(role);

  const rows = list.map(p => {
    const sCls   = STATUS_CLS[p.status] || "text-on-surface-variant bg-surface-container";
    const sLbl   = STATUS_LABELS[p.status] || p.status || "—";
    const meta   = [p.bhk, p.property_type, p.total_area_m2 ? p.total_area_m2 + " m²" : null].filter(Boolean).join(" · ");
    const date   = new Date(p.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

    // ── Drawings progress ────────────────────────────────────────────────────
    let drawingsCell = "";
    if (showDrawings) {
      const s = _drawingSummary[p.id] || { total: 0, approved: 0, pending_review: 0, revision_requested: 0 };
      const approvedPct = s.total ? Math.round((s.approved / s.total) * 100) : 0;
      const reviewPct   = s.total ? Math.round((s.pending_review / s.total) * 100) : 0;
      const allDone     = s.total > 0 && s.approved === s.total;
      drawingsCell = `<td class="px-5 py-4 hidden md:table-cell">
        ${s.total > 0
          ? `<div class="drawing-bar-track mb-1">
               <div class="drawing-bar-approved" style="width:${approvedPct}%"></div>
               <div class="drawing-bar-review"   style="width:${reviewPct}%"></div>
             </div>
             <p class="font-body text-[10px] ${allDone ? "text-primary font-semibold" : "text-on-surface-variant"}">
               ${allDone ? "✓ All approved" : `${s.approved}/${s.total} approved`}
               ${s.pending_review ? ` · <span class="text-on-surface-variant">${s.pending_review} pending</span>` : ""}
               ${s.revision_requested ? ` · <span style="color:#9f403d">${s.revision_requested} revision</span>` : ""}
             </p>`
          : `<p class="font-body text-[10px] text-on-surface-variant">No drawings yet</p>`
        }
      </td>`;
    }

    // ── Action buttons ────────────────────────────────────────────────────────
    const actions = [];

    if (["sales", "lead_designer", "admin"].includes(role)) {
      actions.push(`
        <a href="/index?id=${p.id}" onclick="event.stopPropagation()"
          class="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-primary-container text-primary hover:bg-primary hover:text-on-primary transition-all">
          <span class="material-symbols-outlined text-[14px]">space_dashboard</span>Fitout
        </a>`);
    }

    if (["designer", "lead_designer", "admin"].includes(role)) {
      actions.push(`
        <a href="/designer?projectId=${p.id}" onclick="event.stopPropagation()"
          class="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-tertiary-container text-tertiary hover:bg-tertiary hover:text-on-tertiary transition-all">
          <span class="material-symbols-outlined text-[14px]">edit_square</span>Drawings
        </a>`);
    }

    if (role === "admin") {
      actions.push(`
        <a href="/audit?projectId=${p.id}" onclick="event.stopPropagation()"
          class="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-all">
          <span class="material-symbols-outlined text-[14px]">history</span>Audit
        </a>`);
    }

    return `
      <tr class="border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors proj-row-click"
          onclick="window.location.href='/project?id=${p.id}'">
        <td class="px-5 py-4">
          <p class="font-headline font-bold text-sm text-on-background leading-tight">${escHtml(p.name || "Untitled")}</p>
          <p class="font-body text-xs text-on-surface-variant mt-0.5">${escHtml(p.client_name || "—")}</p>
        </td>
        <td class="px-5 py-4 hidden sm:table-cell">
          <p class="font-body text-xs text-on-surface-variant">${escHtml(meta || "—")}</p>
        </td>
        <td class="px-5 py-4">
          <span class="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${sCls}">${escHtml(sLbl)}</span>
          ${p.advance_payment_done ? `<span class="ml-1 text-[10px] font-bold uppercase tracking-wider text-primary bg-primary-container px-2.5 py-1 rounded-full">₹ Paid</span>` : ""}
        </td>
        ${drawingsCell}
        <td class="px-5 py-4 hidden lg:table-cell">
          <p class="font-body text-xs text-on-surface-variant">${date}</p>
        </td>
        <td class="px-5 py-4">
          <div class="flex items-center gap-2 justify-end flex-wrap">
            ${actions.join("")}
          </div>
        </td>
      </tr>`;
  }).join("");

  const drawingsTh = showDrawings
    ? `<th class="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant hidden md:table-cell">Drawings</th>`
    : "";

  container.innerHTML = `
    <div class="bg-surface-container-lowest rounded-xl overflow-hidden">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-surface-container-low border-b border-outline-variant/10">
            <th class="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Project / Client</th>
            <th class="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant hidden sm:table-cell">Property</th>
            <th class="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Status</th>
            ${drawingsTh}
            <th class="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant hidden lg:table-cell">Updated</th>
            <th class="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ─── Create Project Modal ─────────────────────────────────────────────────────
function openCreateModal() {
  document.getElementById("newProjectName").value = "";
  document.getElementById("newProjectClient").value = "";
  document.getElementById("createProjectError").style.display = "none";
  document.getElementById("createProjectModal").style.display = "flex";
}

function closeCreateModal() {
  document.getElementById("createProjectModal").style.display = "none";
}

async function handleCreateProject() {
  const name   = document.getElementById("newProjectName").value.trim();
  const client = document.getElementById("newProjectClient").value.trim();
  const errEl  = document.getElementById("createProjectError");
  const btn    = document.getElementById("createProjectSubmit");
  errEl.style.display = "none";

  if (!name) {
    errEl.textContent = "Project name is required.";
    errEl.style.display = "block";
    return;
  }

  btn.disabled    = true;
  btn.textContent = "Creating…";
  try {
    const res  = await apiFetch("/api/project/create", {
      method: "POST",
      body: JSON.stringify({ name, clientName: client || undefined }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create project.");
    window.location.href = `/project?id=${data.projectId}`;
  } catch (err) {
    errEl.textContent    = err.message;
    errEl.style.display  = "block";
    btn.disabled         = false;
    btn.textContent      = "Create & Open";
  }
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

function escHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
