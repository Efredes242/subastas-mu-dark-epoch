-- Los avisos, separados por servidor del juego.
--
-- Alckron empieza a jugar en dos servidores a la vez: uno nuevo y uno con más tiempo. Los eventos
-- no son los mismos, los horarios tampoco, y cada gremio tiene su propio grupo de Telegram con su
-- propio bot. Un solo juego de avisos no alcanza.
--
-- Esto separa SOLO los avisos. El reparto de drops —el catálogo, las ruedas, los miembros— sigue
-- siendo de un solo servidor, que es lo que se pidió: de nada sirve partir la app entera cuando lo
-- único que hoy se duplica es lo que se anuncia.
--
-- Cada servidor guarda su chat y su huso, que antes vivían sueltos en la fila única de `ajustes`.
-- Lo que NO guarda es el token del bot: eso sigue siendo un secreto del Worker, y acá va solo el
-- nombre del secreto que le toca.

CREATE TABLE IF NOT EXISTS servidores (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT    NOT NULL,
  orden  INTEGER NOT NULL DEFAULT 0,

  -- A dónde manda.
  telegram_chat   TEXT    NOT NULL DEFAULT '',
  telegram_nombre TEXT    NOT NULL DEFAULT '',
  telegram_activo INTEGER NOT NULL DEFAULT 0,

  -- Con qué bot: el NOMBRE del secreto del Worker, nunca el token.
  token TEXT NOT NULL DEFAULT 'TELEGRAM_TOKEN',

  -- Su propio huso: dos servidores del juego no tienen por qué correr a la misma hora.
  offset_horas INTEGER NOT NULL DEFAULT -3
);

-- El primero hereda todo lo que ya estaba configurado, para que nada deje de salir.
INSERT INTO servidores (id, nombre, orden, telegram_chat, telegram_nombre, telegram_activo, token, offset_horas)
SELECT
  1,
  'Servidor 1',
  0,
  coalesce(telegram_chat, ''),
  coalesce(telegram_nombre, ''),
  coalesce(telegram_activo, 0),
  'TELEGRAM_TOKEN',
  coalesce(offset_servidor, -3)
FROM ajustes WHERE id = 1;

-- Y los avisos que ya existen son de él.
ALTER TABLE avisos ADD COLUMN servidor_id INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_avisos_servidor ON avisos (servidor_id, orden);
