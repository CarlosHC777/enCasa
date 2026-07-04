-- enCasa - patch: agrega la escalera secundaria/de servicio del 1er piso,
-- junto a Cuarto Carlitos (distinta de "escaleras-p1", la escalera
-- principal junto a Librero).
-- Ejecutar una sola vez en una base ya creada (no borra zonas existentes).

insert into zones (id, name, sort_order) values
  ('escaleras-p1-servicio', 'Escaleras servicio (1er piso)', 23)
on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order;
