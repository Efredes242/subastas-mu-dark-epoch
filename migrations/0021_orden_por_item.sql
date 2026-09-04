-- El orden propio de cada rueda.
--
-- Hasta acá toda rueda daba la vuelta en el orden de PC del gremio y lo único que se podía
-- mover era el puntero ("le toca a"). Pero el orden de un item no siempre sigue al PC: se
-- acuerda entre los que participan y hay que poder acomodarlo a mano, item por item.
--
-- Una fila por persona y por rueda. Si un item no tiene filas acá, sigue usando el orden de
-- PC, que es lo que ya venía pasando; el que se suma después a la lista y todavía no figura
-- entra al final.
CREATE TABLE IF NOT EXISTS orden_rueda (
  catalogo_id INTEGER NOT NULL REFERENCES catalogo(id) ON DELETE CASCADE,
  cola        TEXT    NOT NULL,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  posicion    INTEGER NOT NULL,
  PRIMARY KEY (catalogo_id, cola, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_orden_rueda ON orden_rueda(catalogo_id, cola, posicion);
