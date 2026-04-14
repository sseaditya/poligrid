// ─── Admin Panel ──────────────────────────────────────────────────────────────

let _session, _profile, _allUsers = [];
let _allProjects = [], _projectTeams = {};

// Edit mode state — team members
let _teamEditMode = false;
let _pendingUserChanges = {}; // { [userId]: { role?, isActive? } }

// Edit mode state — project assignments
let _assignEditMode = false;
let _pendingAssignAdd    = []; // [{projectId, userId}]
let _pendingAssignRemove = []; // [{projectId, userId}]
let _originalProjectTeams = {};

const ROLES = ["sales", "designer", "lead_designer", "admin", "ceo"];
const ROLE_LABELS = {
  sales: "Sales", designer: "Designer",
  lead_designer: "Lead Designer", admin: "Admin", ceo: "CEO",
};
const DEPT_LABELS = {
  sales: "Sales", designer: "Design Studio",
  lead_designer: "Design Studio", admin: "Admin", ceo: "Executive",
};

// Role columns for the assignments matrix
const ASSIGN_ROLES = [
  { key: "sales",         label: "Sales",         accent: "#1d4ed8", bg: "#dbeafe", tagColor: "#1e3a8a" },
  { key: "lead_designer", label: "Lead Designer",  accent: "#92400e", bg: "#fef3c7", tagColor: "#78350f" },
  { key: "designer",      label: "Designer",       accent: "#526258", bg: "#d5e7da", tagColor: "#33433a" },
  { key: "procurement",   label: "Procurement",    accent: "#5b21b6", bg: "#ede9fe", tagColor: "#4c1d95", future: true },
  { key: "supervisor",    label: "Supervisor",     accent: "#065f46", bg: "#d1fae5", tagColor: "#064e3b", future: true },
];

(async () => {
  AppNav.mountSidebar('TEAM DIRECTORY');

  try {
    ({ session: _session, profile: _profile } =
      await AuthClient.requireAuth(["admin"]));
  } catch { window.location.href = '/login'; return; }

  AppNav.renderSidebar(_profile, document.getElementById('sidebarNav'));
  AppNav.renderMobileNav(_profile, document.getElementById('mobileNav'));
  AppNav.setupUserSection(_profile);
  AppNav.setupCollapse();

  await Promise.all([loadUsers(), loadProjects(), loadInvitations()]);

  document.getElementById("inviteBtn").addEventListener("click", handleInvite);

  // ── Team table edit / save / cancel ────────────────────────────────────────
  document.getElementById("teamEditBtn").addEventListener("click", () => {
    _teamEditMode = true;
    _pendingUserChanges = {};
    renderUsersTable();
    setTeamEditUI(true);
  });

  document.getElementById("teamSaveBtn").addEventListener("click", async () => {
    const btn = document.getElementById("teamSaveBtn");
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      await Promise.all(
        Object.entries(_pendingUserChanges).map(([uid, changes]) => updateUser(uid, changes))
      );
    } catch { /* individual errors handled inside updateUser */ }
    _teamEditMode = false;
    _pendingUserChanges = {};
    await loadUsers();          // refresh from server + re-render read mode
    setTeamEditUI(false);
    btn.disabled = false;
    btn.textContent = "Save Changes";
  });

  document.getElementById("teamCancelBtn").addEventListener("click", () => {
    _teamEditMode = false;
    _pendingUserChanges = {};
    renderUsersTable();
    setTeamEditUI(false);
  });

  // ── Assignments edit / save / cancel ───────────────────────────────────────
  document.getElementById("assignEditBtn").addEventListener("click", () => {
    _assignEditMode = true;
    _originalProjectTeams = JSON.parse(JSON.stringify(_projectTeams));
    _pendingAssignAdd    = [];
    _pendingAssignRemove = [];
    renderAssignmentsTable();
    setAssignEditUI(true);
  });

  document.getElementById("assignSaveBtn").addEventListener("click", async () => {
    const btn = document.getElementById("assignSaveBtn");
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      await Promise.all([
        ..._pendingAssignAdd.map(({ projectId, userId }) =>
          fetch("/api/project/assign-user", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${_session.access_token}` },
            body: JSON.stringify({ projectId, userId }),
          })
        ),
        ..._pendingAssignRemove.map(({ projectId, userId }) =>
          fetch("/api/project/unassign-user", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${_session.access_token}` },
            body: JSON.stringify({ projectId, userId }),
          })
        ),
      ]);
    } catch { /* silently continue */ }
    _assignEditMode = false;
    _pendingAssignAdd    = [];
    _pendingAssignRemove = [];
    await loadProjects();       // refresh from server + re-render read mode
    setAssignEditUI(false);
    btn.disabled = false;
    btn.textContent = "Save Changes";
  });

  document.getElementById("assignCancelBtn").addEventListener("click", () => {
    _assignEditMode = false;
    _projectTeams = JSON.parse(JSON.stringify(_originalProjectTeams));
    _pendingAssignAdd    = [];
    _pendingAssignRemove = [];
    renderAssignmentsTable();
    setAssignEditUI(false);
  });
})();

