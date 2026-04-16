// ─── Site Supervisor Home Dashboard ──────────────────────────────────────────
// Requires: client/studio-utils.js, client/auth.js, client/nav.js

(async () => {
  let profile;
  AppNav.mountSidebar('SITE SUPERVISOR');

  try {
    const auth = await AuthClient.requireAuth(['site_supervisor', 'admin']);
    profile = auth.profile;
  } catch { return; }

  AppNav.renderSidebar(profile, document.getElementById('sidebarNav'));
  AppNav.renderMobileNav(profile, document.getElementById('mobileNav'));
  AppNav.setupUserSection(profile);
  AppNav.setupCollapse();

  // ── Greeting ──────────────────────────────────────────────────────────────
  const firstName = (profile.full_name || 'Supervisor').split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  document.getElementById('welcomeHeading').textContent = `${greeting}, ${firstName}`;

  // ── Fetch data ────────────────────────────────────────────────────────────
  const [tasksData, projectsData] = await Promise.all([
    studioFetch('/api/tasks/list?status=pending').then(r => r.json()).catch(() => ({ tasks: [] })),
    studioFetch('/api/project/list').then(r => r.json()).catch(() => ({ projects: [] })),
  ]);

  const tasks    = tasksData.tasks    || [];
  const projects = projectsData.projects || [];

  // Get material request summaries for all projects in one call
  let matSummary = {};
  if (projects.length) {
    const ids = projects.map(p => p.id).join(',');
    const summaryData = await studioFetch(`/api/material-requests/summary?projectIds=${ids}`)
      .then(r => r.json()).catch(() => ({ summary: {} }));
    matSummary = summaryData.summary || {};
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalPending   = Object.values(matSummary).reduce((s, v) => s + (v.pending_approval || 0), 0);
  const totalRevisions = Object.values(matSummary).reduce((s, v) => s + (v.revision_requested || 0), 0);

  document.getElementById('statProjects').textContent  = projects.length;
  document.getElementById('statPending').textContent   = totalPending;
  document.getElementById('statRevisions').textContent = totalRevisions;

  // ── Welcome subtext ───────────────────────────────────────────────────────
  const subParts = [];
  if (tasks.length)         subParts.push(`<span class="font-semibold text-primary">${tasks.length} task${tasks.length !== 1 ? 's' : ''}</span> pending`);
  if (totalRevisions)       subParts.push(`<span class="font-semibold text-error">${totalRevisions} material request${totalRevisions !== 1 ? 's' : ''}</span> need revision`);
  if (totalPending)         subParts.push(`<span class="font-semibold" style="color:#f59e0b">${totalPending}</span> awaiting approval`);
  document.getElementById('welcomeSubtext').innerHTML = subParts.length
    ? subParts.join(' · ')
    : 'Your workspace is all clear today.';

  // ── Revision action cards ─────────────────────────────────────────────────
  const revisionProjects = projects.filter(p => (matSummary[p.id]?.revision_requested || 0) > 0);
  if (revisionProjects.length) {
    const section = document.getElementById('revisionCardsSection');
    section.style.removeProperty('display');
    section.innerHTML = revisionProjects.slice(0, 4).map(p => `
      <div class="bg-surface-container-lowest p-6 rounded-xl shadow-sm flex flex-col justify-between">
        <div>
          <div class="flex items-center gap-2 text-error mb-4">
            <span class="material-symbols-outlined">error</span>
            <span class="text-xs font-bold uppercase tracking-widest">Revision Needed</span>
          </div>
          <h3 class="text-xl font-bold">${esc(p.name || 'Project')}</h3>
          <p class="text-on-surface-variant text-xs font-semibold mt-1">${esc(p.client_name || '')} · Phase: ${esc(p.phase || '—')}</p>
          <p class="text-on-surface-variant text-sm mt-2">
            ${matSummary[p.id]?.revision_requested || 0} material request(s) need revision.
          </p>
        </div>
        <a href="/project?id=${p.id}"
           class="mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">
          Open Project <span class="material-symbols-outlined text-[16px]">east</span>
        </a>
      </div>
    `).join('');
  }

  // ── Tasks table ───────────────────────────────────────────────────────────
  document.getElementById('tasksSkeleton').style.display = 'none';
  if (tasks.length) {
    const tbody = document.getElementById('tasksBody');
    tbody.innerHTML = tasks.map(t => {
      const priorityColors = { high: 'text-error', medium: 'text-[#f59e0b]', low: 'text-on-surface-variant' };
      return `
        <tr class="hover:bg-surface-container-low transition-colors">
          <td class="px-5 py-4">
            <p class="font-semibold text-sm text-on-surface">${esc(t.title)}</p>
            <p class="text-xs text-on-surface-variant mt-0.5">${esc(t.project?.name || '—')}</p>
          </td>
          <td class="px-5 py-4">
            <span class="text-xs font-bold uppercase ${priorityColors[t.priority] || ''}">${esc(t.priority)}</span>
          </td>
          <td class="px-5 py-4 text-xs text-on-surface-variant">${t.due_date ? fmtShort(t.due_date) : '—'}</td>
          <td class="px-5 py-4 text-right">
            ${t.project_id ? `<a href="/project?id=${t.project_id}" class="text-primary font-semibold text-xs hover:underline">Open →</a>` : ''}
          </td>
        </tr>`;
    }).join('');
    document.getElementById('tasksTable').style.display = 'block';
  } else {
    document.getElementById('tasksEmpty').style.display = 'flex';
  }

  // ── Project cards ─────────────────────────────────────────────────────────
  document.getElementById('projectSkeleton').style.display = 'none';
  if (projects.length) {
    const PHASE_LABELS = {
      prospect: 'Prospect', design: 'Design', prep: 'Site Prep',
      production: 'Production', execution: 'Execution',
      completed: 'Completed', cancelled: 'Cancelled',
    };
    const PHASE_COLORS = {
      prospect: '#6366f1', design: '#526258', prep: '#f59e0b',
      production: '#0ea5e9', execution: '#10b981',
      completed: '#526258', cancelled: '#9f403d',
    };

    const filtered = _filterProjects(projects, document.getElementById('searchInput')?.value || '');
    renderProjectCards(filtered, matSummary, PHASE_LABELS, PHASE_COLORS);

    document.getElementById('searchInput')?.addEventListener('input', e => {
      const q = e.target.value;
      renderProjectCards(_filterProjects(projects, q), matSummary, PHASE_LABELS, PHASE_COLORS);
    });
  } else {
    document.getElementById('projectsEmpty').style.display = 'block';
  }
})();

function _filterProjects(projects, q) {
  if (!q.trim()) return projects;
  const lq = q.toLowerCase();
  return projects.filter(p =>
    (p.name || '').toLowerCase().includes(lq) ||
    (p.client_name || '').toLowerCase().includes(lq)
  );
}

function renderProjectCards(projects, matSummary, PHASE_LABELS, PHASE_COLORS) {
  const wrap = document.getElementById('projectCards');
  const empty = document.getElementById('projectsEmpty');

  if (!projects.length) {
    wrap.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  wrap.style.display = 'grid';

  wrap.innerHTML = projects.map(p => {
    const phase  = p.phase || 'prospect';
    const color  = PHASE_COLORS[phase] || '#526258';
    const label  = PHASE_LABELS[phase]  || phase;
    const sm     = matSummary[p.id] || {};
    const total  = sm.total  || 0;
    const approved = sm.approved || 0;
    const pending  = sm.pending_approval || 0;
    const revision = sm.revision_requested || 0;

    const badgeHtml = revision
      ? `<span style="background:#fff0f0;color:#9f403d;padding:2px 8px;border-radius:100px;font-size:10px;font-weight:700">⚠ ${revision} revision${revision>1?'s':''}</span>`
      : pending
        ? `<span style="background:#fffbeb;color:#92400e;padding:2px 8px;border-radius:100px;font-size:10px;font-weight:700">⏳ ${pending} pending</span>`
        : total
          ? `<span style="background:#d5e7da;color:#33433a;padding:2px 8px;border-radius:100px;font-size:10px;font-weight:700">✓ ${approved}/${total} approved</span>`
          : `<span style="background:#f2f4f4;color:#5a6061;padding:2px 8px;border-radius:100px;font-size:10px;font-weight:700">No requests yet</span>`;

    return `
      <a href="/project?id=${p.id}"
         class="bg-surface-container-lowest rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-3 cursor-pointer no-underline"
         style="border-left: 4px solid ${color}">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h4 class="font-headline font-bold text-base text-on-surface leading-tight">${esc(p.name || 'Untitled')}</h4>
            <p class="text-xs text-on-surface-variant mt-0.5">${esc(p.client_name || '—')}</p>
          </div>
          <span style="background:${color}20;color:${color};padding:2px 10px;border-radius:100px;font-size:10px;font-weight:700;white-space:nowrap">${label}</span>
        </div>
        <div class="flex items-center justify-between">
          ${badgeHtml}
          <span class="material-symbols-outlined text-on-surface-variant text-[18px]">east</span>
        </div>
      </a>`;
  }).join('');
}
