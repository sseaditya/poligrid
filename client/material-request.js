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
  edit:          p => ['site_supervisor','admin'].includes(p.role),
  approve:       p => ['lead_designer'].includes(p.role),
  procure:       p => ['procurement','admin'].includes(p.role),
  editRate:      p => ['procurement','admin'].includes(p.role),
  approvePricing: p => ['admin'].includes(p.role),
  view:          p => ['site_supervisor','lead_designer','admin','procurement'].includes(p.role),
  seePricing:    p => !['site_supervisor'].includes(p.role), // supervisor can't see rate/amount
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
  const canEdit        = ROLE_CAN.edit(_profile)    && (status === 'draft' || status === 'revision_requested');
  const canApprove     = ROLE_CAN.approve(_profile) && status === 'pending_approval';
  const canProcure     = ROLE_CAN.procure(_profile) && status === 'procurement_active'; // procure checkbox only when active
  const canAssignVendor = ROLE_CAN.procure(_profile) && ['approved','pricing_review','procurement_active'].includes(status);
  const canEditRate    = ROLE_CAN.editRate(_profile) && (status === 'approved' || status === 'pricing_review');
  const canOrderStatus = ROLE_CAN.procure(_profile) && status === 'procurement_active';
  const canApprovePricing = ROLE_CAN.approvePricing(_profile) && status === 'pricing_review';
  const showPricing    = ROLE_CAN.seePricing(_profile);
  const isReadOnly     = !canEdit && !canProcure && !canEditRate;

  // PDF button
  const pdfBtn = document.getElementById('pdfBtn');
  if (status === 'approved' || ROLE_CAN.approve(_profile)) {
    pdfBtn.style.display = 'inline-flex';
    pdfBtn.addEventListener('click', () => window.print());
  }

  const content = document.getElementById('pageContent');
  content.innerHTML = buildHeader(canEdit, canApprove, canEditRate, canApprovePricing, showPricing)
    + buildBody(canEdit, canProcure, canEditRate, canOrderStatus, showPricing, isReadOnly, canAssignVendor);

  wireActions(canEdit, canApprove, canEditRate, canApprovePricing, canOrderStatus);

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
    content.querySelectorAll('.delete-item-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteItem(btn.dataset.id));
    });
    content.querySelectorAll('.item-field').forEach(inp => {
      inp.addEventListener('change', () => saveItemField(inp));
    });
  }

  // Procurement: editable rate fields
  if (canEditRate) {
    content.querySelectorAll('.rate-field').forEach(inp => {
      inp.addEventListener('change', () => saveRateField(inp));
    });
  }

  // Procurement: mark procured checkboxes
  if (canProcure) {
    content.querySelectorAll('.procure-checkbox').forEach(cb => {
      cb.addEventListener('change', () => toggleProcured(cb));
    });
  }

  // Vendor assignment (available from 'approved' status onwards)
  if (canAssignVendor) {
    content.querySelectorAll('.vendor-search-input').forEach(inp => {
      wireVendorCombobox(inp);
    });
    content.querySelectorAll('.vendor-chip').forEach(chip => {
      chip.addEventListener('click', () => openVendorPopup(chip.dataset.vendorId));
    });
    content.querySelectorAll('.vendor-clear-btn').forEach(btn => {
      btn.addEventListener('click', () => clearVendor(btn.dataset.itemId));
    });
  }

  // Order status dropdowns
  if (canOrderStatus) {
    content.querySelectorAll('.order-status-select').forEach(sel => {
      sel.addEventListener('change', () => updateOrderStatus({ itemId: sel.dataset.id, orderStatus: sel.value }));
    });
    content.querySelectorAll('.bulk-category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const status = btn.closest('.category-header').querySelector('.bulk-status-select')?.value;
        if (status) updateOrderStatus({ category: btn.dataset.category, orderStatus: status });
      });
    });
  }
}

