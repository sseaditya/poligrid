// ─── Homepage — role-aware dashboard ─────────────────────────────────────────

(async () => {
  let session, profile;
  try {
    ({ session, profile } = await AuthClient.requireAuth());
  } catch { window.location.href = '/login.html'; return; }

  // Render user chip + role-based nav
  AuthClient.renderUserChip(profile, document.getElementById("userChipWrap"));
  renderNav(profile);

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  document.getElementById("greeting").textContent = `${greeting}, ${profile.full_name.split(" ")[0]}`;
  document.getElementById("subline").textContent = `You're signed in as ${roleLabel(profile.role)}.`;

  // Role-specific setup
  if (profile.role === "lead_designer" || profile.role === "admin") {
    document.getElementById("statRow").hidden = false;
    document.getElementById("reviewSection").hidden = false;
    loadReviewQueue(session);
  }
  // Team-wide stats only available to admin/ceo
  if (profile.role === "admin") {
    loadStats(session);
  }

  if (profile.role === "sales" || profile.role === "admin") {
    const wrap = document.getElementById("projectsAction");
    wrap.innerHTML = `<button class="primary-btn btn-sm" id="newProjectBtn">+ New Project</button>`;
    document.getElementById("newProjectBtn").addEventListener("click", () => {
      window.location.href = "/index.html?new=1";
    });
  }

  if (profile.role === "designer" || profile.role === "lead_designer") {
    const wrap = document.getElementById("projectsAction");
    wrap.innerHTML = `<a class="ghost-btn btn-sm" href="/designer.html">All Drawings →</a>`;
  }

  loadProjects(session, profile);
  loadTasks(session, profile);
})();

// ─── Nav links per role ───────────────────────────────────────────────────────
function renderNav(profile) {
  const nav = document.getElementById("dashNav");
  const links = [{ href: "/homepage.html", label: "Home", active: true }];

  if (["sales", "admin"].includes(profile.role)) {
    links.push({ href: "/index.html", label: "Fitout Planner" });
  }
  if (["designer", "lead_designer", "admin"].includes(profile.role)) {
    links.push({ href: "/designer.html", label: "Drawings" });
  }
  if (profile.role === "admin") {
    links.push({ href: "/admin.html", label: "Admin" });
    links.push({ href: "/ceo.html", label: "Dashboard" });
  }
  if (profile.role === "ceo") {
    links.push({ href: "/ceo.html", label: "Dashboard" });
  }

  nav.innerHTML = links.map(l =>
    `<a class="dash-nav-link${l.active ? " active" : ""}" href="${l.href}">${l.label}</a>`
  ).join("");
}

// ─── Load projects ────────────────────────────────────────────────────────────
async function loadProjects(session, profile) {
  const container = document.getElementById("projectsList");
  try {
    const headers = { Authorization: `Bearer ${session.access_token}` };
    const res = await fetch("/api/project/list", { headers });
    const { projects } = await res.json();

    if (!projects?.length) {
      container.innerHTML = `<p class="empty-hint">No projects yet.</p>`;
      return;
    }

    container.innerHTML = projects.slice(0, 8).map(p => `
      <div class="proj-mini-card" data-id="${p.id}">
        ${p.thumbnail_url ? `<img class="proj-mini-thumb" src="${p.thumbnail_url}" alt="" />` : `<div class="proj-mini-thumb proj-mini-thumb--empty"></div>`}
        <div class="proj-mini-info">
          <span class="proj-mini-name">${p.name || "Untitled"}</span>
          <span class="proj-mini-meta">${p.bhk || ""} ${p.property_type || ""} ${p.client_name ? "· " + p.client_name : ""}</span>
          ${p.status !== "active" ? `<span class="badge badge-${p.status}">${p.status}</span>` : ""}
        </div>
        ${["sales", "admin"].includes(profile.role) ? `<a class="ghost-sm proj-mini-open" href="/index.html?id=${p.id}">Open →</a>` : ""}
        ${["designer", "lead_designer"].includes(profile.role) ? `<a class="ghost-sm proj-mini-open" href="/designer.html?projectId=${p.id}">Drawings →</a>` : ""}
      </div>
    `).join("");
  } catch {
    container.innerHTML = `<p class="empty-hint">Failed to load projects.</p>`;
  }
}

