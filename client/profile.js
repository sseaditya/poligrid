// ─── Profile page ─────────────────────────────────────────────────────────────
// URL: /profile  → own profile
// URL: /profile/<email-slug>  → another user (admin only)

let _session, _profile;

(async () => {
  try {
    ({ session: _session, profile: _profile } = await AuthClient.requireAuth());
  } catch { return; }

  AuthClient.renderUserChip(_profile, document.getElementById("userChipWrap"));
  renderNav(_profile);

  const mySlug  = emailToSlug(_profile.email);
  const pageSlug = getPageSlug();

  if (!pageSlug || pageSlug === mySlug) {
    await loadOwnProfile();
  } else {
    if (_profile.role !== "admin") {
      window.location.href = `/profile/${mySlug}`;
      return;
    }
    await loadOtherProfile(pageSlug);
  }
})();

// ─── Slug helpers ─────────────────────────────────────────────────────────────

function emailToSlug(email) {
  return email.split("@")[0].toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

function getPageSlug() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[1] || null; // parts[0] = "profile"
}

// ─── Own profile ───────────────────────────────────────────────────────────────

async function loadOwnProfile() {
  document.getElementById("ownProfileSection").hidden = false;
  document.getElementById("otherProfileSection").hidden = true;

  renderProfileHero(_profile);
  populateForm(_profile);
  renderAccountDl(_profile);
  renderQuickLinks(_profile);

  document.getElementById("saveProfileBtn").addEventListener("click", saveProfile);
  document.getElementById("resetPasswordBtn").addEventListener("click", sendPasswordReset);

  // Strip non-digits on phone field
  document.getElementById("fieldPhone").addEventListener("input", e => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10);
  });

  // Fetch stats for sidebar
  await loadStats(_profile);
}

function populateForm(profile) {
  document.getElementById("fieldName").value  = profile.full_name || "";
  document.getElementById("fieldPhone").value = profile.phone || "";
  document.getElementById("fieldEmail").value = profile.email || "";
  document.getElementById("fieldRole").value  = roleLabel(profile.role);
}

