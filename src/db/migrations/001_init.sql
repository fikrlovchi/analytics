-- Kategoriyalar
CREATE TABLE IF NOT EXISTS categories (
  id       TEXT PRIMARY KEY,
  uz       TEXT,
  ru       TEXT,
  is_income  INTEGER DEFAULT 0,
  is_expense INTEGER DEFAULT 0
);

-- Foydalanuvchilar (xodimlar)
CREATE TABLE IF NOT EXISTS users (
  login      TEXT PRIMARY KEY,
  full_name  TEXT
);

-- AppSheet kassa operatsiyalari
CREATE TABLE IF NOT EXISTS operations (
  id             TEXT PRIMARY KEY,
  op_date        TEXT,          -- YYYY-MM-DD
  created_by     TEXT,
  is_income      INTEGER,       -- 1 kirim, 0 chiqim
  category_id    TEXT,
  amount         REAL,          -- doim musbat
  employee_login TEXT,
  request_id     TEXT,
  comment        TEXT
);
CREATE INDEX IF NOT EXISTS idx_ops_date ON operations(op_date);
CREATE INDEX IF NOT EXISTS idx_ops_cat  ON operations(category_id);
CREATE INDEX IF NOT EXISTS idx_ops_emp  ON operations(employee_login);

-- Kassa (qo'lda jadval) kunlik yakunlari
CREATE TABLE IF NOT EXISTS kassa_days (
  day      TEXT PRIMARY KEY,    -- YYYY-MM-DD
  income   REAL DEFAULT 0,
  expense  REAL DEFAULT 0,
  found    INTEGER DEFAULT 0
);

-- Kassa yozuvlari (N2:O16)
CREATE TABLE IF NOT EXISTS kassa_entries (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  day     TEXT,                 -- YYYY-MM-DD
  amount  REAL,                 -- ishorali (so'mda)
  comment TEXT
);
CREATE INDEX IF NOT EXISTS idx_kentries_day ON kassa_entries(day);

-- Sinxronizatsiya holati (kalit-qiymat)
CREATE TABLE IF NOT EXISTS sync_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