// ─── Load tasks ───────────────────────────────────────────────────────────────
async function loadTasks(session, profile) {
  const container = document.getElementById("tasksList");
  try {
    const headers = { Authorization: `Bearer ${session.access_token}` };
    const res = await fetch("/api/tasks/list?status=pending", { headers });
    const { tasks } = await res.json();

    // Also count for stat
    document.getElementById("statTasksNum").textContent = tasks?.length ?? 0;

    if (!tasks?.length) {
      container.innerHTML = `<p class="empty-hint">No pending tasks. You're all clear!</p>`;
      return;
    }

    container.innerHTML = tasks.map(t => `
      <div class="task-item" data-id="${t.id}">
        <div class="task-item-left">
          <span class="task-priority priority-${t.priority}"></span>
          <div>
            <span class="task-title">${t.title}</span>
            ${t.project ? `<span class="task-project">${t.project.name || "Untitled"}</span>` : ""}
          </div>
        </div>
        <button class="ghost-sm task-done-btn" data-id="${t.id}">Done</button>
      </div>
    `).join("");

    container.querySelectorAll(".task-done-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const taskId = btn.dataset.id;
        btn.disabled = true;
        await fetch("/api/tasks/update", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ taskId, status: "completed" }),
        });
        btn.closest(".task-item").style.opacity = "0.4";
        btn.textContent = "✓";
      });
    });
  } catch {
    container.innerHTML = `<p class="empty-hint">Failed to load tasks.</p>`;
  }
}

// ─── Load review queue (lead_designer / admin) — single API call ──────────────
async function loadReviewQueue(session) {
  const container = document.getElementById("reviewList");
  const headers   = { Authorization: `Bearer ${session.access_token}` };
  try {
    const res = await fetch("/api/drawings/pending", { headers });
    if (!res.ok) { container.innerHTML = `<p class="empty-hint">Could not load queue.</p>`; return; }
    const { drawings } = await res.json();

    // Update stat badge
    const statEl = document.getElementById("statPendingNum");
    if (statEl) statEl.textContent = drawings.length;

    if (!drawings.length) {
      container.innerHTML = `<p class="empty-hint">No drawings awaiting review. All clear!</p>`;
      return;
    }

    container.innerHTML = drawings.map(d => `
      <div class="drawing-row">
        <div class="drawing-row-info">
          <span class="drawing-type-badge">${d.drawing_type}</span>
          <span class="drawing-title">${d.title}</span>
          <span class="drawing-meta">
            ${d.project?.name || "Unknown project"}
            ${d.project?.client_name ? "· " + d.project.client_name : ""}
            &nbsp;·&nbsp; v${d.version_number}
            &nbsp;·&nbsp; ${d.uploader?.full_name || ""}
            &nbsp;·&nbsp; ${fmtDate(d.created_at)}
          </span>
        </div>
        <span class="badge badge-drawing-pending_review">⏳ Pending</span>
        <a class="ghost-sm review-queue-link" href="/designer.html?projectId=${d.project_id}">Review →</a>
      </div>
    `).join("");
  } catch {
    container.innerHTML = `<p class="empty-hint">Failed to load review queue.</p>`;
  }
}

// ─── Load stats (admin) ───────────────────────────────────────────────────────
async function loadStats(session) {
  try {
    const headers = { Authorization: `Bearer ${session.access_token}` };
    const res = await fetch("/api/ceo/team-stats", { headers });
    if (!res.ok) return;
    const stats = await res.json();
    document.getElementById("statProjectsNum").textContent = stats.totalProjects ?? 0;
    document.getElementById("statPendingNum").textContent = stats.pendingDrawingsTotal ?? 0;
  } catch { /* silent */ }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function roleLabel(role) {
  return { admin: "Admin", sales: "Sales", designer: "Designer", lead_designer: "Lead Designer", ceo: "CEO" }[role] || role;
}

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
