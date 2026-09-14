-- "invitado" pasa a llamarse "jugador".
--
-- El nombre viejo venía de cuando cualquiera podía anotarse al Kundun y pedir items. Eso no
-- existe más: hoy el que no maneja la app es un jugador del gremio que entra a mirar.

UPDATE usuarios SET rol = 'jugador' WHERE rol = 'invitado';
