-- Esquema inicial de Subastas del Kundun

CREATE TABLE usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario       TEXT    NOT NULL UNIQUE,
  personaje     TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  rol           TEXT    NOT NULL DEFAULT 'miembro',
  pc            INTEGER NOT NULL DEFAULT 0,
  orden         INTEGER NOT NULL DEFAULT 0,
  activo        INTEGER NOT NULL DEFAULT 1,
  creado_en     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE eventos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  numero           INTEGER NOT NULL,
  sala             TEXT    NOT NULL DEFAULT '',
  pin              TEXT    NOT NULL,
  registro_abierto INTEGER NOT NULL DEFAULT 1,
  cierra_en        TEXT,
  cerrado          INTEGER NOT NULL DEFAULT 0,
  creado_en        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE asistencias (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  evento_id  INTEGER NOT NULL REFERENCES eventos(id)  ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creado_en  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (evento_id, usuario_id)
);

CREATE TABLE items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  evento_id  INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  nombre     TEXT    NOT NULL,
  tipo       TEXT    NOT NULL DEFAULT '',
  rareza     TEXT    NOT NULL DEFAULT 'comun',
  icono      TEXT    NOT NULL DEFAULT 'caja',
  imagen     TEXT,
  estado     TEXT    NOT NULL DEFAULT 'abierto',
  asignado_a INTEGER          REFERENCES usuarios(id) ON DELETE SET NULL,
  metodo     TEXT    NOT NULL DEFAULT '',
  creado_en  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE pedidos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id    INTEGER NOT NULL REFERENCES items(id)    ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creado_en  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (item_id, usuario_id)
);

CREATE INDEX idx_asistencias_evento ON asistencias(evento_id);
CREATE INDEX idx_items_evento       ON items(evento_id);
CREATE INDEX idx_pedidos_item       ON pedidos(item_id);
CREATE INDEX idx_usuarios_orden     ON usuarios(orden, pc);
