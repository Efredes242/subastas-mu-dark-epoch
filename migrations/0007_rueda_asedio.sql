-- Tercera rueda: los drops del Castle Siege de los domingos, que van solo para los
-- top daño del gremio (los que están marcados como "solo almas" en el reparto del Kundun).
-- La tabla `punteros` no necesita cambios: acepta cualquier rueda.

ALTER TABLE eventos ADD COLUMN puntero_asedio_previo INTEGER;
