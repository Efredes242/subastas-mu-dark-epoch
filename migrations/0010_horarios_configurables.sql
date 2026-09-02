-- El horario del Kundun deja de estar clavado en el código.
--
-- El servidor del juego cambia los horarios cada tanto, así que el admin los acomoda desde el
-- panel. Es una sola fila: `id = 1` y listo. Las horas se guardan en minutos desde medianoche,
-- en hora del servidor, separadas por coma.

CREATE TABLE ajustes (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  horas              TEXT    NOT NULL,
  offset_servidor    INTEGER NOT NULL,
  abre_antes_min     INTEGER NOT NULL,
  pin_antes_min      INTEGER NOT NULL,
  cierra_despues_min INTEGER NOT NULL,
  actualizado_en     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- 13:00 y 21:00 hora del servidor (GMT-3), registro 10 minutos antes, PIN 5 minutos antes,
-- cierre 15 minutos después. Es lo que venía haciendo el código.
INSERT INTO ajustes (id, horas, offset_servidor, abre_antes_min, pin_antes_min, cierra_despues_min)
VALUES (1, '780,1260', -3, 10, 5, 15);
