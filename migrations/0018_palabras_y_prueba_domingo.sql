-- Dos cosas.
--
-- 1) "condor" cargaba Plumas. Era la clave de la Pluma de Condor, así que escribir
--    "2 plumas, 2 condor" daba cuatro plumas en vez de dos y dos. La Pluma pasa a llamarse
--    por su nombre y "condor" queda del lado de la Llama, que es el otro item del cóndor.
--
-- 2) El Kundun de prueba puede hacerse pasar por domingo, para probar la carga separada de
--    los drops del asedio sin esperar al domingo.

UPDATE catalogo SET clave = 'pluma de condor', alias = '|pluma|plumas|' WHERE clave = 'condor';
UPDATE catalogo SET alias = '|llama|condor|flame|' WHERE clave = 'condor flame';

ALTER TABLE eventos ADD COLUMN forzar_domingo INTEGER NOT NULL DEFAULT 0;