async function saveProfile() {
  const btn    = document.getElementById("saveProfileBtn");
  const status = document.getElementById("saveStatus");
  const name   = document.getElementById("fieldName").value.trim();
  const phone  = document.getElementById("fieldPhone").value.trim();

  if (!name) return setStatus(status, "Name cannot be empty.", "error");
  if (phone && !/^\d{10}$/.test(phone)) return setStatus(status, "Phone must be 10 digits.", "error");

  btn.disabled = true;
  setStatus(status, "Saving…", "");

  try {
    const headers = await AuthClient.authHeader();
    const res = await fetch("/api/profile/update", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: name, phone }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to save.");

    _profile = await AuthClient.getProfile(true);
    renderProfileHero(_profile);
    renderAccountDl(_profile);
    setStatus(status, "Saved!", "ok");
    setTimeout(() => setStatus(status, "", ""), 3000);
  } catch (err) {
    setStatus(status, err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

async function sendPasswordReset() {
  const btn    = document.getElementById("resetPasswordBtn");
  const status = document.getElementById("resetPwStatus");
  btn.disabled = true;
  setStatus(status, "Sending…", "");

  try {
    // Use Supabase client-side to trigger password reset
    const cfg = await fetch("/api/config").then(r => r.json());
    const sb  = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const { error } = await sb.auth.resetPasswordForEmail(_profile.email, {
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) throw error;
    setStatus(status, "Reset link sent to your email.", "ok");
    setTimeout(() => setStatus(status, "", ""), 5000);
  } catch (err) {
    setStatus(status, err.message || "Failed to send.", "error");
  } finally {
    btn.disabled = false;
  }
}

// ─── Load stats for sidebar ────────────────────────────────────────────────────

async function loadStats(profile) {
  const statsSection = document.getElementById("statsSection");
  const statPills    = document.getElementById("statPills");

  try {
    const headers = await AuthClient.authHeader();

    // Fetch projects
    const projRes = await fetch("/api/project/list", { headers });
    const projData = projRes.ok ? await projRes.json() : { projects: [] };
    const projectCount = (projData.projects || []).length;

    // Fetch open tasks
    const taskRes = await fetch("/api/tasks/list?status=pending", { headers });
    const taskData = taskRes.ok ? await taskRes.json() : { tasks: [] };
    const taskCount = (taskData.tasks || []).length;

    const pills = [
      { num: projectCount, label: "Projects" },
      { num: taskCount,    label: "Open Tasks" },
    ];

    // Lead designer: drawings to review
    if (profile.role === "lead_designer" || profile.role === "admin") {
      const drawRes  = await fetch("/api/drawings/pending", { headers });
      const drawData = drawRes.ok ? await drawRes.json() : { drawings: [] };
      const toReview = (drawData.drawings || []).length;
      pills.push({ num: toReview, label: "To Review" });
    }

    // Days as member
    if (profile.created_at) {
      const days = Math.floor((Date.now() - new Date(profile.created_at)) / 86400000);
      pills.push({ num: days, label: "Days with us" });
    }

    statPills.innerHTML = pills.map(p =>
      `<div class="profile-stat-pill">
        <div class="stat-num">${p.num}</div>
        <div class="stat-label">${p.label}</div>
      </div>`
    ).join("");

    // Sales: show milestone progress bar towards 5 projects
    if (profile.role === "sales" && projectCount >= 0) {
      const target = 10;
      const pct    = Math.min(100, Math.round((projectCount / target) * 100));
      document.getElementById("milestoneBlock").hidden = false;
      document.getElementById("milestoneLabel").textContent   = "Projects Milestone";
      document.getElementById("milestonePct").textContent     = `${pct}%`;
      document.getElementById("milestoneFill").style.width    = `${pct}%`;
      const remaining = Math.max(0, target - projectCount);
      document.getElementById("milestoneCaption").textContent =
        remaining > 0
          ? `${remaining} more project${remaining !== 1 ? "s" : ""} to reach your next milestone.`
          : "Milestone reached!";
    }

    document.getElementById("statsTitle").textContent = roleStatsTitle(profile.role);
    statsSection.hidden = false;
  } catch {
    // Stats are non-critical — silently skip
  }
}

function roleStatsTitle(role) {
  return {
    sales:         "My Performance",
    designer:      "My Activity",
    lead_designer: "Team Overview",
    admin:         "Platform Activity",
    ceo:           "Overview",
  }[role] || "Activity";
}

// ─── Quick links ───────────────────────────────────────────────────────────────

function renderQuickLinks(profile) {
  const container = document.getElementById("quickLinksList");
  const links = buildQuickLinks(profile.role);
  container.innerHTML = links.map(l =>
    `<a class="profile-quicklink" href="${l.href}">
      <span class="material-symbols-outlined">${l.icon}</span>
      ${l.label}
    </a>`
  ).join("");
}

function buildQuickLinks(role) {
  const all = [
    { roles: ["sales","lead_designer","admin"],           href: "/homepage",  icon: "home",             label: "Dashboard" },
    { roles: ["sales","lead_designer","admin"],           href: "/projects",  icon: "folder_open",      label: "Projects" },
    { roles: ["sales","lead_designer","admin"],           href: "/index",     icon: "architecture",     label: "Fitout Planner" },
    { roles: ["designer","lead_designer","admin"],        href: "/designer",  icon: "draw",             label: "Drawings Manager" },
    { roles: ["lead_designer","admin"],                   href: "/designer",  icon: "rate_review",      label: "Review Drawings" },
    { roles: ["admin"],                                   href: "/admin",     icon: "manage_accounts",  label: "Team Admin" },
    { roles: ["admin","ceo"],                             href: "/ceo",       icon: "monitoring",       label: "CEO Dashboard" },
    { roles: ["ceo"],                                     href: "/ceo",       icon: "monitoring",       label: "Dashboard" },
  ];
  return all.filter(l => l.roles.includes(role));
}

// ─── Account details DL ────────────────────────────────────────────────────────

function renderAccountDl(profile) {
  const dl = document.getElementById("accountDl");
  const rows = [
    { label: "Member since", value: fmtDate(profile.created_at) },
    { label: "Email",        value: profile.email },
    { label: "Role",         value: roleLabel(profile.role) },
  ];
  if (profile.phone) rows.push({ label: "Phone", value: profile.phone });
  dl.innerHTML = rows.map(r =>
    `<div class="account-dl-row"><dt>${r.label}</dt><dd>${r.value}</dd></div>`
  ).join("");
}

// ─── Other user's profile (admin view) ───────────────────────────────────────

async function loadOtherProfile(slug) {
  document.getElementById("ownProfileSection").hidden = true;
  document.getElementById("otherProfileSection").hidden = false;

  try {
    const headers = await AuthClient.authHeader();
    const res = await fetch(`/api/profile/by-slug?slug=${encodeURIComponent(slug)}`, { headers });
    if (res.status === 404) {
      document.getElementById("otherProfileSection").hidden = true;
      document.getElementById("profileError").hidden = false;
      return;
    }
    const { profile } = await res.json();

    renderProfileHero(profile);

    // Show admin badge in hero
    const heroActions = document.getElementById("heroActions");
    const badge       = document.getElementById("heroAdminBadge");
    badge.textContent = "Admin view";
    heroActions.hidden = false;

    document.getElementById("viewEmail").textContent       = profile.email || "—";
    document.getElementById("viewPhone").textContent       = profile.phone || "Not set";
    document.getElementById("viewRole").textContent        = roleLabel(profile.role);
    document.getElementById("viewMemberSince").textContent = fmtDate(profile.created_at);
  } catch {
    document.getElementById("otherProfileSection").hidden = true;
    document.getElementById("profileError").hidden = false;
  }
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function renderProfileHero(profile) {
  const initials = (profile.full_name || profile.email || "?")
    .split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join("");

  document.getElementById("profileAvatar").textContent  = initials;
  document.getElementById("profileName").textContent    = profile.full_name || profile.email;
  document.getElementById("profileEmail").textContent   = profile.email;
  document.getElementById("profileMemberSince").textContent = `Member since ${fmtDate(profile.created_at)}`;

  const badge = document.getElementById("profileRoleBadge");
  badge.textContent = roleLabel(profile.role);
  badge.className   = `profile-role-badge role-${profile.role}`;
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function renderNav(profile) {
  const nav = document.getElementById("dashNav");
  const links = [
    { href: "/homepage", label: "Home" },
    { href: "/projects", label: "Projects" },
  ];
  if (["sales", "admin", "lead_designer"].includes(profile.role))
    links.push({ href: "/projects", label: "Fitout Planner" });
  if (["designer", "lead_designer", "admin"].includes(profile.role))
    links.push({ href: "/designer", label: "Drawings" });
  if (profile.role === "admin") {
    links.push({ href: "/admin", label: "Admin" });
    links.push({ href: "/ceo",   label: "Dashboard" });
  }
  if (profile.role === "ceo")
    links.push({ href: "/ceo", label: "Dashboard" });

  nav.innerHTML = links.map(l =>
    `<a class="dash-nav-link" href="${l.href}">${l.label}</a>`
  ).join("");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setStatus(el, msg, cls) {
  el.textContent = msg;
  el.className   = ["save-status", cls].filter(Boolean).join(" ");
}

function roleLabel(role) {
  return {
    admin:         "Admin",
    sales:         "Sales Associate",
    designer:      "Junior Designer",
    lead_designer: "Design Lead",
    ceo:           "CEO",
  }[role] || role;
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
}
