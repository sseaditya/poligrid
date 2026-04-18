// client/vendors.js — Vendor management page (admin only)

let _profile;
let _vendors = [];

const CATEGORIES = [
  'Civil','Electrical','Plumbing','HVAC',
  'Flooring','Furniture/Joinery','Doors & Windows','Miscellaneous',
];

(async () => {
  AppNav.mountSidebar('VENDORS');
  try {
    const auth = await AuthClient.requireAuth(['admin']);
    _profile = auth.profile;
  } catch { return; }

  const navEl = document.getElementById('sidebarNav');
  AppNav.renderSidebar(_profile, navEl);
  AppNav.setupUserSection(_profile);
  AppNav.setupCollapse();

  await loadVendors();

  document.getElementById('searchInput').addEventListener('input', debounce(loadVendors, 250));
  document.getElementById('categoryFilter').addEventListener('change', loadVendors);
  document.getElementById('showInactive').addEventListener('change', loadVendors);
  document.getElementById('addVendorBtn').addEventListener('click', () => openVendorForm(null));
  document.getElementById('closeDetailModal').addEventListener('click', () => closeModal('vendorDetailModal'));
  document.getElementById('vendorFormClose').addEventListener('click', () => closeModal('vendorFormModal'));
  document.getElementById('vendorFormCancel').addEventListener('click', () => closeModal('vendorFormModal'));
  document.getElementById('vendorFormSave').addEventListener('click', saveVendorForm);
})();

async function loadVendors() {
  const q        = document.getElementById('searchInput').value.trim();
  const category = document.getElementById('categoryFilter').value;
  const inactive = document.getElementById('showInactive').checked ? '1' : '0';

  const params = new URLSearchParams({ q, category, inactive });
  try {
    const res = await studioFetch(`/api/vendors/list?${params}`);
    if (!res.ok) throw new Error('Failed to load vendors.');
    const data = await res.json();
    _vendors = data.vendors || [];
    renderTable(_vendors);
  } catch (err) {
    document.getElementById('vendorTableBody').innerHTML =
      `<tr><td colspan="5" class="px-5 py-8 text-center text-error text-sm">${esc(err.message)}</td></tr>`;
  }
}