// ─── Header section ───────────────────────────────────────────────────────────
function buildHeader(canEdit, canApprove, canEditRate, canApprovePricing, showPricing) {
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

  const approvedBanner = (st === 'approved' && !canEditRate) ? `
    <div class="bg-primary-container rounded-xl p-4 flex gap-3">
      <span class="material-symbols-outlined text-primary flex-shrink-0">verified</span>
      <div>
        <p class="font-semibold text-primary text-sm">Approved by ${esc(apr)}</p>
        <p class="text-xs text-on-surface-variant mt-0.5">${fmtDt(_request.approved_at)}</p>
        ${latestReview?.comments ? `<p class="text-sm text-on-surface mt-1">"${esc(latestReview.comments)}"</p>` : ''}
      </div>
    </div>` : '';

  // Procurement: approved request with pricing needed
  const pricingNeededBanner = (st === 'approved' && canEditRate) ? `
    <div class="rounded-xl p-4 flex gap-3" style="background:#fffbeb;border:1px solid #fde68a">
      <span class="material-symbols-outlined flex-shrink-0" style="color:#92400e">price_change</span>
      <div>
        <p class="font-semibold text-sm" style="color:#92400e">Pricing Required — Add rates for all items below</p>
        <p class="text-xs mt-0.5" style="color:#92400e">Once all items have rates, you can submit for admin approval.</p>
      </div>
    </div>` : '';

  // Procurement: pricing submitted, awaiting admin
  const pricingReviewBanner = (st === 'pricing_review') ? `
    <div class="rounded-xl p-4 flex gap-3" style="background:#f3e8ff;border:1px solid #e9d5ff">
      <span class="material-symbols-outlined flex-shrink-0" style="color:#6d28d9">hourglass_top</span>
      <div>
        <p class="font-semibold text-sm" style="color:#6d28d9">Pricing Submitted — Awaiting Admin Approval</p>
        <p class="text-xs mt-0.5" style="color:#6d28d9">You'll be notified once admin reviews and approves the pricing.</p>
      </div>
    </div>` : '';

  // Admin: pricing review panel
  const pricingApprovalBanner = canApprovePricing ? `
    <div class="rounded-xl p-5 flex flex-col gap-3" style="background:#fef9c3;border:2px solid #fde68a">
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined" style="color:#92400e">admin_panel_settings</span>
        <p class="font-bold text-sm" style="color:#92400e">Procurement Pricing Needs Your Approval</p>
      </div>
      <p class="text-xs" style="color:#78350f">Review the rates below, then approve to allow ordering, or send back for revision.</p>
      <div class="flex gap-3 flex-wrap">
        <button id="approvePricingBtn" class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white" style="background:linear-gradient(135deg,#526258,#46564c)">
          <span class="material-symbols-outlined text-[16px]">check_circle</span> Approve Pricing
        </button>
        <button id="rejectPricingBtn" class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border" style="border-color:#f59e0b;color:#92400e">
          <span class="material-symbols-outlined text-[16px]">undo</span> Send Back for Revision
        </button>
      </div>
      <div id="pricingRejectForm" style="display:none" class="flex flex-col gap-2">
        <textarea id="pricingRejectComments" rows="2" class="w-full rounded-lg border border-outline-variant text-sm p-2" placeholder="Reason for sending back (optional)"></textarea>
        <div class="flex gap-2">
          <button id="pricingRejectConfirm" class="px-4 py-2 rounded-lg text-sm font-semibold text-white" style="background:#9f403d">Send Back</button>
          <button id="pricingRejectCancel" class="px-4 py-2 rounded-lg text-sm font-semibold border border-outline-variant">Cancel</button>
        </div>
      </div>
    </div>` : '';

  // Procurement active: ordering in progress
  const procurementActiveBanner = (st === 'procurement_active') ? `
    <div class="bg-primary-container rounded-xl p-4 flex gap-3">
      <span class="material-symbols-outlined text-primary flex-shrink-0">local_shipping</span>
      <div>
        <p class="font-semibold text-primary text-sm">Pricing Approved — Start Ordering</p>
        <p class="text-xs text-on-surface-variant mt-0.5">Update the order status for each item as you place and receive orders.</p>
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
    : canEditRate && st === 'approved'
    ? `<div class="flex gap-3 flex-wrap">
         <button id="submitPricingBtn" class="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white" style="background:linear-gradient(135deg,#92400e,#78350f)">
           <span class="material-symbols-outlined text-[16px]">send</span> Submit Pricing for Approval
         </button>
       </div>`
    : '';

  const procureProgress = (st === 'approved' || st === 'procurement_active') ? (() => {
    const total    = _items.length;
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
      ${pricingNeededBanner}
      ${pricingReviewBanner}
      ${pricingApprovalBanner}
      ${procurementActiveBanner}
      ${procureProgress ? `<div class="bg-surface-container-lowest rounded-xl p-4 no-print">${procureProgress}</div>` : ''}
    </div>`;
}

