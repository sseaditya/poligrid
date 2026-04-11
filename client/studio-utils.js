// ─── Shared utilities for Tailwind-based Studio pages ─────────────────────────
// Loaded by designer_home.html and lead_designer_home.html.
// Globals exposed: esc, fmtDt, fmtShort, studioFetch

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
    + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtShort(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// Authenticated API fetch — uses AuthClient.getSession() each call so token
// refresh is handled automatically.
async function studioFetch(url, opts = {}) {
  const session = await AuthClient.getSession();
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(opts.headers || {}),
    },
  });
}
