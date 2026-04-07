// ─── Profile page ─────────────────────────────────────────────────────────────
// URL: /profile/<email-slug>
// Own profile → editable. Another user's profile → read-only (admin only).

let _session, _profile;

(async () => {
  try {
    ({ session: _session, profile: _profile } = await AuthClient.requireAuth());
  } catch { return; }

  AuthClient.renderUserChip(_profile, document.getElementById("userChipWrap"));
  renderNav(_profile);

  // Derive slug for the current user to check if this is own profile
  const mySlug = emailToSlug(_profile.email);
  const pageSlug = getPageSlug();

  if (!pageSlug || pageSlug === mySlug) {
    // Own profile
    loadOwnProfile();
  } else {
    // Another user's profile — admin only
    if (_profile.role !== "admin") {
      window.location.href = `/profile/${mySlug}`;
      return;
    }
    loadOtherProfile(pageSlug);
  }
})();

// ─── Slug helpers ─────────────────────────────────────────────────────────────

function emailToSlug(email) {
  return email.split("@")[0].toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
}

function getPageSlug() {
  // URL: /profile/<slug>
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[1] || null; // parts[0] = "profile"
}

// ─── Own profile ───────────────────────────────────────────────────────────────

async function loadOwnProfile() {
  document.getElementById("ownProfileSection").hidden = false;
  document.getElementById("otherProfileSection").hidden = true;

  renderProfileHeader(_profile);

  document.getElementById("fieldName").value  = _profile.full_name || "";
  document.getElementById("fieldPhone").value = _profile.phone || "";
  document.getElementById("fieldEmail").value = _profile.email || "";
  document.getElementById("fieldRole").value  = roleLabel(_profile.role);

  document.getElementById("saveProfileBtn").addEventListener("click", saveProfile);

  // Strip non-digits as user types
  document.getElementById("fieldPhone").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10);
  });
}

async function saveProfile() {
  const btn = document.getElementById("saveProfileBtn");
  const status = document.getElementById("saveStatus");
  const name  = document.getElementById("fieldName").value.trim();
  const phone = document.getElementById("fieldPhone").value.trim();

  if (!name) {
    status.textContent = "Name cannot be empty.";
    status.className = "profile-save-status error";
    return;
  }
  if (phone && !/^\d{10}$/.test(phone)) {
    status.textContent = "Phone must be exactly 10 digits.";
    status.className = "profile-save-status error";
    return;
  }

  btn.disabled = true;
  status.textContent = "Saving…";
  status.className = "profile-save-status";

  try {
    const headers = await AuthClient.authHeader();
    const res = await fetch("/api/profile/update", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: name, phone }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to save.");

    // Refresh cached profile and re-render header
    _profile = await AuthClient.getProfile(true);
    renderProfileHeader(_profile);

    status.textContent = "Saved!";
    status.className = "profile-save-status success";
    setTimeout(() => { status.textContent = ""; }, 3000);
  } catch (err) {
    status.textContent = err.message;
    status.className = "profile-save-status error";
  } finally {
    btn.disabled = false;
  }
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

    renderProfileHeader(profile);

    document.getElementById("viewEmail").textContent       = profile.email || "—";
    document.getElementById("viewPhone").textContent       = profile.phone || "Not set";
    document.getElementById("viewRole").textContent        = roleLabel(profile.role);
    document.getElementById("viewMemberSince").textContent = fmtDate(profile.created_at);
  } catch {
    document.getElementById("otherProfileSection").hidden = true;
    document.getElementById("profileError").hidden = false;
  }
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function renderProfileHeader(profile) {
  const initials = (profile.full_name || profile.email || "?")
    .split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join("");
  document.getElementById("profileAvatar").textContent   = initials;
  document.getElementById("profileName").textContent     = profile.full_name || profile.email;
  document.getElementById("profileEmail").textContent    = profile.email;
  document.getElementById("profileMemberSince").textContent = `Member since ${fmtDate(profile.created_at)}`;

  const badge = document.getElementById("profileRoleBadge");
  badge.textContent = roleLabel(profile.role);
  badge.className   = `profile-role-badge role-${profile.role}`;
}

function renderNav(profile) {
  const nav = document.getElementById("dashNav");
  const links = [
    { href: "/homepage", label: "Home" },
    { href: "/projects", label: "Projects" },
  ];
  if (["sales", "admin", "lead_designer"].includes(profile.role)) {
    links.push({ href: "/projects", label: "Fitout Planner" });
  }
  if (["designer", "lead_designer", "admin"].includes(profile.role)) {
    links.push({ href: "/designer", label: "Drawings" });
  }
  if (profile.role === "admin") {
    links.push({ href: "/admin", label: "Admin" });
    links.push({ href: "/ceo", label: "Dashboard" });
  }
  if (profile.role === "ceo") {
    links.push({ href: "/ceo", label: "Dashboard" });
  }
  nav.innerHTML = links.map(l =>
    `<a class="dash-nav-link" href="${l.href}">${l.label}</a>`
  ).join("");
}

function roleLabel(role) {
  return { admin: "Admin", sales: "Sales", designer: "Designer", lead_designer: "Lead Designer", ceo: "CEO" }[role] || role;
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
}
