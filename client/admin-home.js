// ─── Admin / CEO Command Center ────────────────────────────────────────────────
// Data sources:
//   /api/project/list      → projects with advance_payment_done, status, client_name
//   /api/ceo/dashboard     → per-project drawing + task stats, sales person
//   /api/ceo/team-stats    → roleCount, pendingDrawingsTotal, pendingTasksTotal

let _profile;
let _projects = [];         // from /api/project/list
let _projectsLoaded = false;
let _dashProjects = [];     // from /api/ceo/dashboard (for drawing/task data)

const STATUS_LABELS = {
  active: "Active",
  in_progress: "In Progress",
  advanced_paid: "Advanced Paid",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────

(async () => {
  try {
    ({ profile: _profile } =
      await AuthClient.requireAuth(["admin", "ceo"]));
  } catch { window.location.href = "/login"; return; }

  // Profile UI
  const slug = (_profile.full_name || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (slug) {
    document.getElementById("settingsLink").href   = `/profile/${slug}`;
    document.getElementById("userAvatarLink").href = `/profile/${slug}`;
  }
  if (_profile.avatar_url) document.getElementById("userAvatarImg").src = _profile.avatar_url;
  document.getElementById("userAvatarImg").alt = _profile.full_name || "User";
  document.getElementById("logoutBtn").addEventListener("click", () => AuthClient.signOut());

  // Role label in header
  document.getElementById("roleLabel").textContent =
    _profile.role === "admin" ? "Admin Console" : "CEO Overview";

  // Greeting
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (_profile.full_name || "Admin").split(" ")[0];
  document.getElementById("greetName").textContent = firstName + ".";
  document.getElementById("greetLine").textContent =
    `${greeting} — ${now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}`;

  // Sidebar: inject admin-only links
  if (_profile.role === "admin") {
    const nav = document.getElementById("sideNav");
    const adminLinks = [
      { href: "/index", icon: "chair", label: "Fitout Planner" },
      { href: "/designer", icon: "edit_square", label: "Drawings" },
      { href: "/admin", icon: "group", label: "Team Management" },
      { href: "/audit", icon: "history", label: "Audit Logs" },
    ];
    adminLinks.forEach(l => {
      const a = document.createElement("a");
      a.className = "flex items-center gap-3 px-4 py-3 rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-all";
      a.href = l.href;
      a.innerHTML = `<span class="material-symbols-outlined">${l.icon}</span><span class="text-sm">${l.label}</span>`;
      nav.appendChild(a);
    });
  } else {
    // CEO: hide team mgmt link (ceo doesn't manage team)
    const teamLink = document.getElementById("teamMgmtLink");
    if (teamLink) teamLink.style.display = "none";
    const sideTeam = document.querySelector('a[href="/admin"]');
    if (sideTeam) sideTeam.remove();
  }

  // New Project button (admin only)
  if (_profile.role === "admin") {
    document.getElementById("newProjectBtn").style.display = "";
    document.getElementById("newProjectBtn").addEventListener("click", openCreateModal);
  }

  // Load all data in parallel
  await Promise.all([loadProjects(), loadDashboard(), loadTeamStats()]);

  // Wire up search + filter
  document.getElementById("searchInput").addEventListener("input", renderTable);
  document.getElementById("statusFilter").addEventListener("change", renderTable);
})();

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function loadProjects() {
  try {
    const res = await studioFetch("/api/project/list");
    const data = await res.json();
    _projects = data.projects || [];
  } catch { _projects = []; }
  _projectsLoaded = true;
  renderKPIs();
  renderPipeline();
  renderTable();
}

async function loadDashboard() {
  try {
    const res = await studioFetch("/api/ceo/dashboard");
    const data = await res.json();
    _dashProjects = data.projects || [];
  } catch { _dashProjects = []; }
  renderTable();
}

async function loadTeamStats() {
  try {
    const res = await studioFetch("/api/ceo/team-stats");
    const stats = await res.json();
    renderTeamPulse(stats);
    // Also patch KPI placeholders that depend on team-stats (pending drawings/tasks)
    renderKPIs(stats);
  } catch { renderTeamPulse(null); }
}

// ── Render: KPI cards ─────────────────────────────────────────────────────────

let _teamStats = null;
function renderKPIs(stats) {
  if (stats) _teamStats = stats;
  if (!_projectsLoaded) return; // still loading

  const total    = _projects.length;
  const active   = _projects.filter(p => p.status === "active").length;
  const advPaid  = _projects.filter(p => p.advance_payment_done).length;
  const onHold   = _projects.filter(p => p.status === "on_hold").length;
  const completed = _projects.filter(p => p.status === "completed").length;

  const pendingDrawings = _teamStats?.pendingDrawingsTotal ?? "—";
  const openTasks       = _teamStats?.pendingTasksTotal ?? "—";

  const kpis = [
    { label: "Total Projects",     value: total,           icon: "architecture",     accent: false },
    { label: "Active",             value: active,          icon: "trending_up",      accent: false },
    { label: "Advance Paid",       value: advPaid,         icon: "payments",         accent: true  },
    { label: "On Hold",            value: onHold,          icon: "pause_circle",     accent: false },
    { label: "Drawings to Review", value: pendingDrawings, icon: "rate_review",      accent: pendingDrawings > 0 },
    { label: "Open Tasks",         value: openTasks,       icon: "task_alt",         accent: openTasks > 0 },
  ];

  document.getElementById("kpiRow").innerHTML = kpis.map(k => `
    <div class="bg-surface-container-lowest rounded-xl p-5 flex flex-col gap-1 ${k.accent ? "ring-1 ring-primary/20" : ""}">
      <div class="flex items-center gap-2 mb-1">
        <span class="material-symbols-outlined text-[18px] ${k.accent ? "text-primary" : "text-on-surface-variant"}">${k.icon}</span>
        <span class="font-label text-[10px] uppercase tracking-widest ${k.accent ? "text-primary font-bold" : "text-on-surface-variant font-bold"}">${k.label}</span>
      </div>
      <span class="font-headline font-extrabold text-4xl text-on-background">${k.value}</span>
    </div>
  `).join("");
}

// ── Render: Pipeline breakdown ─────────────────────────────────────────────────

function renderPipeline() {
  const total = _projects.length || 1;
  const statusOrder = ["active", "in_progress", "advanced_paid", "on_hold", "completed", "cancelled"];
  const colors = {
    active:        { bar: "bg-green-500",  pill: "pill-active"       },
    in_progress:   { bar: "bg-purple-400", pill: "pill-in_progress"  },
    advanced_paid: { bar: "bg-primary",    pill: "pill-advanced_paid"},
    on_hold:       { bar: "bg-yellow-400", pill: "pill-on_hold"      },
    completed:     { bar: "bg-blue-400",   pill: "pill-completed"    },
    cancelled:     { bar: "bg-red-300",    pill: "pill-cancelled"    },
  };

  const counts = {};
  statusOrder.forEach(s => counts[s] = 0);
  _projects.forEach(p => { if (counts[p.status] != null) counts[p.status]++; });

  const rows = statusOrder
    .filter(s => counts[s] > 0)
    .map(s => {
      const pct = Math.round((counts[s] / total) * 100);
      const c = colors[s] || { bar: "bg-gray-300", pill: "pill-default" };
      return `
        <div class="flex items-center gap-3">
          <span class="w-24 shrink-0 text-xs font-label font-semibold text-on-surface-variant">${STATUS_LABELS[s] || s}</span>
          <div class="flex-1 h-2 bg-surface-container-high rounded-full overflow-hidden">
            <div class="${c.bar} h-full rounded-full transition-all" style="width:${pct}%"></div>
          </div>
          <span class="w-8 text-right text-xs font-headline font-bold text-on-background">${counts[s]}</span>
        </div>`;
    });

  document.getElementById("pipelineBreakdown").innerHTML =
    rows.length ? rows.join("") : `<p class="text-sm text-on-surface-variant">No projects yet.</p>`;
}

// ── Render: Team pulse ────────────────────────────────────────────────────────

function renderTeamPulse(stats) {
  const el = document.getElementById("teamPulse");
  if (!stats) {
    el.innerHTML = `<p class="text-sm text-on-surface-variant">Could not load team data.</p>`;
    return;
  }
  const rc = stats.roleCount || {};
  const rows = [
    { label: "Sales",          key: "sales",         icon: "point_of_sale", color: "text-blue-600",  bg: "bg-blue-50"  },
    { label: "Designers",      key: "designer",       icon: "edit_square",   color: "text-purple-600",bg: "bg-purple-50"},
    { label: "Lead Designers", key: "lead_designer",  icon: "verified",      color: "text-yellow-700",bg: "bg-yellow-50"},
    { label: "Admins",         key: "admin",          icon: "shield_person", color: "text-primary",   bg: "bg-primary/5"},
    { label: "CEO",            key: "ceo",            icon: "stars",         color: "text-slate-600", bg: "bg-slate-50" },
  ].filter(r => rc[r.key]);

  el.innerHTML = rows.map(r => `
    <div class="flex items-center gap-3 p-3 rounded-lg ${r.bg}">
      <span class="material-symbols-outlined text-[18px] ${r.color}">${r.icon}</span>
      <span class="flex-1 text-sm font-label font-semibold text-on-background">${r.label}</span>
      <span class="font-headline font-bold text-lg text-on-background">${rc[r.key]}</span>
    </div>
  `).join("");
}

// ── Render: Projects table ────────────────────────────────────────────────────

function renderTable() {
  const tbody  = document.getElementById("projectsBody");
  if (!_projectsLoaded) return; // keep "Loading…" placeholder
  const search = (document.getElementById("searchInput")?.value || "").toLowerCase();
  const filter = document.getElementById("statusFilter")?.value || "";

  // Merge _projects (advance_payment_done) with _dashProjects (drawings, tasks, sales_person)
  const dashMap = {};
  _dashProjects.forEach(p => { dashMap[p.project_id] = p; });

  let rows = _projects.filter(p => {
    const matchSearch = !search ||
      (p.name || "").toLowerCase().includes(search) ||
      (p.client_name || "").toLowerCase().includes(search);
    const matchStatus = !filter || p.status === filter;
    return matchSearch && matchStatus;
  });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-10 text-on-surface-variant text-sm">No projects match your filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(p => {
    const d = dashMap[p.id] || {};
    const statusPill = `<span class="drw-pill ${statusPillClass(p.status)}">${STATUS_LABELS[p.status] || p.status || "—"}</span>`;
    const advBadge   = p.advance_payment_done
      ? `<span class="adv-yes"><span class="material-symbols-outlined text-[12px]">check_circle</span>Paid</span>`
      : `<span class="adv-no">—</span>`;

    const pending  = Number(d.drawings_pending_review || 0);
    const revision = Number(d.drawings_needs_revision || 0);
    const approved = Number(d.drawings_approved || 0);
    const drwHtml  = [
      pending  > 0 ? `<span class="drw-pill drw-pending">⏳ ${pending}</span>`  : "",
      revision > 0 ? `<span class="drw-pill drw-revision">↩ ${revision}</span>` : "",
      approved > 0 ? `<span class="drw-pill drw-approved">✓ ${approved}</span>` : "",
    ].join("") || `<span class="text-xs text-on-surface-variant">—</span>`;

    const tasks  = Number(d.tasks_pending || 0);
    const taskHtml = tasks > 0
      ? `<span class="font-bold text-error">⚠ ${tasks}</span>`
      : `<span class="text-on-surface-variant">${tasks}</span>`;

    return `<tr>
      <td class="td-name" title="${esc(p.name)}">${esc(p.name || "Untitled")}</td>
      <td class="text-sm text-on-surface-variant">${esc(p.client_name || "—")}</td>
      <td class="text-sm text-on-surface-variant">${esc(d.sales_person || "—")}</td>
      <td>${statusPill}</td>
      <td>${advBadge}</td>
      <td class="td-center text-sm">${d.team_size ?? "—"}</td>
      <td>${drwHtml}</td>
      <td class="td-center">${taskHtml}</td>
      <td>
        <div class="flex items-center gap-1">
          <a class="ghost-sm" href="/index?id=${p.id}">Plan</a>
          <a class="ghost-sm" href="/designer?projectId=${p.id}">Drawings</a>
        </div>
      </td>
    </tr>`;
  }).join("");
}

