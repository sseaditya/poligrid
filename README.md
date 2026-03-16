# Interior Fitout Planner (Web Prototype)

A no-database web app for interior furniture concepting in India.

## What it takes as input
- Floor plan image (with room numbers labelled on the plan)
- Rooms (add one at a time):
  - Room number/label (must match floor plan label)
  - Room dimensions (meters)
  - Room photos (multiple)
  - Per-room design brief
  - Per-room inspiration images (optional)

## What it outputs
- Furnished concept images per room (downloadable PNG)
- Scene JSON
- Standardized BOM/cutlist rollup (plywood/laminate/edge banding/hinges/channels/handles) + India first-quality cost estimate (downloadable CSV)

## Image generation mode
- OpenAI-only (server-side `OPENAI_API_KEY` from `.env.local`).
- For each room, the app first extracts a style direction from inspiration images, then furnishes each room photo using OpenAI image edits.
- If an AI request fails for any image, app auto-falls back to a local quick mock for that image.

## Key assumptions
- Standard laminate sheet size: `8ft x 4ft`.
- Rate card uses typical metro market values and is meant for first-pass budgeting.
- Auto-placement uses room dimensions from the floor plan and keeps furniture within room bounds.
- Final production should be validated against exact site measurements and civil/electrical constraints.

## Run
1. Create your secure env file:

```bash
cp .env.example .env.local
```

2. Put your keys in `.env.local`:

```env
OPENAI_API_KEY=your_key_here
PORT=8080
```

3. Start the app server:

```bash
node server.js
```

4. Open `http://localhost:8080`.

## Notes
- No database/persistence is used.
- To revise output, update files/brief/rooms and click **Generate furnished rooms + BOM** again.
- Auto laminate selection is based on brief + inspiration (no manual laminate selection in UI).
- `.env.local` is gitignored and not committed.
