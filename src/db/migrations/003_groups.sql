-- Kategoriya guruhlari (faqat dashboard; Sheets'ga ta'sir qilmaydi).
-- Daraxt: asosiy (parent_id=NULL) -> subguruh -> subguruh ...
CREATE TABLE IF NOT EXISTS cat_groups (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  parent_id INTEGER            -- NULL = yuqori (asosiy) daraja
);

-- Xom (Sheets) kategoriyani guruhga biriktirish: bitta kategoriya -> bitta guruh
CREATE TABLE IF NOT EXISTS cat_group_map (
  category_id TEXT PRIMARY KEY,   -- Sheets kategoriya IDsi
  group_id    INTEGER NOT NULL
);
