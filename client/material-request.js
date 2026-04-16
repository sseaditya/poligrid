// ─── Material Request Page ────────────────────────────────────────────────────
// Handles: edit (supervisor), approval (lead/admin), procurement (procurement role)
// URL: /material_request?id=<requestId>
// Requires: client/studio-utils.js, client/auth.js, client/nav.js

let _profile, _request, _items = [], _reviews = [];
const _requestId = new URLSearchParams(location.search).get('id');

const CATEGORIES = [
  'Civil','Electrical','Plumbing','HVAC',
  'Flooring','Furniture/Joinery','Doors & Windows','Miscellaneous',
];

const ROLE_CAN = {
  edit:       p => ['site_supervisor','admin'].includes(p.role),
  approve:    p => ['lead_designer','admin'].includes(p.role),
  procure:    p => ['procurement','admin'].includes(p.role),
  view:       p => ['site_supervisor','lead_designer','admin','procurement'].includes(p.role),
};

(async () => {
  AppNav.mountSidebar('MATERIAL REQUEST');

  try {
    const auth = await AuthClient.requireAuth(['site_supervisor','lead_designer','admin','procurement']);
    _profile = auth.profile;
  } catch { return; }

  AppNav.renderSidebar(_profile, document.getElementById('sidebarNav'));
  AppNav.renderMobileNav(_profile, document.getElementById('mobileNav'));
  AppNav.setupUserSection(_profile);
  AppNav.setupCollapse();

  if (!_requestId) {
    renderError('No request ID specified.');
    return;
  }

  await loadRequest();
})();

// ─── Load request + items + reviews ──────────────────────────────────────────
async function loadRequest() {
  const res = await studioFetch(`/api/material-requests/get?id=${_requestId}`);
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    renderError(d.error || 'Failed to load request.');
    return;
  }
  const data = await res.json();
  _request = data.request;
  _items   = data.items   || [];
  _reviews = data.reviews || [];

  // Top bar breadcrumb
  const topBar = document.getElementById('topBarTitle');
  if (topBar) {
    topBar.innerHTML = `
      <a href="/projects" class="text-on-surface-variant hover:text-on-surface text-sm">Projects</a>
      <span class="material-symbols-outlined text-on-surface-variant/40 text-[14px]">chevron_right</span>
      <a href="/project?id=${_request.project?.id || ''}" class="text-on-surface-variant hover:text-on-surface text-sm">${esc(_request.project?.name || 'Project')}</a>
      <span class="material-symbols-outlined text-on-surface-variant/40 text-[14px]">chevron_right</span>
      <span class="font-headline font-extrabold text-on-background text-sm">${esc(_request.title)}</span>
    `;
  }

  renderPage();
}

// ─── Main page render ─────────────────────────────────────────────────────────
function renderPage() {
  const status   = _request.status;
  const canEdit  = ROLE_CAN.edit(_profile)    && (status === 'draft' || status === 'revision_requested');
  const canApprove  = ROLE_CAN.approve(_profile) && status === 'pending_approval';
  const canProcure  = ROLE_CAN.procure(_profile) && status === 'approved';
  const isReadOnly  = !canEdit && !canProcure;

  // PDF button
  const pdfBtn = document.getElementById('pdfBtn');
  if (status === 'approved' || ROLE_CAN.approve(_profile)) {
    pdfBtn.style.display = 'inline-flex';
    pdfBtn.addEventListener('click', () => window.print());
  }

  const content = document.getElementById('pageContent');
  content.innerHTML = buildHeader(canEdit, canApprove) + buildBody(canEdit, canProcure, isReadOnly);

  wireActions(canEdit, canApprove);

  // Expand/collapse category sections
  content.querySelectorAll('.category-header').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const body = hdr.nextElementSibling;
      const icon = hdr.querySelector('.cat-chevron');
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      if (icon) icon.style.transform = isOpen ? 'rotate(-90deg)' : '';
    });
  });

  // Wire "Add Item" buttons per category (edit mode)
  if (canEdit) {
    content.querySelectorAll('.add-item-btn').forEach(btn => {
      btn.addEventListener('click', () => openAddItemModal(btn.dataset.category));
    });

    // Wire delete buttons
    content.querySelectorAll('.delete-item-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteItem(btn.dataset.id));
    });

    // Inline edit: save on blur
    content.querySelectorAll('.item-field').forEach(inp => {
      inp.addEventListener('change', () => saveItemField(inp));
    });
  }

  // Procurement: mark procured checkboxes
  if (canProcure) {
    content.querySelectorAll('.procure-checkbox').forEach(cb => {
      cb.addEventListener('change', () => toggleProcured(cb));
    });
  }
}