function statusPillClass(s) {
  return {
    active:        "pill-active",
    in_progress:   "pill-in_progress",
    advanced_paid: "pill-advanced_paid",
    on_hold:       "pill-on_hold",
    completed:     "pill-completed",
    cancelled:     "pill-cancelled",
  }[s] || "pill-default";
}

// ── Create project modal ──────────────────────────────────────────────────────

function openCreateModal() {
  const modal = document.getElementById("createModal");
  modal.style.display = "flex";
  document.getElementById("cpName").value = "";
  document.getElementById("cpClient").value = "";
  document.getElementById("cpError").style.display = "none";
}

document.getElementById("createModalClose").addEventListener("click", () => {
  document.getElementById("createModal").style.display = "none";
});
document.getElementById("createModalCancel").addEventListener("click", () => {
  document.getElementById("createModal").style.display = "none";
});

document.getElementById("cpSubmit").addEventListener("click", async () => {
  const name   = document.getElementById("cpName").value.trim();
  const client = document.getElementById("cpClient").value.trim();
  const errEl  = document.getElementById("cpError");
  const btn    = document.getElementById("cpSubmit");

  if (!name) { errEl.textContent = "Project name is required."; errEl.style.display = ""; return; }

  btn.disabled = true;
  btn.textContent = "Creating…";
  errEl.style.display = "none";

  try {
    const res = await studioFetch("/api/project/create", {
      method: "POST",
      body: JSON.stringify({ name, clientName: client || undefined }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create project");
    window.location.href = `/index?id=${data.project.id}`;
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = "";
    btn.disabled = false;
    btn.textContent = "Create & Open";
  }
});
