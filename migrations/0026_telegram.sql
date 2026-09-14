-- El bot de Telegram que manda los avisos.
--
-- Acá va solo a qué chat mandar y si está prendido. El token NO: vive como secreto del Worker
-- (wrangler secret put TELEGRAM_TOKEN), porque con el token cualquiera publica en el grupo
-- haciéndose pasar por el bot, y la base se exporta para respaldos.

ALTER TABLE ajustes ADD COLUMN telegram_chat   TEXT    NOT NULL DEFAULT '';
ALTER TABLE ajustes ADD COLUMN telegram_nombre TEXT    NOT NULL DEFAULT '';
ALTER TABLE ajustes ADD COLUMN telegram_activo INTEGER NOT NULL DEFAULT 0;

-- Qué avisos ya salieron.
--
-- El cron corre cada minuto y puede correr dos veces para el mismo minuto, o llegar tarde y
-- ver la misma ventana otra vez. La clave única es (aviso, momento exacto del disparo): si ya
-- está, no se manda de nuevo. Es lo único que evita que el grupo reciba el mismo aviso repetido.
CREATE TABLE IF NOT EXISTS avisos_enviados (
  aviso_id  INTEGER NOT NULL,
  clave     TEXT    NOT NULL,
  enviado_en TEXT   NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  PRIMARY KEY (aviso_id, clave)
);

CREATE INDEX IF NOT EXISTS idx_avisos_enviados ON avisos_enviados(enviado_en);
