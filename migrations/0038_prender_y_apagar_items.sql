-- Un item del catálogo se puede apagar sin borrarlo.
--
-- Borrarlo es perder su imagen, sus alias y el historial de los Kundun donde salió. Apagado
-- sigue estando, pero no se puede elegir al cargar los drops ni aparece en las listas del
-- tablero: sirve para lo que dejó de caer, lo que todavía no se usa y lo que se cargó de más.
--
-- Lo que ya se repartió no se toca: los items de los Kundun viejos siguen como estaban.
ALTER TABLE catalogo ADD COLUMN activo INTEGER NOT NULL DEFAULT 1;