// ─── Header section ───────────────────────────────────────────────────────────
function buildHeader(canEdit, canApprove) {
  const st   = _request.status;
  const sub  = _request.submitter?.full_name || '—';
  const apr  = _request.approver?.full_name  || '—';

  const latestReview = _reviews[0];

  const revisionBanner = (st === 'revision_requested' && latestReview) ? `
    <div class="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
      <span class="material-symbols-outlined text-error flex-shrink-0">feedback</span>
      <div>
        <p class="font-semibold text-error text-sm">Revision Requested by ${esc(latestReview.reviewer?.full_name || '—')}</p>
        <p class="text-sm text-on-surface mt-1">${esc(latestReview.comments || 'No comments provided.')}</p>
        <p class="text-xs text-on-surface-variant mt-1">${fmtDt(latestReview.reviewed_at)}</p>
      </div>
    </div>` : '';

  const approvedBanner = (st === 'approved') ? `
    <div class="bg-primary-container rounded-xl p-4 flex gap-3">
      <span class="material-symbols-outlined text-primary flex-shrink-0">verified</span>
      <div>
        <p class="font-semibold text-primary text-sm">Approved by ${esc(apr)}</p>
        <p class="text-xs text-on-surface-variant mt-0.5">${fmtDt(_request.approved_at)}</p>
        ${latestReview?.comments ? `<p class="text-sm text-on-surface mt-1">"${esc(latestReview.comments)}"</p>` : ''}
      </div>
    </div>` : '';

  const actionBtns = canEdit
    ? `<div class="flex gap-3 flex-wrap">
         <button id="submitBtn" class="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white" style="background:linear-gradient(135deg,#526258,#46564c)">
           <span class="material-symbols-outlined text-[16px]">send</span> Submit for Approval
         </button>
       </div>`
    : canApprove
    ? `<div class="flex gap-3 flex-wrap">
         <button id="openReviewBtn" class="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white" style="background:linear-gradient(135deg,#526258,#46564c)">
           <span class="material-symbols-outlined text-[16px]">rate_review</span> Submit Review
         </button>
       </div>`
    : '';

  const procureProgress = _request.status === 'approved' ? (() => {
    const total   = _items.length;
    const procured = _items.filter(i => i.procured).length;
    const pct = total ? Math.round((procured/total)*100) : 0;
    return `
      <div class="flex items-center gap-3">
        <div class="flex-1 bg-surface-container-high rounded-full h-2">
          <div class="bg-primary rounded-full h-2 transition-all" style="width:${pct}%"></div>
        </div>
        <span class="text-sm font-semibold text-on-surface-variant">${procured}/${total} procured</span>
      </div>`;
  })() : '';

  return `
    <div class="print-only" style="margin-bottom:24px">
      <h1 style="font-family:Manrope;font-size:22px;font-weight:800;margin:0">${esc(_request.title)}</h1>
      <p style="font-size:13px;color:#5a6061;margin:4px 0 0">${esc(_request.project?.name||'')} · ${esc(_request.project?.client_name||'')} · v${_request.version_number}</p>
    </div>

    <div class="space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-3 flex-wrap">
            <h1 class="font-headline font-extrabold text-3xl text-on-surface no-print">${esc(_request.title)}</h1>
            <span class="status-badge status-${st} no-print">${statusLabel(st)}</span>
          </div>
          <p class="text-on-surface-variant text-sm mt-1 no-print">
            v${_request.version_number} · ${esc(_request.project?.name||'—')} · ${esc(_request.project?.client_name||'')}
          </p>
          <p class="text-xs text-on-surface-variant mt-1">
            Submitted by <strong>${esc(sub)}</strong>
            ${_request.submitted_at ? ` · ${fmtDt(_request.submitted_at)}` : ''}
          </p>
        </div>
        <div class="flex-shrink-0 no-print">${actionBtns}</div>
      </div>
      ${revisionBanner}
      ${approvedBanner}
      ${procureProgress ? `<div class="bg-surface-container-lowest rounded-xl p-4 no-print">${procureProgress}</div>` : ''}
    </div>`;
}

