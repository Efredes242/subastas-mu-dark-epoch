-- El menú Desarrollador: qué se ve y quién puede tocar qué.
--
-- Dos mapas en JSON, los dos del admin:
--   interfaz — para cada pedazo de la app, si lo ve todo el mundo, solo el admin, o nadie.
--   permisos — para lo que cambia las reglas del reparto, si lo puede hacer el Grand Master.
--
-- Vacíos significan "lo de siempre": se ve todo, y el catálogo y los turnos son del admin.
-- El cartel del próximo Kundun pasa a vivir acá, así hay un solo lugar donde se prende y apaga.

ALTER TABLE ajustes ADD COLUMN interfaz TEXT NOT NULL DEFAULT '';
ALTER TABLE ajustes ADD COLUMN permisos TEXT NOT NULL DEFAULT '';

-- Si el cartel estaba sacado, se lo lleva al mapa nuevo para no perder la elección.
UPDATE ajustes
   SET interfaz = '{"tablero_cartel":"nadie"}'
 WHERE id = 1 AND cartel_sin_kundun = 0;
