-- Cuánto dura cada evento, y qué pasa con los avisos cuando termina.
--
-- Hasta acá un aviso se mandaba y se quedaba para siempre en el grupo: a la mañana siguiente el
-- chat tenía tres recordatorios de algo que ya había pasado. Ahora el aviso vive lo que vive el
-- evento y después se borra solo, con el mismo cron que limpia los ensayos.
--
-- La duración va pegada a cada horario y no al evento, porque el mismo evento no siempre dura lo
-- mismo: el Kundun del mediodía son diez minutos y el de la noche quince. Por eso `horas` pasa de
-- "780,1245" a "780:10,1245:15". Un número pelado se sigue leyendo igual y toma la duración de
-- fábrica, así que no hace falta tocar lo que no se sepa.

ALTER TABLE avisos ADD COLUMN al_empezar     INTEGER NOT NULL DEFAULT 1;
ALTER TABLE avisos ADD COLUMN mensaje_inicio TEXT    NOT NULL DEFAULT '';

-- Las duraciones que ya se sabían, de los horarios del gremio.
UPDATE avisos SET horas = '780:10,1245:15' WHERE horas = '780,1245';
UPDATE avisos SET horas = '1290:30'        WHERE horas = '1290';
UPDATE avisos SET horas = '795:5,1380:5'   WHERE horas = '795,1380';
