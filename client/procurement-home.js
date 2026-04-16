// ─── Procurement Home Dashboard ───────────────────────────────────────────────
// Requires: client/studio-utils.js, client/auth.js, client/nav.js

(async () => {
  let profile;
  AppNav.mountSidebar('PROCUREMENT');

  try {
    const auth = await AuthClient.requireAuth(['procurement', 'admin']);
    profile = auth.profile;
  } catch { return; }

  AppNav.renderSidebar(profile, document.getElementById('sidebarNav'));
  AppNav.renderMobileNav(profile, document.getElementById('mobileNav'));
  AppNav.setupUserSection(profile);
  AppNav.setupCollapse();

  // ── Greeting ──────────────────────────────────────────────────────────────
  const firstName = (profile.full_name || 'Procurement').split(' ')[0];
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

  // Fetch material request summaries for all projects
  let matSummary = {};
  // Also fetch active request IDs for projects that need action
  let activeRequests = {}; // projectId -> { id, status }

  if (projects.length) {
    const ids = projects.map(p => p.id).join(',');
    const summaryData = await studioFetch(`/api/material-requests/summary?projectIds=${ids}`)
      .then(r => r.json()).catch(() => ({ summary: {} }));
    matSummary = summaryData.summary || {};

    // For projects with approved/pricing_review requests, fetch the request ID for direct links
    const actionProjects = projects.filter(p => {
      const sm = matSummary[p.id] || {};
      return (sm.approved || 0) > 0 || (sm.pricing_review || 0) > 0 || (sm.procurement_active || 0) > 0;
    });

    if (actionProjects.length) {
      await Promise.all(actionProjects.map(async p => {
        try {
          const res = await studioFetch(`/api/material-requests/list?projectId=${p.id}`);
          const d = await res.json();
          const reqs = d.requests || [];
          // Find the active one (approved, pricing_review, or procurement_active)
          const active = reqs.find(r =>
            ['approved','pricing_review','procurement_active'].includes(r.status)
          );
          if (active) activeRequests[p.id] = active;
        } catch {}
      }));
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalNeedsPricing    = Object.values(matSummary).reduce((s, v) => s + (v.approved || 0), 0);
  const totalAwaitingApproval = Object.values(matSummary).reduce((s, v) => s + (v.pricing_review || 0), 0);
  const totalActiveOrders    = Object.values(matSummary).reduce((s, v) => s + (v.procurement_active || 0), 0);

  document.getElementById('statProjects').textContent         = projects.length;
  document.getElementById('statNeedsPricing').textContent     = totalNeedsPricing;
  document.getElementById('statAwaitingApproval').textContent = totalAwaitingApproval;
  document.getElementById('statActiveOrders').textContent     = totalActiveOrders;

  // ── Welcome subtext ───────────────────────────────────────────────────────
  const subParts = [];
  if (tasks.length)              subParts.push(`<span class="font-semibold text-primary">${tasks.length} task${tasks.length !== 1 ? 's' : ''}</span> pending`);
  if (totalNeedsPricing)         subParts.push(`<span class="font-semibold" style="color:#f59e0b">${totalNeedsPricing} request${totalNeedsPricing !== 1 ? 's' : ''}</span> need pricing`);
  if (totalAwaitingApproval)     subParts.push(`<span class="font-semibold" style="color:#8b5cf6">${totalAwaitingApproval}</span> awaiting admin approval`);
  if (totalActiveOrders)         subParts.push(`<span class="font-semibold" style="color:#0ea5e9">${totalActiveOrders}</span> order${totalActiveOrders !== 1 ? 's' : ''} in progress`);
  document.getElementById('welcomeSubtext').innerHTML = subParts.length
    ? subParts.join(' · ')
    : 'Your workspace is all clear today.';

  // ── Needs Pricing action cards ─────────────────────────────────────────────
  const pricingProjects = projects.filter(p => (matSummary[p.id]?.approved || 0) > 0);
  if (pricingProjects.length) {
    const section = document.getElementById('pricingCardsSection');
    section.style.removeProperty('display');
    section.innerHTML = `
      <div class="lg:col-span-2 flex items-center gap-2 mb-2">
        <span class="material-symbols-outlined" style="color:#f59e0b">pending_actions</span>
        <h3 class="font-headline font-bold text-lg">Requests Needing Pricing</h3>
      </div>
      ${pricingProjects.slice(0, 4).map(p => {
        const req = activeRequests[p.id];
        const link = req ? `/material_request?id=${req.id}` : `/project?id=${p.id}`;
        return `
        <div class="bg-surface-container-lowest p-6 rounded-xl shadow-sm flex flex-col justify-between border-l-4" style="border-color:#f59e0b">
          <div>
            <div class="flex items-center gap-2 mb-4" style="color:#92400e">
              <span class="material-symbols-outlined">price_change</span>
              <span class="text-xs font-bold uppercase tracking-widest">Pricing Required</span>
            </div>
            <h3 class="text-xl font-bold">${esc(p.name || 'Project')}</h3>
            <p class="text-on-surface-variant text-xs font-semibold mt-1">${esc(p.client_name || '')} · Phase: ${esc(p.phase || '—')}</p>
            <p class="text-on-surface-variant text-sm mt-2">
              Material request approved — add pricing to all items and submit for admin approval.
            </p>
          </div>
          <a href="${link}"
             class="mt-4 inline-flex items-center gap-1 text-sm font-bold hover:underline" style="color:#92400e">
            Add Pricing <span class="material-symbols-outlined text-[16px]">east</span>
          </a>
        </div>`;
      }).join('')}`;
  }

  // ── Awaiting Admin Approval cards ─────────────────────────────────────────
  const approvalProjects = projects.filter(p => (matSummary[p.id]?.pricing_review || 0) > 0);
  if (approvalProjects.length) {
    const section = document.getElementById('approvalCardsSection');
    section.style.removeProperty('display');
    section.innerHTML = `
      <div class="lg:col-span-2 flex items-center gap-2 mb-2">
        <span class="material-symbols-outlined" style="color:#8b5cf6">hourglass_top</span>
        <h3 class="font-headline font-bold text-lg">Awaiting Admin Approval</h3>
      </div>
      ${approvalProjects.slice(0, 4).map(p => {
        const req = activeRequests[p.id];
        const link = req ? `/material_request?id=${req.id}` : `/project?id=${p.id}`;
        return `
        <div class="bg-surface-container-lowest p-6 rounded-xl shadow-sm flex flex-col justify-between border-l-4" style="border-color:#8b5cf6">
          <div>
            <div class="flex items-center gap-2 mb-4" style="color:#6d28d9">
              <span class="material-symbols-outlined">hourglass_top</span>
              <span class="text-xs font-bold uppercase tracking-widest">Awaiting Approval</span>
            </div>
            <h3 class="text-xl font-bold">${esc(p.name || 'Project')}</h3>
            <p class="text-on-surface-variant text-xs font-semibold mt-1">${esc(p.client_name || '')} · Phase: ${esc(p.phase || '—')}</p>
            <p class="text-on-surface-variant text-sm mt-2">
              Pricing submitted to admin. You'll be notified once approved.
            </p>
          </div>
          <a href="${link}"
             class="mt-4 inline-flex items-center gap-1 text-sm font-bold hover:underline" style="color:#6d28d9">
            View Request <span class="material-symbols-outlined text-[16px]">east</span>
          </a>
        </div>`;
      }).join('')}`;
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
    renderProjectCards(filtered, matSummary, activeRequests, PHASE_LABELS, PHASE_COLORS);

    document.getElementById('searchInput')?.addEventListener('input', e => {
      renderProjectCards(_filterProjects(projects, e.target.value), matSummary, activeRequests, PHASE_LABELS, PHASE_COLORS);
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

function renderProjectCards(projects, matSummary, activeRequests, PHASE_LABELS, PHASE_COLORS) {
  const wrap  = document.getElementById('projectCards');
  const empty = document.getElementById('projectsEmpty');

  if (!projects.length) {
    wrap.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  wrap.style.display  = 'grid';

  wrap.innerHTML = projects.map(p => {
    const phase = p.phase || 'prospect';
    const color = PHASE_COLORS[phase] || '#526258';
    const label = PHASE_LABELS[phase]  || phase;
    const sm    = matSummary[p.id] || {};
    const req   = activeRequests[p.id];

    // Determine procurement-specific badge
    let badgeHtml = '';
    if (sm.approved > 0) {
      badgeHtml = `<span style="background:#fffbeb;color:#92400e;padding:2px 8px;border-radius:100px;font-size:10px;font-weight:700">💰 Needs pricing</span>`;
    } else if (sm.pricing_review > 0) {
      badgeHtml = `<span style="background:#f3e8ff;color:#6d28d9;padding:2px 8px;border-radius:100px;font-size:10px;font-weight:700">⏳ Awaiting approval</span>`;
    } else if (sm.procurement_active > 0) {
      badgeHtml = `<span style="background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:100px;font-size:10px;font-weight:700">📦 Ordering in progress</span>`;
    } else if (sm.total > 0) {
      badgeHtml = `<span style="background:#d5e7da;color:#33433a;padding:2px 8px;border-radius:100px;font-size:10px;font-weight:700">✓ Complete</span>`;
    } else {
      badgeHtml = `<span style="background:#f2f4f4;color:#5a6061;padding:2px 8px;border-radius:100px;font-size:10px;font-weight:700">No requests yet</span>`;
    }

    // Link to active request if available, else project page
    const href = req ? `/material_request?id=${req.id}` : `/project?id=${p.id}`;

    return `
      <a href="${href}"
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
