-- enCasa - patch: asigna responsables a las tareas iniciales del comedor
-- Ejecutar una sola vez en una base ya creada (no recrea tablas ni datos).

update task_templates set assigned_to = 'carlitos' where id = 'comedor-levantar-trastes';
update task_templates set assigned_to = 'paulina' where id = 'comedor-limpiar-mesa';
update task_templates set assigned_to = 'papa-angel' where id = 'comedor-limpiar-suelo';
