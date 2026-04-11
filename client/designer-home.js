// ─── Designer Home Dashboard ──────────────────────────────────────────────────
// Requires: client/studio-utils.js (esc, fmtDt, studioFetch), client/auth.js

(async () => {
  let profile;
  try {
    const auth = await AuthClient.requireAuth(['designer', 'lead_designer', 'admin']);
    profile = auth.profile;
  } catch { return; }

  // ── Shared nav + user section ────────────────────────────────────────────────
  AppNav.mountSidebar("GOD'S EYE");
  AppNav.renderSidebar(profile, document.getElementById('sidebarNav'));
  AppNav.renderMobileNav(profile, document.getElementById('mobileNav'));
  AppNav.setupUserSection(profile);
  AppNav.setupCollapse();

  // ── Greeting ────────────────────────────────────────────────────────────────
  const firstName = (profile.full_name || 'Designer').split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  document.getElementById('welcomeHeading').textContent = `${greeting}, ${firstName}`;

  // ── Load data in parallel ───────────────────────────────────────────────────
  const [tasksData, projectsData, revisionsData, assignmentsData] = await Promise.all([
    studioFetch('/api/tasks/list?status=pending').then(r => r.json()).catch(() => ({ tasks: [] })),
    studioFetch('/api/project/list').then(r => r.json()).catch(() => ({ projects: [] })),
    studioFetch('/api/drawings/revision-requests').then(r => r.json()).catch(() => ({ drawings: [] })),
    studioFetch('/api/drawings/assignments').then(r => r.json()).catch(() => ({ assignments: [] })),
  ]);

  const tasks       = tasksData.tasks        || [];
  const projects    = projectsData.projects  || [];
  const revisions   = revisionsData.drawings || [];
  const assignments = assignmentsData.assignments || [];

  // Assignments pending upload (actionable for designer)
  const pendingAssignments = assignments.filter(a => a.status === 'assigned');
  // Assignments uploaded but awaiting lead designer approval
  const pendingApprovalAssignments = assignments.filter(a => a.status === 'pending_review');

  // ── Welcome subtext ─────────────────────────────────────────────────────────
  const dueTodayCount = tasks.filter(t => {
    if (!t.due_date) return false;
    const due = new Date(t.due_date);
    return due.toDateString() === new Date().toDateString();
  }).length;

  const subParts = [];
  const actionableCount = tasks.length + pendingAssignments.length;
  if (actionableCount) subParts.push(`<span class="font-semibold text-primary">${actionableCount} task${actionableCount !== 1 ? 's' : ''}</span> in your queue`);
  if (revisions.length) subParts.push(`<span class="font-semibold text-error">${revisions.length} revision${revisions.length !== 1 ? 's' : ''}</span> need attention`);
  document.getElementById('welcomeSubtext').innerHTML = subParts.length
    ? subParts.join(' and ')
    : 'Your workspace is all clear today.';

  // ── Stats ───────────────────────────────────────────────────────────────────
  const pendingUploadCount = assignments.filter(a => new Set(['assigned', 'pending', 'in_progress']).has(a.status)).length;
  document.getElementById('statTasksDue').textContent  = dueTodayCount || (tasks.length + pendingUploadCount);
  document.getElementById('statRevisions').textContent = revisions.length;

  // ── Action Cards (revision notices) ─────────────────────────────────────────
  if (revisions.length) {
    const section = document.getElementById('actionCardsSection');
    section.style.removeProperty('display');
    section.innerHTML = revisions.slice(0, 4).map(d => {
      const reviewer = d.drawing_reviews?.[0]?.reviewer?.full_name || 'Design Lead';
      const comment  = d.drawing_reviews?.[0]?.comments || 'Please review and revise.';
      return `
        <div class="bg-surface-container-lowest p-6 rounded-xl shadow-sm flex flex-col justify-between">
          <div>
            <div class="flex items-center gap-2 text-error mb-4">
              <span class="material-symbols-outlined">error</span>
              <span class="text-xs font-bold uppercase tracking-widest">Revision Needed</span>
            </div>
            <h3 class="text-xl font-bold">${esc(d.project?.name || 'Unknown Project')}</h3>
            <p class="text-on-surface-variant text-xs font-semibold mt-1 mb-2">${esc(d.title)} · ${esc(d.drawing_type)}</p>
            <p class="text-on-surface-variant text-sm leading-relaxed">"${esc(comment)}" — ${esc(reviewer)}</p>
          </div>
          <a href="/designer?projectId=${esc(d.project_id)}" class="mt-6 w-fit bg-on-surface text-surface py-2 px-6 rounded-lg font-bold text-sm hover:opacity-90 transition-opacity no-underline inline-block">
            Open Revision
          </a>
        </div>`;
    }).join('');
  }

  // ── Task Table ──────────────────────────────────────────────────────────────
  document.getElementById('tasksSkeleton').style.display = 'none';
  if (!tasks.length && !revisions.length && !pendingAssignments.length && !pendingApprovalAssignments.length) {
    document.getElementById('tasksEmpty').style.display = '';
  } else {
    const tbody = document.getElementById('tasksBody');
    const today = new Date().toDateString();

    const revisionRows = revisions.map(d => {
      const reviewer = d.drawing_reviews?.[0]?.reviewer?.full_name || 'Design Lead';
      const comment  = d.drawing_reviews?.[0]?.comments || '';
      return `
        <tr class="transition-colors" style="background:#fffbeb">
          <td class="px-5 py-4">
            <div class="font-semibold text-on-surface text-sm">${esc(d.title)}</div>
            <div class="text-[10px] text-on-surface-variant mt-0.5">${esc(d.project?.name || '—')} · ${esc(d.drawing_type)} · v${d.version_number || 1}</div>
            ${comment ? `<div class="text-[10px] text-on-surface-variant/70 mt-0.5 italic">"${esc(comment)}" — ${esc(reviewer)}</div>` : ''}
          </td>
          <td class="px-5 py-4"><span class="text-[10px] text-on-surface-variant">—</span></td>
          <td class="px-5 py-4"><span class="text-[10px] font-bold" style="color:#d97706">Now</span></td>
          <td class="px-5 py-4">
            <span class="text-[10px] font-bold px-2 py-1 rounded-full" style="background:#fef3c7;color:#d97706">🔁 Requested Revision</span>
          </td>
          <td class="px-5 py-4 text-right">
            <div class="flex items-center gap-2 justify-end">
              <button class="quick-upload-btn text-[11px] font-bold px-3 py-1.5 rounded-lg cursor-pointer border-none" style="background:linear-gradient(135deg,#d97706,#92400e);color:#fff" data-project-id="${esc(d.project_id)}" data-drawing-type="${esc(d.drawing_type)}" data-is-revision="1">Upload Revision</button>
              <a href="/project?id=${esc(d.project_id)}" class="text-on-surface-variant font-semibold text-xs hover:underline">Open</a>
            </div>
          </td>
        </tr>`;
    });

    const taskRows = tasks.map(t => {
      const dueStr    = t.due_date ? new Date(t.due_date).toDateString() : null;
      const isToday   = dueStr === today;
      const isOverdue = t.due_date && new Date(t.due_date) < new Date() && !isToday;
      const dueLabel  = isOverdue  ? `<span class="text-[10px] font-bold text-error">Overdue</span>`
                      : isToday    ? `<span class="text-[10px] font-bold text-error">Due Today</span>`
                      : t.due_date ? `<span class="text-[10px] text-on-surface-variant">${fmtDt(t.due_date)}</span>`
                      :              `<span class="text-[10px] text-on-surface-variant">—</span>`;
      const statusMap = { pending: 'bg-surface-container text-on-surface-variant', in_progress: 'bg-tertiary-container text-tertiary', completed: 'bg-primary-container text-primary' };
      const statusCls = statusMap[t.status] || statusMap.pending;
      return `
        <tr class="hover:bg-surface-container-low transition-colors">
          <td class="px-5 py-4">
            <div class="font-semibold text-on-surface text-sm">${esc(t.title)}</div>
            <div class="text-[10px] text-on-surface-variant mt-0.5">${esc(t.project?.name || '—')}</div>
          </td>
          <td class="px-5 py-4">
            <span class="text-[10px] text-on-surface-variant">${fmtDt(t.created_at)}</span>
            ${t.assigner?.full_name ? `<div class="text-[9px] text-on-surface-variant/60 mt-0.5">by ${esc(t.assigner.full_name)}</div>` : ''}
          </td>
          <td class="px-5 py-4">${dueLabel}</td>
          <td class="px-5 py-4">
            <span class="${statusCls} text-[10px] font-bold px-2 py-1 rounded-full uppercase">${esc(t.status || 'pending')}</span>
          </td>
          <td class="px-5 py-4 text-right">
            ${t.project?.id
              ? `<a href="/project?id=${esc(t.project.id)}" class="text-primary font-semibold text-xs hover:underline">Open →</a>`
              : `<span class="text-on-surface-variant text-xs">—</span>`}
          </td>
        </tr>`;
    });

    const pendingUploadRows = pendingAssignments.map(a => {
      const isOverdue = a.deadline && new Date(a.deadline) < new Date();
      const deadlineLabel = a.deadline
        ? `<span class="text-[10px] ${isOverdue ? 'font-bold' : ''}" style="${isOverdue ? 'color:#9f403d' : ''}">${fmtDt(a.deadline)}${isOverdue ? ' ⚠' : ''}</span>`
        : `<span class="text-[10px] text-on-surface-variant">—</span>`;
      return `
        <tr class="hover:bg-surface-container-low transition-colors">
          <td class="px-5 py-4">
            <div class="font-semibold text-on-surface text-sm">${esc(a.drawing_type)}</div>
            <div class="text-[10px] text-on-surface-variant mt-0.5">${esc(a.project?.name || '—')}${a.project?.client_name ? ' · ' + esc(a.project.client_name) : ''}</div>
          </td>
          <td class="px-5 py-4">
            <span class="text-[10px] text-on-surface-variant">${fmtDt(a.assigned_at)}</span>
            ${a.assigner?.full_name ? `<div class="text-[9px] text-on-surface-variant/60 mt-0.5">by ${esc(a.assigner.full_name)}</div>` : ''}
          </td>
          <td class="px-5 py-4">${deadlineLabel}</td>
          <td class="px-5 py-4">
            <span class="bg-surface-container text-on-surface-variant text-[10px] font-bold px-2 py-1 rounded-full uppercase">⬆ Pending Upload</span>
          </td>
          <td class="px-5 py-4 text-right">
            <div class="flex items-center gap-2 justify-end">
              <button class="quick-upload-btn text-[11px] font-bold px-3 py-1.5 rounded-lg cursor-pointer border-none" style="background:linear-gradient(135deg,#526258,#46564c);color:#eafcef" data-project-id="${esc(a.project_id)}" data-drawing-type="${esc(a.drawing_type)}">Upload</button>
              <a href="/project?id=${esc(a.project_id)}" class="text-on-surface-variant font-semibold text-xs hover:underline">Open</a>
            </div>
          </td>
        </tr>`;
    });

    const pendingApprovalRows = pendingApprovalAssignments.map(a => {
      const isOverdue = a.deadline && new Date(a.deadline) < new Date();
      const deadlineLabel = a.deadline
        ? `<span class="text-[10px] ${isOverdue ? 'font-bold' : ''}" style="${isOverdue ? 'color:#9f403d' : ''}">${fmtDt(a.deadline)}${isOverdue ? ' ⚠' : ''}</span>`
        : `<span class="text-[10px] text-on-surface-variant">—</span>`;
      return `
        <tr class="hover:bg-surface-container-low transition-colors">
          <td class="px-5 py-4">
            <div class="font-semibold text-on-surface text-sm">${esc(a.drawing_type)}</div>
            <div class="text-[10px] text-on-surface-variant mt-0.5">${esc(a.project?.name || '—')}${a.project?.client_name ? ' · ' + esc(a.project.client_name) : ''}</div>
          </td>
          <td class="px-5 py-4">
            <span class="text-[10px] text-on-surface-variant">${fmtDt(a.assigned_at)}</span>
            ${a.assigner?.full_name ? `<div class="text-[9px] text-on-surface-variant/60 mt-0.5">by ${esc(a.assigner.full_name)}</div>` : ''}
          </td>
          <td class="px-5 py-4">${deadlineLabel}</td>
          <td class="px-5 py-4">
            <span class="text-[10px] font-bold px-2 py-1 rounded-full" style="background:#fef9c3;color:#a16207">⏳ Pending Approval</span>
          </td>
          <td class="px-5 py-4 text-right">
            <a href="/project?id=${esc(a.project_id)}" class="text-primary font-semibold text-xs hover:underline">Open →</a>
          </td>
        </tr>`;
    });

    tbody.innerHTML = [...revisionRows, ...pendingUploadRows, ...pendingApprovalRows, ...taskRows].join('');
    document.getElementById('tasksTable').style.display = '';
    tbody.querySelectorAll('.quick-upload-btn').forEach(btn => {
      btn.addEventListener('click', () => openQuickUpload(btn.dataset.projectId, btn.dataset.drawingType, btn.dataset.isRevision === '1'));
    });
  }

  // ── Drawing Assignment Timeline (paginated) ──────────────────────────────────
  document.getElementById('timelineSkeleton').style.display = 'none';
  if (!assignments.length) {
    document.getElementById('timelineEmpty').style.display = '';
  } else {
    const statusCfg = {
      assigned:           { style: 'background:#f1f5f9;color:#475569',           label: 'Not Uploaded' },
      pending_review:     { style: 'background:#fef9c3;color:#a16207',           label: 'Approval Pending' },
      approved:           { style: 'background:#dcfce7;color:#166534',           label: 'Approved' },
      rejected:           { style: 'background:#fee2e2;color:#991b1b',           label: 'Rejected' },
      revision_requested: { style: 'background:#fef3c7;color:#d97706',           label: 'Revision Requested' },
    };

    let tlPage = 0;
    let tlPageSize = 5;

    function renderTimeline() {
      const start  = tlPage * tlPageSize;
      const slice  = assignments.slice(start, start + tlPageSize);
      const total  = assignments.length;
      const pages  = Math.ceil(total / tlPageSize);
      const tbody  = document.getElementById('timelineBody');
      tbody.innerHTML = slice.map(a => {
        const cfg = statusCfg[a.status] || { style: 'background:#f1f5f9;color:#475569', label: a.status };
        const isOverdue = a.due_date && !['approved'].includes(a.status) && new Date(a.due_date) < new Date();
        const deadlineCell = a.due_date
          ? `<span class="${isOverdue ? 'text-error font-bold' : 'text-on-surface-variant'} text-[10px]">${fmtDt(a.due_date)}${isOverdue ? ' ⚠' : ''}</span>`
          : `<span class="text-on-surface-variant text-[10px]">—</span>`;
        return `
          <tr class="hover:bg-surface-container-low transition-colors">
            <td class="px-5 py-4">
              <div class="font-semibold text-on-surface text-sm">${esc(a.drawing_type)}</div>
              <div class="text-[10px] text-on-surface-variant mt-0.5">${esc(a.project?.name || '—')}${a.project?.client_name ? ' · ' + esc(a.project.client_name) : ''}</div>
            </td>
            <td class="px-5 py-4">
              <span class="text-[10px] font-bold px-2 py-1 rounded-full" style="${cfg.style}">${cfg.label}</span>
            </td>
            <td class="px-5 py-4">
              <span class="text-[10px] text-on-surface-variant">${fmtDt(a.assigned_at)}</span>
              ${a.assigner?.full_name ? `<div class="text-[9px] text-on-surface-variant/60 mt-0.5">by ${esc(a.assigner.full_name)}</div>` : ''}
            </td>
            <td class="px-5 py-4">${deadlineCell}</td>
            <td class="px-5 py-4">
              <span class="text-[10px] ${a.submitted_at ? 'text-on-surface-variant' : 'text-on-surface-variant/40'}">${fmtDt(a.submitted_at)}</span>
            </td>
            <td class="px-5 py-4">
              <span class="text-[10px] ${a.completed_at ? 'text-primary font-semibold' : 'text-on-surface-variant/40'}">${fmtDt(a.completed_at)}</span>
            </td>
            <td class="px-5 py-4 text-right">
              <a href="/project?id=${esc(a.project_id)}" class="text-primary font-semibold text-xs hover:underline">Open →</a>
            </td>
          </tr>`;
      }).join('');

      document.getElementById('tlPageInfo').textContent =
        `${start + 1}–${Math.min(start + tlPageSize, total)} of ${total}`;
      document.getElementById('tlPrevBtn').disabled = tlPage === 0;
      document.getElementById('tlNextBtn').disabled = tlPage >= pages - 1;
    }

    // Inject pagination bar above the table
    const paginationBar = document.createElement('div');
    paginationBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:12px;flex-wrap:wrap';
    paginationBar.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:11px;color:#5a6061;font-weight:600">Rows per page:</span>
        <select id="tlPageSizeSelect" style="font-size:11px;padding:3px 8px;border:1px solid #dde4e5;border-radius:6px;background:#fff;color:#2d3435;outline:none;cursor:pointer">
          <option value="5" selected>5</option>
          <option value="10">10</option>
        </select>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span id="tlPageInfo" style="font-size:11px;color:#5a6061"></span>
        <button id="tlPrevBtn" style="padding:3px 10px;border:1px solid #dde4e5;border-radius:6px;background:#fff;font-size:12px;cursor:pointer;font-weight:700;color:#526258" disabled>‹ Prev</button>
        <button id="tlNextBtn" style="padding:3px 10px;border:1px solid #dde4e5;border-radius:6px;background:#fff;font-size:12px;cursor:pointer;font-weight:700;color:#526258">Next ›</button>
      </div>`;
    document.getElementById('timelineTable').before(paginationBar);

    document.getElementById('tlPageSizeSelect').addEventListener('change', e => {
      tlPageSize = parseInt(e.target.value, 10);
      tlPage = 0;
      renderTimeline();
    });
    document.getElementById('tlPrevBtn').addEventListener('click', () => { tlPage--; renderTimeline(); });
    document.getElementById('tlNextBtn').addEventListener('click', () => { tlPage++; renderTimeline(); });

    document.getElementById('timelineTable').style.display = '';
    renderTimeline();
  }

  // ── Project Context Cards ───────────────────────────────────────────────────
  document.getElementById('projectCardsSkeleton').style.display = 'none';
  if (!projects.length) {
    document.getElementById('projectsEmpty').style.display = '';
  } else {
    document.getElementById('projectCards').style.display = '';
    document.getElementById('projectCards').innerHTML = projects.slice(0, 6).map(p => `
      <div class="bg-white p-4 rounded-xl border border-surface-container flex items-center gap-4">
        <div class="h-14 w-14 bg-surface-container rounded-lg flex-shrink-0 flex items-center justify-center">
          <span class="material-symbols-outlined text-primary text-2xl">home_work</span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-[10px] font-bold text-primary uppercase tracking-widest">Stage 2: Design Dev</p>
          <h4 class="font-bold text-on-surface text-sm truncate">${esc(p.name || 'Untitled')}</h4>
          ${p.client_name ? `<p class="text-xs text-on-surface-variant mt-0.5">${esc(p.client_name)}</p>` : ''}
          <a class="text-xs font-semibold text-on-surface-variant hover:text-primary mt-1 inline-flex items-center gap-1 transition-colors" href="/project?id=${esc(p.id)}">
            Open Project <span class="material-symbols-outlined text-[12px]">east</span>
          </a>
        </div>
      </div>`).join('');
  }

  // ── Quick Upload Modal ──────────────────────────────────────────────────────
  let _quProjectId = null, _quDrawingType = null;

  function openQuickUpload(projectId, drawingType, isRevision) {
    _quProjectId   = projectId;
    _quDrawingType = drawingType;
    document.getElementById('quTitle').value = '';
    document.getElementById('quDesc').value  = '';
    document.getElementById('quFile').value  = '';
    document.getElementById('quErr').style.display = 'none';
    document.getElementById('quTypeLabel').textContent = drawingType;
    document.getElementById('quHeading').textContent   = isRevision ? 'Upload Revision' : 'Upload Drawing';
    const sub = document.getElementById('quSubmit');
    sub.style.background = isRevision
      ? 'linear-gradient(135deg,#d97706,#92400e)'
      : 'linear-gradient(135deg,#526258,#46564c)';
    sub.textContent = isRevision ? 'Replace File' : 'Upload';
    document.getElementById('quickUploadModal').style.display = 'flex';
  }

  function closeQuickUpload() {
    document.getElementById('quickUploadModal').style.display = 'none';
  }

  document.getElementById('quClose').addEventListener('click', closeQuickUpload);
  document.getElementById('quCancel').addEventListener('click', closeQuickUpload);
  document.getElementById('quSubmit').addEventListener('click', async () => {
    const btn   = document.getElementById('quSubmit');
    const errEl = document.getElementById('quErr');
    errEl.style.display = 'none';
    const file = document.getElementById('quFile').files[0];
    if (!file) { errEl.textContent = 'Please select a file.'; errEl.style.display = 'block'; return; }
    const title = document.getElementById('quTitle').value.trim() || _quDrawingType;
    const origText = btn.textContent;
    btn.disabled = true; btn.textContent = 'Uploading…';
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await studioFetch('/api/drawings/upload', {
        method: 'POST',
        body: JSON.stringify({
          projectId:     _quProjectId,
          drawingType:   _quDrawingType,
          title,
          description:   document.getElementById('quDesc').value.trim(),
          fileBase64:    base64,
          fileName:      file.name,
          fileSizeBytes: file.size,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Upload failed.'); }
      closeQuickUpload();
      location.reload();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = origText;
    }
  });

})();
