# Poligrid Filemap
> Reference for Claude Code — reduces token burn on structure discovery.

## Entry Points
| File | Role |
|------|------|
| `server.js` | Express dev server — serves static files + mounts `api/route.js` |
| `vercel.json` | Vercel config — rewrites all `/api/*` to `api/route.js` (serverless) |
| `api/route.js` | **Single serverless function** — all API routing + all AI logic (2641 lines, see split plan below) |

## HTML Pages
| File | Who sees it | Client JS |
|------|-------------|-----------|
| `login.html` | All | `client/auth.js` |
| `homepage.html` | All (post-login) | `client/homepage.js` |
| `index.html` | sales, lead_designer, admin | `app.js`, `client/phases.js`, etc. |
| `sales.html` | sales | `client/sales.js` |
| `designer.html` | designer, lead_designer, admin | `client/designer.js` |
| `admin.html` | admin | `client/admin.js` |
| `ceo.html` | ceo, admin | `client/ceo.js` |
| `project.html` | all roles | `client/project-detail.js` |
| `projects.html` | all roles | `client/projects.js` |
| `profile.html` | all roles | `client/profile.js` |

## Client-side JS (`client/`)
| File | Purpose |
|------|---------|
| `auth.js` | Supabase auth client — `AuthClient.requireAuth(roles)`, token management |
| `state.js` | Global project state shared across client modules |
| `constants.js` | Shared constants (room types, furniture categories, pricing, etc.) |
| `utils.js` | Generic client helpers |
| `phases.js` | Fitout planner phase UI (floor plan → camera pins → renders → BOQ) — 904 lines |
| `generate.js` | Render generation UI (calls `/api/render/openai`, `/api/furnish-room`) |
| `floor-plan.js` | Floor plan canvas interaction (room overlay editing) |
| `boq.js` | BOQ display + editing |
| `render-cards.js` | Render card components |
| `project-picker.js` | Project selection dropdown/modal |
| `project-detail.js` | Project detail page logic |
| `projects.js` | Projects list page |
| `homepage.js` | Homepage: tasks, project list, review queue |
| `designer.js` | Drawing upload + review UI (683 lines) |
| `sales.js` | Sales-specific project list view |
| `admin.js` | Admin user/role management UI |
| `ceo.js` | CEO dashboard charts/stats |
| `pricing.js` | Hyderabad pricing lookup helpers |
| `profile.js` | Profile page — edit own name/phone, view others (admin) |
| `debugger.js` | Dev-only debug panel |

## Server-side JS (`server/`)
| File | Purpose |
|------|---------|
| `auth.js` | JWT middleware — `requireAuth(req, roles)`, `getAuthProfile(req)` |
| `config.js` | Env/config helpers |
| `projects.js` | Project CRUD + Supabase queries (745 lines) |
| `openai.js` | OpenAI API wrappers — renders, analysis, BOQ (1244 lines) |
| `drawings.js` | Drawing upload to Supabase Storage + lead-designer review flow (555 lines) |
| `tasks.js` | Task CRUD (auto-created on drawing events) |
| `admin.js` | User list, role update, project assignments, CEO dashboard |
| `notifications.js` | **Stub** — WhatsApp/Twilio hooks for drawing upload/review/task events |
| `png.js` | PNG encode helpers (camera annotation overlay) |
| `utils.js` | Server-side shared helpers |

## Root-level JS (legacy/canvas)
| File | Purpose |
|------|---------|
| `app.js` | Main fitout planner app — canvas, state, orchestration (3205 lines, monolith) |
| `analysis.js` | Floor plan analysis helpers |
| `planner-canvas.js` | Canvas rendering for planner |
| `room-editor.js` | Room polygon editor |
| `deck-generator.js` | PDF/deck export |
| `test-openai-vision.js` | Dev test script |

## DB / Config
| File | Purpose |
|------|---------|
| `db.js` | Supabase client singleton |
| `supabase_schema.sql` | Full DB schema |
| `migration_drawing_assignments.sql` | Migration: drawing_assignments table |
| `.env.local` | Secrets (not committed) |
| `.env.example` | Env var template |
| `package.json` | Node deps |
| `styles.css` | Global styles |

## API Endpoints (all in `api/route.js`)
```
GET  /api/config                    → { supabaseUrl, supabaseAnonKey }
GET  /api/auth/me                   → current user profile

POST /api/render/openai             → generate room render (OpenAI image)
POST /api/style/extract             → extract style from inspiration images
POST /api/analyze/floorplan         → analyze floor plan image → rooms
POST /api/analyze/room-image        → match room in floor plan
POST /api/furniture/suggest         → suggest furniture for room
POST /api/furniture/autoplace       → auto-place furniture in room
POST /api/furnish-room              → inpaint furniture into render
POST /api/chat/placement            → chat-driven furniture placement
POST /api/inspire/extract-furnish-style
POST /api/generate-text             → generic text generation

GET  /api/project/list              → role-filtered project list
GET  /api/project/load?id=          → full project data
GET  /api/project/versions?id=      → version history
GET  /api/project/detail?id=        → project detail (incl. assignments)
GET  /api/project/team?id=          → assigned users for project
POST /api/project/create
POST /api/project/update
POST /api/project/update-status
POST /api/project/assign-user
POST /api/project/unassign-user
POST /api/project/advance-payment
POST /api/project/generate-boq
POST /api/project/save-analysis     → (via action dispatcher)
POST /api/project/save-rooms
POST /api/project/save-inspiration
POST /api/project/save-pin
POST /api/project/save-render
POST /api/project/save-placements
POST /api/project/save-boq
POST /api/project/save-scene
POST /api/project/rename
POST /api/project/save-brief
POST /api/project/create-version

GET  /api/drawings/list?projectId=
GET  /api/drawings/pending
GET  /api/drawings/signed-url?path=
POST /api/drawings/upload
POST /api/drawings/review

GET  /api/tasks/list
POST /api/tasks/create
POST /api/tasks/update

GET  /api/users/list
POST /api/users/update-role

GET  /api/ceo/dashboard
GET  /api/ceo/team-stats

GET  /api/profile/by-slug?slug=   → admin: fetch any user profile by email slug
POST /api/profile/update           → update own full_name + phone

GET  /api/sales/projects
```