// ── UI mode helpers ────────────────────────────────────────────────────────────

function setTeamEditUI(editing) {
  document.getElementById("teamEditBtn").style.display  = editing ? "none" : "";
  document.getElementById("teamSaveBtn").style.display  = editing ? "" : "none";
  document.getElementById("teamCancelBtn").style.display = editing ? "" : "none";
}

function setAssignEditUI(editing) {
  document.getElementById("assignEditBtn").style.display  = editing ? "none" : "";
  document.getElementById("assignSaveBtn").style.display  = editing ? "" : "none";
  document.getElementById("assignCancelBtn").style.display = editing ? "" : "none";
  document.getElementById("assignHint").style.display     = editing ? "none" : "";
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
  const tbody = document.getElementById("usersBody");
  try {
    const res = await fetch("/api/users/list", {
      headers: { Authorization: `Bearer ${_session.access_token}` },
    });
    const { users } = await res.json();
    _allUsers = users || [];
    _updateComposition(_allUsers);
    renderUsersTable();
  } catch {
    tbody.innerHTML = `<tr><td colspan="4" style="padding:24px;text-align:center;color:#9f403d">Failed to load users.</td></tr>`;
  }
}

function renderUsersTable() {
  const tbody = document.getElementById("usersBody");

  tbody.innerHTML = _allUsers.map(u => {
    const staged      = _pendingUserChanges[u.id] || {};
    const displayRole = staged.role     !== undefined ? staged.role     : u.role;
    const displayActive = staged.isActive !== undefined ? staged.isActive : u.is_active;

    // Access Level cell
    const roleCell = _teamEditMode
      ? `<select class="role-select-inline role-select" data-uid="${u.id}"
           ${u.id === _profile.id ? "disabled title='Cannot change your own role'" : ""}>
           ${ROLES.map(r => `<option value="${r}" ${displayRole === r ? "selected" : ""}>${ROLE_LABELS[r]}</option>`).join("")}
         </select>`
      : `<span class="role-badge role-${u.role}">${ROLE_LABELS[u.role] || u.role}</span>`;

    // Status cell
    const statusCell = _teamEditMode
      ? `<label class="adm-status-toggle" style="cursor:${u.id === _profile.id ? 'not-allowed' : 'pointer'}">
           <input type="checkbox" class="active-toggle" data-uid="${u.id}"
             ${displayActive ? "checked" : ""} ${u.id === _profile.id ? "disabled" : ""}
             style="display:none" />
           <span class="adm-status-pill ${displayActive ? 'active' : 'inactive'}" id="status-pill-${u.id}">
             <span class="adm-status-dot ${displayActive ? 'active' : 'inactive'}"></span>
             <span id="status-text-${u.id}">${displayActive ? "Active" : "Inactive"}</span>
           </span>
         </label>`
      : `<span class="adm-status-pill ${u.is_active ? 'active' : 'inactive'}">
           <span class="adm-status-dot ${u.is_active ? 'active' : 'inactive'}"></span>
           ${u.is_active ? "Active" : "Inactive"}
         </span>`;

    return `<tr data-id="${u.id}">
      <td>
        <div class="adm-member-cell">
          <div class="adm-avatar role-${u.role}" id="avatar-${u.id}">${_initials(u.full_name)}</div>
          <div class="adm-member-info">
            <span class="adm-member-name">${u.full_name || "—"}</span>
            <span class="adm-member-email">${u.email}</span>
          </div>
        </div>
      </td>
      <td><span class="adm-dept-text" id="dept-${u.id}">${DEPT_LABELS[displayRole] || displayRole}</span></td>
      <td>${roleCell}</td>
      <td>${statusCell}</td>
    </tr>`;
  }).join("");

  if (_teamEditMode) wireUserTableEvents();
}

