-- El turno es POR ITEM, no por tipo de drop.
--
-- Cada entrada del catálogo lleva su propia cuenta: la CQC tiene su turno, la Pluma el suyo.
-- Cuando sale una CQC va al que le toca en la lista de la CQC y solo esa lista avanza; las
-- demás quedan donde estaban.
--
-- La columna catalogo.cola deja de ser una rueda y pasa a definir solo QUIÉN participa en
-- la lista de ese item:
--   'items'  — todo el gremio menos los top daño (ellos cobran en el asedio)
--   'almas'  — todo el gremio
--   'asedio' — solo los top daño

CREATE TABLE turnos (
  catalogo_id    INTEGER PRIMARY KEY REFERENCES catalogo(id) ON DELETE CASCADE,
  usuario_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Copia de seguridad mientras hay un Kundun de prueba abierto, para poder devolver
-- todos los turnos de una cuando la prueba se borra.
CREATE TABLE turnos_respaldo (
  catalogo_id INTEGER PRIMARY KEY,
  usuario_id  INTEGER
);

-- Arranque: para cada item, el último que lo cobró en un Kundun de verdad.
INSERT INTO turnos (catalogo_id, usuario_id)
SELECT catalogo_id, asignado_a
  FROM items
 WHERE id IN (
   SELECT MAX(i.id)
     FROM items i
     JOIN eventos e ON e.id = i.evento_id
    WHERE e.es_prueba = 0
      AND i.asignado_a IS NOT NULL
      AND i.catalogo_id IS NOT NULL
    GROUP BY i.catalogo_id
 );

-- Los punteros por rueda quedan sin uso.
DROP TABLE punteros;

ALTER TABLE eventos DROP COLUMN puntero_items_previo;
ALTER TABLE eventos DROP COLUMN puntero_almas_previo;
ALTER TABLE eventos DROP COLUMN puntero_asedio_previo;
