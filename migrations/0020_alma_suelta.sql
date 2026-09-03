-- La entrada "Alma", que se crea sola cuando alguien escribe "1 alma".
--
-- Ya se había borrado una vez, pero al no quedar "alma" como forma de escribir las Almas de
-- Guerra, el siguiente que lo tipeó volvió a crearla: un item sin imagen que parece un alma rota.
-- Se borra y "alma" pasa a ser alias de las Almas de Guerra, que es lo que uno quiere decir.

UPDATE catalogo
   SET alias = '|almas|alma|alma de guerra|'
 WHERE clave = 'almas de guerra';

-- Los items que la usaban quedan sin catálogo; son de Kundun de prueba y se van con ellos.
DELETE FROM catalogo WHERE clave = 'alma' AND nombre = 'Alma';

-- De paso: un alias igual a la clave propia no sirve para nada y ensucia la lista de palabras.
UPDATE catalogo SET alias = '' WHERE clave = 'cqc' AND alias = '|cqc|';
