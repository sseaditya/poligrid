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
  } catch { return; }

  AuthClient.renderUserChip(_profile, document.getElementById("userChipWrap"));

  await Promise.all([loadUsers(), loadProjects()]);

  document.getElementById("assignProjectSelect").addEventListener("change", e => {
    _currentProjectId = e.target.value;
    document.getElementById("assignBtn").disabled = !_currentProjectId;
    if (_currentProjectId) loadTeam(_currentProjectId);
    else document.getElementById("teamWrap").innerHTML = `<p class="loading-hint">Select a project to see its team.</p>`;
  });

  document.getElementById("assignBtn").addEventListener("click", handleAssign);
})();

async function loadUsers() {
  const tbody = document.getElementById("usersBody");
  const userSelect = document.getElementById("assignUserSelect");
  try {
    const res = await fetch("/api/users/list", {
      headers: { Authorization: `Bearer ${_session.access_token}` },
    });
    const { users } = await res.json();
    _allUsers = users || [];

    tbody.innerHTML = _allUsers.map(u => `
      <tr data-id="${u.id}">
        <td class="td-name">${u.full_name}</td>
        <td class="td-email">${u.email}</td>
        <td>
          <select class="role-select ctx-input-sm" data-uid="${u.id}" ${u.id === _profile.id ? "disabled title='Cannot change your own role'" : ""}>
            ${ROLES.map(r => `<option value="${r}" ${u.role === r ? "selected" : ""}>${ROLE_LABELS[r]}</option>`).join("")}
          </select>
        </td>
        <td>
          <label class="toggle-label">
            <input type="checkbox" class="active-toggle" data-uid="${u.id}" ${u.is_active ? "checked" : ""} ${u.id === _profile.id ? "disabled" : ""} />
            <span class="toggle-label-text">${u.is_active ? "Active" : "Inactive"}</span>
          </label>
        </td>
        <td><span class="saved-indicator" id="saved-${u.id}"></span></td>
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
        const label = chk.nextElementSibling;
        await updateUser(chk.dataset.uid, { isActive: chk.checked });
        label.textContent = chk.checked ? "Active" : "Inactive";
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
    if (indicator) { indicator.textContent = "Saved"; setTimeout(() => { indicator.textContent = ""; }, 2000); }
  } catch {
    if (indicator) { indicator.textContent = "Error"; indicator.style.color = "var(--danger)"; }
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
    wrap.innerHTML = `<div class="team-chips">${team.map(t => `
      <div class="team-chip">
        <span class="team-chip-name">${t.profile?.full_name || "Unknown"}</span>
        <span class="team-chip-role role-${t.profile?.role}">${ROLE_LABELS[t.profile?.role] || t.profile?.role}</span>
        <button class="ghost-sm danger-sm unassign-btn" data-uid="${t.user_id}" title="Remove">✕</button>
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
