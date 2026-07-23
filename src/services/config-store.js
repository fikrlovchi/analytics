const db = require("../db");

// ===== Generic settings (key-value) =====
function getSetting(key, def = null) {
  const r = db.prepare("SELECT value FROM settings WHERE key=?").get(key);
  return r ? r.value : def;
}
function setSetting(key, value) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).run(key, String(value));
}

// ===== Kunlik hisobot konfiguratsiyasi (JSON) =====
const DEFAULT_REPORT = {
  enabled: false,
  time: "19:00",            // HH:MM (Asia/Tashkent)
  mode: "daily",            // on_anomaly | daily | weekly | monthly | custom
  weekdays: [1, 2, 3, 4, 5], // weekly uchun (1=Dushanba ... 7=Yakshanba)
  monthdays: [1],           // monthly uchun (1..31)
  customdays: "",           // custom: vergul bilan oy kunlari "1,10,20"
};

function getReportConfig() {
  const raw = getSetting("report_config");
  if (!raw) return { ...DEFAULT_REPORT };
  try {
    return { ...DEFAULT_REPORT, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_REPORT };
  }
}
function setReportConfig(obj) {
  const cur = getReportConfig();
  setSetting("report_config", JSON.stringify({ ...cur, ...obj }));
}

// ===== Telegram botlar =====
function listBots() {
  return db.prepare("SELECT id, name, token, active FROM tg_bots ORDER BY id").all();
}
function activeBot() {
  return db.prepare("SELECT * FROM tg_bots WHERE active=1 ORDER BY id LIMIT 1").get();
}
function addBot(name, token) {
  return db.prepare("INSERT INTO tg_bots (name, token, active) VALUES (?, ?, 1)").run(name || "Bot", token);
}
function deleteBot(id) {
  db.prepare("DELETE FROM tg_bots WHERE id=?").run(id);
}
function setBotActive(id, active) {
  db.prepare("UPDATE tg_bots SET active=? WHERE id=?").run(active ? 1 : 0, id);
}

// ===== Telegram chatlar =====
function listChats() {
  return db.prepare("SELECT id, name, chat_id, active FROM tg_chats ORDER BY id").all();
}
function activeChats() {
  return db.prepare("SELECT * FROM tg_chats WHERE active=1 ORDER BY id").all();
}
function addChat(name, chatId) {
  return db.prepare("INSERT INTO tg_chats (name, chat_id, active) VALUES (?, ?, 1)").run(name || "Chat", chatId);
}
function deleteChat(id) {
  db.prepare("DELETE FROM tg_chats WHERE id=?").run(id);
}
function setChatActive(id, active) {
  db.prepare("UPDATE tg_chats SET active=? WHERE id=?").run(active ? 1 : 0, id);
}

// ===== Anomaliya qoidalari =====
function listRules() {
  return db.prepare("SELECT id, scope, pct, min_sum, active FROM anomaly_rules ORDER BY (scope='all') DESC, id").all();
}
function addRule(scope, pct, minSum) {
  return db.prepare("INSERT INTO anomaly_rules (scope, pct, min_sum, active) VALUES (?, ?, ?, 1)")
    .run(scope || "all", Number(pct) || 50, Number(minSum) || 0);
}
function deleteRule(id) {
  db.prepare("DELETE FROM anomaly_rules WHERE id=?").run(id);
}
function ensureDefaultRule() {
  const n = db.prepare("SELECT COUNT(*) AS c FROM anomaly_rules").get().c;
  if (n === 0) addRule("all", 50, 300000);
}

// Kategoriya uchun amaldagi qoida: aynan shu kategoriya (active) bo'lsa u, aks holda 'all'
function ruleFor(categoryId, rules) {
  const list = rules || listRules();
  const spec = list.find((r) => r.active && String(r.scope) === String(categoryId));
  if (spec) return spec;
  return list.find((r) => r.active && r.scope === "all") || null;
}

module.exports = {
  getSetting, setSetting, getReportConfig, setReportConfig, DEFAULT_REPORT,
  listBots, activeBot, addBot, deleteBot, setBotActive,
  listChats, activeChats, addChat, deleteChat, setChatActive,
  listRules, addRule, deleteRule, ensureDefaultRule, ruleFor,
};
