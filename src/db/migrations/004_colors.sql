-- Guruhlar uchun rang
ALTER TABLE cat_groups ADD COLUMN color TEXT;

-- Xom (Sheets) kategoriyalar uchun rang
CREATE TABLE IF NOT EXISTS cat_colors (
  category_id TEXT PRIMARY KEY,
  color       TEXT
);
