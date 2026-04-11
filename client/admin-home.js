// ─── Admin / CEO Command Center ────────────────────────────────────────────────
// Data sources:
//   /api/project/list          → all projects with advance_payment_done, status
//   /api/ceo/dashboard         → per-project sales_person, drawing stats, tasks_pending
//   /api/ceo/team-stats        → roleCount, pendingDrawingsTotal, pendingTasksTotal
//   /api/drawings/project-summary → drawing progress per project
//   /api/drawings/assignments  → designer assignments per project
//   /api/drawings/pending      → drawings awaiting lead-designer review

let _profile;
let _projects = [];
let _projectsLoaded = false;
let _dashProjects = []; // from /api/ceo/dashboard

// Status display helpers (shared with renderProjects)
const STATUS_LABELS = {
  active: 'Active', in_progress: 'In Progress', advanced_paid: 'Advanced Paid',
  on_hold: 'On Hold', completed: 'Completed', cancelled: 'Cancelled',
};
const STATUS_CLS = {
  active:        'text-primary bg-primary-container',
  advanced_paid: 'text-secondary bg-secondary-container',
  in_progress:   'text-tertiary bg-tertiary-container',
  completed:     'text-primary bg-primary-container',
  on_hold:       'text-on-surface-variant bg-surface-container',
  cancelled:     'text-error bg-[#fff0f0]',
};
const DT_LABEL = {
  civil: 'Civil', electrical: 'Electrical', plumbing: 'Plumbing', hvac: 'HVAC',
  firefighting: 'Fire', architectural: 'Arch', structural: 'Structural',
  interior: 'Interior', landscape: 'Landscape', other: 'Other',
};
const dotColor = s => ({ approved: '#526258', pending_review: '#d97706', revision_requested: '#9f403d' }[s] || '#757c7d');

// ── Bootstrap ─────────────────────────────────────────────────────────────────

