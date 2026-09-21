-- Los pedidos de ingreso.
--
-- Hasta acá, quien entraba con Google sin estar cargado en el gremio recibía un "ese mail no está
-- todavía" y ahí se terminaba: tenía que avisarle al admin por otro lado, y el admin cargarlo a
-- mano antes de que pudiera volver a intentar. Dos personas coordinando por fuera de la app para
-- algo que la app puede tramitar sola.
--
-- Ahora el intento deja un pedido y el admin lo acepta o lo rechaza desde el panel. La puerta
-- sigue cerrada con llave —nadie entra por el hecho de pedir— pero el trámite pasa a estar adentro.
--
-- El mail es la clave única: un pedido por dirección. Si la persona vuelve a intentar no se apila
-- un pedido nuevo, se le suma un intento al que ya está, que además le sirve al admin para ver
-- quién está esperando de verdad.

CREATE TABLE IF NOT EXISTS pedidos_ingreso (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    NOT NULL UNIQUE,
  google_sub TEXT    NOT NULL,
  -- Cómo se llama la cuenta de Google. Es lo único que sabemos de la persona antes de aceptarla.
  nombre     TEXT    NOT NULL DEFAULT '',
  avatar     TEXT,
  -- 'pendiente' o 'rechazado'. Los aceptados no quedan acá: pasan a ser un miembro.
  estado     TEXT    NOT NULL DEFAULT 'pendiente',
  pedido_en  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  intentos   INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_pedidos_ingreso_estado ON pedidos_ingreso (estado);
