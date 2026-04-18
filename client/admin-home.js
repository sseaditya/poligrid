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

// Phase display helpers (shared with renderProjects)
const STATUS_LABELS = {
  prospect:   'Prospect',
  design:     'Design',
  prep:       'Site Prep',
  production: 'Production',
  execution:  'Execution',
  completed:  'Completed',
  cancelled:  'Cancelled',
};
const STATUS_CLS = {
  prospect:   'text-on-surface-variant bg-surface-container',
  design:     'text-secondary bg-secondary-container',
  prep:       'text-tertiary bg-tertiary-container',
  production: 'text-primary bg-primary-container',
  execution:  'text-primary bg-primary-container',
  completed:  'text-primary bg-primary-container',
  cancelled:  'text-error bg-[#fff0f0]',
};
const DT_LABEL = {
  civil: 'Civil', electrical: 'Electrical', plumbing: 'Plumbing', hvac: 'HVAC',
  firefighting: 'Fire', architectural: 'Arch', structural: 'Structural',
  interior: 'Interior', landscape: 'Landscape', other: 'Other',
};
const dotColor = s => ({ approved: '#526258', pending_review: '#d97706', revision_requested: '#9f403d' }[s] || '#757c7d');

// ── Bootstrap ─────────────────────────────────────────────────────────────────

(async () => {
  AppNav.mountSidebar("COMMAND CENTER");

  try {
    ({ profile: _profile } = await AuthClient.requireAuth(['admin', 'ceo']));
  } catch { window.location.href = '/login'; return; }

  // Shared nav + user section
  AppNav.renderSidebar(_profile, document.getElementById('sidebarNav'));
  AppNav.renderMobileNav(_profile, document.getElementById('mobileNav'));
  AppNav.setupUserSection(_profile);
  AppNav.setupCollapse();

  // Role label removed from header (now shown in sidebar brand)

  // Greeting
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (_profile.full_name || 'Admin').split(' ')[0];
  document.getElementById('greetName').textContent = firstName + '.';
  document.getElementById('greetLine').textContent =
    `${greeting} — ${now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}`;

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
  await Promise.all([
    loadAdminQueue(),
    loadProjects(),
    loadDashboard(),
    loadTeamStats(),
  ]);
})();

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function loadAdminQueue() {
  try {
    const res = await studioFetch('/api/material-requests/admin-queue');
    const data = await res.json();
    renderApprovalQueue(data.pricingApprovals || []);
    renderDeliveries(data.activeDeliveries || []);
  } catch {
    renderApprovalQueue([]);
    renderDeliveries([]);
  }
}

async function loadProjects() {
  try {
    const res = await studioFetch('/api/project/list');
    const data = await res.json();
    _projects = data.projects || [];
  } catch { _projects = []; }
  _projectsLoaded = true;

  renderKPIs();

  // Now fetch drawing + assignment data for the project list
  const ids = _projects.map(p => p.id);
  const [summary, allAssignments] = await Promise.all([
    fetchDrawingSummary(ids),
    fetchAllAssignments(ids),
  ]);

  renderProjectList(summary, allAssignments);
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
    renderKPIs();
  } catch { }
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

// ── Render: KPI cards ─────────────────────────────────────────────────────────

