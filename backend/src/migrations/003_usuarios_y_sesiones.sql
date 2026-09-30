-- Feature 004: usuarios, sesiones y estado del alta del propietario. Aditiva (expand).
-- NO EDITAR: una migración aplicada es inmutable (ver docs/sdd/guia-migraciones.md).

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT COLLATE NOCASE UNIQUE,     -- NULL hasta el alta
  password_hash TEXT,                   -- NULL = alta pendiente
  role TEXT NOT NULL CHECK (role IN ('owner')),
  created_at TEXT NOT NULL
);

-- El propietario existe desde la migración para poder asignarle los datos (migración 004)
INSERT INTO users (id, email, password_hash, role, created_at)
VALUES (1, NULL, NULL, 'owner', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,             -- sha256 del identificador de la cookie
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Estado del alta: huella del último OWNER_SETUP_TOKEN visto al arrancar
CREATE TABLE auth_setup (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  token_hash TEXT,
  used_at TEXT
);
INSERT INTO auth_setup (id, token_hash, used_at) VALUES (1, NULL, NULL);
