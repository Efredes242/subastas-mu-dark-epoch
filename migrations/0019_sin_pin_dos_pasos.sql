-- Se va el PIN y la subasta pasa a dos pasos.
--
-- El PIN existía para que cada uno se anotara solo desde el tablero. Eso se saca: la asistencia
-- la marca el admin o la Grand Master, que es lo que terminaba pasando igual.
--
-- Y el orden se hace explícito. Primero se marca quiénes estuvieron y se confirma; recién ahí
-- se habilita cargar los drops, y cargarlos los reparte en el acto. Antes se podían cargar los
-- items con la asistencia a medio marcar y el reparto salía mal.
--
-- `asistencia_lista` es esa confirmación. Las columnas del PIN quedan sin uso; no se borran
-- porque los eventos viejos las tienen cargadas y no molestan.

ALTER TABLE eventos ADD COLUMN asistencia_lista INTEGER NOT NULL DEFAULT 0;

-- Los Kundun ya cerrados quedan como confirmados: su reparto ya está hecho.
UPDATE eventos SET asistencia_lista = 1 WHERE cerrado = 1;
