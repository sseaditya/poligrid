// ─── Admin Panel ──────────────────────────────────────────────────────────────

let _session, _profile, _allUsers = [], _currentProjectId;

const ROLES = ["sales", "designer", "lead_designer", "admin", "ceo"];
const ROLE_LABELS = {
  sales: "Sales", designer: "Designer",
  lead_designer: "Lead Designer", admin: "Admin", ceo: "CEO",
};
const DEPT_LABELS = {
  sales: "Sales", designer: "Design Studio",
  lead_designer: "Design Studio", admin: "Admin", ceo: "Executive",
};

(async () => {
  try {
    ({ session: _session, profile: _profile } =
      await AuthClient.requireAuth(["admin"]));
  } catch { window.location.href = '/login'; return; }

  AuthClient.renderUserChip(_profile, document.getElementById("userChipWrap"));
  renderTopNav();
  renderSidebar();

  await Promise.all([loadUsers(), loadProjects(), loadInvitations()]);

  document.getElementById("inviteBtn").addEventListener("click", handleInvite);

  document.getElementById("assignProjectSelect").addEventListener("change", e => {
    _currentProjectId = e.target.value;
    document.getElementById("assignBtn").disabled = !_currentProjectId;
    if (_currentProjectId) loadTeam(_currentProjectId);
    else document.getElementById("teamWrap").innerHTML =
      `<div style="font-size:12px;color:var(--color-on-surface-variant);text-align:center;padding:8px 0">Select a project to see its team</div>`;
  });

  document.getElementById("assignBtn").addEventListener("click", handleAssign);
})();

// ── Top nav ───────────────────────────────────────────────────────────────────
function renderTopNav() {
  const nav = document.getElementById("dashNav");
  const links = [
    { href: "/admin_home", label: "Home" },
    { href: "/projects",   label: "Projects" },
    { href: "/audit",      label: "Audit Logs" },
    { href: "/admin",      label: "Admin", active: true },
    { href: "/ceo",        label: "Dashboard" },
  ];
  nav.innerHTML = links.map(l =>
    `<a class="dash-nav-link${l.active ? " active" : ""}" href="${l.href}">${l.label}</a>`
  ).join("");
}