function wireUserTableEvents() {
  const tbody = document.getElementById("usersBody");

  // Role select
  tbody.querySelectorAll(".role-select").forEach(sel => {
    sel.addEventListener("change", () => {
      if (!_pendingUserChanges[sel.dataset.uid]) _pendingUserChanges[sel.dataset.uid] = {};
      _pendingUserChanges[sel.dataset.uid].role = sel.value;
      // Update avatar class + dept label in place (no full re-render)
      const av   = document.getElementById(`avatar-${sel.dataset.uid}`);
      const dept = document.getElementById(`dept-${sel.dataset.uid}`);
      if (av)   av.className   = `adm-avatar role-${sel.value}`;
      if (dept) dept.textContent = DEPT_LABELS[sel.value] || sel.value;
    });
  });

  // Active toggle
  tbody.querySelectorAll(".active-toggle").forEach(chk => {
    chk.addEventListener("change", () => {
      if (!chk.checked) {
        const user = _allUsers.find(u => u.id === chk.dataset.uid);
        const name = user?.full_name || "this user";
        if (!confirm(`Deactivate ${name}? They will lose access to the platform.`)) {
          chk.checked = true; // revert
          return;
        }
      }
      if (!_pendingUserChanges[chk.dataset.uid]) _pendingUserChanges[chk.dataset.uid] = {};
      _pendingUserChanges[chk.dataset.uid].isActive = chk.checked;
      // Update pill visuals in place
      const pill = document.getElementById(`status-pill-${chk.dataset.uid}`);
      const txt  = document.getElementById(`status-text-${chk.dataset.uid}`);
      if (pill) pill.className = `adm-status-pill ${chk.checked ? "active" : "inactive"}`;
      if (txt)  txt.textContent = chk.checked ? "Active" : "Inactive";
    });
  });
}

