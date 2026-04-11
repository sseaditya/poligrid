// client/nav.js — Shared sidebar & mobile nav for all Tailwind studio pages
// Load after auth.js. Exposes global: AppNav
//
// Usage (in each page's JS, after requireAuth):
//   AppNav.renderSidebar(profile, document.getElementById('sidebarNav'));
//   AppNav.renderMobileNav(profile, document.getElementById('mobileNav'));
//   AppNav.setupUserSection(profile);
//   AppNav.setupCollapse();  ← call once after setupUserSection

const AppNav = (() => {

  // ── Collapse CSS (injected once into <head>, no transitions) ─────────────────
  // Called early in mountSidebar so the initial collapsed state renders correctly
  // without any animation flash.
  function _injectCollapseStyles() {
    if (document.getElementById('nav-collapse-styles')) return;
    const s = document.createElement('style');
    s.id = 'nav-collapse-styles';
    s.textContent = `
      /* Sidebar collapses to icon-only width */
      #appSidebar.nav-collapsed {
        width: 64px !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
      }
      @media (min-width: 768px) {
        #sidebarMain.nav-collapsed { margin-left: 64px !important; }
      }

      /* Hide text labels */
      #appSidebar.nav-collapsed .nav-label { display: none !important; }

      /* Top-level links: center icon, strip side padding */
      #appSidebar.nav-collapsed .nav-link {
        justify-content: center;
        padding-left: 0;
        padding-right: 0;
      }

      /* Project sub-block */
      #appSidebar.nav-collapsed .nav-sub-wrap {
        margin-left: 0 !important;
        padding-left: 0 !important;
      }
      #appSidebar.nav-collapsed .nav-sub-link {
        justify-content: center;
        padding-left: 0;
        padding-right: 0;
      }

      /* Project name: swap text for icon */
      #appSidebar.nav-collapsed .nav-proj-name {
        display: flex;
        justify-content: center;
        padding: 5px 0;
      }
      #appSidebar.nav-collapsed .nav-proj-name .nav-proj-icon {
        display: inline-block !important;
      }

      /* Footer items */
      #appSidebar.nav-collapsed .sidebar-footer-item {
        justify-content: center;
        padding-left: 0;
        padding-right: 0;
      }

      /* Toggle chevron — lives in the brand header */
      .sidebar-toggle-icon { display: block; }
      #sidebarBrandHeader.nav-collapsed .sidebar-toggle-icon { transform: rotate(180deg); }

      /* Tooltip on collapsed items — appear to the right of the sidebar */
      #appSidebar.nav-collapsed [data-nav-tip] { position: relative; }
      #appSidebar.nav-collapsed [data-nav-tip]:hover::after {
        content: attr(data-nav-tip);
        position: absolute;
        left: calc(100% + 10px);
        top: 50%;
        transform: translateY(-50%);
        background: rgba(12, 12, 16, 0.92);
        color: #f0f0f0;
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 500;
        white-space: nowrap;
        z-index: 9999;
        pointer-events: none;
        letter-spacing: 0.02em;
      }
    `;
    document.head.appendChild(s);
  }

  // ── Transition CSS (injected after first paint to avoid load-time stutter) ───
  function _injectTransitions() {
    if (document.getElementById('nav-transition-styles')) return;
    const s = document.createElement('style');
    s.id = 'nav-transition-styles';
    s.textContent = `
      #appSidebar { transition: width 0.25s cubic-bezier(0.4,0,0.2,1); }
      #sidebarMain { transition: margin-left 0.25s cubic-bezier(0.4,0,0.2,1); }
      .sidebar-toggle-icon { transition: transform 0.25s ease; }
    `;
    document.head.appendChild(s);
  }

  // ── Nav link definitions per role ───────────────────────────────────────────

  function _homeLink(role, profile) {
    if (role === 'sales') {
      const slug = (profile.full_name || '')
        .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      return { href: slug ? `/sales/${slug}` : '/projects', icon: 'dashboard', label: 'Dashboard' };
    }
    return {
      admin:         { href: '/admin_home',         icon: 'dashboard', label: 'Command Center' },
      ceo:           { href: '/ceo',                 icon: 'bar_chart', label: 'CEO Dashboard'  },
      designer:      { href: '/designer_home',       icon: 'dashboard', label: 'My Dashboard'   },
      lead_designer: { href: '/lead_designer_home',  icon: 'dashboard', label: 'Command Center' },
    }[role] || { href: '/homepage', icon: 'dashboard', label: 'Home' };
  }

  function buildNavLinks(profile, currentPath) {
    const role = profile.role;
    const path = currentPath || window.location.pathname;

    const links = [_homeLink(role, profile)];

    // Projects (all except CEO, who gets it separately)
    if (role !== 'ceo') {
      links.push({ href: '/projects', icon: 'architecture', label: 'Projects' });
    }

    // Drawings
    if (['designer', 'lead_designer', 'admin'].includes(role)) {
      links.push({ href: '/designer', icon: 'edit_square', label: 'Drawings' });
    }

    // Admin extras
    if (role === 'admin') {
      links.push({ href: '/admin', icon: 'manage_accounts', label: 'Team'       });
      links.push({ href: '/ceo',   icon: 'bar_chart',       label: 'CEO View'   });
      links.push({ href: '/audit', icon: 'history',         label: 'Audit Logs' });
    }

    // CEO
    if (role === 'ceo') {
      links.push({ href: '/projects', icon: 'architecture', label: 'All Projects' });
    }

    // Mark active: exact match OR path starts with href (but skip '/')
    return links.map(l => ({
      ...l,
      active: path === l.href || (l.href.length > 1 && path.startsWith(l.href + '/')),
    }));
  }

  // ── Render helpers ───────────────────────────────────────────────────────────

  function _sidebarLinkHtml(l) {
    const cls = l.active
      ? 'text-primary bg-primary/5 font-bold border-r-2 border-primary'
      : 'text-on-surface-variant hover:bg-surface-container-low';
    const fill = l.active ? "style=\"font-variation-settings:'FILL' 1\"" : '';
    return `<a class="nav-link flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all duration-200 ${cls}" href="${l.href}" data-nav-tip="${l.label}">
  <span class="material-symbols-outlined" ${fill}>${l.icon}</span>
  <span class="nav-label">${l.label}</span>
</a>`;
  }

  function renderSidebar(profile, navEl, currentPath) {
    if (!navEl) return;
    navEl.innerHTML = buildNavLinks(profile, currentPath).map(_sidebarLinkHtml).join('');
  }

  // Renders the sidebar with an indented project-context block injected
  // under the "Projects" link, showing project-specific sub-navigation.
  function renderSidebarWithProject(profile, navEl, project, currentPath) {
    if (!navEl) return;
    const role = profile.role;

    // Determine which project-specific sub-links to show, marking the active one
    const path = currentPath || window.location.pathname;
    const hasProjectParam = new URLSearchParams(window.location.search).get('projectId');

    const subLinks = [];
    if (['sales', 'lead_designer', 'admin'].includes(role)) {
      subLinks.push({
        icon: 'design_services', label: 'Fitout Planner',
        href: `/index?id=${project.id}`,
        active: false,
      });
    }
    if (['designer', 'lead_designer', 'admin'].includes(role)) {
      subLinks.push({
        icon: 'architecture', label: 'Drawings',
        href: `/designer?projectId=${project.id}`,
        active: path === '/designer' && !!hasProjectParam,
      });
    }
    subLinks.push({
      icon: 'history', label: 'Audit Log',
      href: `/audit?projectId=${project.id}`,
      active: path === '/audit' && !!hasProjectParam,
    });

    // Escape project name for HTML
    const projName = (project.name || 'Project').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const subHtml = `
<div class="nav-sub-wrap pl-3 ml-5 border-l-2 border-primary/20 space-y-0.5 pb-1">
  <a class="nav-proj-name px-2 pt-0.5 pb-1 flex items-center gap-1.5 hover:text-primary transition-colors" title="${projName}" href="/project?id=${project.id}" data-nav-tip="${projName}">
    <span class="nav-proj-icon material-symbols-outlined text-primary/80 flex-shrink-0" style="font-size:14px;display:none">home</span>
    <span class="nav-label text-[10px] font-bold uppercase tracking-widest text-primary/80 truncate">${projName}</span>
  </a>
  ${subLinks.map(l => {
    const cls = l.active
      ? 'nav-sub-link flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] text-primary bg-primary/5 font-bold border-r-2 border-primary transition-all duration-150'
      : 'nav-sub-link flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-all duration-150';
    const fill = l.active ? "style=\"font-variation-settings:'FILL' 1\"" : '';
    return `
  <a class="${cls}" href="${l.href}" data-nav-tip="${l.label}">
    <span class="material-symbols-outlined flex-shrink-0" style="font-size:15px" ${fill}>${l.icon}</span>
    <span class="nav-label">${l.label}</span>
  </a>`;
  }).join('')}
</div>`;

    // Pass '/project' so no top-level link gets highlighted active in project context
    // (active state is carried by the sub-links instead)
    const links = buildNavLinks(profile, '/project');
    let html = '';
    let injected = false;
    for (const l of links) {
      html += _sidebarLinkHtml(l);
      // Inject project sub-menu right after the "Projects" link
      if (!injected && l.href === '/projects') {
        html += subHtml;
        injected = true;
      }
    }
    // Fallback: append if Projects link wasn't in nav (e.g. CEO)
    if (!injected) html += subHtml;
    navEl.innerHTML = html;
  }


  function renderMobileNav(profile, navEl, currentPath) {
    if (!navEl) return;
    const links = buildNavLinks(profile, currentPath).slice(0, 4);
    navEl.innerHTML = links.map(l => `
      <a href="${l.href}" class="flex flex-col items-center gap-1 no-underline ${l.active ? 'text-primary' : 'text-on-surface-variant/60'}">
        <span class="material-symbols-outlined" ${l.active ? "style=\"font-variation-settings:'FILL' 1\"" : ''}>${l.icon}</span>
        <span class="text-[10px] font-bold uppercase tracking-tighter">${l.label}</span>
      </a>`).join('');
  }

  // Wire up profile link, avatar, and logout buttons
  function setupUserSection(profile) {
    const slug = (profile.email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const profileUrl = `/profile/${slug}`;

    for (const id of ['settingsLink', 'userAvatarLink', 'topbarProfileLink', 'sidebarProfileLink']) {
      const el = document.getElementById(id);
      if (el) el.href = profileUrl;
    }

    const img = document.getElementById('userAvatarImg');
    if (img) {
      if (profile.avatar_url) img.src = profile.avatar_url;
      img.alt = profile.full_name || 'User';
    }

    const signOut = () => AuthClient.signOut();
    for (const id of ['logoutBtn', 'logoutBtnTop']) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', signOut);
    }
  }

  // ── Collapsible sidebar ──────────────────────────────────────────────────────
  // Call once per page after setupUserSection. Reads localStorage key
  // 'pg_sidebar_collapsed'. Requires id="appSidebar", id="sidebarBrandHeader",
  // id="sidebarMain", and id="sidebarToggle" (inside the brand header).
  //
  // Initial collapsed state is applied synchronously in mountSidebar (no stutter).
  // Transitions are enabled here, after the first paint, so the initial render
  // never animates.
  function setupCollapse() {
    const sidebar     = document.getElementById('appSidebar');
    const brandHeader = document.getElementById('sidebarBrandHeader');
    const main        = document.getElementById('sidebarMain');
    const btn         = document.getElementById('sidebarToggle');
    if (!sidebar || !btn) return;

    const KEY = 'pg_sidebar_collapsed';

    // Enable smooth transitions only after the initial paint so restoring saved
    // state never causes a visible width/margin animation.
    requestAnimationFrame(() => requestAnimationFrame(() => _injectTransitions()));

    function apply(collapsed) {
      sidebar.classList.toggle('nav-collapsed', collapsed);
      if (brandHeader) brandHeader.classList.toggle('nav-collapsed', collapsed);
      if (main) main.classList.toggle('nav-collapsed', collapsed);
      localStorage.setItem(KEY, collapsed ? '1' : '0');
    }

    btn.addEventListener('click', () => apply(!sidebar.classList.contains('nav-collapsed')));
  }

  // ── Mount sidebar + mobile nav into DOM ─────────────────────────────────────
  // Call once per page (synchronously, before renderSidebar/setupUserSection).
  // title — text shown as the tab/page name under "POLIGRID STUDIO"
  // opts  — { profileActive: bool }
  //
  // The brand header (#sidebarBrandHeader) is a separate fixed element that is
  // always fully visible regardless of collapse state. It sits at top-0 and is
  // always 256 px wide. The sidebar nav (#appSidebar) starts at top-16 (64 px)
  // below it and collapses width independently.
  //
  // The initial collapsed state is applied synchronously here (before any paint)
  // by reading localStorage. This prevents the stutter that occurred when the
  // state was applied in setupCollapse (which runs after an async auth round-trip).
  function mountSidebar(title, opts = {}) {
    if (document.getElementById('appSidebar')) return; // already in DOM (static HTML)

    // Inject collapse behaviour CSS immediately (no transitions yet — those come
    // in setupCollapse after the first paint).
    _injectCollapseStyles();

    const KEY          = 'pg_sidebar_collapsed';
    const startCollapsed = localStorage.getItem(KEY) === '1';

    const label        = (title || "GOD'S EYE").toUpperCase();
    const profileActive = !!opts.profileActive;

    // ── Brand header — always visible, never collapses ──────────────────────
    const brand = document.createElement('div');
    brand.id = 'sidebarBrandHeader';
    // nav-collapsed applied immediately so chevron is correct on load
    brand.className = [
      'hidden md:flex fixed left-0 top-0 z-40',
      'w-64 h-16',
      'bg-surface-container-lowest',
      'border-r border-outline-variant/10',
      'border-b border-outline-variant/10',
      'items-center justify-between px-5',
      startCollapsed ? 'nav-collapsed' : '',
    ].join(' ');
    brand.innerHTML = `
      <div class="min-w-0 flex-1 pr-2">
        <div class="text-[9px] font-bold tracking-[0.22em] uppercase text-on-surface-variant/40 leading-none">POLIGRID STUDIO</div>
        <div class="text-[14px] font-extrabold tracking-tighter text-on-surface mt-0.5 font-headline leading-tight truncate">${label}</div>
      </div>
      <button id="sidebarToggle"
              class="flex-shrink-0 p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors"
              title="Toggle sidebar">
        <span class="material-symbols-outlined sidebar-toggle-icon" style="font-size:18px">chevron_left</span>
      </button>`;

    // ── Sidebar nav — starts below brand, collapses width ───────────────────
    const aside = document.createElement('aside');
    aside.id = 'appSidebar';
    aside.className = [
      'hidden md:flex fixed left-0 top-16',
      'h-[calc(100vh-4rem)] w-64',
      'bg-surface-container-lowest flex-col z-30',
      'border-r border-outline-variant/10',
      startCollapsed ? 'nav-collapsed' : '',
    ].join(' ');
    aside.style.height = 'calc(100vh - 4rem)'; // reliable fallback for arbitrary Tailwind value

    const profileLinkCls = profileActive
      ? 'sidebar-footer-item flex items-center gap-3 px-4 py-2 text-primary bg-primary/5 font-bold rounded-lg border-r-2 border-primary'
      : 'sidebar-footer-item flex items-center gap-3 px-4 py-2 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-container-low transition-colors';
    const profileIconStyle = profileActive ? " style=\"font-variation-settings:'FILL' 1\"" : '';

    aside.innerHTML = `
  <nav class="flex-1 px-4 py-3 space-y-1 overflow-y-auto" id="sidebarNav"></nav>
  <div class="mt-auto border-t border-outline-variant/20 pt-4 px-4 pb-6 space-y-1">
    <a id="settingsLink" href="/profile" class="${profileLinkCls}" data-nav-tip="My Profile">
      <span class="material-symbols-outlined text-[20px]"${profileIconStyle}>account_circle</span>
      <span class="nav-label text-xs font-medium">My Profile</span>
    </a>
    <button id="logoutBtn" class="sidebar-footer-item w-full flex items-center gap-3 px-4 py-2 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-container-low text-left transition-colors" data-nav-tip="Sign Out">
      <span class="material-symbols-outlined text-[20px]">logout</span>
      <span class="nav-label text-xs font-medium">Sign Out</span>
    </button>
  </div>`;

    // ── Apply initial margin to main content ─────────────────────────────────
    // Add nav-collapsed to sidebarMain so the injected CSS sets margin-left:64px
    // immediately (before transitions are enabled).
    const main = document.getElementById('sidebarMain');
    if (startCollapsed && main) main.classList.add('nav-collapsed');

    // ── Insert into DOM ──────────────────────────────────────────────────────
    if (main) {
      document.body.insertBefore(aside, main);
      document.body.insertBefore(brand, main);
    } else {
      document.body.prepend(aside);
      document.body.prepend(brand);
    }

    // Mobile nav
    if (!document.getElementById('mobileNav')) {
      const nav = document.createElement('nav');
      nav.id = 'mobileNav';
      nav.className = 'md:hidden fixed bottom-0 w-full bg-surface/80 backdrop-blur-xl flex justify-around items-center py-3 border-t border-surface-container z-20';
      document.body.appendChild(nav);
    }
  }

  return { buildNavLinks, mountSidebar, renderSidebar, renderSidebarWithProject, renderMobileNav, setupUserSection, setupCollapse };
})();
