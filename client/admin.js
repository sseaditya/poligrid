// ─── Admin Panel ──────────────────────────────────────────────────────────────

let _session, _profile, _allUsers = [], _currentProjectId;

const ROLES = ["sales", "designer", "lead_designer", "admin", "ceo"];
const ROLE_LABELS = {
  sales: "Sales", designer: "Designer",
  lead_designer: "Lead Designer", admin: "Admin", ceo: "CEO",
};

(async () => {
  try {
    ({ session: _session, profile: _profile } =
      await AuthClient.requireAuth(["admin"]));
  } catch { window.location.href = '/login'; return; }

  AuthClient.renderUserChip(_profile, document.getElementById("userChipWrap"));

  await Promise.all([loadUsers(), loadProjects(), loadInvitations()]);

  document.getElementById("inviteBtn").addEventListener("click", handleInvite);

  document.getElementById("assignProjectSelect").addEventListener("change", e => {
    _currentProjectId = e.target.value;
    document.getElementById("assignBtn").disabled = !_currentProjectId;
    if (_currentProjectId) loadTeam(_currentProjectId);
    else document.getElementById("teamWrap").innerHTML = `<p class="loading-hint">Select a project to see its team.</p>`;
  });

  document.getElementById("assignBtn").addEventListener("click", handleAssign);
})();

