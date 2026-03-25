-- ─────────────────────────────────────────────────────────────────────────────
-- Poligrid – Supabase Schema
-- Run this entire file in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Shared updated_at trigger function
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ─── 1. Projects ─────────────────────────────────────────────────────────────
create table projects (
  id             uuid primary key,          -- client-generated UUID
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  property_type  text,                      -- Apartment | Villa | Commercial
  bhk            text,                      -- 2BHK | Open Plan Office | …
  total_area_m2  numeric,
  notes          text,
  bhk_type       text,                      -- derived by AI
  orientation    text,
  summary        text
);
create trigger projects_updated_at before update on projects
  for each row execute function update_updated_at_column();

-- ─── 2. Floor Plans ──────────────────────────────────────────────────────────
create table floor_plans (
  id             uuid primary key default uuid_generate_v4(),
  project_id     uuid not null references projects(id) on delete cascade,
  created_at     timestamptz not null default now(),
  file_name      text,
  storage_path   text,          -- path inside bucket poligrid-floor-plans
  analysis_raw   jsonb,         -- full /api/analyze/floorplan response
  analyzed_at    timestamptz
);

-- ─── 3. Inspiration Images ───────────────────────────────────────────────────
create table inspiration_images (
  id             uuid primary key default uuid_generate_v4(),
  project_id     uuid not null references projects(id) on delete cascade,
  created_at     timestamptz not null default now(),
  file_name      text,
  storage_path   text,          -- path inside bucket poligrid-inspiration
  sort_order     integer not null default 0
);

-- ─── 4. Rooms ─────────────────────────────────────────────────────────────────
create table rooms (
  id             uuid primary key default uuid_generate_v4(),
  project_id     uuid not null references projects(id) on delete cascade,
  floor_plan_id  uuid references floor_plans(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  label          text not null,             -- e.g. LR-01
  name           text,                      -- e.g. Living Room
  room_type      text,                      -- bedroom | living | kitchen | …
  bbox_x_pct     numeric,                   -- 0–1 fraction of image width
  bbox_y_pct     numeric,
  bbox_w_pct     numeric,
  bbox_h_pct     numeric,
  width_m        numeric,
  length_m       numeric,
  notes          text,
  walls          jsonb,                     -- [{ side, isExterior, adjacentRoomLabel, openings[] }]
  fp_placements  jsonb                      -- furniture drawn in floor plan
);
create trigger rooms_updated_at before update on rooms
  for each row execute function update_updated_at_column();

-- ─── 5. Camera Pins ──────────────────────────────────────────────────────────
create table camera_pins (
  id                  uuid primary key default uuid_generate_v4(),
  project_id          uuid not null references projects(id) on delete cascade,
  client_id           text not null,        -- id assigned by frontend
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  x_m                 numeric,
  y_m                 numeric,
  angle_deg           numeric,
  fov_deg             numeric default 60,
  room_label          text,
  brief               text,
  photo_file_name     text,
  photo_storage_path  text,                 -- path inside bucket poligrid-pin-photos
  unique (project_id, client_id)
);
create trigger camera_pins_updated_at before update on camera_pins
  for each row execute function update_updated_at_column();

-- ─── 6. Furniture Placements ─────────────────────────────────────────────────
create table furniture_placements (
  id          uuid primary key default uuid_generate_v4(),
  project_id  uuid not null references projects(id) on delete cascade,
  created_at  timestamptz not null default now(),
  client_id   text,                         -- id assigned by frontend
  module_id   text,
  label       text,
  type        text,                         -- cabinet | bed | seating | table | decor | custom
  room_label  text,
  room_type   text,
  x_m         numeric,
  y_m         numeric,
  w_m         numeric,
  d_m         numeric,
  h_m         numeric,
  rotation_y  numeric default 0,
  wall        text,                         -- north | south | east | west | center
  color       text,
  source      text                          -- manual | ai_suggestion | auto_place | floor_plan
);

-- ─── 7. Renders ──────────────────────────────────────────────────────────────
create table renders (
  id                    uuid primary key default uuid_generate_v4(),
  project_id            uuid not null references projects(id) on delete cascade,
  camera_pin_client_id  text,
  created_at            timestamptz not null default now(),
  room_label            text,
  storage_path          text,               -- path inside bucket poligrid-renders
  model_used            text,
  furniture_list        jsonb,              -- [{ label, type, wM, dM, hM }]
  generation_type       text               -- edit | generate
);

-- ─── 8. BOQ Items ────────────────────────────────────────────────────────────
create table boq_items (
  id          uuid primary key default uuid_generate_v4(),
  project_id  uuid not null references projects(id) on delete cascade,
  created_at  timestamptz not null default now(),
  source      text,                         -- floor_plan_analysis | furniture_generated
  category    text,                         -- Civil work | Plumbing | Flooring | …
  item        text,
  qty         numeric,
  unit        text,
  rate        numeric,
  amount      numeric
);

-- ─── 9. Scene Exports ────────────────────────────────────────────────────────
create table scene_exports (
  id                   uuid primary key default uuid_generate_v4(),
  project_id           uuid not null references projects(id) on delete cascade,
  created_at           timestamptz not null default now(),
  scene_json           jsonb,
  boq_csv_storage_path text                 -- path inside bucket poligrid-exports
);

-- ─── Indexes for common queries ───────────────────────────────────────────────
create index on floor_plans    (project_id);
create index on inspiration_images (project_id);
create index on rooms          (project_id);
create index on camera_pins    (project_id);
create index on furniture_placements (project_id);
create index on renders        (project_id);
create index on boq_items      (project_id, source);
create index on scene_exports  (project_id);
