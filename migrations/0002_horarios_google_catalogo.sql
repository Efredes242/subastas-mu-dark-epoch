-- Login con Google, roles, horarios fijos del Kundun y catálogo de items.

-- Cuentas de Google. password_hash queda en '' para quien solo entra con Gmail.
ALTER TABLE usuarios ADD COLUMN email TEXT;
ALTER TABLE usuarios ADD COLUMN google_sub TEXT;
ALTER TABLE usuarios ADD COLUMN avatar TEXT;
-- Zona IANA elegida a mano. NULL = usar la del dispositivo.
ALTER TABLE usuarios ADD COLUMN zona TEXT;

CREATE UNIQUE INDEX idx_usuarios_email  ON usuarios(lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_usuarios_google ON usuarios(google_sub)   WHERE google_sub IS NOT NULL;

-- El Kundun cae todos los días a horario fijo. `clave` identifica la corrida
-- programada ("2026-09-01T15:00Z") para no crear dos eventos para el mismo horario.
ALTER TABLE eventos ADD COLUMN clave TEXT;
ALTER TABLE eventos ADD COLUMN empieza_en TEXT;
ALTER TABLE eventos ADD COLUMN abre_en TEXT;
ALTER TABLE eventos ADD COLUMN reparto_en TEXT;

CREATE UNIQUE INDEX idx_eventos_clave ON eventos(clave) WHERE clave IS NOT NULL;

-- Catálogo del gremio: cada item conocido, con su imagen y su rareza.
-- Al cargar "2 condor flame" el item hereda de acá; si el nombre es nuevo,
-- se agrega solo y después se le pone la imagen una vez para todas las veces.
CREATE TABLE catalogo (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  clave     TEXT    NOT NULL UNIQUE,
  nombre    TEXT    NOT NULL,
  alias     TEXT    NOT NULL DEFAULT '',
  rareza    TEXT    NOT NULL DEFAULT 'comun',
  icono     TEXT    NOT NULL DEFAULT 'caja',
  imagen    TEXT,
  veces     INTEGER NOT NULL DEFAULT 0,
  creado_en TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Cuando salen 2 iguales se cargan como 2 items separados ("1 de 2", "2 de 2"),
-- porque cada uno lo puja una persona distinta.
ALTER TABLE items ADD COLUMN catalogo_id INTEGER REFERENCES catalogo(id) ON DELETE SET NULL;
ALTER TABLE items ADD COLUMN copia  INTEGER NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN copias INTEGER NOT NULL DEFAULT 1;

CREATE INDEX idx_items_catalogo ON items(catalogo_id);