// ── Left sidebar ──────────────────────────────────────────────────────────────
function renderSidebar() {
  const sidebar = document.getElementById("projSidebar");
  if (!sidebar) return;

  const isCollapsed = localStorage.getItem("leftSidebarCollapsed") === "1";
  if (isCollapsed) sidebar.classList.add("collapsed");

  const navLinks = [
    { icon: "dashboard",      label: "Command Center", href: "/admin_home" },
    { icon: "manage_accounts",label: "User Management", href: "/admin", active: true },
    { icon: "policy",         label: "Audit Logs",      href: "/audit" },
    { icon: "folder_open",    label: "Projects",        href: "/projects" },
    { icon: "bar_chart",      label: "CEO Dashboard",   href: "/ceo" },
    { icon: "architecture",   label: "Drawings",        href: "/designer" },
  ];

  const bottomLinks = [
    { icon: "cottage",        label: "Home",            href: "/homepage" },
    { icon: "design_services",label: "Fitout Planner",  href: "/index" },
    { icon: "logout",         label: "Logout",          href: "#", id: "sidebarLogoutBtn" },
  ];

  sidebar.innerHTML = `
    <div class="proj-sidebar-topbar">
      <button id="leftSidebarToggleBtn" class="proj-sidebar-collapse-btn"
        title="${isCollapsed ? "Expand sidebar" : "Collapse sidebar"}">
        <span class="material-symbols-outlined">${isCollapsed ? "left_panel_open" : "left_panel_close"}</span>
      </button>
    </div>

    <div class="proj-sidebar-ctx">
      <div class="proj-sidebar-ctx-icon">
        <span class="material-symbols-outlined">manage_accounts</span>
      </div>
      <div class="proj-sidebar-ctx-name">System Manager</div>
      <div class="proj-sidebar-ctx-sub">Admin</div>
    </div>

    <p class="proj-sidebar-label">Navigation</p>
    ${navLinks.map(l => `
      <a class="proj-sidebar-link${l.active ? " active" : ""}" href="${l.href}">
        <span class="material-symbols-outlined">${l.icon}</span>
        <span>${l.label}</span>
      </a>`).join("")}

    <hr class="proj-sidebar-divider" />

    <div class="proj-sidebar-bottom">
      ${bottomLinks.map(l => `
        <a class="proj-sidebar-link" href="${l.href}"${l.id ? ` id="${l.id}"` : ""}>
          <span class="material-symbols-outlined">${l.icon}</span>
          <span>${l.label}</span>
        </a>`).join("")}
    </div>`;

  document.getElementById("leftSidebarToggleBtn")?.addEventListener("click", () => {
    const collapsed = sidebar.classList.toggle("collapsed");
    localStorage.setItem("leftSidebarCollapsed", collapsed ? "1" : "0");
    const btn = document.getElementById("leftSidebarToggleBtn");
    btn.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
    btn.querySelector(".material-symbols-outlined").textContent =
      collapsed ? "left_panel_open" : "left_panel_close";
  });

  document.getElementById("sidebarLogoutBtn")?.addEventListener("click", async (e) => {
    e.preventDefault();
    if (window.AuthClient) await AuthClient.signOut();
    window.location.href = "/login";
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function _updateComposition(users) {
  if (!users.length) return;
  const counts = {};
  ROLES.forEach(r => counts[r] = 0);
  users.forEach(u => { if (counts[u.role] != null) counts[u.role]++; });
  ROLES.forEach(r => {
    const pct = Math.round((counts[r] / users.length) * 100);
    const fill = document.getElementById(`comp-${r}`);
    const lbl  = document.getElementById(`compPct-${r}`);
    if (fill) fill.style.width = pct + "%";
    if (lbl)  lbl.textContent  = pct + "%";
  });
  const lbl = document.getElementById("memberCountLabel");
  if (lbl) lbl.textContent = `Showing ${users.length} member${users.length !== 1 ? "s" : ""}`;
}

// ── Invite ─────────────────────────────────────────────────────────────────────

async function handleInvite() {
  const email    = document.getElementById("inviteEmail").value.trim();
  const role     = document.getElementById("inviteRole").value;
  const fullName = document.getElementById("inviteFullName").value.trim();
  const msg      = document.getElementById("inviteMsg");
  const btn      = document.getElementById("inviteBtn");

  if (!email) { msg.className = "adm-invite-msg error"; msg.textContent = "Email is required."; return; }

  btn.disabled = true;
  btn.textContent = "Sending…";
  msg.textContent = "";
  msg.className = "adm-invite-msg";

  try {
    const res = await fetch("/api/users/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${_session.access_token}` },
      body: JSON.stringify({ email, role, fullName: fullName || undefined }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    msg.className = "adm-invite-msg success";
    msg.textContent = `Invite sent for ${email}. They can now log in with their Google account.`;
    document.getElementById("inviteEmail").value = "";
    document.getElementById("inviteFullName").value = "";
    await loadInvitations();
  } catch (e) {
    msg.className = "adm-invite-msg error";
    msg.textContent = e.message || "Failed to send invite.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Send Invite";
  }
}

async function loadInvitations() {
  const wrap = document.getElementById("invitationsWrap");
  try {
    const res = await fetch("/api/users/invitations", {
      headers: { Authorization: `Bearer ${_session.access_token}` },
    });
    const { invitations } = await res.json();

    if (!invitations?.length) {
      wrap.innerHTML = `<p style="font-size:12px;color:#8a9394;margin:0">No pending invitations.</p>`;
      return;
    }

    wrap.innerHTML = `
      <div class="adm-pending-section">
        <div class="adm-pending-label">Pending — awaiting first login (${invitations.length})</div>
        <div class="adm-chips">
          ${invitations.map(inv => `
            <div class="adm-chip">
              <span class="adm-chip-name">${inv.full_name ? `${inv.full_name} &lt;${inv.email}&gt;` : inv.email}</span>
              <span class="adm-chip-role role-${inv.role}">${ROLE_LABELS[inv.role] || inv.role}</span>
              <button class="adm-chip-cancel cancel-invite-btn" data-email="${inv.email}" title="Cancel invite">✕</button>
            </div>`).join("")}
        </div>
      </div>`;

    wrap.querySelectorAll(".cancel-invite-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        await fetch("/api/users/invitations/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${_session.access_token}` },
          body: JSON.stringify({ email: btn.dataset.email }),
        });
        loadInvitations();
      });
    });
  } catch {
    wrap.innerHTML = "";
  }
}

// ── Users table ────────────────────────────────────────────────────────────────

async function loadUsers() {
  const tbody     = document.getElementById("usersBody");
  const userSelect = document.getElementById("assignUserSelect");
  try {
    const res = await fetch("/api/users/list", {
      headers: { Authorization: `Bearer ${_session.access_token}` },
    });
    const { users } = await res.json();
    _allUsers = users || [];

    _updateComposition(_allUsers);

    tbody.innerHTML = _allUsers.map(u => `
      <tr data-id="${u.id}">
        <td>
          <div class="adm-member-cell">
            <div class="adm-avatar role-${u.role}">${_initials(u.full_name)}</div>
            <div class="adm-member-info">
              <span class="adm-member-name">${u.full_name || "—"}</span>
              <span class="adm-member-email">${u.email}</span>
            </div>
          </div>
        </td>
        <td><span class="adm-dept-text">${DEPT_LABELS[u.role] || u.role}</span></td>
        <td>
          <select class="role-select-inline role-select" data-uid="${u.id}"
            ${u.id === _profile.id ? "disabled title='Cannot change your own role'" : ""}>
            ${ROLES.map(r => `<option value="${r}" ${u.role === r ? "selected" : ""}>${ROLE_LABELS[r]}</option>`).join("")}
          </select>
        </td>
        <td>
          <label class="adm-status-toggle" style="cursor:${u.id === _profile.id ? 'not-allowed' : 'pointer'}">
            <input type="checkbox" class="active-toggle" data-uid="${u.id}"
              ${u.is_active ? "checked" : ""} ${u.id === _profile.id ? "disabled" : ""}
              style="display:none" />
            <span class="adm-status-pill ${u.is_active ? 'active' : 'inactive'}" id="status-pill-${u.id}">
              <span class="adm-status-dot ${u.is_active ? 'active' : 'inactive'}" id="status-dot-${u.id}"></span>
              <span id="status-text-${u.id}">${u.is_active ? "Active" : "Inactive"}</span>
            </span>
          </label>
        </td>
        <td>
          <div class="adm-actions-cell">
            <span class="adm-save-badge" id="saved-${u.id}"></span>
          </div>
        </td>
      </tr>
    `).join("");

    // Wire role selects
    tbody.querySelectorAll(".role-select").forEach(sel => {
      sel.addEventListener("change", async () => {
        await updateUser(sel.dataset.uid, { role: sel.value });
        // Refresh avatar/dept after role change
        const row = document.querySelector(`tr[data-id="${sel.dataset.uid}"]`);
        if (row) {
          const av   = row.querySelector(".adm-avatar");
          const dept = row.querySelector(".adm-dept-text");
          if (av)   av.className   = `adm-avatar role-${sel.value}`;
          if (dept) dept.textContent = DEPT_LABELS[sel.value] || sel.value;
          // Update cached user role for composition
          const u = _allUsers.find(u => u.id === sel.dataset.uid);
          if (u) u.role = sel.value;
          _updateComposition(_allUsers);
        }
      });
    });

    // Wire active toggles
    tbody.querySelectorAll(".active-toggle").forEach(chk => {
      chk.addEventListener("change", async () => {
        await updateUser(chk.dataset.uid, { isActive: chk.checked });
        const pill = document.getElementById(`status-pill-${chk.dataset.uid}`);
        const dot  = document.getElementById(`status-dot-${chk.dataset.uid}`);
        const txt  = document.getElementById(`status-text-${chk.dataset.uid}`);
        if (pill) pill.className   = `adm-status-pill ${chk.checked ? "active" : "inactive"}`;
        if (dot)  dot.className    = `adm-status-dot  ${chk.checked ? "active" : "inactive"}`;
        if (txt)  txt.textContent  = chk.checked ? "Active" : "Inactive";
        const u = _allUsers.find(u => u.id === chk.dataset.uid);
        if (u) u.is_active = chk.checked;
      });
    });

    // Populate user dropdown for assignments
    userSelect.innerHTML = `<option value="">Select member…</option>` +
      _allUsers.filter(u => u.id !== _profile.id).map(u =>
        `<option value="${u.id}">${u.full_name} (${ROLE_LABELS[u.role] || u.role})</option>`
      ).join("");

  } catch {
    tbody.innerHTML = `<tr><td colspan="5" style="padding:24px;text-align:center;color:#9f403d">Failed to load users.</td></tr>`;
  }
}

async function updateUser(userId, updates) {
  const badge = document.getElementById(`saved-${userId}`);
  try {
    const res = await fetch("/api/users/update-role", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${_session.access_token}` },
      body: JSON.stringify({ userId, ...updates }),
    });
    if (!res.ok) throw new Error();
    if (badge) {
      badge.textContent = "Saved";
      badge.className = "adm-save-badge show";
      setTimeout(() => { badge.className = "adm-save-badge"; }, 2000);
    }
  } catch {
    if (badge) {
      badge.textContent = "Error";
      badge.className = "adm-save-badge show error";
    }
  }
}

// ── Projects & Assignments ─────────────────────────────────────────────────────

async function loadProjects() {
  const select = document.getElementById("assignProjectSelect");
  try {
    const res = await fetch("/api/project/list", {
      headers: { Authorization: `Bearer ${_session.access_token}` },
    });
    const { projects } = await res.json();
    select.innerHTML = `<option value="">Select project…</option>` +
      (projects || []).map(p =>
        `<option value="${p.id}">${p.name || "Untitled"}${p.client_name ? " · " + p.client_name : ""}</option>`
      ).join("");
  } catch {
    select.innerHTML = `<option value="">Error loading projects</option>`;
  }
}

async function loadTeam(projectId) {
  const wrap = document.getElementById("teamWrap");
  wrap.innerHTML = `<div style="font-size:12px;color:#5a6e6f;padding:8px 0">Loading…</div>`;
  try {
    const res = await fetch(`/api/project/team?id=${projectId}`, {
      headers: { Authorization: `Bearer ${_session.access_token}` },
    });
    const { team } = await res.json();
    if (!team?.length) {
      wrap.innerHTML = `<div style="font-size:12px;color:#5a6e6f;text-align:center;padding:8px 0">No members assigned yet.</div>`;
      return;
    }
    wrap.innerHTML = team.map(t => `
      <div class="adm-team-member">
        <div class="adm-avatar role-${t.profile?.role}" style="width:28px;height:28px;font-size:10px;flex-shrink:0">
          ${_initials(t.profile?.full_name)}
        </div>
        <span class="adm-team-member-name">${t.profile?.full_name || "Unknown"}</span>
        <span class="adm-team-member-role">${ROLE_LABELS[t.profile?.role] || t.profile?.role}</span>
        <button class="adm-team-remove unassign-btn" data-uid="${t.user_id}" title="Remove">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>`).join("");

    wrap.querySelectorAll(".unassign-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        await fetch("/api/project/unassign-user", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${_session.access_token}` },
          body: JSON.stringify({ projectId: _currentProjectId, userId: btn.dataset.uid }),
        });
        loadTeam(_currentProjectId);
      });
    });
  } catch {
    wrap.innerHTML = `<div style="font-size:12px;color:#9f403d;padding:8px 0">Failed to load team.</div>`;
  }
}

async function handleAssign() {
  const userId = document.getElementById("assignUserSelect").value;
  if (!userId || !_currentProjectId) return;
  const btn = document.getElementById("assignBtn");
  btn.disabled = true;
  btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:15px">hourglass_top</span> Assigning…`;
  try {
    await fetch("/api/project/assign-user", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${_session.access_token}` },
      body: JSON.stringify({ projectId: _currentProjectId, userId }),
    });
    loadTeam(_currentProjectId);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:15px">person_add_alt</span> Assign to Project`;
  }
}