async function handleInvite() {
  const email = document.getElementById("inviteEmail").value.trim();
  const role = document.getElementById("inviteRole").value;
  const fullName = document.getElementById("inviteFullName").value.trim();
  const msg = document.getElementById("inviteMsg");
  const btn = document.getElementById("inviteBtn");

  if (!email) { msg.className = "invite-msg error"; msg.textContent = "Email is required."; return; }

  btn.disabled = true;
  btn.textContent = "Sending…";
  msg.textContent = "";
  msg.className = "invite-msg";

  try {
    const res = await fetch("/api/users/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${_session.access_token}` },
      body: JSON.stringify({ email, role, fullName: fullName || undefined }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    msg.className = "invite-msg success";
    msg.textContent = `Invite sent for ${email}. They can now log in with their Google account.`;
    document.getElementById("inviteEmail").value = "";
    document.getElementById("inviteFullName").value = "";
    await loadInvitations();
  } catch (e) {
    msg.className = "invite-msg error";
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
    const pendingEl = document.getElementById("statPendingInvites");
    if (pendingEl) pendingEl.textContent = invitations?.length ?? 0;

    if (!invitations?.length) {
      wrap.innerHTML = `<p class="loading-hint" style="margin:0">No pending invitations.</p>`;
      return;
    }
    wrap.innerHTML = `
      <div class="pending-section">
        <div class="pending-label">Pending — awaiting first login (${invitations.length})</div>
        <div class="team-chips">
          ${invitations.map(inv => `
            <div class="team-chip">
              <span class="team-chip-name">${inv.full_name ? `${inv.full_name} &lt;${inv.email}&gt;` : inv.email}</span>
              <span class="team-chip-role role-${inv.role} role-badge" style="text-transform:uppercase">${ROLE_LABELS[inv.role] || inv.role}</span>
              <button class="ghost-sm danger-sm cancel-invite-btn" data-email="${inv.email}" title="Cancel invite">✕</button>
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

function _initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function _updateStats(users, pendingCount) {
  const total = document.getElementById("statTotalUsers");
  const active = document.getElementById("statActiveUsers");
  const pending = document.getElementById("statPendingInvites");
  if (total)   total.textContent   = users.length;
  if (active)  active.textContent  = users.filter(u => u.is_active).length;
  if (pending && pendingCount != null) pending.textContent = pendingCount;
}

async function loadUsers() {
  const tbody = document.getElementById("usersBody");
  const userSelect = document.getElementById("assignUserSelect");
  try {
    const res = await fetch("/api/users/list", {
      headers: { Authorization: `Bearer ${_session.access_token}` },
    });
    const { users } = await res.json();
    _allUsers = users || [];

    _updateStats(_allUsers, null);

    tbody.innerHTML = _allUsers.map(u => `
      <tr data-id="${u.id}">
        <td>
          <div class="member-cell">
            <div class="user-avatar avatar-${u.role}">${_initials(u.full_name)}</div>
            <div class="member-info">
              <span class="member-name">${u.full_name || "—"}</span>
              <span class="member-email">${u.email}</span>
            </div>
          </div>
        </td>
        <td>
          <select class="role-select ctx-input-sm" data-uid="${u.id}" ${u.id === _profile.id ? "disabled title='Cannot change your own role'" : ""}>
            ${ROLES.map(r => `<option value="${r}" ${u.role === r ? "selected" : ""}>${ROLE_LABELS[r]}</option>`).join("")}
          </select>
        </td>
        <td>
          <label class="toggle-label" style="gap:8px;cursor:${u.id === _profile.id ? 'not-allowed' : 'pointer'}">
            <input type="checkbox" class="active-toggle" data-uid="${u.id}" ${u.is_active ? "checked" : ""} ${u.id === _profile.id ? "disabled" : ""} />
            <span class="status-pill ${u.is_active ? 'active' : 'inactive'}" id="status-pill-${u.id}">
              <span class="status-dot ${u.is_active ? 'active' : 'inactive'}" id="status-dot-${u.id}"></span>
              <span id="status-text-${u.id}">${u.is_active ? "Active" : "Inactive"}</span>
            </span>
          </label>
        </td>
        <td><span class="save-badge" id="saved-${u.id}"></span></td>
      </tr>
    `).join("");

    // Wire role selects
    tbody.querySelectorAll(".role-select").forEach(sel => {
      sel.addEventListener("change", async () => {
        await updateUser(sel.dataset.uid, { role: sel.value });
      });
    });

    // Wire active toggles
    tbody.querySelectorAll(".active-toggle").forEach(chk => {
      chk.addEventListener("change", async () => {
        await updateUser(chk.dataset.uid, { isActive: chk.checked });
        const pill = document.getElementById(`status-pill-${chk.dataset.uid}`);
        const dot  = document.getElementById(`status-dot-${chk.dataset.uid}`);
        const txt  = document.getElementById(`status-text-${chk.dataset.uid}`);
        if (pill) { pill.className = `status-pill ${chk.checked ? "active" : "inactive"}`; }
        if (dot)  { dot.className  = `status-dot  ${chk.checked ? "active" : "inactive"}`; }
        if (txt)  { txt.textContent = chk.checked ? "Active" : "Inactive"; }
        _updateStats(_allUsers.map(u => u.id === chk.dataset.uid ? {...u, is_active: chk.checked} : u), null);
      });
    });

    // Populate user dropdown for assignments
    userSelect.innerHTML = `<option value="">Select user…</option>` +
      _allUsers.filter(u => u.id !== _profile.id).map(u =>
        `<option value="${u.id}">${u.full_name} (${ROLE_LABELS[u.role] || u.role})</option>`
      ).join("");

  } catch {
    tbody.innerHTML = `<tr><td colspan="5">Failed to load users.</td></tr>`;
  }
}

async function updateUser(userId, updates) {
  const indicator = document.getElementById(`saved-${userId}`);
  try {
    const res = await fetch("/api/users/update-role", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${_session.access_token}`,
      },
      body: JSON.stringify({ userId, ...updates }),
    });
    if (!res.ok) throw new Error();
    if (indicator) {
      indicator.textContent = "Saved";
      indicator.className = "save-badge visible";
      setTimeout(() => { indicator.className = "save-badge"; }, 2000);
    }
  } catch {
    if (indicator) {
      indicator.textContent = "Error";
      indicator.className = "save-badge visible error";
    }
  }
}

async function loadProjects() {
  const select = document.getElementById("assignProjectSelect");
  try {
    const res = await fetch("/api/project/list", {
      headers: { Authorization: `Bearer ${_session.access_token}` },
    });
    const { projects } = await res.json();
    select.innerHTML = `<option value="">Select project…</option>` +
      (projects || []).map(p =>
        `<option value="${p.id}">${p.name || "Untitled"} ${p.client_name ? "· " + p.client_name : ""}</option>`
      ).join("");
  } catch {
    select.innerHTML = `<option value="">Error loading projects</option>`;
  }
}

async function loadTeam(projectId) {
  const wrap = document.getElementById("teamWrap");
  wrap.innerHTML = `<p class="loading-hint">Loading team…</p>`;
  try {
    const res = await fetch(`/api/project/team?id=${projectId}`, {
      headers: { Authorization: `Bearer ${_session.access_token}` },
    });
    const { team } = await res.json();
    if (!team?.length) {
      wrap.innerHTML = `<p class="loading-hint">No team members assigned yet.</p>`;
      return;
    }
    wrap.innerHTML = `<div class="team-member-chips">${team.map(t => `
      <div class="team-member-chip">
        <div class="user-avatar avatar-${t.profile?.role}" style="width:30px;height:30px;font-size:11px">${_initials(t.profile?.full_name)}</div>
        <span class="team-member-chip-name">${t.profile?.full_name || "Unknown"}</span>
        <span class="role-badge role-${t.profile?.role} team-member-chip-role">${ROLE_LABELS[t.profile?.role] || t.profile?.role}</span>
        <button class="ghost-sm danger-sm unassign-btn" data-uid="${t.user_id}" title="Remove from project" style="margin-left:auto">✕</button>
      </div>`).join("")}</div>`;

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
    wrap.innerHTML = `<p class="loading-hint">Failed to load team.</p>`;
  }
}

async function handleAssign() {
  const userId = document.getElementById("assignUserSelect").value;
  if (!userId || !_currentProjectId) return;
  const btn = document.getElementById("assignBtn");
  btn.disabled = true;
  btn.textContent = "Assigning…";
  try {
    await fetch("/api/project/assign-user", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${_session.access_token}` },
      body: JSON.stringify({ projectId: _currentProjectId, userId }),
    });
    loadTeam(_currentProjectId);
  } finally {
    btn.disabled = false;
    btn.textContent = "Assign";
  }
}