// ─── Items body ───────────────────────────────────────────────────────────────
function buildBody(canEdit, canProcure, canEditRate, canOrderStatus, showPricing, isReadOnly, canAssignVendor) {
  const grouped = {};
  CATEGORIES.forEach(c => { grouped[c] = []; });
  _items.forEach(item => {
    const cat = item.category || 'Miscellaneous';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });

  const grandTotal = showPricing ? _items.reduce((s, i) => s + ((i.quantity || 0) * (i.estimated_rate || 0)), 0) : null;
  const totalItems = _items.length;

  const ORDER_STATUS_OPTS = [
    { value: 'pending',    label: 'Pending',    color: '#5a6061', bg: '#f2f4f4' },
    { value: 'ordered',    label: 'Ordered',    color: '#0369a1', bg: '#e0f2fe' },
    { value: 'in_transit', label: 'In Transit', color: '#92400e', bg: '#fffbeb' },
    { value: 'delivered',  label: 'Delivered',  color: '#33433a', bg: '#d5e7da' },
  ];

  const categorySections = CATEGORIES.map(cat => {
    const catItems = grouped[cat] || [];
    const catTotal = showPricing ? catItems.reduce((s, i) => s + ((i.quantity||0)*(i.estimated_rate||0)), 0) : 0;
    const hasItems = catItems.length > 0;

    const rows = catItems.map(item => buildItemRow(item, canEdit, canProcure, canEditRate, canOrderStatus, showPricing, ORDER_STATUS_OPTS, canAssignVendor)).join('');

    const addBtnHtml = canEdit
      ? `<button class="add-item-btn flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline px-4 py-3" data-category="${esc(cat)}">
           <span class="material-symbols-outlined text-[14px]">add</span> Add item
         </button>`
      : '';

    // Bulk status update for procurement_active
    const bulkUpdateHtml = canOrderStatus && hasItems ? `
      <div class="flex items-center gap-2 px-4 py-2 border-t border-outline-variant/20">
        <span class="text-xs text-on-surface-variant font-semibold">Mark all as:</span>
        <select class="bulk-status-select text-xs border border-outline-variant rounded px-2 py-1">
          ${ORDER_STATUS_OPTS.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
        </select>
        <button class="bulk-category-btn text-xs font-bold text-primary hover:underline" data-category="${esc(cat)}">Apply</button>
      </div>` : '';

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
            ${showPricing && catTotal > 0 ? `<span class="text-xs font-bold text-on-surface-variant">₹${fmtNum(catTotal)}</span>` : ''}
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
                  ${showPricing ? `<th style="width:100px;text-align:right">Rate (₹)</th>` : ''}
                  ${showPricing ? `<th style="width:100px;text-align:right">Amount (₹)</th>` : ''}
                  ${canAssignVendor ? '<th style="width:170px">Vendor</th>' : ''}
                  ${canOrderStatus ? '<th style="width:130px">Order Status</th>' : ''}
                  ${canEdit ? '<th style="width:40px"></th>' : ''}
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>` : ''}
          ${emptyHtml}
          ${addBtnHtml}
          ${bulkUpdateHtml}
        </div>
      </div>`;
  }).join('');

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
        ${showPricing ? `
        <div class="text-right">
          <p class="text-xs text-on-surface-variant uppercase tracking-widest font-bold">Estimated Total</p>
          <p class="text-2xl font-headline font-extrabold text-on-surface">₹${fmtNum(grandTotal)}</p>
        </div>` : ''}
      </div>
      ${approvalBlock}
    </div>`;
}

// ─── Single item row ──────────────────────────────────────────────────────────
function buildItemRow(item, canEdit, canProcure, canEditRate, canOrderStatus, showPricing, orderStatusOpts, canAssignVendor) {
  const amount = (item.quantity || 0) * (item.estimated_rate || 0);
  const procuredClass = item.procured ? 'opacity-50' : '';

  // Order status badge/dropdown helper
  function orderStatusCell() {
    if (!canOrderStatus) return '';
    const opts = (orderStatusOpts || []).map(o =>
      `<option value="${o.value}" ${item.order_status === o.value ? 'selected' : ''}>${o.label}</option>`
    ).join('');
    return `<td><select class="order-status-select text-xs border border-outline-variant rounded px-1.5 py-1 w-28" data-id="${item.id}">${opts}</select></td>`;
  }

  function orderStatusBadge() {
    if (!showPricing) return '';
    const opt = (orderStatusOpts || []).find(o => o.value === (item.order_status || 'pending'));
    if (!opt) return '';
    return `<td><span style="background:${opt.bg};color:${opt.color};padding:2px 8px;border-radius:100px;font-size:10px;font-weight:700">${opt.label}</span></td>`;
  }

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
          <button class="delete-item-btn text-error hover:opacity-70" data-id="${item.id}" title="Delete">
            <span class="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </td>
      </tr>`;
  }

  if (canEditRate) {
    // Procurement: rate is editable, rest is read-only
    return `
      <tr class="item-row" data-id="${item.id}">
        <td>${esc(item.item_name)}</td>
        <td class="text-on-surface-variant text-xs">${esc(item.description||'')}</td>
        <td style="text-align:right">${item.quantity ?? '—'}</td>
        <td>${esc(item.unit||'')}</td>
        <td>
          <input class="rate-field w-24 border border-outline-variant rounded px-2 py-1 text-sm text-right"
                 data-id="${item.id}" type="number" step="any"
                 value="${item.estimated_rate ?? ''}" placeholder="Rate"/>
          <span class="rate-indicator text-xs ml-1 text-on-surface-variant" data-rate-indicator="${item.id}"></span>
        </td>
        <td style="text-align:right">
          <span class="item-amount text-sm font-semibold" data-id="${item.id}">${amount > 0 ? '₹'+fmtNum(amount) : '—'}</span>
        </td>
        ${canAssignVendor ? renderVendorCell(item) : ''}
      </tr>`;
  }

  if (canProcure) {
    // Procurement active: read rates, mark procured, assign vendor, update order status
    const vendorCell = renderVendorCell(item);
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
        ${showPricing ? `<td style="text-align:right">${item.estimated_rate != null ? '₹'+fmtNum(item.estimated_rate) : '—'}</td>` : ''}
        ${showPricing ? `<td style="text-align:right">${amount > 0 ? '₹'+fmtNum(amount) : '—'}</td>` : ''}
        <td style="min-width:160px" data-vendor-cell="1">${vendorCell}</td>
        ${orderStatusCell()}
      </tr>`;
  }

  // Read-only view
  return `
    <tr class="item-row">
      <td>${esc(item.item_name)}</td>
      <td class="text-on-surface-variant text-xs">${esc(item.description||'')}</td>
      <td style="text-align:right">${item.quantity ?? '—'}</td>
      <td>${esc(item.unit||'')}</td>
      ${showPricing ? `<td style="text-align:right">${item.estimated_rate != null ? '₹'+fmtNum(item.estimated_rate) : '—'}</td>` : ''}
      ${showPricing ? `<td style="text-align:right">${amount > 0 ? '₹'+fmtNum(amount) : '—'}</td>` : ''}
    </tr>`;
}

// ─── Wire buttons ─────────────────────────────────────────────────────────────
function wireActions(canEdit, canApprove, canEditRate, canApprovePricing, canOrderStatus) {
  // Submit for lead designer approval
  document.getElementById('submitBtn')?.addEventListener('click', openSubmitModal);
  document.getElementById('submitCancel')?.addEventListener('click', () => closeModal('submitModal'));
  document.getElementById('submitConfirm')?.addEventListener('click', doSubmit);

  // Review button (lead designer / admin on pending_approval)
  document.getElementById('openReviewBtn')?.addEventListener('click', () => {
    document.getElementById('reviewModal').style.removeProperty('display');
  });
  document.getElementById('reviewCancel')?.addEventListener('click', () => closeModal('reviewModal'));
  document.getElementById('reviewSubmit')?.addEventListener('click', doReview);

  // Add item modal
  document.getElementById('addItemClose')?.addEventListener('click', () => closeModal('addItemModal'));
  document.getElementById('addItemCancel')?.addEventListener('click', () => closeModal('addItemModal'));
  document.getElementById('addItemSave')?.addEventListener('click', doAddItem);

  // Submit pricing for admin approval
  document.getElementById('submitPricingBtn')?.addEventListener('click', doSubmitPricing);

  // Admin: approve pricing
  document.getElementById('approvePricingBtn')?.addEventListener('click', () => doApprovePricing('procurement_active'));
  document.getElementById('rejectPricingBtn')?.addEventListener('click', () => {
    document.getElementById('pricingRejectForm').style.removeProperty('display');
    document.getElementById('rejectPricingBtn').style.display = 'none';
  });
  document.getElementById('pricingRejectCancel')?.addEventListener('click', () => {
    document.getElementById('pricingRejectForm').style.display = 'none';
    document.getElementById('rejectPricingBtn').style.removeProperty('display');
  });
  document.getElementById('pricingRejectConfirm')?.addEventListener('click', () => {
    const comments = document.getElementById('pricingRejectComments')?.value.trim() || '';
    doApprovePricing('approved', comments);
  });
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
  // Hide rate field for site supervisors
  const rateRow = document.getElementById('aiRateRow');
  if (rateRow) rateRow.style.display = ROLE_CAN.seePricing(_profile) ? '' : 'none';
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

// ─── Procurement: save rate field ────────────────────────────────────────────
const _rateTimers = {};
function saveRateField(inp) {
  const itemId = inp.dataset.id;
  clearTimeout(_rateTimers[itemId]);

  const ind = document.querySelector(`[data-rate-indicator="${itemId}"]`);
  if (ind) { ind.textContent = 'Saving…'; ind.style.color = '#5a6061'; }

  _rateTimers[itemId] = setTimeout(async () => {
    const item = _items.find(i => i.id === itemId);
    if (!item) return;

    const raw = inp.value;
    item.estimated_rate = raw === '' ? null : Number(raw);

    // Recompute amount display
    const amt = (item.quantity||0)*(item.estimated_rate||0);
    const amtEl = document.querySelector(`.item-amount[data-id="${itemId}"]`);
    if (amtEl) amtEl.textContent = amt > 0 ? '₹'+fmtNum(amt) : '—';
    updateTotals();

    try {
      const res = await studioFetch('/api/material-requests/items/upsert', {
        method: 'POST',
        body: JSON.stringify({ requestId: _requestId, itemId, estimatedRate: item.estimated_rate }),
      });
      if (ind) {
        if (res.ok) { ind.textContent = '✓'; ind.style.color = '#33433a'; setTimeout(() => { ind.textContent = ''; }, 2000); }
        else        { ind.textContent = 'Error'; ind.style.color = '#9f403d'; }
      }
    } catch {
      if (ind) { ind.textContent = 'Error'; ind.style.color = '#9f403d'; }
    }
  }, 600);
}

// ─── Procurement: submit pricing for admin approval ───────────────────────────
async function doSubmitPricing() {
  const unpriced = _items.filter(i => i.estimated_rate == null);
  if (unpriced.length) {
    alert(`${unpriced.length} item(s) still need a rate. Please fill all rates before submitting.`);
    return;
  }
  const btn = document.getElementById('submitPricingBtn');
  btn.disabled = true; btn.textContent = 'Submitting…';
  try {
    const res = await studioFetch('/api/material-requests/submit-pricing', {
      method: 'POST',
      body: JSON.stringify({ requestId: _requestId }),
    });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Submit failed.'); btn.disabled=false; btn.innerHTML='<span class="material-symbols-outlined text-[16px]">send</span> Submit Pricing for Approval'; return; }
    await loadRequest();
  } catch (e) {
    alert('Network error. Please try again.');
    btn.disabled=false; btn.innerHTML='<span class="material-symbols-outlined text-[16px]">send</span> Submit Pricing for Approval';
  }
}

// ─── Admin: approve or reject pricing ────────────────────────────────────────
async function doApprovePricing(status, comments) {
  const btnId = status === 'procurement_active' ? 'approvePricingBtn' : 'pricingRejectConfirm';
  const btn = document.getElementById(btnId);
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    const res = await studioFetch('/api/material-requests/approve-pricing', {
      method: 'POST',
      body: JSON.stringify({ requestId: _requestId, status, comments: comments || '' }),
    });
    const d = await res.json();
    if (!res.ok) { alert(d.error || 'Action failed.'); if (btn) { btn.disabled=false; btn.textContent=status==='procurement_active'?'Approve Pricing':'Send Back'; } return; }
    await loadRequest();
  } catch {
    if (btn) { btn.disabled=false; btn.textContent=status==='procurement_active'?'Approve Pricing':'Send Back'; }
  }
}

// ─── Procurement: update order status ────────────────────────────────────────
async function updateOrderStatus({ itemId, category, orderStatus }) {
  try {
    const res = await studioFetch('/api/material-requests/items/update-order-status', {
      method: 'POST',
      body: JSON.stringify({ requestId: _requestId, itemId, category, orderStatus }),
    });
    if (res.ok) {
      // Update local state
      _items.forEach(i => {
        if (itemId && i.id === itemId) i.order_status = orderStatus;
        if (category && i.category === category) i.order_status = orderStatus;
      });
      if (itemId) {
        // Apply strikethrough on the row immediately for single-item updates
        const row = document.querySelector(`tr[data-id="${CSS.escape(itemId)}"]`);
        if (row) {
          const delivered = orderStatus === 'delivered';
          row.classList.toggle('opacity-50', delivered);
          // Strike through name cell (second td in procure rows, first in read-only)
          row.querySelectorAll('td').forEach(td => {
            // Skip checkbox, vendor, and select cells
            if (!td.querySelector('input[type="checkbox"]') && !td.querySelector('select') && !td.querySelector('input[type="text"]') && !td.dataset.vendorCell) {
              td.classList.toggle('line-through', delivered);
            }
          });
        }
      }
      // Re-render to show updated badges (lightweight re-render)
      if (category) renderPage();
    }
  } catch {}
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
  return {
    draft:               'Draft',
    pending_approval:    'Pending Approval',
    approved:            'Approved',
    revision_requested:  'Revision Needed',
    pricing_review:      'Pricing Review',
    procurement_active:  'Ordering Active',
  }[st] || st;
}

function categoryIcon(cat) {
  const MAP = {
    'Civil':'foundation','Electrical':'electrical_services','Plumbing':'water_pump',
    'HVAC':'hvac','Flooring':'grid_view','Furniture/Joinery':'chair',
    'Doors & Windows':'door_front','Miscellaneous':'category',
  };
  return MAP[cat] || 'inventory_2';
}

// ─── Vendor combobox rendering ────────────────────────────────────────────────
function renderVendorCell(item) {
  if (item.vendor?.id) {
    return `
      <div class="flex items-center gap-1">
        <button class="vendor-chip text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-full transition-colors max-w-[120px] truncate"
                data-vendor-id="${escAttr(item.vendor.id)}" title="${escAttr(item.vendor.name)}"
                style="cursor:pointer">
          ${esc(item.vendor.name)}
        </button>
        <button class="vendor-clear-btn text-on-surface-variant/50 hover:text-error transition-colors" data-item-id="${escAttr(item.id)}" title="Remove vendor">
          <span class="material-symbols-outlined text-[14px]">close</span>
        </button>
      </div>`;
  }
  return `
    <div class="vendor-combobox-wrap" data-item-id="${escAttr(item.id)}">
      <input type="text" placeholder="Search vendor…"
             class="vendor-search-input w-full border border-outline-variant rounded px-2 py-1 text-xs outline-none focus:border-primary"
             data-item-id="${escAttr(item.id)}" autocomplete="off"/>
      <div class="vendor-dropdown hidden fixed z-[200] bg-white border border-outline-variant rounded-lg shadow-lg w-56 max-h-48 overflow-y-auto"></div>
    </div>`;
}

// Wire up a vendor search input with live dropdown
let _vendorDebounce = null;
function wireVendorCombobox(inp) {
  const wrap = inp.closest('.vendor-combobox-wrap');
  const dropdown = wrap.querySelector('.vendor-dropdown');

  function positionDropdown() {
    const rect = inp.getBoundingClientRect();
    dropdown.style.top  = (rect.bottom + window.scrollY + 4) + 'px';
    dropdown.style.left = rect.left + 'px';
    dropdown.style.width = Math.max(rect.width, 224) + 'px';
  }

  inp.addEventListener('input', () => {
    clearTimeout(_vendorDebounce);
    const q = inp.value.trim();
    positionDropdown();
    _vendorDebounce = setTimeout(() => fetchVendorDropdown(inp, dropdown, q), 200);
  });

  inp.addEventListener('focus', () => {
    positionDropdown();
    if (inp.value.trim().length === 0) fetchVendorDropdown(inp, dropdown, '');
  });

  // Close dropdown on outside click
  document.addEventListener('click', e => {
    if (!wrap.contains(e.target) && !dropdown.contains(e.target)) dropdown.classList.add('hidden');
  }, { capture: true });
}

async function fetchVendorDropdown(inp, dropdown, q) {
  try {
    const res = await studioFetch(`/api/vendors/list?q=${encodeURIComponent(q)}`);
    if (!res.ok) return;
    const { vendors } = await res.json();
    renderVendorDropdown(inp, dropdown, vendors || []);
  } catch {}
}

function renderVendorDropdown(inp, dropdown, vendors) {
  const itemId = inp.dataset.itemId;
  const rows = vendors.slice(0, 20).map(v => `
    <button class="vendor-option w-full text-left px-3 py-2 hover:bg-surface-container-low text-xs flex items-start gap-2"
            data-vendor-id="${escAttr(v.id)}" data-vendor-name="${escAttr(v.name)}" data-item-id="${escAttr(itemId)}">
      <div>
        <div class="font-semibold text-on-surface">${esc(v.name)}</div>
        ${v.location ? `<div class="text-on-surface-variant">${esc(v.location)}</div>` : ''}
        ${v.specialty_categories?.length ? `<div class="text-on-surface-variant/70">${v.specialty_categories.join(', ')}</div>` : ''}
      </div>
    </button>`).join('');

  dropdown.innerHTML = rows + `
    <div class="border-t border-outline-variant/20">
      <button class="add-vendor-from-dropdown w-full text-left px-3 py-2 hover:bg-surface-container-low text-xs font-semibold text-primary flex items-center gap-1.5"
              data-item-id="${escAttr(itemId)}">
        <span class="material-symbols-outlined text-[14px]">add</span> Add new vendor
      </button>
    </div>`;

  dropdown.classList.remove('hidden');

  // Wire option clicks
  dropdown.querySelectorAll('.vendor-option').forEach(btn => {
    btn.addEventListener('click', () => selectVendor(btn.dataset.itemId, btn.dataset.vendorId, btn.dataset.vendorName));
  });
  dropdown.querySelector('.add-vendor-from-dropdown')?.addEventListener('click', () => {
    dropdown.classList.add('hidden');
    openAddVendorModal(itemId, inp.value.trim());
  });
}

async function selectVendor(itemId, vendorId, vendorName) {
  try {
    const res = await studioFetch('/api/material-requests/items/set-vendor', {
      method: 'POST',
      body: JSON.stringify({ itemId, vendorId }),
    });
    if (res.ok) {
      // Update local state
      const item = _items.find(i => i.id === itemId);
      if (item) item.vendor = { id: vendorId, name: vendorName };
      // Re-render just this row's vendor cell
      const row = document.querySelector(`tr[data-id="${CSS.escape(itemId)}"]`);
      const td = row?.querySelector('td[data-vendor-cell]');
      if (td) {
        td.innerHTML = renderVendorCell({ id: itemId, vendor: { id: vendorId, name: vendorName } });
        td.querySelector('.vendor-chip')?.addEventListener('click', () => openVendorPopup(vendorId));
        td.querySelector('.vendor-clear-btn')?.addEventListener('click', () => clearVendor(itemId));
      }
    }
  } catch {}
}

async function clearVendor(itemId) {
  try {
    const res = await studioFetch('/api/material-requests/items/set-vendor', {
      method: 'POST',
      body: JSON.stringify({ itemId, vendorId: null }),
    });
    if (res.ok) {
      const item = _items.find(i => i.id === itemId);
      if (item) item.vendor = null;
      const row = document.querySelector(`tr[data-id="${CSS.escape(itemId)}"]`);
      const td = row?.querySelector('td[data-vendor-cell]');
      if (td) {
        td.innerHTML = renderVendorCell({ id: itemId, vendor: null });
        const inp = td.querySelector('.vendor-search-input');
        if (inp) wireVendorCombobox(inp);
      }
    }
  } catch {}
}

// ─── Vendor popup modal ───────────────────────────────────────────────────────
async function openVendorPopup(vendorId) {
  const modal = document.getElementById('vendorPopupModal');
  const body  = document.getElementById('vendorPopupBody');
  const nameEl = document.getElementById('vendorPopupName');
  modal.style.removeProperty('display');
  body.innerHTML = '<div class="text-sm text-on-surface-variant">Loading…</div>';
  nameEl.textContent = 'Vendor';

  try {
    const res = await studioFetch(`/api/vendors/get?id=${encodeURIComponent(vendorId)}`);
    if (!res.ok) throw new Error('Failed');
    const { vendor, stats, recent_items } = await res.json();

    nameEl.textContent = vendor.name;
    const cats = (vendor.specialty_categories || []).join(', ') || '—';
    const fmtMoney = n => '₹' + fmtNum(n || 0);

    const recentRows = (recent_items || []).slice(0, 10).map(i => `
      <div class="flex items-center justify-between py-1.5 border-b border-outline-variant/10 last:border-0">
        <div>
          <div class="font-medium text-on-surface text-xs">${esc(i.item_name || i.category)}</div>
          <div class="text-on-surface-variant text-[11px]">${esc(i.request?.project?.name || '—')}</div>
        </div>
        <div class="text-xs text-right">
          ${i.procured ? `<span class="text-primary font-semibold">Procured</span>` : `<span class="text-on-surface-variant">Pending</span>`}
          <div class="text-on-surface-variant">${i.quantity ? i.quantity + (i.unit ? ' ' + i.unit : '') : ''}</div>
        </div>
      </div>`).join('');

    body.innerHTML = `
      <div class="grid grid-cols-2 gap-3 mb-5">
        <div class="bg-surface-container-low rounded-xl p-3">
          <p class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-0.5">Total Orders</p>
          <p class="text-2xl font-headline font-extrabold text-on-surface">${stats.total_orders}</p>
        </div>
        <div class="bg-surface-container-low rounded-xl p-3">
          <p class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-0.5">Business Value</p>
          <p class="text-2xl font-headline font-extrabold text-primary">${fmtMoney(stats.total_business_value)}</p>
        </div>
      </div>
      <div class="space-y-1.5 text-sm mb-5">
        ${vendor.phone     ? `<div class="flex gap-2"><span class="text-on-surface-variant w-20 shrink-0">Phone</span><span class="font-medium">${esc(vendor.phone)}</span></div>` : ''}
        ${vendor.email     ? `<div class="flex gap-2"><span class="text-on-surface-variant w-20 shrink-0">Email</span><span class="font-medium">${esc(vendor.email)}</span></div>` : ''}
        ${vendor.location  ? `<div class="flex gap-2"><span class="text-on-surface-variant w-20 shrink-0">Location</span><span class="font-medium">${esc(vendor.location)}</span></div>` : ''}
        ${vendor.address   ? `<div class="flex gap-2"><span class="text-on-surface-variant w-20 shrink-0">Address</span><span class="font-medium">${esc(vendor.address)}</span></div>` : ''}
        ${vendor.gstin     ? `<div class="flex gap-2"><span class="text-on-surface-variant w-20 shrink-0">GSTIN</span><span class="font-medium">${esc(vendor.gstin)}</span></div>` : ''}
        <div class="flex gap-2"><span class="text-on-surface-variant w-20 shrink-0">Categories</span><span class="font-medium">${esc(cats)}</span></div>
        ${vendor.notes     ? `<div class="flex gap-2"><span class="text-on-surface-variant w-20 shrink-0">Notes</span><span class="font-medium">${esc(vendor.notes)}</span></div>` : ''}
      </div>
      ${recent_items.length ? `
      <div>
        <p class="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">Recent Items</p>
        ${recentRows}
      </div>` : ''}`;
  } catch {
    body.innerHTML = '<div class="text-error text-sm">Failed to load vendor info.</div>';
  }
}

// ─── Add Vendor Modal ─────────────────────────────────────────────────────────
const VENDOR_CATEGORIES = [
  'Civil','Electrical','Plumbing','HVAC',
  'Flooring','Furniture/Joinery','Doors & Windows','Miscellaneous',
];

function openAddVendorModal(itemId, prefillName = '') {
  const modal = document.getElementById('addVendorModal');
  modal.style.removeProperty('display');
  document.getElementById('avName').value = prefillName;
  document.getElementById('avPhone').value = '';
  document.getElementById('avEmail').value = '';
  document.getElementById('avAddress').value = '';
  document.getElementById('avLocation').value = '';
  document.getElementById('avGstin').value = '';
  document.getElementById('avNotes').value = '';
  document.getElementById('avTargetItemId').value = itemId || '';
  document.getElementById('addVendorErr').classList.add('hidden');

  // Render category chips
  const chipsEl = document.getElementById('avCategoryChips');
  chipsEl.innerHTML = VENDOR_CATEGORIES.map(c => `
    <label class="flex items-center gap-1.5 cursor-pointer">
      <input type="checkbox" class="av-cat-chip accent-primary" value="${escAttr(c)}"/>
      <span class="text-xs">${esc(c)}</span>
    </label>`).join('');

  document.getElementById('addVendorClose').onclick = () => closeModal('addVendorModal');
  document.getElementById('addVendorCancel').onclick = () => closeModal('addVendorModal');
  document.getElementById('addVendorSave').onclick = doAddVendor;
}

async function doAddVendor() {
  const name     = document.getElementById('avName').value.trim();
  const itemId   = document.getElementById('avTargetItemId').value;
  const errEl    = document.getElementById('addVendorErr');
  errEl.classList.add('hidden');

  if (!name) { errEl.textContent = 'Vendor name is required.'; errEl.classList.remove('hidden'); return; }

  const selectedCats = [...document.querySelectorAll('.av-cat-chip:checked')].map(c => c.value);

  const payload = {
    name,
    phone:    document.getElementById('avPhone').value.trim() || undefined,
    email:    document.getElementById('avEmail').value.trim() || undefined,
    address:  document.getElementById('avAddress').value.trim() || undefined,
    location: document.getElementById('avLocation').value.trim() || undefined,
    gstin:    document.getElementById('avGstin').value.trim() || undefined,
    notes:    document.getElementById('avNotes').value.trim() || undefined,
    specialty_categories: selectedCats,
  };

  const saveBtn = document.getElementById('addVendorSave');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    const res = await studioFetch('/api/vendors/create', { method: 'POST', body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create vendor.');

    closeModal('addVendorModal');
    if (itemId) await selectVendor(itemId, data.vendor.id, data.vendor.name);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Add Vendor';
  }
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