// ─── Items body ───────────────────────────────────────────────────────────────
function buildBody(canEdit, canProcure, isReadOnly) {
  // Group items by category
  const grouped = {};
  CATEGORIES.forEach(c => { grouped[c] = []; });
  _items.forEach(item => {
    const cat = item.category || 'Miscellaneous';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });

  // Compute totals
  const grandTotal = _items.reduce((s, i) => s + ((i.quantity || 0) * (i.estimated_rate || 0)), 0);
  const totalItems = _items.length;

  const categorySections = CATEGORIES.map(cat => {
    const catItems = grouped[cat] || [];
    const catTotal = catItems.reduce((s, i) => s + ((i.quantity||0)*(i.estimated_rate||0)), 0);
    const hasItems = catItems.length > 0;

    const rows = catItems.map(item => buildItemRow(item, canEdit, canProcure)).join('');

    const addBtnHtml = canEdit
      ? `<button class="add-item-btn flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline px-4 py-3" data-category="${esc(cat)}">
           <span class="material-symbols-outlined text-[14px]">add</span> Add item
         </button>`
      : '';

    const emptyHtml = !hasItems && !canEdit
      ? `<p class="text-xs text-on-surface-variant px-4 py-3 italic">No items in this category.</p>`
      : '';

    return `
      <div class="category-section">
        <div class="category-header" tabindex="0" role="button" aria-expanded="${hasItems ? 'true' : 'false'}">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-primary text-[18px]">${categoryIcon(cat)}</span>
            <span class="font-headline font-bold text-sm">${esc(cat)}</span>
            <span class="text-xs text-on-surface-variant">(${catItems.length} item${catItems.length!==1?'s':''})</span>
          </div>
          <div class="flex items-center gap-3">
            ${catTotal > 0 ? `<span class="text-xs font-bold text-on-surface-variant">₹${fmtNum(catTotal)}</span>` : ''}
            <span class="material-symbols-outlined text-on-surface-variant text-[18px] cat-chevron transition-transform">expand_more</span>
          </div>
        </div>
        <div class="category-body" style="${!hasItems && !canEdit ? 'display:none' : ''}">
          ${hasItems ? `
          <div class="overflow-x-auto">
            <table class="items-table">
              <thead>
                <tr>
                  ${canProcure ? '<th style="width:32px"></th>' : ''}
                  <th>Item</th>
                  <th>Description</th>
                  <th style="width:80px;text-align:right">Qty</th>
                  <th style="width:80px">Unit</th>
                  <th style="width:100px;text-align:right">Rate (₹)</th>
                  <th style="width:100px;text-align:right">Amount (₹)</th>
                  ${canEdit ? '<th style="width:40px"></th>' : ''}
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>` : ''}
          ${emptyHtml}
          ${addBtnHtml}
        </div>
      </div>`;
  }).join('');

  // Print-only approval block
  const approvalBlock = _request.status === 'approved' ? `
    <div class="print-only" style="margin-top:32px;border-top:2px solid #ccc;padding-top:16px">
      <h3 style="font-family:Manrope;font-size:14px;font-weight:700;margin-bottom:8px">Approval</h3>
      <p style="font-size:12px">Approved by: <strong>${esc(_request.approver?.full_name||'—')}</strong></p>
      <p style="font-size:12px">Date: ${_request.approved_at ? fmtDt(_request.approved_at) : '—'}</p>
      ${_reviews[0]?.comments ? `<p style="font-size:12px">Comments: ${esc(_reviews[0].comments)}</p>` : ''}
    </div>` : '';

  return `
    <div>
      ${categorySections}
      <div class="bg-surface-container-lowest rounded-xl p-5 flex items-center justify-between mt-4">
        <div class="text-sm text-on-surface-variant">
          Total: <strong class="text-on-surface">${totalItems} items</strong>
        </div>
        <div class="text-right">
          <p class="text-xs text-on-surface-variant uppercase tracking-widest font-bold">Estimated Total</p>
          <p class="text-2xl font-headline font-extrabold text-on-surface">₹${fmtNum(grandTotal)}</p>
        </div>
      </div>
      ${approvalBlock}
    </div>`;
}

