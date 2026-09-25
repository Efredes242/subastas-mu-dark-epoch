-- Las imágenes que acompañan a un aviso.
--
-- Para decir dónde aparecen los jefes de evento no alcanza con el texto: una captura del mapa con
-- el punto marcado se entiende de un vistazo y no hay que explicar coordenadas. Y como los jefes
-- suelen ser varios, un aviso lleva varias imágenes, no una.
--
-- Tabla aparte y no una columna en `avisos` por el peso: una captura son cientos de miles de
-- caracteres en base64, y si vivieran en la misma fila, cada lectura de la configuración de avisos
-- —que pasa en cada carga del panel y en cada vuelta del cron— se traería megabytes que casi nunca
-- se usan. Acá se leen solo cuando hay que mandarlas.

CREATE TABLE IF NOT EXISTS imagenes_aviso (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  aviso_id INTEGER NOT NULL,
  -- En qué orden salen en el álbum.
  orden    INTEGER NOT NULL DEFAULT 0,
  -- Qué se ve, por ejemplo "Lorencia 132,124". Telegram la muestra al abrir la foto.
  etiqueta TEXT    NOT NULL DEFAULT '',
  -- La imagen como data URL. El panel la achica antes de subirla.
  datos    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_imagenes_aviso ON imagenes_aviso (aviso_id, orden);
