-- enCasa - patch: permite crear/editar task_templates desde el panel /tareas
-- usando la anon key (no hay autenticación real en este MVP).
-- Ejecutar una sola vez en una base ya creada.
--
-- A propósito NO se agrega política de delete: las tareas solo se
-- desactivan (enabled = false) o reactivan (enabled = true), nunca se
-- borran físicamente.

alter table task_templates enable row level security;

drop policy if exists "task_templates_insert_all" on task_templates;
create policy "task_templates_insert_all" on task_templates
  for insert with check (true);

drop policy if exists "task_templates_update_all" on task_templates;
create policy "task_templates_update_all" on task_templates
  for update using (true) with check (true);
