// ─── Lead Designer Home Dashboard ────────────────────────────────────────────
// Requires: client/studio-utils.js (esc, fmtDt, fmtShort, studioFetch), client/auth.js

(async () => {
  let profile;
  try {
    const auth = await AuthClient.requireAuth(['lead_designer', 'admin']);
    profile = auth.profile;
  } catch { return; }

  // ── Shared nav + user section ────────────────────────────────────────────────
  AppNav.renderSidebar(profile, document.getElementById('sidebarNav'));
  AppNav.renderMobileNav(profile, document.getElementById('mobileNav'));
  AppNav.setupUserSection(profile);
  AppNav.setupCollapse();

  const firstName = (profile.full_name || 'Lead').split(' ')[0];
  document.getElementById('welcomeName').textContent = firstName + '.';
  document.getElementById('activeName').textContent  = firstName + '.';

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('activeDateLine').textContent =
    `${greeting} — ${now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}`;

  // ── Fetch projects ──────────────────────────────────────────────────────────
  let projects = [];
  try {
    const res = await studioFetch('/api/project/list');
    const data = await res.json();
    projects = data.projects || [];
  } catch { /* show empty state on failure */ }

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('activeDashboard').style.display = '';
  document.getElementById('statActiveProjects').textContent = projects.length;

  document.getElementById('pickupBtn').addEventListener('click', openBrowseModal);
  document.getElementById('newProjectBtn').addEventListener('click', openCreateModal);

  // Load all data in parallel — single assignment call replaces per-project N+1
  const projectIds = projects.map(p => p.id);
  const [summary, reviewData, allAssignments] = await Promise.all([
    fetchDrawingSummary(projectIds),
    fetchPendingReview(),
    fetchAllAssignments(projectIds),
  ]);

  renderStats(summary, reviewData);
  renderActionCards(projects, summary, reviewData);
  renderProjects(projects, summary, allAssignments);
  renderReviewQueue(reviewData);

  // ── Modal wiring ────────────────────────────────────────────────────────────
  document.getElementById('browseModalClose').addEventListener('click',  closeBrowseModal);
  document.getElementById('createModalClose').addEventListener('click',  closeCreateModal);
  document.getElementById('createModalCancel').addEventListener('click', closeCreateModal);
  document.getElementById('cpSubmit').addEventListener('click', handleCreateProject);

  document.getElementById('emptyBrowseBtn')?.addEventListener('click', openBrowseModal);
  document.getElementById('emptyCreateBtn')?.addEventListener('click', openCreateModal);

  // ── Stats ───────────────────────────────────────────────────────────────────
  function renderStats(summary, reviewData) {
    let totalPending   = reviewData?.drawings?.length ?? 0;
    let totalRevisions = 0;
    Object.values(summary).forEach(s => { totalRevisions += (s.revision_requested || 0); });
    document.getElementById('statPendingReview').textContent = totalPending;
    document.getElementById('statRevisions').textContent     = totalRevisions;
  }

  // ── Action Cards ─────────────────────────────────────────────────────────────
  function renderActionCards(projects, summary, reviewData) {
    const grid = document.getElementById('actionCardsGrid');
    const cards = [];

    const pendingCount   = reviewData?.drawings?.length ?? 0;
    let   revisionCount  = 0;
    Object.values(summary).forEach(s => { revisionCount += (s.revision_requested || 0); });

    if (pendingCount > 0) {
      cards.push({
        icon: 'rate_review', iconBg: 'bg-primary-container', iconColor: 'text-primary',
        label: 'Drawings to Review', value: pendingCount,
        desc: `${pendingCount} drawing${pendingCount !== 1 ? 's' : ''} awaiting your approval`,
        cta: 'Review Now', href: '/designer', urgent: pendingCount > 3,
      });
    }
    if (revisionCount > 0) {
      cards.push({
        icon: 'sync_problem', iconBg: 'bg-[#fff0f0]', iconColor: 'text-error',
        label: 'Revision Requests', value: revisionCount,
        desc: `${revisionCount} drawing${revisionCount !== 1 ? 's' : ''} sent back for revision`,
        cta: 'View Revisions', href: '/designer', urgent: true,
      });
    }
    const noDrawingsProjects = projects.filter(p => { const s = summary[p.id]; return !s || s.total === 0; });
    if (noDrawingsProjects.length > 0) {
      cards.push({
        icon: 'pending_actions', iconBg: 'bg-tertiary-container', iconColor: 'text-tertiary',
        label: 'Awaiting Drawings', value: noDrawingsProjects.length,
        desc: `${noDrawingsProjects.length} project${noDrawingsProjects.length !== 1 ? 's' : ''} with no drawings uploaded yet`,
        cta: 'Assign Drawings', href: '/projects', urgent: false,
      });
    }
    cards.push({
      icon: 'add_task', iconBg: 'bg-secondary-container', iconColor: 'text-secondary',
      label: 'Available Projects', value: null,
      desc: 'Pick up a new paid project from the sales queue',
      cta: 'Browse', onclick: openBrowseModal, urgent: false,
    });

    if (!cards.length) {
      grid.innerHTML = `<div class="col-span-3 bg-surface-container-lowest rounded-xl p-8 flex flex-col items-center gap-3 text-center">
        <span class="material-symbols-outlined text-4xl text-primary">task_alt</span>
        <p class="font-headline font-bold text-on-background">All clear! No actions required.</p>
        <p class="font-body text-sm text-on-surface-variant">Your team is on track. Check back later.</p>
      </div>`;
      return;
    }

    grid.innerHTML = cards.map(c => `
      <div class="bg-surface-container-lowest rounded-xl p-6 flex flex-col gap-4 ${c.urgent ? 'action-card-urgent' : ''}">
        <div class="flex items-start justify-between">
          <div class="w-10 h-10 rounded-lg ${c.iconBg} flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined ${c.iconColor} text-[20px]">${c.icon}</span>
          </div>
          ${c.value !== null ? `<span class="font-headline font-extrabold text-3xl text-on-background leading-none">${c.value}</span>` : ''}
        </div>
        <div class="flex-1">
          <p class="font-label font-bold text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">${c.label}</p>
          <p class="font-body text-sm text-on-surface-variant leading-snug">${c.desc}</p>
        </div>
        ${c.href
          ? `<a href="${c.href}" class="inline-flex items-center gap-1.5 text-primary font-bold text-sm hover:gap-2.5 transition-all">
               ${c.cta} <span class="material-symbols-outlined text-[16px]">east</span>
             </a>`
          : `<button data-action="browse" class="inline-flex items-center gap-1.5 text-primary font-bold text-sm hover:gap-2.5 transition-all text-left">
               ${c.cta} <span class="material-symbols-outlined text-[16px]">east</span>
             </button>`}
      </div>
    `).join('');

    grid.querySelectorAll('[data-action="browse"]').forEach(btn => {
      btn.addEventListener('click', openBrowseModal);
    });
  }

  // ── Project list (tabular) ───────────────────────────────────────────────────
  function renderProjects(projects, summary, allAssignments) {
    const container = document.getElementById('projectListContainer');
    const statusLabel = { active: 'Active', advanced_paid: 'Advance Paid', in_progress: 'In Progress',
      completed: 'Completed', on_hold: 'On Hold', cancelled: 'Cancelled' };
    const statusCls = { active: 'text-primary bg-primary-container', advanced_paid: 'text-secondary bg-secondary-container',
      in_progress: 'text-tertiary bg-tertiary-container', completed: 'text-primary bg-primary-container',
      on_hold: 'text-on-surface-variant bg-surface-container', cancelled: 'text-error bg-[#fff0f0]' };
    const dtLabel = { civil: 'Civil', electrical: 'Electrical', plumbing: 'Plumbing',
      hvac: 'HVAC', firefighting: 'Fire', architectural: 'Arch', structural: 'Structural',
      interior: 'Interior', landscape: 'Landscape', other: 'Other' };
    const dotColor = s => ({ approved: '#526258', pending_review: '#d97706',
      revision_requested: '#9f403d' }[s] || '#757c7d');

    const rows = projects.map(p => {
      const s = summary[p.id] || { total: 0, approved: 0, pending_review: 0, revision_requested: 0 };
      const approvedPct = s.total ? Math.round((s.approved / s.total) * 100) : 0;
      const reviewPct   = s.total ? Math.round((s.pending_review / s.total) * 100) : 0;
      const allDone     = s.total > 0 && s.approved === s.total;
      const sCls = statusCls[p.status] || 'text-on-surface-variant bg-surface-container';
      const sLbl = statusLabel[p.status] || p.status || '—';
      const meta = [p.bhk, p.property_type, p.total_area_m2 ? p.total_area_m2 + ' m²' : null].filter(Boolean).join(' · ');

      const projAssignments = allAssignments[p.id] || [];
      const byDesigner = {};
      for (const a of projAssignments) {
        const name = a.assignee?.full_name || 'Unknown';
        if (!byDesigner[name]) byDesigner[name] = [];
        byDesigner[name].push(a);
      }
      const designerChips = Object.entries(byDesigner).map(([name, assigns]) => {
        const types = assigns.map(a =>
          `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:700;
            padding:1px 6px;border-radius:99px;background:rgba(82,98,88,0.08);color:#526258">
            <span style="width:4px;height:4px;border-radius:50%;background:${dotColor(a.status)};flex-shrink:0"></span>
            ${esc(dtLabel[a.drawing_type] || a.drawing_type)}
            ${a.deadline ? `<span style="color:#757c7d;font-weight:400">· ${fmtShort(a.deadline)}</span>` : ''}
          </span>`
        ).join('');
        return `<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
          <span style="font-size:11px;font-weight:600;color:#2d3435">${esc(name)}</span>
          ${types}
        </div>`;
      }).join('');

      return `
        <tr class="border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors group">
          <td class="px-5 py-4">
            <p class="font-headline font-bold text-sm text-on-background leading-tight">${esc(p.name || 'Untitled')}</p>
            <p class="font-body text-xs text-on-surface-variant mt-0.5">${esc(p.client_name || '—')}</p>
          </td>
          <td class="px-5 py-4 hidden sm:table-cell">
            <p class="font-body text-xs text-on-surface-variant">${esc(meta || '—')}</p>
          </td>
          <td class="px-5 py-4">
            <span class="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${sCls}">${esc(sLbl)}</span>
            ${p.advance_payment_done ? `<span class="ml-1 text-[10px] font-bold uppercase tracking-wider text-primary bg-primary-container px-2.5 py-1 rounded-full">₹ Paid</span>` : ''}
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
            ${projAssignments.length
              ? `<div style="display:flex;flex-direction:column;gap:4px">${designerChips}</div>`
              : `<a href="/project?id=${p.id}"
                  style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;
                    color:#526258;text-decoration:none;padding:3px 8px;border:1px solid #d5e7da;
                    border-radius:6px;transition:background .15s"
                  onmouseover="this.style.background='#d5e7da'" onmouseout="this.style.background=''">
                  <span class="material-symbols-outlined" style="font-size:13px">person_add</span>
                  Assign
                </a>`}
          </td>
          <td class="px-5 py-4 text-right">
            <div class="flex items-center gap-2 justify-end">
              <a href="/project?id=${p.id}"
                class="flex items-center gap-1 text-on-surface-variant font-semibold text-xs hover:text-primary transition-colors"
                title="Manage team & assignments">
                <span class="material-symbols-outlined text-[15px]">group</span>
              </a>
              <a href="/project?id=${p.id}" class="flex items-center gap-1.5 text-primary font-semibold text-sm hover:gap-2.5 transition-all">
                Open Project <span class="material-symbols-outlined text-[15px]">east</span>
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

  // ── Review queue ─────────────────────────────────────────────────────────────
  function renderReviewQueue(reviewData) {
    const container = document.getElementById('reviewQueueContainer');
    const drawings = reviewData?.drawings || [];
    if (!drawings.length) {
      container.innerHTML = `<div class="bg-surface-container-lowest rounded-xl p-6 flex items-center gap-4">
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
        <div class="flex-shrink-0 flex items-center gap-2">
          <button class="inline-review-btn text-[11px] font-bold px-4 py-2 rounded-lg cursor-pointer border-none" style="background:linear-gradient(135deg,#526258,#46564c);color:#eafcef" data-id="${esc(d.id)}" data-title="${esc(d.title)}" data-type="${esc(d.drawing_type)}" data-project="${esc(d.project?.name || '')}" data-file-path="${esc(d.file_path || '')}" data-file-name="${esc(d.file_name || '')}">
            Review
          </button>
          <a href="/designer?projectId=${d.project_id}" class="text-on-surface-variant font-semibold text-xs hover:text-primary transition-colors" title="Open in Drawings Manager">Open →</a>
        </div>
      </div>
    `).join('');
    container.querySelectorAll('.inline-review-btn').forEach(btn => {
      btn.addEventListener('click', () => openInlineReview(btn.dataset.id, btn.dataset.title, btn.dataset.type, btn.dataset.project, btn.dataset.filePath, btn.dataset.fileName));
    });
  }

  // ── Data fetchers ────────────────────────────────────────────────────────────

  async function fetchDrawingSummary(ids) {
    if (!ids.length) return {};
    try {
      const r = await studioFetch(`/api/drawings/project-summary?projectIds=${ids.join(',')}`);
      const d = await r.json();
      return d.summary || {};
    } catch { return {}; }
  }

  // Single batched call — O(1) instead of O(N) API calls.
  // Passes projectIds as a comma-separated list; server filters in one DB query.
  async function fetchAllAssignments(projectIds) {
    if (!projectIds.length) return {};
    try {
      const r = await studioFetch(`/api/drawings/assignments?projectIds=${projectIds.join(',')}`);
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

  // ── Browse paid projects modal ───────────────────────────────────────────────
  function openBrowseModal() {
    const modal = document.getElementById('browseModal');
    modal.style.display = 'flex';
    const list = document.getElementById('browseProjectsList');
    list.innerHTML = '<p style="font-size:13px;color:#757c7d">Loading…</p>';

    studioFetch('/api/project/available').then(r => r.json()).then(({ projects: avail }) => {
      if (!avail?.length) {
        list.innerHTML = '<p style="font-size:13px;color:#757c7d">No paid projects available right now.</p>';
        return;
      }
      list.innerHTML = avail.map(p => `
        <div style="display:flex;align-items:center;gap:14px;padding:12px;background:#f2f4f4;border-radius:8px;margin-bottom:8px">
          <div style="flex:1;min-width:0">
            <p style="font-size:14px;font-weight:700;color:#2d3435;font-family:Manrope;margin:0">${esc(p.name || 'Untitled')}</p>
            <p style="font-size:12px;color:#5a6061;font-family:Inter;margin:2px 0 0">
              ${esc(p.bhk || '')} ${esc(p.property_type || '')} ${p.client_name ? '· ' + esc(p.client_name) : ''}
            </p>
            <span style="display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#46554c;background:#d5e7da;padding:3px 8px;border-radius:99px;margin-top:4px">₹ Advance Paid</span>
          </div>
          <button class="self-assign-btn" data-id="${p.id}"
            style="padding:8px 16px;background:linear-gradient(135deg,#526258,#46564c);color:#eafcef;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:Inter;white-space:nowrap">
            Assign to Me
          </button>
        </div>
      `).join('');

      list.querySelectorAll('.self-assign-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = 'Assigning…';
          try {
            const r = await studioFetch('/api/project/assign-user', {
              method: 'POST',
              body: JSON.stringify({ projectId: btn.dataset.id, userId: profile.id }),
            });
            if (!r.ok) throw new Error();
            btn.textContent = '✓ Assigned';
            btn.style.background = '#526258';
            setTimeout(() => { window.location.href = `/designer?projectId=${btn.dataset.id}`; }, 700);
          } catch {
            btn.disabled = false;
            btn.textContent = 'Assign to Me';
          }
        });
      });
    }).catch(() => {
      list.innerHTML = '<p style="font-size:13px;color:#9f403d">Failed to load projects.</p>';
    });
  }

  function closeBrowseModal() { document.getElementById('browseModal').style.display = 'none'; }

  // ── Create project modal ─────────────────────────────────────────────────────
  function openCreateModal() {
    document.getElementById('cpName').value   = '';
    document.getElementById('cpClient').value = '';
    document.getElementById('cpError').style.display = 'none';
    document.getElementById('createModal').style.display = 'flex';
  }

  function closeCreateModal() { document.getElementById('createModal').style.display = 'none'; }

  async function handleCreateProject() {
    const name   = document.getElementById('cpName').value.trim();
    const client = document.getElementById('cpClient').value.trim();
    const errEl  = document.getElementById('cpError');
    const btn    = document.getElementById('cpSubmit');
    errEl.style.display = 'none';
    if (!name) { errEl.textContent = 'Project name is required.'; errEl.style.display = 'block'; return; }
    btn.disabled = true; btn.textContent = 'Creating…';
    try {
      const res = await studioFetch('/api/project/create', {
        method: 'POST',
        body: JSON.stringify({ name, clientName: client || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create project.');
      window.location.href = `/designer?projectId=${data.projectId}`;
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Create & Open';
    }
  }

  // ── Inline Drawing Review Modal ──────────────────────────────────────────────
  let _irDrawingId = null;

  function openInlineReview(drawingId, title, drawingType, projectName, filePath, fileName) {
    _irDrawingId = drawingId;
    document.getElementById('irTitle').textContent    = title || drawingType;
    document.getElementById('irMeta').textContent     = [projectName, drawingType].filter(Boolean).join(' · ');
    document.getElementById('irComments').value       = '';
    document.getElementById('irErr').style.display    = 'none';
    document.getElementById('irSuccess').style.display = 'none';
    const viewBtn = document.getElementById('irViewBtn');
    if (filePath) {
      viewBtn.style.display = 'inline-flex';
      viewBtn.onclick = async () => {
        try {
          const r = await studioFetch(`/api/drawings/signed-url?path=${encodeURIComponent(filePath)}`);
          const { url } = await r.json();
          window.open(url, '_blank');
        } catch { alert('Could not open file.'); }
      };
    } else {
      viewBtn.style.display = 'none';
    }
    ['irApprove','irRevision','irReject'].forEach(id => { document.getElementById(id).disabled = false; });
    document.getElementById('inlineReviewModal').style.display = 'flex';
  }

  function closeInlineReview() { document.getElementById('inlineReviewModal').style.display = 'none'; }

  async function submitInlineReview(status) {
    const errEl = document.getElementById('irErr');
    const sucEl = document.getElementById('irSuccess');
    errEl.style.display = 'none'; sucEl.style.display = 'none';
    ['irApprove','irRevision','irReject'].forEach(id => { document.getElementById(id).disabled = true; });
    try {
      const res = await studioFetch('/api/drawings/review', {
        method: 'POST',
        body: JSON.stringify({
          drawingId: _irDrawingId,
          status,
          comments: document.getElementById('irComments').value.trim(),
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Review failed.'); }
      sucEl.textContent = status === 'approved' ? '✓ Drawing approved!' : status === 'revision_requested' ? '↩ Revision requested.' : '✗ Drawing rejected.';
      sucEl.style.display = 'block';
      setTimeout(() => { closeInlineReview(); location.reload(); }, 1000);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
      ['irApprove','irRevision','irReject'].forEach(id => { document.getElementById(id).disabled = false; });
    }
  }

  document.getElementById('irClose').addEventListener('click', closeInlineReview);
  document.getElementById('irApprove').addEventListener('click',  () => submitInlineReview('approved'));
  document.getElementById('irRevision').addEventListener('click', () => submitInlineReview('revision_requested'));
  document.getElementById('irReject').addEventListener('click',   () => submitInlineReview('rejected'));

})();