(async () => {
  try {
    ({ profile: _profile } = await AuthClient.requireAuth(['admin', 'ceo']));
  } catch { window.location.href = '/login'; return; }

  // Profile UI
  const slug = (_profile.full_name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (slug) {
    document.getElementById('settingsLink').href   = `/profile/${slug}`;
    document.getElementById('userAvatarLink').href = `/profile/${slug}`;
  }
  if (_profile.avatar_url) document.getElementById('userAvatarImg').src = _profile.avatar_url;
  document.getElementById('userAvatarImg').alt = _profile.full_name || 'User';
  document.getElementById('logoutBtn').addEventListener('click', () => AuthClient.signOut());

  // Role label in header
  document.getElementById('roleLabel').textContent =
    _profile.role === 'admin' ? 'Admin Console' : 'CEO Overview';

  // Greeting
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (_profile.full_name || 'Admin').split(' ')[0];
  document.getElementById('greetName').textContent = firstName + '.';
  document.getElementById('greetLine').textContent =
    `${greeting} — ${now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}`;

  // Sidebar: inject role-specific extra links
  const nav = document.getElementById('sideNav');
  const extraLinks = _profile.role === 'admin'
    ? [
        { href: '/index',    icon: 'chair',         label: 'Fitout Planner'  },
        { href: '/designer', icon: 'edit_square',   label: 'Drawings'        },
        { href: '/admin',    icon: 'group',         label: 'Team Management' },
        { href: '/audit',    icon: 'history',       label: 'Audit Logs'      },
      ]
    : [
        { href: '/projects', icon: 'architecture',  label: 'All Projects'    },
      ];
  extraLinks.forEach(l => {
    const a = document.createElement('a');
    a.className = 'flex items-center gap-3 px-4 py-3 rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-all';
    a.href = l.href;
    a.innerHTML = `<span class="material-symbols-outlined">${l.icon}</span><span class="text-sm">${l.label}</span>`;
    nav.appendChild(a);
  });

  // CEO: hide team mgmt link in mobile nav
  if (_profile.role === 'ceo') {
    const mobileTeam = document.getElementById('mobileTeamLink');
    if (mobileTeam) mobileTeam.style.display = 'none';
  }

  // New Project button (admin only)
  const newBtn = document.getElementById('newProjectBtn');
  if (_profile.role === 'admin') {
    newBtn.classList.remove('hidden');
    newBtn.addEventListener('click', openCreateModal);
  }

  // Search + filter wiring (before data loads so events are ready)
  document.getElementById('searchInput').addEventListener('input',  renderProjectList);
  document.getElementById('statusFilter').addEventListener('change', renderProjectList);

  // Parallel data fetch
  const [, , teamStats] = await Promise.all([
    loadProjects(),
    loadDashboard(),
    loadTeamStats(),
  ]);
})();

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function loadProjects() {
  try {
    const res = await studioFetch('/api/project/list');
    const data = await res.json();
    _projects = data.projects || [];
  } catch { _projects = []; }
  _projectsLoaded = true;

  renderKPIs();
  renderPipeline();

  // Now fetch drawing + assignment data for the project list
  const ids = _projects.map(p => p.id);
  const [summary, allAssignments, reviewData] = await Promise.all([
    fetchDrawingSummary(ids),
    fetchAllAssignments(ids),
    fetchPendingReview(),
  ]);

  renderProjectList(summary, allAssignments);
  renderReviewQueue(reviewData);
}

async function loadDashboard() {
  try {
    const res = await studioFetch('/api/ceo/dashboard');
    const data = await res.json();
    _dashProjects = data.projects || [];
  } catch { _dashProjects = []; }
}

let _teamStats = null;
async function loadTeamStats() {
  try {
    const res = await studioFetch('/api/ceo/team-stats');
    _teamStats = await res.json();
    renderTeamPulse(_teamStats);
    renderKPIs();
  } catch { renderTeamPulse(null); }
}

// ── Sub-fetchers ──────────────────────────────────────────────────────────────

async function fetchDrawingSummary(ids) {
  if (!ids.length) return {};
  try {
    const r = await studioFetch(`/api/drawings/project-summary?projectIds=${ids.join(',')}`);
    const d = await r.json();
    return d.summary || {};
  } catch { return {}; }
}

async function fetchAllAssignments(ids) {
  if (!ids.length) return {};
  try {
    const r = await studioFetch(`/api/drawings/assignments?projectIds=${ids.join(',')}`);
    const d = await r.json();
    const map = {};
    for (const a of (d.assignments || [])) {
      if (!map[a.project_id]) map[a.project_id] = [];
      map[a.project_id].push(a);
    }
    return map;
  } catch { return {}; }
}

async function fetchPendingReview() {
  try {
    const r = await studioFetch('/api/drawings/pending');
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// ── Render: KPI cards ─────────────────────────────────────────────────────────

function renderKPIs() {
  if (!_projectsLoaded) return;

  const total    = _projects.length;
  const active   = _projects.filter(p => p.status === 'active').length;
  const advPaid  = _projects.filter(p => p.advance_payment_done).length;
  const onHold   = _projects.filter(p => p.status === 'on_hold').length;

  const pendingDrawings = _teamStats?.pendingDrawingsTotal ?? '—';
  const openTasks       = _teamStats?.pendingTasksTotal    ?? '—';

  const kpis = [
    { label: 'Total Projects',     value: total,           icon: 'architecture',  accent: false },
    { label: 'Active',             value: active,          icon: 'trending_up',   accent: false },
    { label: 'Advance Paid',       value: advPaid,         icon: 'payments',      accent: true  },
    { label: 'On Hold',            value: onHold,          icon: 'pause_circle',  accent: false },
    { label: 'Drawings to Review', value: pendingDrawings, icon: 'rate_review',   accent: Number(pendingDrawings) > 0 },
    { label: 'Open Tasks',         value: openTasks,       icon: 'task_alt',      accent: Number(openTasks) > 0 },
  ];

  document.getElementById('kpiRow').innerHTML = kpis.map(k => `
    <div class="bg-surface-container-lowest rounded-xl p-5 flex flex-col gap-1 ${k.accent ? 'ring-1 ring-primary/20' : ''}">
      <div class="flex items-center gap-2 mb-1">
        <span class="material-symbols-outlined text-[18px] ${k.accent ? 'text-primary' : 'text-on-surface-variant'}">${k.icon}</span>
        <span class="font-label text-[10px] uppercase tracking-widest ${k.accent ? 'text-primary font-bold' : 'text-on-surface-variant font-bold'}">${k.label}</span>
      </div>
      <span class="font-headline font-extrabold text-4xl text-on-background">${k.value}</span>
    </div>
  `).join('');
}

// ── Render: Pipeline breakdown ─────────────────────────────────────────────────

function renderPipeline() {
  const total = _projects.length || 1;
  const statusOrder = ['active', 'in_progress', 'advanced_paid', 'on_hold', 'completed', 'cancelled'];
  const barColor = {
    active: 'bg-green-500', in_progress: 'bg-purple-400', advanced_paid: 'bg-primary',
    on_hold: 'bg-yellow-400', completed: 'bg-blue-400', cancelled: 'bg-red-300',
  };

  const counts = {};
  statusOrder.forEach(s => counts[s] = 0);
  _projects.forEach(p => { if (counts[p.status] != null) counts[p.status]++; });

  const rows = statusOrder
    .filter(s => counts[s] > 0)
    .map(s => {
      const pct = Math.round((counts[s] / total) * 100);
      return `
        <div class="flex items-center gap-3">
          <span class="w-24 shrink-0 text-xs font-label font-semibold text-on-surface-variant">${STATUS_LABELS[s] || s}</span>
          <div class="flex-1 h-2 bg-surface-container-high rounded-full overflow-hidden">
            <div class="${barColor[s] || 'bg-gray-300'} h-full rounded-full transition-all" style="width:${pct}%"></div>
          </div>
          <span class="w-8 text-right text-xs font-headline font-bold text-on-background">${counts[s]}</span>
        </div>`;
    });

  document.getElementById('pipelineBreakdown').innerHTML =
    rows.length ? rows.join('') : `<p class="text-sm text-on-surface-variant">No projects yet.</p>`;
}

// ── Render: Team pulse ────────────────────────────────────────────────────────

function renderTeamPulse(stats) {
  const el = document.getElementById('teamPulse');
  if (!stats) { el.innerHTML = `<p class="text-sm text-on-surface-variant">Could not load team data.</p>`; return; }
  const rc = stats.roleCount || {};
  const rows = [
    { label: 'Sales',          key: 'sales',        icon: 'point_of_sale', color: 'text-blue-600',   bg: 'bg-blue-50'   },
    { label: 'Designers',      key: 'designer',      icon: 'edit_square',   color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Lead Designers', key: 'lead_designer', icon: 'verified',      color: 'text-yellow-700', bg: 'bg-yellow-50' },
    { label: 'Admins',         key: 'admin',         icon: 'shield_person', color: 'text-primary',    bg: 'bg-primary/5' },
    { label: 'CEO',            key: 'ceo',           icon: 'stars',         color: 'text-slate-600',  bg: 'bg-slate-50'  },
  ].filter(r => rc[r.key]);

  el.innerHTML = rows.map(r => `
    <div class="flex items-center gap-3 p-3 rounded-lg ${r.bg}">
      <span class="material-symbols-outlined text-[18px] ${r.color}">${r.icon}</span>
      <span class="flex-1 text-sm font-label font-semibold text-on-background">${r.label}</span>
      <span class="font-headline font-bold text-lg text-on-background">${rc[r.key]}</span>
    </div>
  `).join('');
}

// ── Render: Project list (lead-designer card style) ───────────────────────────

// Called both on initial load (with summary/assignments args) and on filter change (no args, uses cached)
let _cachedSummary = {}, _cachedAssignments = {};

function renderProjectList(summaryOrEvent, assignmentsArg) {
  // When called from an event listener, first arg is the Event object
  const summary     = (summaryOrEvent && typeof summaryOrEvent === 'object' && !summaryOrEvent.target)
    ? summaryOrEvent : _cachedSummary;
  const assignments = assignmentsArg || _cachedAssignments;

  // Cache for filter re-renders
  if (summaryOrEvent && typeof summaryOrEvent === 'object' && !summaryOrEvent.target) _cachedSummary = summary;
  if (assignmentsArg) _cachedAssignments = assignments;

  if (!_projectsLoaded) return;

  const search = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const filter = document.getElementById('statusFilter')?.value || '';

  // Build sales-person lookup from CEO dashboard data
  const dashMap = {};
  _dashProjects.forEach(p => { dashMap[p.project_id] = p; });

  let filtered = _projects.filter(p => {
    const matchSearch = !search ||
      (p.name || '').toLowerCase().includes(search) ||
      (p.client_name || '').toLowerCase().includes(search);
    const matchStatus = !filter || p.status === filter;
    return matchSearch && matchStatus;
  });

  const container = document.getElementById('projectListContainer');

  if (!filtered.length) {
    container.innerHTML = `
      <div class="bg-surface-container-lowest rounded-xl p-8 flex flex-col items-center gap-3 text-center">
        <span class="material-symbols-outlined text-4xl text-on-surface-variant">search_off</span>
        <p class="font-headline font-bold text-on-background">No projects match your filter.</p>
      </div>`;
    return;
  }

  const rows = filtered.map(p => {
    const s   = summary[p.id]     || { total: 0, approved: 0, pending_review: 0, revision_requested: 0 };
    const d   = dashMap[p.id]     || {};
    const pa  = assignments[p.id] || [];

    const approvedPct = s.total ? Math.round((s.approved / s.total) * 100) : 0;
    const reviewPct   = s.total ? Math.round((s.pending_review / s.total) * 100) : 0;
    const allDone     = s.total > 0 && s.approved === s.total;
    const sCls        = STATUS_CLS[p.status] || 'text-on-surface-variant bg-surface-container';
    const sLbl        = STATUS_LABELS[p.status] || p.status || '—';
    const meta        = [p.bhk, p.property_type, p.total_area_m2 ? p.total_area_m2 + ' m²' : null].filter(Boolean).join(' · ');
    const salesPerson = d.sales_person ? `<span class="font-label text-[10px] text-on-surface-variant">by ${esc(d.sales_person)}</span>` : '';

    // Group assignments by designer
    const byDesigner = {};
    for (const a of pa) {
      const name = a.assignee?.full_name || 'Unknown';
      if (!byDesigner[name]) byDesigner[name] = [];
      byDesigner[name].push(a);
    }
    const designerChips = Object.entries(byDesigner).map(([name, assigns]) => {
      const types = assigns.map(a =>
        `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:700;padding:1px 6px;border-radius:99px;background:rgba(82,98,88,0.08);color:#526258">
           <span style="width:4px;height:4px;border-radius:50%;background:${dotColor(a.status)};flex-shrink:0"></span>
           ${esc(DT_LABEL[a.drawing_type] || a.drawing_type)}
           ${a.deadline ? `<span style="color:#757c7d;font-weight:400">· ${fmtShort(a.deadline)}</span>` : ''}
         </span>`
      ).join('');
      return `<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
        <span style="font-size:11px;font-weight:600;color:#2d3435">${esc(name)}</span>
        ${types}
      </div>`;
    }).join('');

    // Pending tasks badge
    const tasks = Number(d.tasks_pending || 0);
    const tasksBadge = tasks > 0
      ? `<span class="ml-1 text-[10px] font-bold uppercase tracking-wider text-error bg-[#fff0f0] px-2.5 py-1 rounded-full">⚠ ${tasks} tasks</span>`
      : '';

    return `
      <tr class="border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors">
        <td class="px-5 py-4">
          <p class="font-headline font-bold text-sm text-on-background leading-tight">${esc(p.name || 'Untitled')}</p>
          <div class="flex items-center gap-2 mt-0.5">${salesPerson ? salesPerson : ''}<span class="font-body text-xs text-on-surface-variant">${esc(p.client_name || '—')}</span></div>
        </td>
        <td class="px-5 py-4 hidden sm:table-cell">
          <p class="font-body text-xs text-on-surface-variant">${esc(meta || '—')}</p>
        </td>
        <td class="px-5 py-4">
          <span class="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${sCls}">${esc(sLbl)}</span>
          ${p.advance_payment_done ? `<span class="ml-1 text-[10px] font-bold uppercase tracking-wider text-primary bg-primary-container px-2.5 py-1 rounded-full">₹ Paid</span>` : ''}
          ${tasksBadge}
        </td>
        <td class="px-5 py-4 hidden md:table-cell" style="min-width:160px">
          ${s.total > 0 ? `
            <div class="drawing-bar-track mb-1" style="height:3px">
              <div class="drawing-bar-approved" style="width:${approvedPct}%;min-width:${approvedPct > 0 ? 3 : 0}px"></div>
              <div class="drawing-bar-review"   style="width:${reviewPct}%;min-width:${reviewPct > 0 ? 3 : 0}px"></div>
            </div>
            <p class="font-body text-[10px] ${allDone ? 'text-primary font-semibold' : 'text-on-surface-variant'}">
              ${allDone ? '✓ All approved' : `${s.approved}/${s.total} approved`}
              ${s.pending_review ? ` · <span class="text-on-surface-variant">${s.pending_review} pending</span>` : ''}
              ${s.revision_requested ? ` · <span style="color:#9f403d">${s.revision_requested} revision</span>` : ''}
            </p>
          ` : `<p class="font-body text-[10px] text-on-surface-variant">No drawings yet</p>`}
        </td>
        <td class="px-5 py-4 hidden lg:table-cell" style="min-width:180px">
          ${pa.length
            ? `<div style="display:flex;flex-direction:column;gap:4px">${designerChips}</div>`
            : `<span class="text-[10px] text-on-surface-variant">Unassigned</span>`}
        </td>
        <td class="px-5 py-4 text-right">
          <div class="flex items-center gap-2 justify-end">
            <a href="/index?id=${p.id}" class="text-on-surface-variant font-semibold text-xs hover:text-primary transition-colors" title="Fitout Planner">
              <span class="material-symbols-outlined text-[15px]">chair</span>
            </a>
            <a href="/project?id=${p.id}" class="flex items-center gap-1.5 text-primary font-semibold text-sm hover:gap-2.5 transition-all">
              Open <span class="material-symbols-outlined text-[15px]">east</span>
            </a>
          </div>
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="bg-surface-container-lowest rounded-xl overflow-hidden">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-surface-container-low border-b border-outline-variant/10">
            <th class="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Project / Client</th>
            <th class="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant hidden sm:table-cell">Property</th>
            <th class="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Status</th>
            <th class="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant hidden md:table-cell">Drawings</th>
            <th class="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant hidden lg:table-cell">Team</th>
            <th class="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── Render: Drawings review queue ─────────────────────────────────────────────

function renderReviewQueue(reviewData) {
  const container = document.getElementById('reviewQueueContainer');
  const drawings = reviewData?.drawings || [];
  if (!drawings.length) {
    container.innerHTML = `
      <div class="bg-surface-container-lowest rounded-xl p-6 flex items-center gap-4">
        <span class="material-symbols-outlined text-primary text-2xl">check_circle</span>
        <p class="font-body text-sm text-on-surface-variant">No drawings awaiting review. All clear!</p>
      </div>`;
    return;
  }
  container.innerHTML = drawings.slice(0, 10).map(d => `
    <div class="bg-surface-container-lowest rounded-xl px-5 py-4 flex items-center gap-4">
      <span class="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary-container px-2.5 py-1 rounded-full flex-shrink-0">${esc(d.drawing_type)}</span>
      <div class="flex-1 min-w-0">
        <p class="font-body text-sm font-semibold text-on-background truncate">${esc(d.title)}</p>
        <p class="font-body text-[11px] text-on-surface-variant mt-0.5">
          ${d.project?.name ? esc(d.project.name) : 'Unknown project'}
          ${d.project?.client_name ? '· ' + esc(d.project.client_name) : ''}
          · v${d.version_number}
          ${d.uploader?.full_name ? '· ' + esc(d.uploader.full_name) : ''}
        </p>
      </div>
      <div class="flex-shrink-0">
        <a href="/designer?projectId=${d.project_id}" class="inline-flex items-center gap-1.5 text-primary font-bold text-sm hover:gap-2.5 transition-all">
          Review <span class="material-symbols-outlined text-[15px]">east</span>
        </a>
      </div>
    </div>
  `).join('');
}

// ── Create project modal ──────────────────────────────────────────────────────

function openCreateModal() {
  const modal = document.getElementById('createModal');
  modal.style.display = 'flex';
  document.getElementById('cpName').value   = '';
  document.getElementById('cpClient').value = '';
  document.getElementById('cpError').style.display = 'none';
}

document.getElementById('createModalClose').addEventListener('click',  () => { document.getElementById('createModal').style.display = 'none'; });
document.getElementById('createModalCancel').addEventListener('click', () => { document.getElementById('createModal').style.display = 'none'; });

document.getElementById('cpSubmit').addEventListener('click', async () => {
  const name   = document.getElementById('cpName').value.trim();
  const client = document.getElementById('cpClient').value.trim();
  const errEl  = document.getElementById('cpError');
  const btn    = document.getElementById('cpSubmit');

  if (!name) { errEl.textContent = 'Project name is required.'; errEl.style.display = ''; return; }

  btn.disabled = true;
  btn.textContent = 'Creating…';
  errEl.style.display = 'none';

  try {
    const res = await studioFetch('/api/project/create', {
      method: 'POST',
      body: JSON.stringify({ name, clientName: client || undefined }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create project');
    window.location.href = `/index?id=${data.project.id}`;
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = '';
    btn.disabled = false;
    btn.textContent = 'Create & Open';
  }
});
