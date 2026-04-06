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

-- ─── Migration: Add Project Versions (run after initial schema) ───────────────
-- Run these statements in the Supabase SQL Editor if the schema was already deployed.

-- 1. Version table — each version shares floor plan + rooms + pins but has its own
--    brief, inspiration images, renders, and BOQ.
create table if not exists project_versions (
  id                        uuid primary key default uuid_generate_v4(),
  project_id                uuid not null references projects(id) on delete cascade,
  version_number            integer not null,
  created_at                timestamptz not null default now(),
  design_brief              text,
  regen_inspiration_paths   jsonb,   -- storage paths of version-specific inspiration images
  unique(project_id, version_number)
);
create index if not exists idx_project_versions_project_id on project_versions(project_id);

-- 2. Link renders to a version
alter table renders add column if not exists version_id uuid references project_versions(id) on delete set null;
create index if not exists idx_renders_version_id on renders(version_id);

-- 3. Link furniture BOQ items to a version
alter table boq_items add column if not exists version_id uuid references project_versions(id) on delete set null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Role-Based Access Control (run after initial schema)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Enums ───────────────────────────────────────────────────────────────────

create type user_role as enum ('admin', 'sales', 'designer', 'lead_designer', 'ceo');

create type drawing_type as enum (
  'civil', 'electrical', 'plumbing', 'hvac',
  'firefighting', 'architectural', 'structural',
  'interior', 'landscape', 'other'
);

create type drawing_status as enum (
  'pending_review', 'approved', 'rejected', 'revision_requested'
);

create type task_status as enum ('pending', 'in_progress', 'completed', 'cancelled');

create type task_priority as enum ('low', 'medium', 'high');

-- ─── Profiles (extends Supabase auth.users) ──────────────────────────────────
-- One row per user, auto-created on sign-up via trigger below.
-- Admin panel manages the `role` column to grant/revoke access.

create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  email       text not null unique,
  role        user_role not null default 'sales',
  is_active   boolean not null default false,  -- blocked until admin activates
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger update_profiles_updated_at before update on profiles
  for each row execute function update_updated_at_column();

-- Auto-insert a profile row whenever a new user signs up in Supabase Auth.
-- The role can be pre-seeded via user_metadata when the admin creates the invite.
-- Every new Google sign-in is blocked by default (is_active = false).
-- Admin must activate users via the admin panel or SQL before they can log in.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'sales',
    false
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─── Extend projects with ownership + client info ────────────────────────────

alter table projects add column if not exists created_by   uuid references profiles(id);
alter table projects add column if not exists client_name  text;
alter table projects add column if not exists client_email text;
alter table projects add column if not exists client_phone text;
-- status: active | on_hold | completed | cancelled
alter table projects add column if not exists status       text not null default 'active';

create index if not exists idx_projects_created_by on projects(created_by);
create index if not exists idx_projects_status     on projects(status);

-- ─── Project Assignments ─────────────────────────────────────────────────────
-- Controls which users have access to which projects.
-- Sales are assigned by admin; designers/lead designers are assigned by admin or lead designer.

