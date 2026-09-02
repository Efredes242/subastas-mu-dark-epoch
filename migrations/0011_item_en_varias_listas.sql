-- Un item del catálogo puede salir en más de una lista.
--
-- La CQC, la Pluma, el Condor y las Almas caen tanto en el Kundun de todos los días como en el
-- asedio del domingo. El Cofre de Asedio es el único que sale nada más que en el asedio.
--
-- Como cada lista tiene su propia gente, un mismo item necesita **una rueda por lista**: la CQC
-- del Kundun no puede mover el turno de la CQC del asedio. Por eso `turnos` pasa a llevar la
-- cola en la clave.

CREATE TABLE catalogo_colas (
  catalogo_id INTEGER NOT NULL REFERENCES catalogo(id) ON DELETE CASCADE,
  cola        TEXT    NOT NULL,
  PRIMARY KEY (catalogo_id, cola)
);

-- Arranque: cada item queda en la lista que tenía, para no cambiarle el reparto a nadie.
INSERT INTO catalogo_colas (catalogo_id, cola) SELECT id, cola FROM catalogo;

CREATE INDEX idx_catalogo_colas_cola ON catalogo_colas(cola);

-- `turnos` con la cola adentro de la clave.
CREATE TABLE turnos_nuevo (
  catalogo_id    INTEGER NOT NULL REFERENCES catalogo(id) ON DELETE CASCADE,
  cola           TEXT    NOT NULL,
  usuario_id     INTEGER          REFERENCES usuarios(id) ON DELETE SET NULL,
  actualizado_en TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (catalogo_id, cola)
);

INSERT INTO turnos_nuevo (catalogo_id, cola, usuario_id, actualizado_en)
SELECT t.catalogo_id, c.cola, t.usuario_id, t.actualizado_en
  FROM turnos t
  JOIN catalogo c ON c.id = t.catalogo_id;

DROP TABLE turnos;
ALTER TABLE turnos_nuevo RENAME TO turnos;

-- Y el respaldo que usa el Kundun de prueba, igual.
CREATE TABLE turnos_respaldo_nuevo (
  catalogo_id INTEGER NOT NULL,
  cola        TEXT    NOT NULL,
  usuario_id  INTEGER,
  PRIMARY KEY (catalogo_id, cola)
);

DROP TABLE turnos_respaldo;
ALTER TABLE turnos_respaldo_nuevo RENAME TO turnos_respaldo;

-- `catalogo.cola` queda sin sentido: la lista de un item ahora sale de catalogo_colas.
ALTER TABLE catalogo DROP COLUMN cola;
