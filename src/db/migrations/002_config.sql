-- Foydalanuvchi sozlamalari (kalit-qiymat; report_config JSON shu yerda)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Telegram botlar
CREATE TABLE IF NOT EXISTS tg_bots (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name   TEXT,
  token  TEXT NOT NULL,
  active INTEGER DEFAULT 1
);

-- Telegram chatlar (guruh/kanal/shaxsiy)
CREATE TABLE IF NOT EXISTS tg_chats (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT,
  chat_id TEXT NOT NULL,
  active  INTEGER DEFAULT 1
);

-- Anomaliya qoidalari (bir nechta qator; scope='all' yoki category_id)
CREATE TABLE IF NOT EXISTS anomaly_rules (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  scope   TEXT NOT NULL DEFAULT 'all',   -- 'all' yoki kategoriya IDsi
  pct     REAL NOT NULL DEFAULT 50,      -- foiz chetlanish ostonasi
  min_sum REAL NOT NULL DEFAULT 300000,  -- summa ostonasi (shovqin filtri)
  active  INTEGER DEFAULT 1
);
