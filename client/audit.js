// ─── Audit Logs Page ─────────────────────────────────────────────────────────

let _session, _profile;
let _logs = [];
let _scope = "own";

const _projectId = new URLSearchParams(window.location.search).get("projectId") || "";

const SUBCATEGORY_LABELS = {
  project_creation: "Project Creation",
  team_assignment: "Team Assignment",
  marked_paid_by_sales: "Marked Paid",
  lead_designer_took_up_project: "Lead Designer Took Up",
  drawing_assignment: "Drawing Assignment",
  drawing_upload: "Drawing Upload",
  drawing_reupload: "Drawing Reupload",
  review: "Review",
  request_revision: "Request Revision",
  approve: "Approve",
  project_status_change: "Project Status Change",
};

(async () => {
  try {
    ({ session: _session, profile: _profile } = await AuthClient.requireAuth());
  } catch {
    window.location.href = "/login";
    return;
  }

  AppNav.renderSidebar(_profile, document.getElementById('sidebarNav'));
  AppNav.renderMobileNav(_profile, document.getElementById('mobileNav'));
  AppNav.setupUserSection(_profile);

  // If arriving from a project's Audit Log sub-link, show the project context in the sidebar
  if (_projectId) {
    const bc = document.getElementById("auditBreadcrumb");
    if (bc) bc.textContent = "Project Audit Log";
    const topTitle = document.getElementById("auditTopbarTitle");
    if (topTitle) topTitle.textContent = "Project Audit Log";

    // Re-render sidebar with project sub-nav (shows back-to-project indentation)
    try {
      const res = await apiFetch(`/api/project/detail?id=${encodeURIComponent(_projectId)}`);
      if (res.ok) {
        const { project } = await res.json();
        if (project) {
          AppNav.renderSidebarWithProject(
            _profile,
            document.getElementById('sidebarNav'),
            project
          );
        }
      }
    } catch { /* sidebar stays flat if fetch fails */ }
  }


  document.getElementById("searchInput").addEventListener("input", renderTable);
  document.getElementById("categoryFilter").addEventListener("change", renderTable);
  document.getElementById("subcategoryFilter").addEventListener("change", renderTable);

  await loadLogs();
})();

async function loadLogs() {
  const body = document.getElementById("auditBody");
  body.innerHTML = `<tr><td colspan="6" class="loading-hint">Loading…</td></tr>`;

  try {
    const qs = new URLSearchParams();
    qs.set("limit", "500");
    if (_projectId) qs.set("projectId", _projectId);

    const res = await apiFetch(`/api/audit/logs?${qs.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load audit logs.");

    _logs = data.logs || [];
    _scope = data.scope || "own";

    hydrateSubcategoryFilter(_logs);
    renderHeader();
    renderTable();
  } catch (err) {
    document.getElementById("auditTitle").textContent = "Audit Logs";
    document.getElementById("auditSubline").textContent = err.message || "Failed to load audit logs.";
    body.innerHTML = `<tr><td colspan="6" class="loading-hint">Failed to load audit logs.</td></tr>`;
  }
}

function renderHeader() {
  const title = document.getElementById("auditTitle");
  const subline = document.getElementById("auditSubline");

  const firstProjectName = _logs.find(l => l.project?.name)?.project?.name;
  const deptCategory = _scope.startsWith("department:") ? _scope.split(":")[1] : "";
  const scopeLabel = _scope === "all"
    ? "all platform actions"
    : deptCategory
      ? `all ${deptCategory} department actions`
      : "your actions";

  if (_projectId) {
    title.textContent = firstProjectName ? `${firstProjectName} Audit Log` : "Project Audit Log";
    subline.textContent = `Showing ${scopeLabel} for this project.`;
    return;
  }

  title.textContent = _scope === "all"
    ? "All Audit Logs"
    : deptCategory
      ? `${capitalize(deptCategory)} Audit Logs`
      : "My Audit Logs";
  subline.textContent = `Showing ${scopeLabel} across projects.`;
}

function hydrateSubcategoryFilter(logs) {
  const sel = document.getElementById("subcategoryFilter");
  const existing = sel.value;
  const subcategories = Array.from(new Set((logs || []).map(l => l.subcategory).filter(Boolean))).sort();

  sel.innerHTML = `<option value="">All subcategories</option>` +
    subcategories.map(key => `<option value="${escAttr(key)}">${escHtml(subcategoryLabel(key))}</option>`).join("");

  if (existing && subcategories.includes(existing)) sel.value = existing;
}

function renderTable() {
  const body = document.getElementById("auditBody");
  const search = document.getElementById("searchInput").value.trim().toLowerCase();
  const category = document.getElementById("categoryFilter").value;
  const subcategory = document.getElementById("subcategoryFilter").value;

  let rows = _logs;
  if (category) rows = rows.filter(l => l.category === category);
  if (subcategory) rows = rows.filter(l => l.subcategory === subcategory);
  if (search) {
    rows = rows.filter(l => {
      const hay = [
        l.category,
        l.subcategory,
        l.log_message,
        l.actioned_by_name,
        l.project?.name,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(search);
    });
  }

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="loading-hint">No audit rows match this filter.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map(l => `
    <tr>
      <td>${escHtml(capitalize(l.category || "—"))}</td>
      <td>${escHtml(subcategoryLabel(l.subcategory || "—"))}</td>
      <td>${escHtml(l.project?.name || "—")}</td>
      <td style="max-width:420px">${escHtml(l.log_message || "—")}</td>
      <td>${escHtml(l.actioned_by_name || "System")}</td>
      <td>${escHtml(fmtDateTime(l.actioned_on))}</td>
    </tr>
  `).join("");
}

function subcategoryLabel(key) {
  if (!key) return "—";
  return SUBCATEGORY_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtDateTime(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(str) {
  return escHtml(str).replace(/'/g, "&#39;");
}