create table if not exists project_assignments (
  id          uuid primary key default uuid_generate_v4(),
  project_id  uuid not null references projects(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  assigned_by uuid references profiles(id),
  assigned_at timestamptz not null default now(),
  unique(project_id, user_id)
);

create index if not exists idx_project_assignments_project_id on project_assignments(project_id);
create index if not exists idx_project_assignments_user_id    on project_assignments(user_id);

-- ─── Drawings ────────────────────────────────────────────────────────────────
-- Designers upload drawings per project. Lead designers review and approve them.
-- Storage bucket: poligrid-drawings (create as private in Supabase dashboard)

create table if not exists drawings (
  id              uuid primary key default uuid_generate_v4(),
  project_id      uuid not null references projects(id) on delete cascade,
  uploaded_by     uuid not null references profiles(id),
  drawing_type    drawing_type not null,
  title           text not null,
  description     text,
  file_path       text not null,   -- path inside bucket poligrid-drawings
  file_name       text not null,
  file_size_bytes bigint,
  status          drawing_status not null default 'pending_review',
  version_number  integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_drawings_project_id   on drawings(project_id);
create index if not exists idx_drawings_uploaded_by  on drawings(uploaded_by);
create index if not exists idx_drawings_status       on drawings(status);

create trigger update_drawings_updated_at before update on drawings
  for each row execute function update_updated_at_column();

-- ─── Drawing Reviews ─────────────────────────────────────────────────────────
-- Each review by a lead designer appends a row; the drawing's status column is
-- updated to match the latest review outcome.

create table if not exists drawing_reviews (
  id           uuid primary key default uuid_generate_v4(),
  drawing_id   uuid not null references drawings(id) on delete cascade,
  reviewed_by  uuid not null references profiles(id),  -- must be lead_designer
  status       drawing_status not null,                -- approved | rejected | revision_requested
  comments     text,
  reviewed_at  timestamptz not null default now()
);

create index if not exists idx_drawing_reviews_drawing_id on drawing_reviews(drawing_id);

-- ─── Tasks ───────────────────────────────────────────────────────────────────
-- Drives each user's personal homepage. Can be linked to a project and/or a drawing.

create table if not exists tasks (
  id           uuid primary key default uuid_generate_v4(),
  assigned_to  uuid not null references profiles(id) on delete cascade,
  assigned_by  uuid references profiles(id),
  project_id   uuid references projects(id) on delete set null,
  drawing_id   uuid references drawings(id) on delete set null,
  title        text not null,
  description  text,
  status       task_status not null default 'pending',
  priority     task_priority not null default 'medium',
  due_date     date,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_tasks_assigned_to on tasks(assigned_to);
create index if not exists idx_tasks_project_id  on tasks(project_id);
create index if not exists idx_tasks_status      on tasks(status);

create trigger update_tasks_updated_at before update on tasks
  for each row execute function update_updated_at_column();

-- ─── CEO Dashboard View ───────────────────────────────────────────────────────
-- Aggregated per-project snapshot for the CEO drill-down dashboard.

create or replace view ceo_project_dashboard as
select
  p.id                                                                       as project_id,
  p.name                                                                     as project_name,
  p.status                                                                   as project_status,
  p.client_name,
  p.created_at,
  creator.full_name                                                          as sales_person,
  count(distinct pa.user_id)                                                 as team_size,
  count(distinct d.id) filter (where d.status = 'pending_review')           as drawings_pending_review,
  count(distinct d.id) filter (where d.status = 'approved')                 as drawings_approved,
  count(distinct d.id) filter (where d.status = 'revision_requested')       as drawings_needs_revision,
  count(distinct t.id) filter (where t.status = 'pending')                  as tasks_pending,
  count(distinct t.id) filter (where t.status = 'completed')                as tasks_completed
from projects p
left join profiles creator          on p.created_by = creator.id
left join project_assignments pa    on p.id = pa.project_id
left join drawings d                on p.id = d.project_id
left join tasks t                   on p.id = t.project_id
group by p.id, p.name, p.status, p.client_name, p.created_at, creator.full_name;

-- ─── Invitations (pre-invite before first login) ─────────────────────────────
-- Admin adds an email here. When the user signs in via Google OAuth, requireAuth
-- reads this table to set the correct role + activate the profile automatically.
-- Also supports auth.admin.createUser() path where role is stored in user_metadata.

create table if not exists invitations (
  email       text primary key,
  role        text not null,
  full_name   text,
  invited_by  uuid references profiles(id),
  invited_at  timestamptz not null default now()
);

-- ─── Storage Bucket Note ─────────────────────────────────────────────────────
-- Create the following bucket manually in Supabase Dashboard → Storage:
--   Name: poligrid-drawings
--   Public: No (private — serve files via signed URLs)

-- ─── One-time Bootstrap: Activate the first admin ────────────────────────────
-- Run AFTER sseaditya@gmail.com signs in with Google for the first time.
-- (Sign-in creates the profile row with is_active=false; this unlocks it.)
--
-- update profiles
-- set is_active = true, role = 'admin'
-- where email = 'sseaditya@gmail.com';
