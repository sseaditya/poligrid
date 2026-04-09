> For file structure, API endpoints, and module purposes — see **FILEMAP.md** in this directory.

This is a platform that helps my interior design firm give initial designs + quotation to clients using their inspiration images (from pinterest), their floor plan and their design brief.
We use the following structure
    1. Client adds the floor plan, we process it and understand it assigning the overlay of rooms on the floor plan, the user can adjust it
    2. After that the use can put camera pin on the floor plan and it contain this info (location, fov and direction of camera) and we add a 3d image over there. the user can do it in multiple rooms
    3. Finally you have to auto generate furniture and place it in the 3d images and the boq list. ensure that you inpaint and keep the original substance and angle of the original 3d image.
    4. You use the low image generation quality, the other text generation quality you can modify however necessary, but we are testing and want to spend minimum money.
    5. Finally you are also supposed to derive the following in the boq list
        plumbing - plumbing for the entire space, think using floor plan
        electrical - for the entire place think using floor plan
        faux ceiling - if necessary
        modular furniture - expect a detailed list here
        flooring - derive based on floor plan
        doors and windows
        paintwork - entire house
        use hyd premium prices for this.

## Multi-role platform (added 2026-04-01)
The app now has Supabase Auth and role-based access control.

### Roles
- admin — full access, manages roles, see all projects
- sales — fitout planner only (index.html), sees own/assigned projects
- designer — uploads drawings per project (designer.html)
- lead_designer — approves/rejects designer drawings, sees assigned projects + fitout planner
- ceo — read-only CEO dashboard (ceo.html)

### Pages
- login.html — Supabase Auth sign-in (all users)
- homepage.html — per-user homepage with tasks + projects + review queue
- index.html — fitout planner (sales, lead_designer, admin)
- designer.html — drawing upload & review (designer, lead_designer, admin)
- admin.html — user role management + project assignments (admin only)
- ceo.html — aggregated project drill-down dashboard (ceo, admin)
- project.html — unified role-based project detail page (all roles, sections gated by role)

### project.html — Role Permission Matrix
Each section of the project detail page is shown/hidden based on role:

| Section                              | sales | designer | lead_designer | admin | ceo |
|--------------------------------------|:-----:|:--------:|:-------------:|:-----:|:---:|
| Project hero (name, client, status)  |  ✓    |    ✓     |      ✓        |   ✓   |  —  |
| Edit project details                 |  ✓    |    ✓     |      ✓        |   ✓   |  —  |
| Change project status                |  —    |    —     |      ✓        |   ✓   |  —  |
| Mark advance payment done            |  ✓    |    —     |      —        |   ✓   |  —  |
| AI Results & Estimate (renders+BOQ)  |  ✓    |    —     |      —        |   ✓   |  —  |
| Stage 1 Reference Concepts           |  —    |    ✓     |      ✓        |   ✓   |  —  |
| Technical Drawings table             |  —    |    ✓     |      ✓        |   ✓   |  —  |
| Verify / Review drawing buttons      |  —    |    —     |      ✓        |   ✓   |  —  |
| Upload drawing shortcut              |  —    |    ✓     |      ✓        |   ✓   |  —  |
| Approval pipeline sidebar            |  —    |    ✓     |      ✓        |   ✓   |  —  |
| Quick link: Fitout Planner           |  ✓    |    —     |      ✓        |   ✓   |  —  |
| Quick link: Drawings Manager         |  —    |    ✓     |      ✓        |   ✓   |  —  |
| Quick link: Share with Client        |  ✓    |    —     |      —        |   ✓   |  —  |
| Property Details                     |  ✓    |    ✓     |      ✓        |   ✓   |  —  |
| Floor Plan thumbnail                 |  ✓    |    ✓     |      ✓        |   ✓   |  —  |
| Team (assign / unassign members)     |  —    |    —     |      ✓        |   ✓   |  —  |
| My Tasks (pending for this project)  |  —    |    ✓     |      —        |   —   |  —  |

Notes:
- ceo role does not have access to project.html (they use ceo.html dashboard only)
- admin sees every section — effectively the union of all roles
- The `can.*` helpers in client/project-detail.js are the single source of truth for this table

### New server files
- server/auth.js — JWT validation middleware (requireAuth, getAuthProfile)
- server/drawings.js — drawing upload + lead designer review flow
- server/tasks.js — task CRUD (auto-created on drawing upload/review)
- server/admin.js — user list, role update, project assignments, CEO dashboard

### Key env vars to set in .env.local
- SUPABASE_ANON_KEY — anon/public key, exposed to client via GET /api/config
- SUPABASE_SERVICE_ROLE_KEY — server-only (already set)

### Auth flow
- Client uses @supabase/supabase-js CDN + client/auth.js
- SUPABASE_URL and SUPABASE_ANON_KEY are fetched from GET /api/config
- Each protected page calls AuthClient.requireAuth(allowedRoles) at load
- Server validates Bearer JWT via sb.auth.getUser(token) in server/auth.js
- project list (GET /api/project/list) is now role-filtered

### Storage
- poligrid-drawings bucket — PRIVATE, accessed via signed URLs (GET /api/drawings/signed-url?path=)

### Future integrations (stubs in place)
- **WhatsApp notifications**: server/notifications.js has notifyDrawingUploaded / notifyDrawingReviewed / notifyTaskAssigned stubs. Wire real Twilio/Meta calls there. User phone field will need to be added to profiles table.
- **Inventory**: will need products/items tables and a link to BOQ line items. BOQ system already exists.
- **Finances**: BOQ is already generated per project. Finance module will aggregate across projects.