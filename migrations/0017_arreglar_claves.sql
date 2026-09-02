-- Arreglar dos entradas del catálogo que resolvían mal lo que se escribía.
--
-- 1) El Cofre de Asedio tenía `plumas` de clave. Venía de haberse creado escribiendo "plumas" y
--    haberlo renombrado después: el nombre cambió, la clave quedó. Como la clave exacta le gana
--    al alias, escribir "2 plumas" daba cofres en vez de plumas de cóndor.
--
-- 2) "alma" en singular no era alias de las Almas de Guerra, así que escribirlo creaba un item
--    nuevo llamado "Alma".

UPDATE catalogo SET clave = 'cofre de asedio' WHERE clave = 'plumas' AND nombre = 'Cofre de Asedio';

-- Ahora "plumas" cae en el alias de la Pluma de Condor, que es lo que uno espera.
UPDATE catalogo SET alias = '|plumas|pluma|' WHERE clave = 'condor';

UPDATE catalogo SET alias = '|almas|alma de guerra|alma|' WHERE clave = 'almas de guerra';

-- La entrada basura que se creó con "1 alma". Los items que la usaban quedan sin catálogo,
-- pero son de un Kundun de prueba: se borran al terminarla.
DELETE FROM catalogo WHERE clave = 'alma' AND nombre = 'Alma';
