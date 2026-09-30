-- Línea base: el esquema tal como lo creaba db.js antes de la feature 003.
-- Todo es IF NOT EXISTS / WHERE NOT EXISTS: sobre una base existente no cambia ninguna fila.
-- NO EDITAR: una migración aplicada es inmutable (ver docs/sdd/guia-migraciones.md).

CREATE TABLE IF NOT EXISTS sleep_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,             -- fecha de la noche (YYYY-MM-DD), el día en que te acostaste
  bedtime TEXT NOT NULL,          -- ISO 8601 con zona horaria
  wake_time TEXT,                 -- ISO 8601; NULL mientras la noche sigue "abierta"
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS naps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('number','scale','boolean','text')),
  unit TEXT,
  min_value REAL,
  max_value REAL,
  color TEXT NOT NULL DEFAULT '#5b6ee1',
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS metric_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_id INTEGER NOT NULL REFERENCES metrics(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (metric_id, date)
);

CREATE INDEX IF NOT EXISTS idx_sleep_date ON sleep_records(date);
CREATE INDEX IF NOT EXISTS idx_naps_date ON naps(date);
CREATE INDEX IF NOT EXISTS idx_entries_date ON metric_entries(date);

-- Métricas iniciales para que el panel no arranque vacío (solo si no hay ninguna)
INSERT INTO metrics (name, type, unit, min_value, max_value, color, sort_order)
SELECT * FROM (VALUES
  ('Calidad del sueño', 'scale', NULL, 1, 5, '#5b6ee1', 0),
  ('Energía al despertar', 'scale', NULL, 1, 5, '#e8a33d', 1),
  ('Cafés', 'number', 'tazas', 0, NULL, '#8a5a3c', 2)
)
WHERE NOT EXISTS (SELECT 1 FROM metrics);
