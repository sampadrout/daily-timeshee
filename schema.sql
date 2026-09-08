CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  task TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  hours REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS entries_date_idx ON entries (date);

CREATE TABLE IF NOT EXISTS tasks (
  name TEXT PRIMARY KEY
);

-- Prompts table stores predefined sentence fragments for description composition
CREATE TABLE IF NOT EXISTS prompts (
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (type, value)
);
