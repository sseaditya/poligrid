# Poligrid — Long-term TODO

Items here are non-urgent improvements, optimisations, or larger refactors. Ordered roughly by impact.

---

## Performance

- [ ] **Supabase RPC for `projectLoad`** — replace the 8 parallel queries with a single Postgres function (`get_project(id uuid)`) that returns the full project payload in one round trip. Would cut load time from ~500ms to ~100ms. Needs a migration + `server/projects.js` update.
- [ ] **Supabase RPC for `projectList`** — the non-admin path does 2 queries (assignments → IN filter). A view or RPC with a JOIN would collapse this to 1.
- [ ] **Paginate `projectList`**  — currently returns all projects. Will degrade as the dataset grows; add `limit` + `offset` or cursor-based pagination.
- [ ] **Strip heavy columns from render fetches** — `renders.furniture_list` is a large JSON blob pulled on every project load even when only the render URL is needed. Add a lightweight `renders_summary` view that omits it, use that for project load; fetch full row only when editing.

## Infrastructure

- [ ] **Vercel cold-start mitigation** — first request after ~5 min idle adds 1-2s. Options: (a) paid Vercel plan with "fluid compute" / always-on, (b) a cron job that pings `/api/config` every 4 min to keep the function warm.

## Features / integrations

- [ ] **WhatsApp notifications** — stubs exist in `server/notifications.js`. Wire real Twilio/Meta API calls for drawing upload, review, and task-assigned events. Needs `phone` field added to `profiles` table.
- [ ] **Inventory** — link BOQ line items to a products/items catalogue table. BOQ system already generates items; just needs a products table + foreign key.
- [ ] **Finance module** — aggregate BOQ totals across projects (per client, per period). BOQ data is already structured; needs a reporting layer.

## Code quality

- [ ] **`app.js` split (3205 lines)** — the root-level fitout planner monolith. Candidate modules: canvas rendering, room state, camera-pin logic, phase orchestration.
- [ ] **`client/phases.js` split (904 lines)** — phase UI is getting large; could be split per phase.
