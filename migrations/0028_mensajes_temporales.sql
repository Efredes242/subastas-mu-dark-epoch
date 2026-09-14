-- Los mensajes que se borran solos.
--
-- Un ensayo mandado al grupo no tiene por qué quedar ahí: se anota cuándo hay que borrarlo y el
-- cron, que ya se despierta cada minuto, lo saca. No se puede esperar dentro del pedido que lo
-- mandó —un Worker no vive dos minutos— así que la espera vive en la base.

CREATE TABLE IF NOT EXISTS mensajes_temporales (
  chat       TEXT    NOT NULL,
  mensaje_id INTEGER NOT NULL,
  borrar_en  TEXT    NOT NULL,
  PRIMARY KEY (chat, mensaje_id)
);

CREATE INDEX IF NOT EXISTS idx_mensajes_temporales ON mensajes_temporales(borrar_en);
