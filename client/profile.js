// ─── Profile page ─────────────────────────────────────────────────────────────
// URL: /profile         → own profile
// URL: /profile/<slug>  → another user (admin only)

let _profile;

(async () => {
  try {
    ({ profile: _profile } = await AuthClient.requireAuth());
  } catch { return; }

  // Use the shared nav utility (same as projects, audit, etc.)
  AppNav.renderSidebar(_profile, document.getElementById('sidebarNav'));
  AppNav.renderMobileNav(_profile, document.getElementById('mobileNav'));
  AppNav.setupUserSection(_profile);
  AppNav.setupCollapse();

  const emailSlug = emailToSlug(_profile.email);
  const pageSlug  = getPageSlug();

  if (!pageSlug || pageSlug === emailSlug) {
    await loadOwnProfile();
  } else {
    if (_profile.role !== 'admin') {
      window.location.href = `/profile/${emailSlug}`;
      return;
    }
    await loadOtherProfile(pageSlug);
  }
})();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nameToSlug(name) {
  if (!name) return '';
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function emailToSlug(email) {
  return (email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

function getPageSlug() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[1] || null; // parts[0] = 'profile'
}

function initials(profile) {
  return (profile.full_name || profile.email || '?')
    .split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function roleLabel(role) {
  return {
    admin: 'Admin', sales: 'Sales Associate',
    designer: 'Junior Designer', lead_designer: 'Design Lead', ceo: 'CEO',
  }[role] || role;
}

function deptLabel(role) {
  return {
    admin:         'Digital Infrastructure & Core Operations',
    sales:         'Sales & Client Relations',
    designer:      'Creative & Design Studio',
    lead_designer: 'Creative & Design Studio',
    ceo:           'Executive',
  }[role] || 'Poligrid';
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
}

function setStatus(el, msg, cls) {
  el.textContent = msg;
  el.className = [
    'text-sm font-medium',
    cls === 'ok'    ? 'text-green-700'  : '',
    cls === 'error' ? 'text-error'      : 'text-on-surface-variant',
  ].join(' ').trim();
}

// ─── Own profile ───────────────────────────────────────────────────────────────

async function loadOwnProfile() {
  show('ownProfileSection');

  // Hero
  const av = document.getElementById('profileAvatar');
  av.textContent = initials(_profile);
  document.getElementById('profileName').textContent        = _profile.full_name || _profile.email;
  document.getElementById('profileEmail').textContent       = _profile.email;
  document.getElementById('profileMemberSince').textContent = `Member since ${fmtDate(_profile.created_at)}`;
  document.getElementById('profileRoleBadge').textContent   = roleLabel(_profile.role);
  document.getElementById('profileIdChip').textContent      = `PG-${(_profile.id || '').slice(0,8).toUpperCase()}`;

  // Form
  document.getElementById('fieldName').value  = _profile.full_name || '';
  document.getElementById('fieldPhone').value = _profile.phone || '';
  document.getElementById('fieldEmail').value = _profile.email || '';
  document.getElementById('fieldRole').value  = roleLabel(_profile.role);
  document.getElementById('fieldDept').value  = deptLabel(_profile.role);

  document.getElementById('fieldPhone').addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
  });
  document.getElementById('saveProfileBtn').addEventListener('click', saveProfile);

  // Account DL
  renderAccountDl(_profile);

  // Stats panel (project/task counts etc.)
  await loadStats(_profile);
}


async function saveProfile() {
  const btn    = document.getElementById('saveProfileBtn');
  const status = document.getElementById('saveStatus');
  const name   = document.getElementById('fieldName').value.trim();
  const phone  = document.getElementById('fieldPhone').value.trim();

  if (!name) return setStatus(status, 'Name cannot be empty.', 'error');
  if (phone && !/^\d{10}$/.test(phone)) return setStatus(status, 'Phone must be 10 digits.', 'error');

  btn.disabled = true;
  setStatus(status, 'Saving…', '');

  try {
    const res = await studioFetch('/api/profile/update', {
      method: 'POST',
      body: JSON.stringify({ full_name: name, phone }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save.');

    _profile = await AuthClient.getProfile(true);

    // Re-render hero + account
    document.getElementById('profileName').textContent      = _profile.full_name || _profile.email;
    document.getElementById('profileAvatar').textContent    = initials(_profile);

    renderAccountDl(_profile);

    setStatus(status, 'Saved!', 'ok');
    setTimeout(() => setStatus(status, '', ''), 3000);
  } catch (err) {
    setStatus(status, err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ─── Stats ────────────────────────────────────────────────────────────────────

async function loadStats(profile) {
  const [projData, taskData] = await Promise.all([
    studioFetch('/api/project/list').then(r => r.json()).catch(() => ({ projects: [] })),
    studioFetch('/api/tasks/list?status=pending').then(r => r.json()).catch(() => ({ tasks: [] })),
  ]);

  const projectCount = (projData.projects || []).length;
  const taskCount    = (taskData.tasks    || []).length;

  const stats = [
    { icon: 'architecture', label: 'Assigned Projects', value: projectCount },
    { icon: 'check_circle', label: 'Open Tasks',        value: taskCount    },
  ];

  if (profile.role === 'lead_designer' || profile.role === 'admin') {
    const drawData = await studioFetch('/api/drawings/pending').then(r => r.json()).catch(() => ({ drawings: [] }));
    stats.push({ icon: 'rate_review', label: 'Drawings to Review', value: (drawData.drawings || []).length });
  }

  const days = profile.created_at
    ? Math.floor((Date.now() - new Date(profile.created_at)) / 86400000)
    : null;
  if (days !== null) stats.push({ icon: 'calendar_today', label: 'Days with Poligrid', value: days });

  const titles = {
    sales: 'My Performance', designer: 'My Activity',
    lead_designer: 'Team Overview', admin: 'Platform Activity', ceo: 'Overview',
  };
  document.getElementById('statsTitle').textContent = titles[profile.role] || 'Activity';

  document.getElementById('statsList').innerHTML = stats.map(s =>
    `<div class="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface-container-low">
      <span class="material-symbols-outlined text-primary text-[18px]">${s.icon}</span>
      <div class="flex-1 min-w-0">
        <p class="text-xs text-on-surface-variant font-medium">${s.label}</p>
      </div>
      <span class="font-headline font-extrabold text-lg text-on-background">${s.value}</span>
    </div>`
  ).join('');

  // Sales: milestone bar toward 10 projects
  if (profile.role === 'sales') {
    const target = 10;
    const pct    = Math.min(100, Math.round((projectCount / target) * 100));
    const remaining = Math.max(0, target - projectCount);
    document.getElementById('milestoneBlock').classList.remove('hidden');
    document.getElementById('milestonePct').textContent     = `${pct}%`;
    document.getElementById('milestoneFill').style.width    = `${pct}%`;
    document.getElementById('milestoneCaption').textContent = remaining > 0
      ? `${remaining} more project${remaining !== 1 ? 's' : ''} to reach your next milestone`
      : 'Milestone reached!';
  }
}



// ─── Account DL ───────────────────────────────────────────────────────────────

function renderAccountDl(profile) {
  const rows = [
    { label: 'Member since', value: fmtDate(profile.created_at) },
    { label: 'Email',        value: profile.email },
    { label: 'Role',         value: roleLabel(profile.role) },
    { label: 'Department',   value: deptLabel(profile.role) },
  ];
  if (profile.phone) rows.push({ label: 'Phone', value: profile.phone });
  document.getElementById('accountDl').innerHTML = rows.map(r =>
    `<div class="flex justify-between items-baseline gap-4 py-2 border-b border-outline-variant/10 last:border-0">
      <dt class="text-xs font-semibold text-on-surface-variant uppercase tracking-wide shrink-0">${r.label}</dt>
      <dd class="text-sm text-on-background text-right">${r.value}</dd>
    </div>`
  ).join('');
}

// ─── Other user (admin read-only) ─────────────────────────────────────────────

async function loadOtherProfile(slug) {
  show('otherProfileSection');

  try {
    const res = await studioFetch(`/api/profile/by-slug?slug=${encodeURIComponent(slug)}`);
    if (res.status === 404) { show('profileError'); hide('otherProfileSection'); return; }
    const { profile } = await res.json();

    const av = document.getElementById('otherProfileAvatar');
    av.textContent = initials(profile);
    document.getElementById('otherProfileName').textContent       = profile.full_name || profile.email;
    document.getElementById('otherProfileEmail').textContent      = profile.email;
    document.getElementById('otherProfileSince').textContent      = `Member since ${fmtDate(profile.created_at)}`;
    document.getElementById('otherProfileRoleBadge').textContent  = roleLabel(profile.role);

    const rows = [
      { label: 'Email',        value: profile.email },
      { label: 'Phone',        value: profile.phone || 'Not set' },
      { label: 'Role',         value: roleLabel(profile.role) },
      { label: 'Department',   value: deptLabel(profile.role) },
      { label: 'Member since', value: fmtDate(profile.created_at) },
    ];
    document.getElementById('otherDl').innerHTML = rows.map(r =>
      `<div class="flex justify-between items-baseline gap-4 py-2 border-b border-outline-variant/10 last:border-0">
        <dt class="text-xs font-semibold text-on-surface-variant uppercase tracking-wide shrink-0">${r.label}</dt>
        <dd class="text-sm text-on-background text-right">${r.value}</dd>
      </div>`
    ).join('');
  } catch {
    show('profileError'); hide('otherProfileSection');
  }
}

// ─── Visibility helpers ───────────────────────────────────────────────────────

function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
