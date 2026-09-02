-- El registro abre 10 minutos antes del Kundun, pero el PIN recién aparece 5 minutos antes.
-- Así nadie se anota con demasiada anticipación, ni siquiera teniendo el código de otro día.
ALTER TABLE eventos ADD COLUMN pin_desde TEXT;

-- Los eventos que ya existen quedan con el PIN disponible desde que abrió el registro.
UPDATE eventos SET pin_desde = COALESCE(abre_en, creado_en) WHERE pin_desde IS NULL;
