// ─── Projects List Page ────────────────────────────────────────────────────────

let _session, _profile;
let _allProjects = [];

const STATUS_LABELS = {
  active:        "Active",
  advanced_paid: "Advance Paid",
  in_progress:   "In Progress",
  completed:     "Completed",
  on_hold:       "On Hold",
  cancelled:     "Cancelled",
};

const ROLE_LABELS = {
  admin: "Admin", sales: "Sales", designer: "Designer",
  lead_designer: "Lead Designer", ceo: "CEO",
};

(async () => {
  try {
    ({ session: _session, profile: _profile } = await AuthClient.requireAuth());
  } catch { window.location.href = "/login"; return; }

  AuthClient.renderUserChip(_profile, document.getElementById("userChipWrap"));
  renderNav(_profile);

  // Show new project button for roles that can create
  if (["admin", "sales", "designer", "lead_designer"].includes(_profile.role)) {
    const btn = document.getElementById("newProjectBtn");
    btn.hidden = false;
    btn.addEventListener("click", openCreateModal);
  }

  document.getElementById("createProjectClose").addEventListener("click", closeCreateModal);
  document.getElementById("createProjectCancel").addEventListener("click", closeCreateModal);
  document.getElementById("createProjectSubmit").addEventListener("click", handleCreateProject);
  document.getElementById("searchInput").addEventListener("input", renderGrid);
  document.getElementById("statusFilter").addEventListener("change", renderGrid);

  await loadProjects();
})();

function renderNav(profile) {
  const nav = document.getElementById("dashNav");
  const links = [
    { href: "/homepage", label: "Home" },
    { href: "/projects", label: "Projects", active: true },
    { href: "/audit", label: "Audit Logs" },
  ];
  if (["sales", "admin", "lead_designer"].includes(profile.role)) {
    links.push({ href: "/projects", label: "Fitout Planner" });
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

async function loadProjects() {
  const grid = document.getElementById("projectsGrid");
  try {
    const res = await apiFetch("/api/project/list");
    const { projects } = await res.json();
    _allProjects = projects || [];
    renderGrid();
  } catch {
    grid.innerHTML = `<p class="loading-hint">Failed to load projects.</p>`;
  }
}

function renderGrid() {
  const grid    = document.getElementById("projectsGrid");
  const search  = document.getElementById("searchInput").value.toLowerCase().trim();
  const status  = document.getElementById("statusFilter").value;

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
    grid.innerHTML = `<p class="loading-hint" style="grid-column:1/-1">
      ${_allProjects.length ? "No projects match your filter." : "No projects yet."}
    </p>`;
    return;
  }

  grid.innerHTML = list.map(p => {
    const statusLabel = STATUS_LABELS[p.status] || p.status;
    const date = new Date(p.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const meta = [p.property_type, p.bhk, p.total_area_m2 ? p.total_area_m2 + " m²" : null].filter(Boolean).join(" · ");

    const fitoutLink = ["sales", "admin", "lead_designer"].includes(_profile.role)
      ? `<a class="ghost-sm" href="/index?id=${p.id}" onclick="event.stopPropagation()">Fitout →</a>`
      : "";
    const drawingsLink = ["designer", "lead_designer", "admin"].includes(_profile.role)
      ? `<a class="ghost-sm" href="/designer?projectId=${p.id}" onclick="event.stopPropagation()">Drawings →</a>`
      : "";

    return `
      <div class="proj-list-card" onclick="window.location.href='/project?id=${p.id}'">
        <div class="proj-list-thumb">
          ${p.thumbnail_url
            ? `<img src="${escHtml(p.thumbnail_url)}" alt="" loading="lazy" />`
            : `<div class="proj-list-thumb-empty">🏠</div>`}
        </div>
        <div class="proj-list-body">
          <div class="proj-list-top">
            <div>
              <div class="proj-list-name">${escHtml(p.name || "Untitled")}</div>
              ${p.client_name ? `<div class="proj-list-client">${escHtml(p.client_name)}</div>` : ""}
            </div>
            <div class="proj-list-badges">
              <span class="badge badge-proj-${p.status}">${statusLabel}</span>
              ${p.advance_payment_done ? `<span class="badge badge-advance">₹ Paid</span>` : ""}
            </div>
          </div>
          ${meta ? `<div class="proj-list-meta">${escHtml(meta)}</div>` : ""}
          <div class="proj-list-footer">
            <span class="proj-list-date">${date}</span>
            <div class="proj-list-actions">
              <a class="ghost-sm" href="/project?id=${p.id}" onclick="event.stopPropagation()">Details</a>
              <a class="ghost-sm" href="/audit?projectId=${p.id}" onclick="event.stopPropagation()">Audit</a>
              ${fitoutLink}
              ${drawingsLink}
            </div>
          </div>
        </div>
      </div>`;
  }).join("");
}

// ─── Create project modal ─────────────────────────────────────────────────────
function openCreateModal() {
  document.getElementById("newProjectName").value = "";
  document.getElementById("newProjectClient").value = "";
  document.getElementById("createProjectError").hidden = true;
  document.getElementById("createProjectModal").hidden = false;
}

function closeCreateModal() {
  document.getElementById("createProjectModal").hidden = true;
}

async function handleCreateProject() {
  const name   = document.getElementById("newProjectName").value.trim();
  const client = document.getElementById("newProjectClient").value.trim();
  const errEl  = document.getElementById("createProjectError");
  const btn    = document.getElementById("createProjectSubmit");
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
    window.location.href = `/project?id=${data.projectId}`;
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
    btn.disabled = false;
    btn.textContent = "Create Project";
  }
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
