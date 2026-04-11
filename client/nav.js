// client/nav.js — Shared sidebar & mobile nav for all Tailwind studio pages
// Load after auth.js. Exposes global: AppNav
//
// Usage (in each page's JS, after requireAuth):
//   AppNav.renderSidebar(profile, document.getElementById('sidebarNav'));
//   AppNav.renderMobileNav(profile, document.getElementById('mobileNav'));
//   AppNav.setupUserSection(profile);

const AppNav = (() => {

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
    return `<a class="flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all duration-200 ${cls}" href="${l.href}">
  <span class="material-symbols-outlined" ${fill}>${l.icon}</span>
  <span>${l.label}</span>
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
<div class="pl-3 ml-5 border-l-2 border-primary/20 space-y-0.5 pb-1">
  <a class="px-2 pt-0.5 pb-1 text-[10px] font-bold uppercase tracking-widest text-primary/80 hover:text-primary truncate block transition-colors" title="${projName}" href="/project?id=${project.id}">${projName} ↗</a>
  ${subLinks.map(l => {
    const cls = l.active
      ? 'flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] text-primary bg-primary/5 font-bold border-r-2 border-primary transition-all duration-150'
      : 'flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-all duration-150';
    const fill = l.active ? "style=\"font-variation-settings:'FILL' 1\"" : '';
    return `
  <a class="${cls}" href="${l.href}">
    <span class="material-symbols-outlined" style="font-size:15px" ${fill}>${l.icon}</span>
    <span>${l.label}</span>
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

  return { buildNavLinks, renderSidebar, renderSidebarWithProject, renderMobileNav, setupUserSection };
})();