function renderKPIs() {
  if (!_projectsLoaded) return;

  const total    = _projects.length;
  const inDesign = _projects.filter(p => p.phase === 'design').length;
  const onHold   = _projects.filter(p => p.on_hold).length;
  const completed       = _projects.filter(p => p.phase === 'completed').length;
  const pendingDrawings = _teamStats?.pendingDrawingsTotal ?? '—';

  const kpis = [
    { label: 'Total Projects', value: total,     icon: 'architecture', accent: false },
    { label: 'In Design',      value: inDesign,  icon: 'draw',         accent: false },
    { label: 'On Hold',        value: onHold,    icon: 'pause_circle', accent: onHold > 0 },
    { label: 'Completed',      value: completed, icon: 'check_circle', accent: completed > 0 },
    { label: 'Total Team',     value: _teamStats?.roleCount ? Object.values(_teamStats.roleCount).reduce((s, n) => s + n, 0) : '—', icon: 'group', accent: false },
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


// ── Render: Pricing Approval Queue ───────────────────────────────────────────

function renderApprovalQueue(items) {
  const el = document.getElementById('approvalQueueList');
  const badge = document.getElementById('approvalBadge');
  if (!el) return;

  if (badge) {
    if (items.length > 0) {
      badge.textContent = items.length;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  if (!items.length) {
    el.innerHTML = `<div class="bg-surface-container-lowest rounded-xl p-5 text-sm text-on-surface-variant">No pricing approvals pending. All clear.</div>`;
    return;
  }

  el.innerHTML = items.map(r => `
    <a href="/material_request?id=${r.id}" class="flex items-center justify-between bg-surface-container-lowest rounded-xl px-5 py-4 mb-2 hover:ring-1 hover:ring-primary/30 transition-all group no-underline">
      <div class="flex items-center gap-4">
        <span class="material-symbols-outlined text-error text-[20px]" style="font-variation-settings:'FILL' 1">receipt_long</span>
        <div>
          <p class="font-label font-bold text-sm text-on-background">${escHtml(r.project?.name || 'Project')} — ${escHtml(r.title || 'Material Request')}</p>
          <p class="font-body text-xs text-on-surface-variant mt-0.5">${r.project?.client_name ? escHtml(r.project.client_name) + ' · ' : ''}${r.item_count} item${r.item_count !== 1 ? 's' : ''} · Awaiting price approval</p>
        </div>
      </div>
      <span class="font-label font-bold text-xs text-primary group-hover:underline">Approve Pricing →</span>
    </a>`).join('');
}

// ── Render: Active Deliveries ─────────────────────────────────────────────────

function renderDeliveries(items) {
  const el = document.getElementById('deliveriesList');
  if (!el) return;

  if (!items.length) {
    el.innerHTML = `<div class="bg-surface-container-lowest rounded-xl p-5 text-sm text-on-surface-variant">No active deliveries right now.</div>`;
    return;
  }

  // Group by project
  const byProject = {};
  for (const item of items) {
    const pid = item.request?.project?.id || 'unknown';
    if (!byProject[pid]) byProject[pid] = { project: item.request?.project, items: [] };
    byProject[pid].items.push(item);
  }

  const ORDER_LABEL = { ordered: 'Ordered', in_transit: 'In Transit' };
  const ORDER_COLOR = { ordered: 'text-secondary', in_transit: 'text-tertiary' };

  el.innerHTML = Object.values(byProject).map(group => `
    <div class="bg-surface-container-lowest rounded-xl px-5 py-4 mb-2">
      <p class="font-label font-bold text-sm text-on-background mb-2">${escHtml(group.project?.name || 'Project')}${group.project?.client_name ? ' <span class="font-normal text-on-surface-variant">— ' + escHtml(group.project.client_name) + '</span>' : ''}</p>
      <div class="flex flex-col gap-1">
        ${group.items.map(item => `
          <div class="flex items-center justify-between text-xs">
            <span class="text-on-surface-variant">${escHtml(item.description || item.category || '—')}${item.quantity ? ' · ' + item.quantity + (item.unit ? ' ' + item.unit : '') : ''}</span>
            <span class="font-bold ${ORDER_COLOR[item.order_status] || 'text-on-surface-variant'}">${ORDER_LABEL[item.order_status] || item.order_status}</span>
          </div>`).join('')}
      </div>
    </div>`).join('');
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
    const matchStatus = !filter || p.phase === filter;
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
    const sCls        = STATUS_CLS[p.phase] || 'text-on-surface-variant bg-surface-container';
    const sLbl        = STATUS_LABELS[p.phase] || p.phase || '—';
    const onHoldChip  = p.on_hold ? `<span class="ml-1 px-2 py-0.5 rounded-full text-[9px] font-bold" style="background:#fff3cd;color:#7c5e00">On Hold</span>` : '';
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
          ${onHoldChip}
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
