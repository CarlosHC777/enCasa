-- enCasa · patch: covered_due_at en task_completions (ventana de gracia)
-- Ejecutar en el SQL editor de Supabase sobre una base existente.
--
-- Qué hace:
--  1. Agrega covered_due_at timestamptz null a task_completions. Guarda qué
--     ocurrencia de vencimiento cubre cada completion (según la ventana de
--     gracia de 2 h). Las completions anteriores quedan con null (legacy) y se
--     emparejan por completed_at.
--  2. Índice por (task_template_id, covered_due_at) para consultas por tarea.
--
-- Es idempotente y no borra datos.

alter table task_completions
  add column if not exists covered_due_at timestamptz;

create index if not exists task_completions_task_covered_due_at_idx
  on task_completions(task_template_id, covered_due_at);