async function updateUser(userId, updates) {
  const res = await fetch("/api/users/update-role", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${_session.access_token}` },
    body: JSON.stringify({ userId, ...updates }),
  });
  if (!res.ok) throw new Error(`Failed to update user ${userId}`);
}

// ── Projects & Assignments Matrix ─────────────────────────────────────────────

async function loadProjects() {
  const wrap = document.getElementById("assignmentsTableWrap");
  try {
    const res = await fetch("/api/project/list", {
      headers: { Authorization: `Bearer ${_session.access_token}` },
    });
    const { projects } = await res.json();
    _allProjects = projects || [];

    const results = await Promise.all(
      _allProjects.map(async p => {
        try {
          const r = await fetch(`/api/project/team?id=${p.id}`, {
            headers: { Authorization: `Bearer ${_session.access_token}` },
          });
          const d = await r.json();
          return { id: p.id, team: d.team || [] };
        } catch { return { id: p.id, team: [] }; }
      })
    );
    results.forEach(r => { _projectTeams[r.id] = r.team; });

    renderAssignmentsTable();
  } catch {
    document.getElementById("assignmentsTableWrap").innerHTML =
      `<p style="color:#9f403d;padding:20px">Failed to load project data.</p>`;
  }
}

function renderAssignmentsTable() {
  const wrap = document.getElementById("assignmentsTableWrap");
  if (!_allProjects.length) {
    wrap.innerHTML = `<p style="font-size:13px;color:var(--color-on-surface-variant);padding:20px">No projects yet.</p>`;
    return;
  }

  const rows = _allProjects.map(p => {
    const team = _projectTeams[p.id] || [];

    const cells = ASSIGN_ROLES.map(role => {
      if (role.future) {
        return `<td><div class="pa-cell"><span class="pa-future-label">Coming soon</span></div></td>`;
      }
      const members = team.filter(t => t.profile?.role === role.key);

      const tags = members.map(t => {
        const removeBtn = _assignEditMode
          ? `<button class="pa-tag-remove" data-pid="${p.id}" data-uid="${t.user_id}" title="Remove">×</button>`
          : "";
        return `<span class="pa-tag" style="background:${role.bg};border-color:${role.accent}30;color:${role.tagColor}">
          <div class="adm-avatar role-${role.key}" style="width:16px;height:16px;font-size:7px;flex-shrink:0">${_initials(t.profile?.full_name)}</div>
          <span class="pa-tag-name">${esc(t.profile?.full_name || "Unknown")}</span>
          ${removeBtn}
        </span>`;
      }).join("");

      const addWrap = _assignEditMode ? (() => {
        const available = _allUsers.filter(u => u.role === role.key && !members.find(m => m.user_id === u.id));
        const dropdownItems = available.length
          ? available.map(u => `
              <div class="pa-dropdown-item" data-pid="${p.id}" data-uid="${u.id}">
                <div class="adm-avatar role-${u.role}" style="width:22px;height:22px;font-size:9px;flex-shrink:0">${_initials(u.full_name)}</div>
                <span>${esc(u.full_name || u.email)}</span>
              </div>`).join("")
          : `<div class="pa-dropdown-empty">No ${role.label.toLowerCase()}s available</div>`;

        return `<div class="pa-add-wrap">
          <button class="pa-add-btn" data-pid="${p.id}" data-role="${role.key}">
            <span class="material-symbols-outlined" style="font-size:11px">add</span> Add
          </button>
          <div class="pa-dropdown hidden" id="drop-${p.id}-${role.key}">
            ${dropdownItems}
          </div>
        </div>`;
      })() : "";

      return `<td>
        <div class="pa-cell">
          ${tags}
          ${addWrap}
        </div>
      </td>`;
    }).join("");

    return `<tr>
      <td style="padding:10px 14px;vertical-align:top">
        <a href="/project?id=${p.id}" class="pa-project-name">${esc(p.name || "Untitled")}</a>
        ${p.client_name ? `<span class="pa-project-client">${esc(p.client_name)}</span>` : ""}
      </td>
      ${cells}
    </tr>`;
  }).join("");

  const headers = ASSIGN_ROLES.map(r =>
    `<th class="pa-th-role${r.future ? " pa-th-future" : ""}">${r.label}${r.future ? " <span style='font-size:9px;font-weight:400;font-style:italic'>(soon)</span>" : ""}</th>`
  ).join("");

  wrap.innerHTML = `
    <table class="pa-table">
      <thead>
        <tr>
          <th class="pa-th-project">Project</th>
          ${headers}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  if (_assignEditMode) wireAssignmentEvents(wrap);
}

function wireAssignmentEvents(container) {
  // Remove member — confirm popup
  container.querySelectorAll(".pa-tag-remove").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const { pid, uid } = btn.dataset;
      const user    = _allUsers.find(u => u.id === uid);
      const project = _allProjects.find(p => p.id === pid);
      const name  = user?.full_name    || "this member";
      const pname = project?.name      || "this project";

      if (!confirm(`Remove ${name} from ${pname}?`)) return;

      // Update local display state
      _projectTeams[pid] = (_projectTeams[pid] || []).filter(t => t.user_id !== uid);

      // Stage: if this was a pending add, cancel it; otherwise add to removes
      const addIdx = _pendingAssignAdd.findIndex(a => a.projectId === pid && a.userId === uid);
      if (addIdx >= 0) {
        _pendingAssignAdd.splice(addIdx, 1);
      } else {
        _pendingAssignRemove.push({ projectId: pid, userId: uid });
      }
      renderAssignmentsTable();
    });
  });

  // Toggle add dropdown
  container.querySelectorAll(".pa-add-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const { pid, role } = btn.dataset;
      const dropdown = document.getElementById(`drop-${pid}-${role}`);
      const isOpen = !dropdown.classList.contains("hidden");
      container.querySelectorAll(".pa-dropdown").forEach(d => d.classList.add("hidden"));
      if (!isOpen) dropdown.classList.remove("hidden");
    });
  });

  // Assign member
  container.querySelectorAll(".pa-dropdown-item").forEach(item => {
    item.addEventListener("click", e => {
      e.stopPropagation();
      const { pid, uid } = item.dataset;

      // Update local display state
      const user = _allUsers.find(u => u.id === uid);
      if (user) {
        if (!_projectTeams[pid]) _projectTeams[pid] = [];
        _projectTeams[pid].push({ user_id: uid, profile: user });
      }

      // Stage: if this was a pending remove, cancel it; otherwise add to adds
      const removeIdx = _pendingAssignRemove.findIndex(r => r.projectId === pid && r.userId === uid);
      if (removeIdx >= 0) {
        _pendingAssignRemove.splice(removeIdx, 1);
      } else {
        _pendingAssignAdd.push({ projectId: pid, userId: uid });
      }
      renderAssignmentsTable();
    });
  });

  // Close dropdowns on outside click
  document.addEventListener("click", () => {
    container.querySelectorAll(".pa-dropdown").forEach(d => d.classList.add("hidden"));
  }, { once: true });
}
