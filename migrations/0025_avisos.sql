-- Los avisos que el gremio recibe antes de cada evento.
--
-- Un aviso es un evento con nombre propio, los días y las horas en que cae, cuánto antes hay
-- que recordarlo y el texto que se manda. El texto lleva marcas entre llaves que se reemplazan
-- al armarlo, así el mismo sirve para el recordatorio de una hora antes y el de cinco minutos.
--
-- Todavía no se manda a ningún lado: esto es la configuración y el texto, para poder verlos y
-- corregirlos antes de colgarlos de un bot de Telegram.

CREATE TABLE IF NOT EXISTS avisos (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre  TEXT    NOT NULL,
  -- Días de la semana separados por coma, 0 = domingo.
  dias    TEXT    NOT NULL DEFAULT '0,1,2,3,4,5,6',
  -- Horas del servidor en minutos desde medianoche, separadas por coma.
  horas   TEXT    NOT NULL DEFAULT '',
  -- Cuánto antes avisar, en minutos, separados por coma. Nunca más de 60.
  antes   TEXT    NOT NULL DEFAULT '15',
  mensaje TEXT    NOT NULL DEFAULT '',
  activo  INTEGER NOT NULL DEFAULT 1,
  orden   INTEGER NOT NULL DEFAULT 0
);

-- Los dos que ya existen en el juego, para no arrancar con la lista vacía.
INSERT INTO avisos (nombre, dias, horas, antes, mensaje, activo, orden) VALUES
  (
    'Kundun',
    '0,1,2,3,4,5,6',
    '780,1245',
    '60,15',
    '⚔️ *Kundun* en {falta}' || char(10) || char(10) ||
    'Arranca {dia} a las {hora} hora del servidor. Prepárense que después no hay excusas.',
    1,
    0
  ),
  (
    'Asedio al castillo',
    '0',
    '1290',
    '60,15',
    '🏰 *Asedio al castillo* en {falta}' || char(10) || char(10) ||
    'Empieza {dia} a las {hora} hora del servidor. Es el único día de la semana: no se lo pierdan.',
    1,
    1
  );
