// ─── Sales Dashboard ───────────────────────────────────────────────────────────

(async () => {
  let session, profile;
  try {
    ({ session, profile } = await AuthClient.requireAuth(["sales", "admin", "ceo"]));
  } catch { window.location.href = "/login.html"; return; }

  // Render user chip + nav
  AuthClient.renderUserChip(profile, document.getElementById("userChipWrap"));
  renderNav(profile);

  // Greeting
  const hour = new Date().getHours();
  const tod  = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  document.getElementById("greeting").textContent =
    `Good ${tod}, ${profile.full_name.split(" ")[0]}`;

  // New project button
  document.getElementById("newProjectBtn").addEventListener("click", () => {
    window.location.href = "/index.html?new=1";
  });

  // Load and render projects
  await loadProjects(session);

  // Wire up search
  document.getElementById("searchInput").addEventListener("input", e => {
    filterCards(e.target.value.toLowerCase().trim());
  });
})();

// ─── Nav ──────────────────────────────────────────────────────────────────────
function renderNav(profile) {
  const nav = document.getElementById("dashNav");
  const links = [{ href: "/homepage.html", label: "Home" }];
  if (["sales", "admin"].includes(profile.role)) {
    links.push({ href: salesPageUrl(profile), label: "My Dashboard", active: true });
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

function salesPageUrl(profile) {
  const slug = profile.full_name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return `/sales/${slug}`;
}

// ─── Load & render projects ───────────────────────────────────────────────────
let _allMine   = [];
let _allOthers = [];

async function loadProjects(session) {
  const headers = { Authorization: `Bearer ${session.access_token}` };

  try {
    const res  = await fetch("/api/sales/projects", { headers });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    _allMine   = data.mine   || [];
    _allOthers = data.others || [];

    // Stats
    const total  = _allMine.length + _allOthers.length;
    const active = [..._allMine, ..._allOthers].filter(p => !p.status || p.status === "active").length;
    document.getElementById("statTotal").textContent   = total;
    document.getElementById("statMine").textContent    = _allMine.length;
    document.getElementById("statOthers").textContent  = _allOthers.length;
    document.getElementById("statActive").textContent  = active;

    renderSection("mineGrid",   "mineCount",   _allMine,   true);
    renderSection("othersGrid", "othersCount", _allOthers, false);
  } catch (err) {
    document.getElementById("mineGrid").innerHTML =
      `<p class="empty-hint">Could not load projects: ${err.message}</p>`;
    document.getElementById("othersGrid").innerHTML = "";
  }
}

function renderSection(gridId, countId, projects, isMine) {
  document.getElementById(countId).textContent = projects.length;
  const grid = document.getElementById(gridId);

  if (!projects.length) {
    grid.innerHTML = `<div class="sales-empty">${
      isMine
        ? "You haven't created any projects yet.<br>Click <strong>+ New Project</strong> to get started."
        : "No other projects found."
    }</div>`;
    return;
  }

  grid.innerHTML = projects.map(p => projectCardHtml(p)).join("");
}

function projectCardHtml(p) {
  const date = p.updated_at
    ? new Date(p.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "";
  const meta = [p.bhk_type || p.bhk, p.property_type].filter(Boolean).join(" · ");
  const statusBadge = p.status && p.status !== "active"
    ? `<span class="sales-badge sales-badge-${p.status}">${p.status.replace("_", " ")}</span>`
    : "";

  return `
    <a class="sales-card" href="/index.html?id=${p.id}"
       data-name="${esc(p.name)}" data-client="${esc(p.client_name)}">
      <div class="sales-card-thumb">
        ${p.thumbnail_url
          ? `<img src="${p.thumbnail_url}" alt="" loading="lazy" />`
          : `<div class="sales-card-thumb-empty">🏠</div>`}
      </div>
      <div class="sales-card-body">
        <div class="sales-card-name">${esc(p.name || "Untitled")}</div>
        ${p.client_name ? `<div class="sales-card-client">${esc(p.client_name)}</div>` : ""}
        ${meta ? `<div class="sales-card-meta">${esc(meta)}</div>` : ""}
        ${statusBadge}
      </div>
      <div class="sales-card-footer">
        <span class="sales-card-date">${date}</span>
        <span class="sales-card-open">Open →</span>
      </div>
    </a>`;
}

// ─── Search / filter ──────────────────────────────────────────────────────────
function filterCards(query) {
  if (!query) {
    renderSection("mineGrid",   "mineCount",   _allMine,   true);
    renderSection("othersGrid", "othersCount", _allOthers, false);
    return;
  }

  const filtered = arr => arr.filter(p =>
    (p.name || "").toLowerCase().includes(query) ||
    (p.client_name || "").toLowerCase().includes(query)
  );

  const mine   = filtered(_allMine);
  const others = filtered(_allOthers);
  renderSection("mineGrid",   "mineCount",   mine,   true);
  renderSection("othersGrid", "othersCount", others, false);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
