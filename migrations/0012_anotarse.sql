-- Cada uno se anota solo al Kundun con el código, sin cuenta ni contraseña.
--
-- El PIN existía desde el principio pero no lo validaba nadie: la asistencia la marcaba
-- el admin a mano. Ahora hay una ruta pública que lo pide.
--
-- `intentos` cuenta los códigos errados de ESTE Kundun. Pasado el límite la ruta se cierra
-- hasta que el admin genere un PIN nuevo, que lo vuelve a cero.

ALTER TABLE eventos ADD COLUMN intentos INTEGER NOT NULL DEFAULT 0;
