-- Las imágenes de los items dejan de vivir adentro de la base.
--
-- Estaban guardadas como data URL en `catalogo.imagen`: entre las cinco eran ~23 KB de base64
-- que viajaban en cada `/api/estado`, duplicados por cada rueda del item. Ahora apuntan a la
-- biblioteca de `public/iconos/`, que son archivos que sirve Cloudflare y cachea el navegador.
--
-- La columna sigue aceptando data URL: es lo que se guarda cuando el admin sube algo que la
-- biblioteca no tiene.

UPDATE catalogo SET imagen = '/iconos/cristal-del-caos.webp' WHERE clave = 'cqc';
UPDATE catalogo SET imagen = '/iconos/alma-de-guerra.webp'   WHERE clave = 'almas de guerra';
UPDATE catalogo SET imagen = '/iconos/llama-del-condor.webp' WHERE clave = 'condor flame';
UPDATE catalogo SET imagen = '/iconos/pluma-de-condor.webp'  WHERE clave = 'condor';
UPDATE catalogo SET imagen = '/iconos/cofre-de-asedio.webp'  WHERE clave = 'plumas';

-- Los items ya repartidos guardan una copia de la imagen de cuando se cargaron. El tablero lee
-- la del catálogo y usa ésta solo de respaldo, así que se vacían: son otros 30 KB al pedo.
UPDATE items SET imagen = NULL WHERE catalogo_id IS NOT NULL;