// ─── Single item row ──────────────────────────────────────────────────────────
function buildItemRow(item, canEdit, canProcure) {
  const amount = (item.quantity || 0) * (item.estimated_rate || 0);
  const procuredClass = item.procured ? 'opacity-50' : '';

  if (canEdit) {
    return `
      <tr class="item-row ${procuredClass}" data-id="${item.id}">
        <td>
          <input class="item-field w-full" data-id="${item.id}" data-field="item_name"
                 type="text" value="${escAttr(item.item_name)}" placeholder="Item name"/>
        </td>
        <td>
          <input class="item-field w-full" data-id="${item.id}" data-field="description"
                 type="text" value="${escAttr(item.description||'')}" placeholder="Description"/>
        </td>
        <td>
          <input class="item-field w-16" data-id="${item.id}" data-field="quantity"
                 type="number" step="any" value="${item.quantity ?? ''}" placeholder="0"/>
        </td>
        <td>
          <input class="item-field w-16" data-id="${item.id}" data-field="unit"
                 type="text" value="${escAttr(item.unit||'')}" placeholder="unit"/>
        </td>
        <td>
          <input class="item-field w-24" data-id="${item.id}" data-field="estimated_rate"
                 type="number" step="any" value="${item.estimated_rate ?? ''}" placeholder="0"/>
        </td>
        <td style="text-align:right">
          <span class="item-amount text-sm font-semibold" data-id="${item.id}">${fmtNum(amount)}</span>
        </td>
        <td>
          <button class="delete-item-btn text-error hover:opacity-70" data-id="${item.id}" title="Delete">
            <span class="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </td>
      </tr>`;
  }

  if (canProcure) {
    return `
      <tr class="item-row ${item.procured ? 'opacity-50' : ''}" data-id="${item.id}">
        <td>
          <input type="checkbox" class="procure-checkbox accent-primary w-4 h-4"
                 data-id="${item.id}" ${item.procured ? 'checked' : ''} />
        </td>
        <td class="${item.procured ? 'line-through' : ''}">${esc(item.item_name)}</td>
        <td class="text-on-surface-variant text-xs">${esc(item.description||'')}</td>
        <td style="text-align:right">${item.quantity ?? '—'}</td>
        <td>${esc(item.unit||'')}</td>
        <td style="text-align:right">${item.estimated_rate != null ? '₹'+fmtNum(item.estimated_rate) : '—'}</td>
        <td style="text-align:right">${amount > 0 ? '₹'+fmtNum(amount) : '—'}</td>
      </tr>`;
  }

  // Read-only view
  return `
    <tr class="item-row">
      <td>${esc(item.item_name)}</td>
      <td class="text-on-surface-variant text-xs">${esc(item.description||'')}</td>
      <td style="text-align:right">${item.quantity ?? '—'}</td>
      <td>${esc(item.unit||'')}</td>
      <td style="text-align:right">${item.estimated_rate != null ? '₹'+fmtNum(item.estimated_rate) : '—'}</td>
      <td style="text-align:right">${amount > 0 ? '₹'+fmtNum(amount) : '—'}</td>
    </tr>`;
}

// ─── Wire buttons ─────────────────────────────────────────────────────────────
function wireActions(canEdit, canApprove) {
  // Submit button
  document.getElementById('submitBtn')?.addEventListener('click', openSubmitModal);
  document.getElementById('submitCancel')?.addEventListener('click', () => closeModal('submitModal'));
  document.getElementById('submitConfirm')?.addEventListener('click', doSubmit);

  // Review button
  document.getElementById('openReviewBtn')?.addEventListener('click', () => {
    document.getElementById('reviewModal').style.removeProperty('display');
  });
  document.getElementById('reviewCancel')?.addEventListener('click', () => closeModal('reviewModal'));
  document.getElementById('reviewSubmit')?.addEventListener('click', doReview);

  // Add item modal
  document.getElementById('addItemClose')?.addEventListener('click', () => closeModal('addItemModal'));
  document.getElementById('addItemCancel')?.addEventListener('click', () => closeModal('addItemModal'));
  document.getElementById('addItemSave')?.addEventListener('click', doAddItem);
}

// ─── Submit modal ─────────────────────────────────────────────────────────────
function openSubmitModal() {
  const grouped = {};
  CATEGORIES.forEach(c => { grouped[c] = 0; });
  _items.forEach(i => { grouped[i.category] = (grouped[i.category]||0) + 1; });
  const grandTotal = _items.reduce((s, i) => s + ((i.quantity||0)*(i.estimated_rate||0)), 0);

  const rows = CATEGORIES
    .filter(c => grouped[c] > 0)
    .map(c => `<div class="flex justify-between text-sm"><span>${esc(c)}</span><strong>${grouped[c]} items</strong></div>`)
    .join('');

  document.getElementById('submitSummary').innerHTML = `
    ${rows}
    <div class="border-t border-outline-variant pt-2 mt-2 flex justify-between text-sm font-bold">
      <span>Total (${_items.length} items)</span>
      <span>₹${fmtNum(grandTotal)}</span>
    </div>`;
  document.getElementById('submitModal').style.removeProperty('display');
}

