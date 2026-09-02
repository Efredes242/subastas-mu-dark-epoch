-- Un Kundun de prueba para que el admin pruebe todo el circuito cuando quiera.
--
-- No cuenta como Kundun de verdad: no aparece en el historial ni en la puja anterior,
-- y al borrarlo las ruedas vuelven a donde estaban, así probar no le roba el turno a nadie.

ALTER TABLE eventos ADD COLUMN es_prueba INTEGER NOT NULL DEFAULT 0;

-- Dónde estaba parada cada rueda antes de la prueba, para poder devolverla.
ALTER TABLE eventos ADD COLUMN puntero_items_previo INTEGER;
ALTER TABLE eventos ADD COLUMN puntero_almas_previo INTEGER;

CREATE INDEX idx_eventos_prueba ON eventos(es_prueba);
