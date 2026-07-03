-- enCasa - esquema y datos semilla para Supabase (Postgres)
-- Ejecutar en el SQL editor de Supabase.

-- ============================================================
-- Tablas
-- ============================================================

create table if not exists profiles (
  id text primary key,
  name text not null
);

create table if not exists zones (
  id text primary key,
  name text not null,
  sort_order int not null default 0
);

create table if not exists task_templates (
  id text primary key,
  zone_id text not null references zones(id) on delete cascade,
  title text not null,
  assigned_to text references profiles(id) on delete set null,
  recurrence_type text not null check (recurrence_type in ('daily', 'every_n_days')),
  due_time text,          -- "HH:MM", usado por tareas daily
  active_from text,       -- "HH:MM", usado por tareas daily
  interval_days int,      -- usado por tareas every_n_days
  active_days int[],      -- 0 (domingo) - 6 (sábado); null/[] = todos los días
  enabled boolean not null default true
);

create table if not exists task_completions (
  id uuid primary key default gen_random_uuid(),
  task_template_id text not null references task_templates(id) on delete cascade,
  completed_by text not null references profiles(id),
  completed_at timestamptz not null default now()
);

create index if not exists task_completions_task_template_id_idx
  on task_completions(task_template_id);

create index if not exists task_completions_completed_at_idx
  on task_completions(completed_at);

-- ============================================================
-- Row Level Security
-- ------------------------------------------------------------
-- El MVP usa "login simbólico" sin autenticación real de Supabase:
-- toda la app opera con la clave anónima (anon key). Para que la
-- app pueda leer y escribir, se habilita RLS con políticas
-- permisivas para el rol anon/authenticated.
--
-- ADVERTENCIA: esto significa que cualquiera con la anon key puede
-- leer y escribir estas tablas. Es aceptable para un MVP familiar
-- privado, pero antes de exponerlo públicamente hay que añadir
-- autenticación real y políticas más estrictas.
-- ============================================================

alter table profiles enable row level security;
alter table zones enable row level security;
alter table task_templates enable row level security;
alter table task_completions enable row level security;

drop policy if exists "profiles_select_all" on profiles;
create policy "profiles_select_all" on profiles
  for select using (true);

drop policy if exists "zones_select_all" on zones;
create policy "zones_select_all" on zones
  for select using (true);

drop policy if exists "task_templates_select_all" on task_templates;
create policy "task_templates_select_all" on task_templates
  for select using (true);

drop policy if exists "task_completions_select_all" on task_completions;
create policy "task_completions_select_all" on task_completions
  for select using (true);

drop policy if exists "task_completions_insert_all" on task_completions;
create policy "task_completions_insert_all" on task_completions
  for insert with check (true);

-- ============================================================
-- Seed: perfiles
-- ============================================================

insert into profiles (id, name) values
  ('papa-angel', 'Papá Angel'),
  ('mama-lau', 'Mamá Lau'),
  ('paulina', 'Paulina'),
  ('carlitos', 'Carlitos')
on conflict (id) do update set name = excluded.name;

-- ============================================================
-- Seed: zonas
-- ============================================================

insert into zones (id, name, sort_order) values
  ('patio-trasero', 'Patio trasero', 1),
  ('bano', 'Baño', 2),
  ('pasillo', 'Pasillo', 3),
  ('estudio', 'Estudio', 4),
  ('garaje', 'Garaje', 5),
  ('cocina', 'Cocina', 6),
  ('comedor', 'Comedor', 7),
  ('sala', 'Sala', 8),
  ('jardin', 'Jardín', 9),
  ('cuarto', 'Cuarto', 10)
on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order;

-- ============================================================
-- Seed: tareas iniciales del Comedor
-- ============================================================

insert into task_templates
  (id, zone_id, title, assigned_to, recurrence_type, due_time, active_from, interval_days, active_days, enabled)
values
  ('comedor-levantar-trastes', 'comedor', 'Levantar trastes', 'carlitos', 'daily', '11:00', '06:00', null, null, true),
  ('comedor-limpiar-mesa', 'comedor', 'Limpiar mesa', 'paulina', 'daily', '11:00', '06:00', null, null, true),
  ('comedor-limpiar-suelo', 'comedor', 'Limpiar suelo', 'papa-angel', 'every_n_days', null, null, 3, null, true)
on conflict (id) do update set
  zone_id = excluded.zone_id,
  title = excluded.title,
  assigned_to = excluded.assigned_to,
  recurrence_type = excluded.recurrence_type,
  due_time = excluded.due_time,
  active_from = excluded.active_from,
  interval_days = excluded.interval_days,
  active_days = excluded.active_days,
  enabled = excluded.enabled;