async function doSubmit() {
  const btn = document.getElementById('submitConfirm');
  btn.disabled = true; btn.textContent = 'Submitting…';
  try {
    const res = await studioFetch('/api/material-requests/submit', {
      method: 'POST',
      body: JSON.stringify({ requestId: _requestId }),
    });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Submit failed.'); btn.disabled=false; btn.textContent='Submit →'; return; }
    closeModal('submitModal');
    await loadRequest();
  } catch (e) {
    alert('Network error. Please try again.');
    btn.disabled=false; btn.textContent='Submit →';
  }
}

// ─── Review ───────────────────────────────────────────────────────────────────
async function doReview() {
  const statusEl = document.querySelector('input[name="reviewStatus"]:checked');
  if (!statusEl) { document.getElementById('reviewErr').textContent='Please select a decision.'; document.getElementById('reviewErr').classList.remove('hidden'); return; }
  const comments = document.getElementById('reviewComments').value.trim();
  const btn = document.getElementById('reviewSubmit');
  btn.disabled=true; btn.textContent='Submitting…';
  try {
    const res = await studioFetch('/api/material-requests/review', {
      method: 'POST',
      body: JSON.stringify({ requestId: _requestId, status: statusEl.value, comments }),
    });
    const d = await res.json();
    if (!res.ok) { document.getElementById('reviewErr').textContent=d.error||'Review failed.'; document.getElementById('reviewErr').classList.remove('hidden'); btn.disabled=false; btn.textContent='Submit Review'; return; }
    closeModal('reviewModal');
    await loadRequest();
  } catch { btn.disabled=false; btn.textContent='Submit Review'; }
}

