-- El nombre del evento, en grande.
--
-- Telegram no da mucho margen de formato, así que el énfasis sale de las letras anchas de Unicode
-- y de un par de reglas arriba y abajo. Cada evento elige cuánto quiere gritar, y el emoji deja de
-- adivinarse leyendo el principio del mensaje: ahora es un campo, que es lo que también usa el
-- resumen de la mañana para armar la lista del día.

ALTER TABLE avisos ADD COLUMN emoji  TEXT NOT NULL DEFAULT '⚔️';
ALTER TABLE avisos ADD COLUMN titulo TEXT NOT NULL DEFAULT 'bandera';

UPDATE avisos SET emoji = '🏰' WHERE nombre LIKE '%asedio%' OR nombre LIKE '%castillo%';

-- Los textos que todavía son los de fábrica pasan al formato nuevo, con {titulo} arriba. El que
-- haya escrito el suyo no se toca: la marca la puede poner a mano cuando quiera.
--
-- De paso se arregla algo que venía mal: el nombre estaba escrito dentro del texto, así que un
-- evento renombrado seguía anunciándose con el nombre viejo. Ahora sale de la marca.
UPDATE avisos
SET mensaje =
  '{titulo}' || char(10) ||
  char(10) ||
  '⏳ Falta *{falta}*' || char(10) ||
  '🕐 Arranca {dia} a las *{hora}*, hora del servidor' || char(10) ||
  char(10) ||
  '_Prepárense que después no hay excusas._'
WHERE mensaje LIKE '%en {falta}%';
