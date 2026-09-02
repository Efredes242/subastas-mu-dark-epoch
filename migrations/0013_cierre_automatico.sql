-- El Kundun se cierra solo y el registro corta antes del final.
--
-- Hasta ahora un evento quedaba abierto —con el PIN a la vista— hasta que se abría el
-- siguiente, ocho horas después. Ahora se cierra al llegar su hora.
--
-- Y aparece un momento nuevo: `registro_hasta`. El evento sigue en pantalla hasta el final,
-- pero anotarse se corta unos minutos antes para que nadie entre con el reparto ya empezado.

ALTER TABLE ajustes ADD COLUMN cierra_registro_antes_min INTEGER NOT NULL DEFAULT 5;
ALTER TABLE eventos ADD COLUMN registro_hasta TEXT;

-- Los tiempos que pidió el gremio: abre 15 minutos antes con el PIN ya disponible,
-- el registro corta 5 minutos antes del final y el evento cierra 20 minutos después.
UPDATE ajustes
   SET abre_antes_min = 15,
       pin_antes_min = 15,
       cierra_despues_min = 20,
       cierra_registro_antes_min = 5
 WHERE id = 1;

-- Los eventos que ya estaban abiertos de antes se cierran: su hora pasó hace rato.
UPDATE eventos
   SET cerrado = 1, registro_abierto = 0
 WHERE cerrado = 0
   AND es_prueba = 0
   AND cierra_en IS NOT NULL
   AND cierra_en < strftime('%Y-%m-%dT%H:%M:%SZ', 'now');