// ─── Add item modal ───────────────────────────────────────────────────────────
function openAddItemModal(category) {
  document.getElementById('addItemCategory').value = category;
  ['aiItemName','aiDescription','aiUnit','aiNotes'].forEach(id => { document.getElementById(id).value = ''; });
  ['aiQty','aiRate'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('addItemErr').classList.add('hidden');
  document.getElementById('addItemModal').style.removeProperty('display');
  document.getElementById('aiItemName').focus();
}

async function doAddItem() {
  const category = document.getElementById('addItemCategory').value;
  const itemName = document.getElementById('aiItemName').value.trim();
  const errEl    = document.getElementById('addItemErr');
  if (!itemName) { errEl.textContent='Item name is required.'; errEl.classList.remove('hidden'); return; }
  errEl.classList.add('hidden');

  const btn = document.getElementById('addItemSave');
  btn.disabled=true; btn.textContent='Adding…';

  const payload = {
    requestId:     _requestId,
    category,
    itemName,
    description:   document.getElementById('aiDescription').value.trim()||null,
    quantity:      parseNumOrNull(document.getElementById('aiQty').value),
    unit:          document.getElementById('aiUnit').value.trim()||null,
    estimatedRate: parseNumOrNull(document.getElementById('aiRate').value),
    notes:         document.getElementById('aiNotes').value.trim()||null,
  };

  try {
    const res = await studioFetch('/api/material-requests/items/upsert', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    if (!res.ok) { errEl.textContent=d.error||'Save failed.'; errEl.classList.remove('hidden'); btn.disabled=false; btn.textContent='Add Item'; return; }
    closeModal('addItemModal');
    _items.push(d.item);
    // If status was revision_requested → server moved to draft; reload
    if (_request.status === 'revision_requested') {
      _request.status = 'draft';
    }
    renderPage();
  } catch { errEl.textContent='Network error.'; errEl.classList.remove('hidden'); btn.disabled=false; btn.textContent='Add Item'; }
}

// ─── Inline item save (on blur) ───────────────────────────────────────────────
const _saveTimers = {};
function saveItemField(inp) {
  const itemId = inp.dataset.id;
  const field  = inp.dataset.field;
  clearTimeout(_saveTimers[itemId]);

  setRowIndicator(itemId, 'saving');

  _saveTimers[itemId] = setTimeout(async () => {
    const item = _items.find(i => i.id === itemId);
    if (!item) return;

    // Update local copy
    const raw = inp.value;
    if (field === 'quantity' || field === 'estimated_rate') {
      item[field] = raw === '' ? null : Number(raw);
    } else {
      item[field] = raw || null;
    }

    // Recompute amount display
    const amt = (item.quantity||0)*(item.estimated_rate||0);
    const amtEl = document.querySelector(`.item-amount[data-id="${itemId}"]`);
    if (amtEl) amtEl.textContent = fmtNum(amt);

    // Recompute grand total & category subtotals
    updateTotals();

    try {
      const res = await studioFetch('/api/material-requests/items/upsert', {
        method: 'POST',
        body: JSON.stringify({
          requestId:     _requestId,
          itemId,
          category:      item.category,
          itemName:      item.item_name,
          description:   item.description,
          quantity:      item.quantity,
          unit:          item.unit,
          estimatedRate: item.estimated_rate,
          notes:         item.notes,
        }),
      });
      if (!res.ok) {
        setRowIndicator(itemId, 'error');
      } else {
        setRowIndicator(itemId, 'saved');
        setTimeout(() => setRowIndicator(itemId, ''), 2000);
      }
    } catch {
      setRowIndicator(itemId, 'error');
    }
  }, 600);
}

function setRowIndicator(itemId, state) {
  const ind = document.querySelector(`[data-row-indicator="${itemId}"]`);
  if (ind) { ind.className = `save-indicator ${state}`; ind.textContent = state === 'saving' ? 'Saving…' : state === 'saved' ? '✓ Saved' : state === 'error' ? 'Error' : ''; }
  // Also update global indicator
  const g = document.getElementById('globalSaveIndicator');
  if (g) { g.className = `save-indicator ${state}`; g.textContent = state === 'saving' ? 'Saving…' : state === 'saved' ? '✓ Saved' : state === 'error' ? 'Save error' : ''; }
}

// ─── Delete item ──────────────────────────────────────────────────────────────
async function deleteItem(itemId) {
  if (!confirm('Remove this item?')) return;
  const res = await studioFetch('/api/material-requests/items/delete', {
    method: 'POST',
    body: JSON.stringify({ itemId, requestId: _requestId }),
  });
  if (res.ok) {
    _items = _items.filter(i => i.id !== itemId);
    renderPage();
  }
}

// ─── Procurement: toggle procured ────────────────────────────────────────────
async function toggleProcured(cb) {
  const itemId  = cb.dataset.id;
  const procured = cb.checked;
  cb.disabled = true;
  try {
    const res = await studioFetch('/api/material-requests/items/mark-procured', {
      method: 'POST',
      body: JSON.stringify({ itemId, procured }),
    });
    if (res.ok) {
      const item = _items.find(i => i.id === itemId);
      if (item) item.procured = procured;
      const row = cb.closest('tr');
      if (row) {
        const nameCell = row.querySelectorAll('td')[1];
        if (nameCell) nameCell.classList.toggle('line-through', procured);
        row.classList.toggle('opacity-50', procured);
      }
      updateProcureProgress();
    }
  } finally { cb.disabled = false; }
}

function updateProcureProgress() {
  const total   = _items.length;
  const procured = _items.filter(i => i.procured).length;
  const pct = total ? Math.round((procured/total)*100) : 0;
  const bar = document.querySelector('.bg-primary.rounded-full.h-2');
  if (bar) bar.style.width = pct + '%';
  const label = document.querySelector('.flex-1.bg-surface-container-high + span');
  if (label) label.textContent = `${procured}/${total} procured`;
}

// ─── Recalculate totals in DOM ────────────────────────────────────────────────
function updateTotals() {
  const grandTotal = _items.reduce((s, i) => s + ((i.quantity||0)*(i.estimated_rate||0)), 0);
  const totalEl = document.querySelector('.text-2xl.font-headline.font-extrabold');
  if (totalEl) totalEl.textContent = '₹' + fmtNum(grandTotal);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function renderError(msg) {
  document.getElementById('pageContent').innerHTML = `
    <div class="bg-red-50 text-error rounded-xl p-6 font-semibold">${esc(msg)}</div>`;
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

function statusLabel(st) {
  return { draft:'Draft', pending_approval:'Pending Approval', approved:'Approved', revision_requested:'Revision Needed' }[st] || st;
}

function categoryIcon(cat) {
  const MAP = {
    'Civil':'foundation','Electrical':'electrical_services','Plumbing':'water_pump',
    'HVAC':'hvac','Flooring':'grid_view','Furniture/Joinery':'chair',
    'Doors & Windows':'door_front','Miscellaneous':'category',
  };
  return MAP[cat] || 'inventory_2';
}

function fmtNum(n) {
  if (!n) return '0';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function escAttr(s) {
  return String(s ?? '').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function parseNumOrNull(s) {
  if (!s || s.trim() === '') return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}
