-- enCasa - patch: agrega las zonas de 1er y 2do piso (y "Escaleras" de
-- planta baja) para el selector de pisos del mapa.
-- Ejecutar una sola vez en una base ya creada (no recrea tablas ni borra
-- zonas existentes).

insert into zones (id, name, sort_order) values
  ('escaleras-pb', 'Escaleras (PB)', 11),
  ('bano-p1', 'Baño (1er piso)', 12),
  ('escaleras-p1', 'Escaleras (1er piso)', 13),
  ('librero', 'Librero', 14),
  ('cuarto-papas', 'Cuarto papás', 15),
  ('cuarto-carlitos', 'Cuarto Carlitos', 16),
  ('cuarto-paulina', 'Cuarto Paulina', 17),
  ('terraza', 'Terraza', 18),
  ('cuarto-servicio', 'Cuarto de servicio', 19),
  ('bano-p2', 'Baño (2do piso)', 20),
  ('azotea', 'Azotea', 21),
  ('escaleras-p2', 'Escaleras (2do piso)', 22)
on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order;
