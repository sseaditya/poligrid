// ─── Client-side Auth (Supabase Auth wrapper) ─────────────────────────────────
// All pages include this file + the Supabase CDN script.
// Usage:
//   const { session, profile } = await AuthClient.requireAuth(['sales', 'admin']);

const AuthClient = (() => {
  let _sb = null;
  let _config = null;
  let _profile = null;

  async function _getConfig() {
    if (_config) return _config;
    const res = await fetch("/api/config");
    _config = await res.json();
    return _config;
  }

  async function _getSb() {
    if (_sb) return _sb;
    const cfg = await _getConfig();
    _sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return _sb;
  }

  async function getSession() {
    const sb = await _getSb();
    const { data: { session } } = await sb.auth.getSession();
    return session;
  }

  async function getProfile(forceRefresh) {
    if (_profile && !forceRefresh) return _profile;
    const session = await getSession();
    if (!session) return null;
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.status === 403) {
      // Account exists but is not yet approved — sign out and bounce to login
      const sb = await _getSb();
      await sb.auth.signOut();
      window.location.href = "/login.html?blocked=1";
      return null;
    }
    if (!res.ok) return null;
    const data = await res.json();
    _profile = data.profile;
    return _profile;
  }

  // Call at top of every protected page.
  // allowedRoles = null means any authenticated user is fine.
  // Redirects and throws if not authorised (so page code below it won't run).
  async function requireAuth(allowedRoles) {
    const session = await getSession();
    if (!session) { window.location.href = "/login.html"; throw new Error("unauthenticated"); }
    const profile = await getProfile();
    if (!profile) throw new Error("blocked"); // getProfile already triggered redirect
    if (allowedRoles && !allowedRoles.includes(profile.role)) {
      window.location.href = "/homepage.html";
      throw new Error("unauthorised role");
    }
    return { session, profile };
  }

  async function signInWithGoogle() {
    const sb = await _getSb();
    // After Google auth, Supabase redirects here with ?code=...; homepage.js
    // then routes the user to the right page based on their role.
    return sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/homepage.html" },
    });
  }

  async function signOut() {
    const sb = await _getSb();
    await sb.auth.signOut();
    _profile = null;
    window.location.href = "/login.html";
  }

  // Helper: returns auth header object for fetch calls
  async function authHeader() {
    const session = await getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : {};
  }

  // Render a consistent user chip in any topbar element
  function renderUserChip(profile, container) {
    const roleLabel = {
      admin: "Admin",
      sales: "Sales",
      designer: "Designer",
      lead_designer: "Lead Designer",
      ceo: "CEO",
    }[profile.role] || profile.role;

    container.innerHTML = `
      <div class="user-chip">
        <span class="user-chip-name">${profile.full_name}</span>
        <span class="user-chip-role role-${profile.role}">${roleLabel}</span>
        <button class="ghost-sm user-chip-logout" id="logoutBtn">Sign out</button>
      </div>`;
    container.querySelector("#logoutBtn").addEventListener("click", () => signOut());
  }

  return { requireAuth, signInWithGoogle, signOut, getSession, getProfile, authHeader, renderUserChip };
})();
