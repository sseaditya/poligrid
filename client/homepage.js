// ─── Homepage — role-aware dashboard ─────────────────────────────────────────

let _session, _profile;

(async () => {
  try {
    ({ session: _session, profile: _profile } = await AuthClient.requireAuth());
  } catch { window.location.href = "/login"; return; }

  AuthClient.renderUserChip(_profile, document.getElementById("userChipWrap"));
  renderNav(_profile);

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  document.getElementById("greeting").textContent = `${greeting}, ${_profile.full_name.split(" ")[0]}`;
  document.getElementById("subline").textContent = `You're signed in as ${roleLabel(_profile.role)}.`;

  // Redirect sales to their dedicated page
  if (_profile.role === "sales") {
    const slug = _profile.full_name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    window.location.href = `/sales/${slug}`;
    return;
  }

  if (_profile.role === "designer") {
    await setupDesignerDashboard();
  } else if (_profile.role === "lead_designer") {
    await setupLeadDashboard();
  } else {
    // admin / ceo
    document.getElementById("statRow").hidden = false;
    if (_profile.role === "admin") {
      document.getElementById("reviewSection").hidden = false;
      loadReviewQueue();
      loadStats();
      const wrap = document.getElementById("projectsAction");
      wrap.innerHTML = `<button class="primary-btn btn-sm" id="newProjectBtn">+ New Project</button>`;
      document.getElementById("newProjectBtn").addEventListener("click", () => {
        window.location.href = "/projects";
      });
    }
    loadProjects();
    loadTasks();
  }
})();

// ─── Designer dashboard ───────────────────────────────────────────────────────
async function setupDesignerDashboard() {
  // Hide tasks section — replaced by Actions Required
  document.getElementById("tasksSection").hidden = true;
  document.getElementById("actionsSection").hidden = false;

  // Wire create project modal
  document.getElementById("designerCreateBtn")?.addEventListener("click", openCreateModal);
  document.getElementById("createProjectClose")?.addEventListener("click", closeCreateModal);
  document.getElementById("createProjectCancel")?.addEventListener("click", closeCreateModal);
  document.getElementById("createProjectSubmit")?.addEventListener("click", handleCreateProject);

  const [projects] = await Promise.all([
    loadProjects(),
    loadRevisionRequests(),
  ]);
}

// ─── Lead designer dashboard ──────────────────────────────────────────────────
async function setupLeadDashboard() {
  document.getElementById("tasksSection").hidden = true;

  const projects = await loadLeadProjects();

  if (!projects?.length) {
    // Welcome / empty state
    document.getElementById("leadStart").hidden = false;
    document.getElementById("dashGrid").hidden = true;
    document.getElementById("statRow").hidden = true;
    await setupLeadWelcome();
  } else {
    // Active dashboard
    document.getElementById("statRow").hidden = false;
    document.getElementById("reviewSection").hidden = false;
    document.getElementById("leadStart").hidden = true;
    document.getElementById("dashGrid").hidden = false;
    loadReviewQueue();
    // Wire modals for active state
    document.getElementById("browseProjectsClose")?.addEventListener("click", () => {
      document.getElementById("browseProjectsModal").hidden = true;
    });
    document.getElementById("createProjectClose")?.addEventListener("click", closeCreateModal);
    document.getElementById("createProjectCancel")?.addEventListener("click", closeCreateModal);
    document.getElementById("createProjectSubmit")?.addEventListener("click", handleCreateProject);
  }
}

// ─── Lead welcome screen wiring ───────────────────────────────────────────────
async function setupLeadWelcome() {
  // Load available paid projects (not assigned to self)
  try {
    const res = await apiFetch("/api/project/available");
    const { projects } = await res.json();
    const badge = document.getElementById("leadAvailableBadge");
    if (projects?.length) {
      badge.textContent = `${projects.length} available`;
      badge.hidden = false;
    }
  } catch { /* silent */ }

  // Browse paid projects modal
  document.getElementById("leadBrowseBtn").addEventListener("click", openBrowseModal);
  document.getElementById("browseProjectsClose").addEventListener("click", () => {
    document.getElementById("browseProjectsModal").hidden = true;
  });

  // Create project modal
  document.getElementById("leadCreateBtn").addEventListener("click", openCreateModal);
  document.getElementById("createProjectClose")?.addEventListener("click", closeCreateModal);
  document.getElementById("createProjectCancel")?.addEventListener("click", closeCreateModal);
  document.getElementById("createProjectSubmit")?.addEventListener("click", handleCreateProject);
}

