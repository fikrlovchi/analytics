const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const ROOT = path.join(__dirname, "..");

function resolvePath(p, def) {
  const v = p || def;
  return path.isAbsolute(v) ? v : path.join(ROOT, v);
}

module.exports = {
  ROOT,
  PORT: parseInt(process.env.PORT || "4043", 10),
  SESSION_SECRET: process.env.SESSION_SECRET || "change-me",
  COOKIE_SECURE: process.env.COOKIE_SECURE === "true",
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || "admin",
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || "",

  // OAuth2 (uzbuyo@gmail.com) — oauth.json yo'li
  OAUTH_FILE: resolvePath(process.env.OAUTH_FILE, "oauth.json"),
  APPSHEET_SPREADSHEET_ID: process.env.APPSHEET_SPREADSHEET_ID || "",
  MANUAL_SPREADSHEET_ID: process.env.MANUAL_SPREADSHEET_ID || "",

  SYNC_INTERVAL_MIN: parseInt(process.env.SYNC_INTERVAL_MIN || "30", 10),
  KASSA_SYNC_DAYS: parseInt(process.env.KASSA_SYNC_DAYS || "90", 10),
  // Kassa summalari ming so'mda -> so'mga
  MANUAL_UNIT_SCALE: parseInt(process.env.MANUAL_UNIT_SCALE || "1000", 10),
  // Kassa listida A ustunida shu so'z bo'lgan qatorгача o'qiladi (undan yuqorisi ma'lumot)
  KASSA_TOTAL_MARKER: process.env.KASSA_TOTAL_MARKER || "ИТОГО",
  // ИТОГО topilmasa yoki xavfsizlik uchun skan qilinadigan oxirgi qator
  KASSA_SCAN_LAST_ROW: parseInt(process.env.KASSA_SCAN_LAST_ROW || "60", 10),
  TZ: process.env.TZ || "Asia/Tashkent",
};
