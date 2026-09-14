-- La primera contraseña la pone el admin, así que hay que cambiarla.
--
-- Una clave que eligió otro no es de quien entra: la sabe el que la puso. Con esta marca, la
-- primera vez que alguien entra con la que le dieron, la app lo manda a elegir la suya antes de
-- dejarlo hacer nada.

ALTER TABLE usuarios ADD COLUMN debe_cambiar_clave INTEGER NOT NULL DEFAULT 0;
