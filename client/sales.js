// ─── Sales Dashboard (homepage UI, served at /sales/:slug) ────────────────────

(async () => {
  let session, profile;
  try {
    ({ session, profile } = await AuthClient.requireAuth(["sales", "admin"]));
  } catch { window.location.href = "/login.html"; return; }

  // Render user chip + role-based nav
  AuthClient.renderUserChip(profile, document.getElementById("userChipWrap"));
  renderNav(profile);

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  document.getElementById("greeting").textContent = `${greeting}, ${profile.full_name.split(" ")[0]}`;
  document.getElementById("subline").textContent = `You're signed in as ${roleLabel(profile.role)}.`;

  // New project button for sales
  const wrap = document.getElementById("projectsAction");
  wrap.innerHTML = `<button class="primary-btn btn-sm" id="newProjectBtn">+ New Project</button>`;
  document.getElementById("newProjectBtn").addEventListener("click", () => {
    window.location.href = "/index.html?new=1";
  });

  loadProjects(session, profile);
  loadTasks(session, profile);
})();

// ─── Nav links ────────────────────────────────────────────────────────────────
function renderNav(profile) {
  const nav = document.getElementById("dashNav");
  const slug = profile.full_name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const links = [
    { href: `/sales/${slug}`, label: "Home", active: true },
    { href: "/index.html", label: "Fitout Planner" },
  ];
  if (profile.role === "admin") {
    links.push({ href: "/admin.html", label: "Admin" });
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
        <a class="ghost-sm proj-mini-open" href="/index.html?id=${p.id}">Open →</a>
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

    const headers2 = { Authorization: `Bearer ${session.access_token}` };
    container.querySelectorAll(".task-done-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const taskId = btn.dataset.id;
        btn.disabled = true;
        await fetch("/api/tasks/update", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers2 },
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function roleLabel(role) {
  return { admin: "Admin", sales: "Sales", designer: "Designer", lead_designer: "Lead Designer", ceo: "CEO" }[role] || role;
}
