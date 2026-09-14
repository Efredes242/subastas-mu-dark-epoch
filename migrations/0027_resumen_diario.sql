-- El resumen de la mañana.
--
-- Una vez por día, a la hora que fije el admin, la lista de lo que cae ese día. Sirve para que
-- el gremio arranque sabiendo qué hay, sobre todo si se agregó algún evento de noche.
--
-- La hora va en minutos desde medianoche, hora del servidor, igual que todo lo demás.

ALTER TABLE ajustes ADD COLUMN resumen_hora   INTEGER NOT NULL DEFAULT 600;  -- 10:00
ALTER TABLE ajustes ADD COLUMN resumen_activo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ajustes ADD COLUMN resumen_texto  TEXT    NOT NULL DEFAULT '';
