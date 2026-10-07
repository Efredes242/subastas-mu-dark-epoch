-- A quién le tocaba un drop que terminó cobrando otro.
--
-- Cuando el que sigue en la rueda no estuvo en el Kundun, el item pasa al siguiente. Eso ya
-- funciona desde siempre, y hasta quedaba escrito —pero adentro del texto de "cómo se decidió",
-- que el tablero no muestra. Así, el gremio ve que cobró Rikiya y no hay forma de saber que le
-- tocaba a Alckron.
--
-- Los nombres, separados por barras y en el orden de la rueda: el primero es el del turno. Van
-- los nombres y no los ids porque es un registro de lo que pasó esa noche, y tiene que seguir
-- leyéndose aunque después se borre al miembro.
ALTER TABLE items ADD COLUMN salteados TEXT NOT NULL DEFAULT '';

-- Lo viejo se recupera del texto, que tiene la forma:
--   "Le tocaba a X en la lista de Y — se saltearon A, B por no estar"
UPDATE items
   SET salteados = replace(
         substr(
           metodo,
           instr(metodo, 'se saltearon ') + length('se saltearon '),
           instr(metodo, ' por no estar') - (instr(metodo, 'se saltearon ') + length('se saltearon '))
         ),
         ', ',
         '|'
       )
 WHERE instr(metodo, 'se saltearon ') > 0
   AND instr(metodo, ' por no estar') > instr(metodo, 'se saltearon ');
