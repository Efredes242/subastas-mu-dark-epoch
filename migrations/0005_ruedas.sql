-- El reparto es una rueda que gira y no se reinicia.
--
-- Hay dos vueltas sobre el mismo orden de PC:
--   'items' — los drops comunes. No entran los del Castle Siege (recibe_items = 0).
--   'almas' — las almas de guerra. Entran todos.
--
-- Cada vuelta recuerda a quién le tocó por última vez. El siguiente drop arranca del que
-- sigue, y el que no estuvo en ese Kundun se saltea: pierde la vuelta y hay que esperar
-- a que la rueda pase de nuevo por su nombre.

-- Los top daño del gremio cobran en el Castle Siege del domingo, así que quedan afuera
-- de la rueda de items (pero siguen recibiendo almas de guerra).
ALTER TABLE usuarios ADD COLUMN recibe_items INTEGER NOT NULL DEFAULT 1;

-- A qué rueda va cada item. Se define una vez en el catálogo.
ALTER TABLE catalogo ADD COLUMN cola TEXT NOT NULL DEFAULT 'items';
ALTER TABLE items    ADD COLUMN cola TEXT NOT NULL DEFAULT 'items';

UPDATE catalogo SET cola = 'almas' WHERE clave = 'almas de guerra';
UPDATE items
   SET cola = 'almas'
 WHERE catalogo_id IN (SELECT id FROM catalogo WHERE cola = 'almas');

-- Dónde quedó parada cada rueda.
CREATE TABLE punteros (
  cola           TEXT PRIMARY KEY,
  usuario_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  actualizado_en TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Arrancan donde las dejó el Kundun del 1/9: el CQC fue para DenaliMyrella y la última
-- alma de guerra para UriahDelyricth.
INSERT INTO punteros (cola, usuario_id)
SELECT 'items', id FROM usuarios WHERE personaje = 'DenaliMyrella';

INSERT INTO punteros (cola, usuario_id)
SELECT 'almas', id FROM usuarios WHERE personaje = 'UriahDelyricth';
