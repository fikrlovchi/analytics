const express = require("express");
const cfg = require("../services/config-store");
const A = require("../services/analytics");
const anomalies = require("../services/anomalies");
const tg = require("../services/telegram");
const fmt = require("../utils/format");
const bg = require("../utils/backgrounds");
const { getMeta } = require("../sheets/sync");

const router = express.Router();

function toArr(v) {
  if (v === undefined || v === null) return [];
  return (Array.isArray(v) ? v : [v]).map(String);
}

router.get("/settings", (req, res) => {
  res.render("settings", {
    fmtDateTime: fmt.fmtDateTime,
    fmtMoney: fmt.fmtMoney,
    sync: { lastSync: getMeta("last_sync") },
    backgrounds: { light: bg.has("light"), dark: bg.has("dark") },
    bots: cfg.listBots(),
    chats: cfg.listChats(),
    rules: cfg.listRules(),
    report: cfg.getReportConfig(),
    categories: A.categoriesList(),
    lastSent: cfg.getSetting("last_report_date"),
    msg: req.query.msg || null,
    err: req.query.err || null,
  });
});

// ----- Kunlik hisobot konfiguratsiyasi -----
router.post("/settings/report", (req, res) => {
  cfg.setReportConfig({
    enabled: req.body.enabled === "on",
    time: /^\d{2}:\d{2}$/.test(req.body.time || "") ? req.body.time : "19:00",
    mode: ["on_anomaly", "daily", "weekly", "monthly", "custom"].includes(req.body.mode) ? req.body.mode : "daily",
    weekdays: toArr(req.body.weekdays).map(Number),
    monthdays: String(req.body.monthdays || "").split(",").map((x) => parseInt(x.trim(), 10)).filter((n) => n >= 1 && n <= 31),
    customdays: String(req.body.customdays || "").trim(),
  });
  res.redirect("/settings?msg=" + encodeURIComponent("Настройки отчёта сохранены"));
});

// ----- Botlar -----
router.post("/settings/bots", (req, res) => {
  if (!req.body.token) return res.redirect("/settings?err=" + encodeURIComponent("Токен обязателен"));
  cfg.addBot(req.body.name, req.body.token.trim());
  res.redirect("/settings?msg=" + encodeURIComponent("Бот добавлен"));
});
router.post("/settings/bots/:id/delete", (req, res) => { cfg.deleteBot(req.params.id); res.redirect("/settings"); });
router.post("/settings/bots/:id/toggle", (req, res) => { cfg.setBotActive(req.params.id, req.body.active === "1"); res.redirect("/settings"); });

// ----- Chatlar -----
router.post("/settings/chats", (req, res) => {
  if (!req.body.chat_id) return res.redirect("/settings?err=" + encodeURIComponent("Chat ID обязателен"));
  cfg.addChat(req.body.name, String(req.body.chat_id).trim());
  res.redirect("/settings?msg=" + encodeURIComponent("Чат добавлен"));
});
router.post("/settings/chats/:id/delete", (req, res) => { cfg.deleteChat(req.params.id); res.redirect("/settings"); });
router.post("/settings/chats/:id/toggle", (req, res) => { cfg.setChatActive(req.params.id, req.body.active === "1"); res.redirect("/settings"); });

// ----- Anomaliya qoidalari -----
router.post("/settings/rules", (req, res) => {
  cfg.addRule(req.body.scope || "all", req.body.pct, req.body.min_sum);
  res.redirect("/settings?msg=" + encodeURIComponent("Правило добавлено"));
});
router.post("/settings/rules/:id/delete", (req, res) => { cfg.deleteRule(req.params.id); res.redirect("/settings"); });

// ----- Test yuborish -----
router.post("/settings/test", async (req, res) => {
  const d = anomalies.latestDay();
  if (!d) return res.redirect("/settings?err=" + encodeURIComponent("Нет данных для отчёта"));
  try {
    const r = await tg.sendReport(d);
    if (r.ok) res.redirect("/settings?msg=" + encodeURIComponent("Тестовый отчёт отправлен"));
    else res.redirect("/settings?err=" + encodeURIComponent(r.error || "Ошибка отправки"));
  } catch (e) {
    res.redirect("/settings?err=" + encodeURIComponent(e.message));
  }
});

module.exports = router;