async function openBrowseModal() {
  document.getElementById("browseProjectsModal").hidden = false;
  const container = document.getElementById("browseProjectsList");
  container.innerHTML = `<p class="loading-hint">Loading…</p>`;

  try {
    const res = await apiFetch("/api/project/available");
    const { projects } = await res.json();

    if (!projects?.length) {
      container.innerHTML = `<p class="empty-hint">No paid projects available right now. Check back later.</p>`;
      return;
    }

    container.innerHTML = projects.map(p => `
      <div class="proj-mini-card" data-id="${p.id}">
        ${p.thumbnail_url
          ? `<img class="proj-mini-thumb" src="${p.thumbnail_url}" alt="" />`
          : `<div class="proj-mini-thumb proj-mini-thumb--empty"></div>`}
        <div class="proj-mini-info">
          <span class="proj-mini-name">${escHtml(p.name || "Untitled")}</span>
          <span class="proj-mini-meta">
            ${escHtml(p.bhk || "")} ${escHtml(p.property_type || "")}
            ${p.client_name ? "· " + escHtml(p.client_name) : ""}
          </span>
          <span class="badge badge-success" style="margin-top:4px">₹ Advance Paid</span>
        </div>
        <button class="primary-btn btn-sm lead-self-assign-btn" data-id="${p.id}">Assign to Me</button>
      </div>
    `).join("");

    container.querySelectorAll(".lead-self-assign-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Assigning…";
        try {
          const r = await apiFetch("/api/project/assign-user", {
            method: "POST",
            body: JSON.stringify({ projectId: btn.dataset.id, userId: _profile.id }),
          });
          if (!r.ok) throw new Error();
          btn.textContent = "✓ Assigned";
          btn.style.background = "var(--success)";
          setTimeout(() => { window.location.href = `/designer?projectId=${btn.dataset.id}`; }, 800);
        } catch {
          btn.disabled = false;
          btn.textContent = "Assign to Me";
        }
      });
    });
  } catch {
    container.innerHTML = `<p class="empty-hint">Failed to load projects.</p>`;
  }
}

