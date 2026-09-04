-- El cartel que tapa las cajas de drops cuando no hay Kundun se puede apagar.
--
-- Sirve para mostrar la app: con el cartel puesto no se ven las tres cajas, que son la mitad de
-- lo que hay para enseñar. Lo prende y apaga el admin desde el panel; viene puesto.

ALTER TABLE ajustes ADD COLUMN cartel_sin_kundun INTEGER NOT NULL DEFAULT 1;