function renderTable(vendors) {
  const tbody = document.getElementById('vendorTableBody');
  const countEl = document.getElementById('vendorCount');
  countEl.textContent = `${vendors.length} vendor${vendors.length !== 1 ? 's' : ''}`;

  if (!vendors.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="px-5 py-10 text-center text-on-surface-variant text-sm">No vendors found.</td></tr>`;
    return;
  }

  tbody.innerHTML = vendors.map(v => `
    <tr class="vendor-row border-b border-outline-variant/10 transition-colors" data-id="${escAttr(v.id)}">
      <td class="px-5 py-4">
        <p class="font-headline font-bold text-sm text-on-background">${esc(v.name)}</p>
        ${v.phone ? `<p class="text-xs text-on-surface-variant mt-0.5">${esc(v.phone)}</p>` : ''}
        ${!v.is_active ? `<span class="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60 bg-surface-container px-2 py-0.5 rounded-full">Inactive</span>` : ''}
      </td>
      <td class="px-5 py-4 hidden md:table-cell text-sm text-on-surface-variant">${esc(v.location || '—')}</td>
      <td class="px-5 py-4 hidden lg:table-cell">
        <div class="flex flex-wrap gap-1">
          ${(v.specialty_categories || []).map(c =>
            `<span class="text-[10px] font-semibold bg-primary-container text-primary px-2 py-0.5 rounded-full">${esc(c)}</span>`
          ).join('') || '<span class="text-xs text-on-surface-variant">—</span>'}
        </div>
      </td>
      <td class="px-5 py-4 text-right">
        ${v.total_business_value > 0
          ? `<span class="text-sm font-bold text-primary">₹${fmtNum(v.total_business_value)}</span>`
          : `<span class="text-sm text-on-surface-variant">—</span>`}
      </td>
      <td class="px-5 py-4 text-right">
        <button class="edit-vendor-btn text-on-surface-variant hover:text-primary transition-colors p-1.5 rounded-lg hover:bg-surface-container-low"
                data-id="${escAttr(v.id)}" title="Edit vendor" onclick="event.stopPropagation()">
          <span class="material-symbols-outlined text-[18px]">edit</span>
        </button>
      </td>
    </tr>`).join('');

  // Row click → detail modal
  tbody.querySelectorAll('.vendor-row').forEach(row => {
    row.addEventListener('click', () => openVendorDetail(row.dataset.id));
  });
  tbody.querySelectorAll('.edit-vendor-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = _vendors.find(x => x.id === btn.dataset.id);
      if (v) openVendorForm(v);
    });
  });
}

// ─── Vendor Detail Modal ────────────────────────────────────────────────────��─
async function openVendorDetail(vendorId) {
  const modal = document.getElementById('vendorDetailModal');
  const body  = document.getElementById('detailVendorBody');
  const nameEl = document.getElementById('detailVendorName');
  const actionsEl = document.getElementById('detailVendorActions');
  modal.style.removeProperty('display');
  body.innerHTML = '<div class="text-sm text-on-surface-variant">Loading…</div>';
  nameEl.textContent = 'Vendor';
  actionsEl.innerHTML = '';

  try {
    const res = await studioFetch(`/api/vendors/get?id=${encodeURIComponent(vendorId)}`);
    if (!res.ok) throw new Error('Failed to load vendor.');
    const { vendor, stats, recent_items } = await res.json();

    nameEl.textContent = vendor.name;
    const cats = (vendor.specialty_categories || []).join(', ') || '—';
    const fmtMoney = n => '₹' + fmtNum(n || 0);

    const recentRows = (recent_items || []).slice(0, 15).map(i => `
      <div class="flex items-center justify-between py-1.5 border-b border-outline-variant/10 last:border-0">
        <div>
          <div class="font-medium text-on-surface text-xs">${esc(i.item_name || i.category)}</div>
          <div class="text-on-surface-variant text-[11px]">${esc(i.request?.project?.name || '—')} · ${esc(i.category)}</div>
        </div>
        <div class="text-xs text-right shrink-0 ml-3">
          ${i.procured
            ? `<span class="text-primary font-semibold">Procured</span>`
            : `<span class="text-on-surface-variant">Pending</span>`}
          ${i.quantity ? `<div class="text-on-surface-variant">${i.quantity}${i.unit ? ' ' + i.unit : ''}</div>` : ''}
        </div>
      </div>`).join('');

    body.innerHTML = `
      <div class="grid grid-cols-3 gap-3 mb-5">
        <div class="bg-surface-container-low rounded-xl p-3 text-center">
          <p class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-0.5">Orders</p>
          <p class="text-2xl font-headline font-extrabold text-on-surface">${stats.total_orders}</p>
        </div>
        <div class="bg-surface-container-low rounded-xl p-3 text-center">
          <p class="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-0.5">Items</p>
          <p class="text-2xl font-headline font-extrabold text-on-surface">${stats.total_items_procured}</p>
        </div>
        <div class="bg-primary-container rounded-xl p-3 text-center">
          <p class="text-[10px] font-bold uppercase tracking-widest text-primary mb-0.5">Business</p>
          <p class="text-xl font-headline font-extrabold text-primary">${fmtMoney(stats.total_business_value)}</p>
        </div>
      </div>
      <div class="space-y-2 text-sm mb-5">
        ${vendor.phone    ? `<div class="flex gap-3"><span class="text-on-surface-variant w-20 shrink-0">Phone</span><span class="font-medium">${esc(vendor.phone)}</span></div>` : ''}
        ${vendor.email    ? `<div class="flex gap-3"><span class="text-on-surface-variant w-20 shrink-0">Email</span><span class="font-medium">${esc(vendor.email)}</span></div>` : ''}
        ${vendor.location ? `<div class="flex gap-3"><span class="text-on-surface-variant w-20 shrink-0">Location</span><span class="font-medium">${esc(vendor.location)}</span></div>` : ''}
        ${vendor.address  ? `<div class="flex gap-3"><span class="text-on-surface-variant w-20 shrink-0">Address</span><span class="font-medium">${esc(vendor.address)}</span></div>` : ''}
        ${vendor.gstin    ? `<div class="flex gap-3"><span class="text-on-surface-variant w-20 shrink-0">GSTIN</span><span class="font-medium">${esc(vendor.gstin)}</span></div>` : ''}
        <div class="flex gap-3"><span class="text-on-surface-variant w-20 shrink-0">Categories</span><span class="font-medium">${esc(cats)}</span></div>
        ${vendor.notes    ? `<div class="flex gap-3"><span class="text-on-surface-variant w-20 shrink-0">Notes</span><span class="font-medium">${esc(vendor.notes)}</span></div>` : ''}
      </div>
      ${recent_items.length ? `
      <div>
        <p class="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">Procurement History</p>
        ${recentRows}
      </div>` : '<p class="text-sm text-on-surface-variant italic">No procurement history yet.</p>'}`;

    actionsEl.innerHTML = `
      <button class="detail-edit-btn px-4 py-2 rounded-lg bg-surface-container text-sm font-semibold hover:bg-surface-container-high transition-colors flex items-center gap-1.5">
        <span class="material-symbols-outlined text-[16px]">edit</span> Edit
      </button>
      ${vendor.is_active
        ? `<button class="detail-deactivate-btn px-4 py-2 rounded-lg bg-red-50 text-error text-sm font-semibold hover:bg-red-100 transition-colors">Deactivate</button>`
        : `<button class="detail-activate-btn px-4 py-2 rounded-lg bg-primary-container text-primary text-sm font-semibold hover:opacity-80 transition-colors">Reactivate</button>`}`;

    actionsEl.querySelector('.detail-edit-btn')?.addEventListener('click', () => {
      closeModal('vendorDetailModal');
      openVendorForm(vendor);
    });
    actionsEl.querySelector('.detail-deactivate-btn')?.addEventListener('click', () => deactivateVendor(vendor.id));
    actionsEl.querySelector('.detail-activate-btn')?.addEventListener('click', () => activateVendor(vendor.id));

  } catch (err) {
    body.innerHTML = `<div class="text-error text-sm">${esc(err.message)}</div>`;
  }
}

async function deactivateVendor(id) {
  if (!confirm('Deactivate this vendor? They will no longer appear in procurement dropdowns.')) return;
  await studioFetch('/api/vendors/delete', { method: 'POST', body: JSON.stringify({ id }) });
  closeModal('vendorDetailModal');
  await loadVendors();
}

async function activateVendor(id) {
  await studioFetch('/api/vendors/update', { method: 'PATCH', body: JSON.stringify({ id, is_active: true }) });
  closeModal('vendorDetailModal');
  await loadVendors();
}

// ─── Add / Edit Vendor Form ───────────────────────────────────────────────────
function openVendorForm(vendor) {
  const modal = document.getElementById('vendorFormModal');
  modal.style.removeProperty('display');
  document.getElementById('vendorFormTitle').textContent = vendor ? 'Edit Vendor' : 'Add Vendor';
  document.getElementById('vfId').value      = vendor?.id || '';
  document.getElementById('vfName').value    = vendor?.name || '';
  document.getElementById('vfPhone').value   = vendor?.phone || '';
  document.getElementById('vfEmail').value   = vendor?.email || '';
  document.getElementById('vfAddress').value = vendor?.address || '';
  document.getElementById('vfLocation').value = vendor?.location || '';
  document.getElementById('vfGstin').value   = vendor?.gstin || '';
  document.getElementById('vfNotes').value   = vendor?.notes || '';
  document.getElementById('vendorFormErr').classList.add('hidden');

  const activeCats = vendor?.specialty_categories || [];
  document.getElementById('vfCategoryChips').innerHTML = CATEGORIES.map(c => `
    <label class="flex items-center gap-1.5 cursor-pointer select-none">
      <input type="checkbox" class="vf-cat accent-primary" value="${escAttr(c)}" ${activeCats.includes(c) ? 'checked' : ''}/>
      <span class="text-sm">${esc(c)}</span>
    </label>`).join('');
}

async function saveVendorForm() {
  const id   = document.getElementById('vfId').value;
  const name = document.getElementById('vfName').value.trim();
  const errEl = document.getElementById('vendorFormErr');
  errEl.classList.add('hidden');

  if (!name) { errEl.textContent = 'Vendor name is required.'; errEl.classList.remove('hidden'); return; }

  const selectedCats = [...document.querySelectorAll('.vf-cat:checked')].map(c => c.value);
  const payload = {
    name,
    phone:    document.getElementById('vfPhone').value.trim() || null,
    email:    document.getElementById('vfEmail').value.trim() || null,
    address:  document.getElementById('vfAddress').value.trim() || null,
    location: document.getElementById('vfLocation').value.trim() || null,
    gstin:    document.getElementById('vfGstin').value.trim() || null,
    notes:    document.getElementById('vfNotes').value.trim() || null,
    specialty_categories: selectedCats,
  };

  const saveBtn = document.getElementById('vendorFormSave');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    let res;
    if (id) {
      res = await studioFetch('/api/vendors/update', { method: 'PATCH', body: JSON.stringify({ id, ...payload }) });
    } else {
      res = await studioFetch('/api/vendors/create', { method: 'POST', body: JSON.stringify(payload) });
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save vendor.');
    closeModal('vendorFormModal');
    await loadVendors();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Vendor';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escAttr(s) {
  return String(s || '').replace(/"/g,'&quot;');
}
function fmtNum(n) {
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
