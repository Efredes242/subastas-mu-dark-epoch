-- Un solo aviso por evento en el grupo.
--
-- Antes se acumulaban: el de una hora antes, el de treinta, el de quince, y arriba de todos el de
-- "arrancó". Cuatro mensajes diciendo lo mismo con distinto número, y el que entra al chat tiene
-- que leer los cuatro para saber cuál vale.
--
-- Ahora cada aviso reemplaza al anterior del mismo evento: sale el nuevo —que suena, para eso
-- está— y recién después se borra el viejo. Para saber cuál es "el anterior" hace falta agrupar
-- los mensajes por la vez concreta que anuncian: el Kundun del mediodía de hoy no es el mismo que
-- el de la noche, ni que el del mediodía de mañana.

ALTER TABLE mensajes_temporales ADD COLUMN ocurrencia TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_mensajes_ocurrencia ON mensajes_temporales (ocurrencia);
