-- Las clases se manejan desde el panel, no desde el código.
--
-- Antes eran cuatro constantes en worker/clases.ts con sus PNG en public/clases/: para sumar una
-- había que tocar el código y volver a desplegar. Ahora son filas, y el admin les sube la imagen
-- igual que a los items del catálogo.
--
-- `imagen` en NULL significa "usá el archivo estático de public/clases/<codigo>.png". Las cuatro
-- que ya existían arrancan así: sus retratos siguen siendo archivos, que pesan menos y los
-- cachea el navegador. Recién si alguien sube una nueva imagen se guarda acá adentro.

CREATE TABLE clases (
  codigo    TEXT    PRIMARY KEY,
  nombre    TEXT    NOT NULL,
  imagen    TEXT,
  orden     INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT INTO clases (codigo, nombre, orden) VALUES
  ('BK',  'Royal Knight', 1),
  ('ELF', 'High Elf',     2),
  ('SM',  'Warrior Mage', 3),
  ('DL',  'Dark Lord',    4);
