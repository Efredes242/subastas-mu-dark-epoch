-- Quién participa en cada lista, elegido a mano.
--
-- Antes salía de usuarios.recibe_items: 1 = items + almas, 0 = almas + asedio. Eso ataba
-- las tres listas a un solo botón. Ahora cada lista tiene su propio conjunto de gente y
-- el admin arma las tres por separado.

CREATE TABLE participantes (
  cola       TEXT    NOT NULL,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  PRIMARY KEY (cola, usuario_id)
);

-- Arranque: lo mismo que valía hasta ahora, para no cambiarle el reparto a nadie.
INSERT INTO participantes (cola, usuario_id)
SELECT 'items', id FROM usuarios WHERE activo = 1 AND recibe_items = 1;

INSERT INTO participantes (cola, usuario_id)
SELECT 'almas', id FROM usuarios WHERE activo = 1;

INSERT INTO participantes (cola, usuario_id)
SELECT 'asedio', id FROM usuarios WHERE activo = 1 AND recibe_items = 0;

CREATE INDEX idx_participantes_cola ON participantes(cola);
