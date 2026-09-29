-- Un item que no gira: todos sus drops van siempre a la misma persona.
--
-- El gremio arregló que las almas de guerra las junte uno solo hasta completar lo que necesita,
-- y recién ahí pase al siguiente. Cuánto le falta no lo puede saber la app —también las compra
-- en las tiendas del juego—, así que no hay meta ni contador: la persona queda fija hasta que
-- el admin la cambia a mano.
--
-- NULL es lo de siempre, la rueda. Sirve para cualquier item, no solo para las almas.
ALTER TABLE catalogo ADD COLUMN fijo_a INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;
