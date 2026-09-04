-- Cada evento tiene dos tramos, no uno.
--
-- Estaba modelado como "el Kundun arranca y 35 minutos después se cierra". Pero son dos cosas
-- distintas: primero corre el evento (13:00 a 13:10), y recién ahí cae el drop y arranca la
-- subasta del gremio (13:10 a 13:40). El evento de la app tiene que seguir abierto hasta el
-- final de las recompensas, que es lo último que hay para repartir.
--
-- Las horas pasan a guardarse como "minutos:duraEvento:duraRecompensas", separadas por comas.
-- El asedio de los domingos lleva los mismos tres números en columnas propias.

ALTER TABLE ajustes ADD COLUMN asedio_premio_min INTEGER NOT NULL DEFAULT 40;

UPDATE ajustes
   SET horas             = '780:10:30,1245:15:40',  -- 13:00 (10 min, premios 30) y 20:45 (15, 40)
       asedio_minutos    = 1290,                    -- 21:30
       asedio_dura_min   = 30,                      -- premios del asedio desde las 22:00
       asedio_premio_min = 40
 WHERE id = 1;
