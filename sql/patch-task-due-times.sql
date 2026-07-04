-- enCasa · patch: horarios múltiples de vencimiento + created_at
-- Ejecutar en el SQL editor de Supabase sobre una base existente.
--
-- Qué hace:
--  1. Agrega la columna due_times text[] (fuente de verdad de los horarios
--     de vencimiento de las tareas diarias). due_time / active_from quedan
--     como legacy.
--  2. Agrega created_at timestamptz para no considerar vencimientos
--     anteriores a la creación de la tarea.
--  3. Migra los datos actuales: pobla due_times desde due_time cuando
--     due_times sea null.
--
-- Es idempotente: se puede correr varias veces sin efectos secundarios.

alter table task_templates
  add column if not exists due_times text[];

alter table task_templates
  add column if not exists created_at timestamptz not null default now();

update task_templates
  set due_times = array[due_time]
  where due_times is null
    and due_time is not null;
