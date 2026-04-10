// ─── CEO Dashboard ────────────────────────────────────────────────────────────

let _session, _profile, _allProjects = [];

(async () => {
  try {
    ({ session: _session, profile: _profile } =
      await AuthClient.requireAuth(["admin", "ceo"]));
  } catch { window.location.href = '/login'; return; }

  AuthClient.renderUserChip(_profile, document.getElementById("userChipWrap"));
  renderNav(_profile);

  await Promise.all([loadStats(), loadDashboard()]);

  document.getElementById("searchInput").addEventListener("input", renderTable);
  document.getElementById("statusFilter").addEventListener("change", renderTable);
})();

function renderNav(profile) {
  const nav = document.getElementById("dashNav");
  const links = [
    { href: "/homepage", label: "Home" },
    { href: "/projects", label: "Projects" },
    { href: "/audit", label: "Audit Logs" },
    { href: "/ceo", label: "Dashboard", active: true },
  ];
  if (profile.role === "admin") {
    links.push({ href: "/projects", label: "Fitout Planner" });
    links.push({ href: "/designer", label: "Drawings" });
    links.push({ href: "/admin", label: "Admin" });
  }
  nav.innerHTML = links.map(l =>
    `<a class="dash-nav-link${l.active ? " active" : ""}" href="${l.href}">${l.label}</a>`
  ).join("");
}

async function loadStats() {
  try {
    const res = await fetch("/api/ceo/team-stats", {
      headers: { Authorization: `Bearer ${_session.access_token}` },
    });
    const stats = await res.json();
    document.getElementById("sTotal").textContent = stats.totalProjects ?? 0;
    document.getElementById("sSales").textContent = stats.roleCount?.sales ?? 0;
    document.getElementById("sDesigners").textContent = stats.roleCount?.designer ?? 0;
    document.getElementById("sLeads").textContent = stats.roleCount?.lead_designer ?? 0;
    document.getElementById("sPendingDrawings").textContent = stats.pendingDrawingsTotal ?? 0;
    document.getElementById("sPendingTasks").textContent = stats.pendingTasksTotal ?? 0;
  } catch { /* silent */ }
}

async function loadDashboard() {
  const tbody = document.getElementById("projectsBody");
  try {
    const res = await fetch("/api/ceo/dashboard", {
      headers: { Authorization: `Bearer ${_session.access_token}` },
    });
    const { projects } = await res.json();
    _allProjects = projects || [];
    renderTable();
  } catch {
    tbody.innerHTML = `<tr><td colspan="8">Failed to load dashboard.</td></tr>`;
  }
}

function renderTable() {
  const tbody = document.getElementById("projectsBody");
  const search = document.getElementById("searchInput").value.toLowerCase();
  const statusFilter = document.getElementById("statusFilter").value;

  let rows = _allProjects.filter(p => {
    const matchSearch = !search ||
      (p.project_name || "").toLowerCase().includes(search) ||
      (p.client_name || "").toLowerCase().includes(search) ||
      (p.sales_person || "").toLowerCase().includes(search);
    const matchStatus = !statusFilter || p.project_status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="loading-hint">No projects match your filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(p => {
    const pendingReviews = Number(p.drawings_pending_review || 0);
    const needsRevision = Number(p.drawings_needs_revision || 0);
    const pendingTasks = Number(p.tasks_pending || 0);

    return `
    <tr>
      <td class="td-name">${p.project_name || "Untitled"}</td>
      <td>${p.client_name || "—"}</td>
      <td>${p.sales_person || "—"}</td>
      <td><span class="badge badge-proj-${p.project_status}">${statusLabel(p.project_status)}</span></td>
      <td class="td-center">${p.team_size ?? 0}</td>
      <td>
        <div class="drawing-mini-stats">
          ${pendingReviews > 0 ? `<span class="badge badge-drawing-pending_review">⏳ ${pendingReviews} pending</span>` : ""}
          ${needsRevision > 0 ? `<span class="badge badge-drawing-revision_requested">🔁 ${needsRevision} revision</span>` : ""}
          ${Number(p.drawings_approved || 0) > 0 ? `<span class="badge badge-drawing-approved">✅ ${p.drawings_approved} approved</span>` : ""}
          ${pendingReviews === 0 && needsRevision === 0 && !Number(p.drawings_approved) ? `<span class="text-dim">No drawings</span>` : ""}
        </div>
      </td>
      <td class="td-center ${pendingTasks > 0 ? "warn-text" : ""}">${pendingTasks > 0 ? "⚠ " + pendingTasks : pendingTasks}</td>
      <td class="td-actions">
        <a class="ghost-sm" href="/index?id=${p.project_id}" title="Fitout Planner">Plan</a>
        <a class="ghost-sm" href="/designer?projectId=${p.project_id}" title="View drawings">Drawings</a>
        <a class="ghost-sm" href="/audit?projectId=${p.project_id}" title="View audit log">Audit</a>
      </td>
    </tr>`;
  }).join("");
}

function statusLabel(s) {
  return { active: "Active", on_hold: "On Hold", completed: "Completed", cancelled: "Cancelled" }[s] || s || "—";
}