// ─── Nav links per role ───────────────────────────────────────────────────────
function renderNav(profile) {
  const nav = document.getElementById("dashNav");
  const links = [{ href: "/homepage", label: "Home", active: true }];
  links.push({ href: "/projects", label: "Projects" });

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

// ─── Load projects (generic — admin/ceo) ─────────────────────────────────────
async function loadProjects() {
  const container = document.getElementById("projectsList");
  try {
    const res = await apiFetch("/api/project/list");
    const { projects } = await res.json();

    if (!projects?.length) {
      // Show start screen for designer
      if (_profile.role === "designer") {
        document.getElementById("designerStart").hidden = false;
        document.getElementById("dashGrid").hidden = true;
      } else {
        container.innerHTML = `<p class="empty-hint">No projects yet.</p>`;
      }
      return [];
    }

    if (_profile.role === "designer") {
      document.getElementById("designerStart").hidden = true;
      document.getElementById("dashGrid").hidden = false;
    }

    container.innerHTML = projects.slice(0, 8).map(p => `
      <div class="proj-mini-card" data-id="${p.id}">
        ${p.thumbnail_url
          ? `<img class="proj-mini-thumb" src="${p.thumbnail_url}" alt="" />`
          : `<div class="proj-mini-thumb proj-mini-thumb--empty"></div>`}
        <div class="proj-mini-info">
          <span class="proj-mini-name">${escHtml(p.name || "Untitled")}</span>
          <span class="proj-mini-meta">${escHtml(p.bhk || "")} ${escHtml(p.property_type || "")} ${p.client_name ? "· " + escHtml(p.client_name) : ""}</span>
          ${p.status !== "active" ? `<span class="badge badge-${p.status}">${p.status}</span>` : ""}
        </div>
        ${["sales", "admin"].includes(_profile.role) ? `<a class="ghost-sm proj-mini-open" href="/index?id=${p.id}">Open →</a>` : ""}
        ${["designer", "lead_designer"].includes(_profile.role) ? `<a class="ghost-sm proj-mini-open" href="/designer?projectId=${p.id}">Drawings →</a>` : ""}
      </div>
    `).join("");

    return projects;
  } catch {
    container.innerHTML = `<p class="empty-hint">Failed to load projects.</p>`;
    return [];
  }
}

// ─── Lead designer: projects with progress bars ───────────────────────────────
async function loadLeadProjects() {
  const container = document.getElementById("projectsList");
  container.innerHTML = `<p class="loading-hint">Loading…</p>`;

  try {
    const res = await apiFetch("/api/project/list");
    const { projects } = await res.json();

    if (!projects?.length) {
      container.innerHTML = `<p class="empty-hint">No projects assigned yet.</p>`;
      // Update stats
      document.getElementById("statProjectsNum").textContent = 0;
      return [];
    }

    document.getElementById("statProjectsNum").textContent = projects.length;

    // Fetch drawing progress for all projects in one call
    const ids = projects.map(p => p.id).join(",");
    let summary = {};
    try {
      const sr = await apiFetch(`/api/drawings/project-summary?projectIds=${ids}`);
      ({ summary } = await sr.json());
    } catch { /* progress bars will show 0 */ }

    const wrap = document.getElementById("projectsAction");
    wrap.innerHTML = `
      <button class="ghost-btn btn-sm" id="leadPickupBtn" style="margin-right:8px">+ Pick Up Project</button>
      <button class="primary-btn btn-sm" id="leadNewProjectBtn">+ New Project</button>
    `;
    document.getElementById("leadPickupBtn")?.addEventListener("click", openBrowseModal);
    document.getElementById("leadNewProjectBtn")?.addEventListener("click", () => {
      document.getElementById("createProjectModal").hidden = false;
    });

    container.innerHTML = projects.map(p => {
      const s = summary[p.id] || { total: 0, approved: 0, pending_review: 0, revision_requested: 0 };
      const approvedPct = s.total ? Math.round((s.approved / s.total) * 100) : 0;
      const reviewPct   = s.total ? Math.round((s.pending_review / s.total) * 100) : 0;
      const allDone = s.total > 0 && s.approved === s.total;

      return `
        <div class="proj-progress-card">
          <div class="proj-progress-top">
            <div class="proj-mini-info">
              <span class="proj-mini-name">${escHtml(p.name || "Untitled")}</span>
              <span class="proj-mini-meta">${escHtml(p.client_name || "")}${p.bhk ? " · " + escHtml(p.bhk) : ""}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              ${p.advance_payment_done ? `<span class="badge badge-success" title="Advance payment received">₹ Paid</span>` : ""}
              ${p.status !== "active" ? `<span class="badge badge-${p.status}">${p.status}</span>` : ""}
              <a class="ghost-sm" href="/designer?projectId=${p.id}">Open →</a>
            </div>
          </div>
          ${s.total > 0 ? `
            <div class="proj-drawing-progress">
              <div class="drawing-progress-track" style="margin:6px 0 4px">
                <div class="drawing-progress-fill approved" style="width:${approvedPct}%"></div>
                <div class="drawing-progress-fill review"   style="width:${reviewPct}%"></div>
              </div>
              <span class="drawing-progress-fraction" style="${allDone ? "color:var(--success)" : ""}">
                ${allDone ? "✓ All drawings approved" : `${s.approved} / ${s.total} approved`}
                ${s.revision_requested ? ` · ${s.revision_requested} need revision` : ""}
              </span>
            </div>
          ` : `<p class="text-dim" style="font-size:12px;margin:4px 0 0">No drawing types assigned yet.</p>`}
        </div>`;
    }).join("");

    return projects;
  } catch {
    container.innerHTML = `<p class="empty-hint">Failed to load projects.</p>`;
    return [];
  }
}

// ─── Designer: Actions Required (revision requests) ───────────────────────────
async function loadRevisionRequests() {
  const container = document.getElementById("actionsList");
  try {
    const res = await apiFetch("/api/drawings/revision-requests");
    const { drawings } = await res.json();

    if (!drawings?.length) {
      container.innerHTML = `<p class="empty-hint">No revisions requested. You're all clear!</p>`;
      return;
    }

    container.innerHTML = drawings.map(d => {
      const latestReview = d.drawing_reviews?.[0];
      return `
        <div class="drawing-row action-row">
          <div class="drawing-row-info">
            <span class="drawing-type-badge">${escHtml(d.drawing_type)}</span>
            <span class="drawing-title">${escHtml(d.title)}</span>
            <span class="drawing-meta">
              ${d.project?.name ? escHtml(d.project.name) : ""}
              ${d.project?.client_name ? "· " + escHtml(d.project.client_name) : ""}
              &nbsp;·&nbsp; v${d.version_number}
            </span>
            ${latestReview?.comments ? `
              <span class="drawing-meta review-feedback">
                "💬 ${escHtml(latestReview.comments)}"
                — ${escHtml(latestReview.reviewer?.full_name || "Reviewer")}
              </span>` : ""}
          </div>
          <span class="badge badge-drawing-revision_requested">🔁 Revision Needed</span>
          <a class="primary-btn btn-sm" href="/designer?projectId=${d.project_id}">Upload Revision →</a>
        </div>`;
    }).join("");
  } catch {
    container.innerHTML = `<p class="empty-hint">Failed to load actions.</p>`;
  }
}

// ─── Load tasks ───────────────────────────────────────────────────────────────
async function loadTasks() {
  const container = document.getElementById("tasksList");
  try {
    const res = await apiFetch("/api/tasks/list?status=pending");
    const { tasks } = await res.json();

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
            <span class="task-title">${escHtml(t.title)}</span>
            ${t.project ? `<span class="task-project">${escHtml(t.project.name || "Untitled")}</span>` : ""}
          </div>
        </div>
        <button class="ghost-sm task-done-btn" data-id="${t.id}">Done</button>
      </div>
    `).join("");

    container.querySelectorAll(".task-done-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        await apiFetch("/api/tasks/update", {
          method: "POST",
          body: JSON.stringify({ taskId: btn.dataset.id, status: "completed" }),
        });
        btn.closest(".task-item").style.opacity = "0.4";
        btn.textContent = "✓";
      });
    });
  } catch {
    container.innerHTML = `<p class="empty-hint">Failed to load tasks.</p>`;
  }
}

// ─── Review queue (lead_designer / admin) ────────────────────────────────────
async function loadReviewQueue() {
  const container = document.getElementById("reviewList");
  try {
    const res = await apiFetch("/api/drawings/pending");
    if (!res.ok) { container.innerHTML = `<p class="empty-hint">Could not load queue.</p>`; return; }
    const { drawings } = await res.json();

    const statEl = document.getElementById("statPendingNum");
    if (statEl) statEl.textContent = drawings.length;

    if (!drawings.length) {
      container.innerHTML = `<p class="empty-hint">No drawings awaiting review. All clear!</p>`;
      return;
    }

    container.innerHTML = drawings.map(d => `
      <div class="drawing-row">
        <div class="drawing-row-info">
          <span class="drawing-type-badge">${escHtml(d.drawing_type)}</span>
          <span class="drawing-title">${escHtml(d.title)}</span>
          <span class="drawing-meta">
            ${d.project?.name ? escHtml(d.project.name) : "Unknown project"}
            ${d.project?.client_name ? "· " + escHtml(d.project.client_name) : ""}
            &nbsp;·&nbsp; v${d.version_number}
            &nbsp;·&nbsp; ${escHtml(d.uploader?.full_name || "")}
            &nbsp;·&nbsp; ${fmtDate(d.created_at)}
          </span>
        </div>
        <span class="badge badge-drawing-pending_review">⏳ Pending</span>
        <a class="ghost-sm review-queue-link" href="/designer?projectId=${d.project_id}">Review →</a>
      </div>
    `).join("");
  } catch {
    container.innerHTML = `<p class="empty-hint">Failed to load review queue.</p>`;
  }
}

// ─── Load stats (admin) ───────────────────────────────────────────────────────
async function loadStats() {
  try {
    const res = await apiFetch("/api/ceo/team-stats");
    if (!res.ok) return;
    const stats = await res.json();
    document.getElementById("statProjectsNum").textContent = stats.totalProjects ?? 0;
    document.getElementById("statPendingNum").textContent = stats.pendingDrawingsTotal ?? 0;
  } catch { /* silent */ }
}

// ─── Create project modal (designer) ─────────────────────────────────────────
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
  const name    = document.getElementById("newProjectName").value.trim();
  const client  = document.getElementById("newProjectClient").value.trim();
  const errEl   = document.getElementById("createProjectError");
  const btn     = document.getElementById("createProjectSubmit");
  errEl.hidden  = true;

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
    window.location.href = `/designer?projectId=${data.projectId}`;
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
    btn.disabled = false;
    btn.textContent = "Create & Open";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function apiFetch(url, opts = {}) {
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${_session.access_token}`,
      ...(opts.headers || {}),
    },
  });
}

function roleLabel(role) {
  return { admin: "Admin", sales: "Sales", designer: "Designer", lead_designer: "Lead Designer", ceo: "CEO" }[role] || role;
}

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
