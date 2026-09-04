-- El asedio tiene hora propia, y el Kundun cambió de horario.
--
-- Hasta acá el asedio se cargaba junto con el Kundun apenas empezaba el evento del domingo,
-- pero los dos drops no salen al mismo tiempo: el del Kundun aparece a las 20:45 y queda en el
-- gremio hasta las 21:20, y recién ahí aparece el del asedio. Cargarlos juntos era al pedo.
--
-- Ahora el asedio tiene su hora y su duración, y el evento del domingo se estira para llegar
-- hasta el final del asedio en vez de cerrarse en el medio.

ALTER TABLE ajustes ADD COLUMN asedio_minutos  INTEGER NOT NULL DEFAULT 1290;  -- 21:30
ALTER TABLE ajustes ADD COLUMN asedio_dura_min INTEGER NOT NULL DEFAULT 40;    -- hasta las 22:10

-- El horario nuevo: 13:00 y 20:45 del servidor, y el drop queda 35 minutos en el gremio.
UPDATE ajustes
   SET horas = '780,1245',
       cierra_despues_min = 35
 WHERE id = 1;
