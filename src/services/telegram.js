const https = require("https");
const A = require("./analytics");
const anomalies = require("./anomalies");
const cfg = require("./config-store");
const config = require("../config");

function fmt(n) {
  n = Math.round(n || 0);
  const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (n < 0 ? "−" : "") + s;
}
function dmy(iso) {
  const p = String(iso).split("-");
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso);
}

function tgApi(token, method, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request(
      `https://api.telegram.org/bot${token}/${method}`,
      { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
      (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(b);
            j.ok ? resolve(j) : reject(new Error(j.description || "telegram error"));
          } catch (e) { reject(e); }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function sendMessage(token, chatId, text) {
  return tgApi(token, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });
}

function buildReportText(d) {
  const ov = A.overview({ from: d, to: d });
  const cats = A.expenseByCategory({ from: d, to: d });
  const anos = anomalies.computeForDate(d);
  const L = [
    `📊 <b>Отчёт по кассе — ${dmy(d)}</b>`, "",
    `🟢 Приход: <b>${fmt(ov.income)}</b> сум`,
    `🔴 Расход: <b>${fmt(ov.expense)}</b> сум`,
    `${ov.net >= 0 ? "🟢" : "🔴"} Итого: <b>${fmt(ov.net)}</b> сум`,
    `🧾 Операций: ${ov.opCount}`,
  ];
  if (cats.length) {
    L.push("", "<b>По категориям:</b>");
    for (const c of cats) {
      const p = [];
      if (c.income) p.push("+" + fmt(c.income));
      if (c.expense) p.push("−" + fmt(c.expense));
      L.push(`• ${c.name}: ${p.join(" / ")}`);
    }
  }
  if (anos.length) {
    const ic = { high: "🚨", warn: "⚠️", info: "ℹ️" };
    L.push("", "<b>Аномалии:</b>");
    for (const a of anos) L.push(`${ic[a.severity] || "•"} ${a.text}`);
  } else {
    L.push("", "✅ Аномалий не обнаружено");
  }
  return L.join("\n");
}

async function sendReport(d) {
  const bot = cfg.activeBot();
  const chats = cfg.activeChats();
  if (!bot) return { ok: false, error: "Активный бот не задан" };
  if (!chats.length) return { ok: false, error: "Активный чат не задан" };
  const text = buildReportText(d);
  const results = [];
  for (const ch of chats) {
    try {
      await sendMessage(bot.token, ch.chat_id, text);
      results.push({ chat: ch.chat_id, ok: true });
    } catch (e) {
      results.push({ chat: ch.chat_id, ok: false, error: e.message });
    }
  }
  return { ok: results.some((r) => r.ok), results };
}

// ===== Rejalashtiruvchi =====
function tashkentParts() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  const iso = `${g("year")}-${g("month")}-${g("day")}`;
  return { iso, hhmm: `${g("hour")}:${g("minute")}`, dom: parseInt(g("day"), 10) };
}
function weekdayOf(iso) {
  // 1=Dushanba ... 7=Yakshanba
  const wd = new Date(iso + "T12:00:00Z").getUTCDay(); // 0=Yak..6=Shan
  return ((wd + 6) % 7) + 1;
}
function freqMatches(rc, iso, dom) {
  switch (rc.mode) {
    case "daily":
    case "on_anomaly":
      return true;
    case "weekly":
      return (rc.weekdays || []).map(Number).includes(weekdayOf(iso));
    case "monthly":
      return (rc.monthdays || []).map(Number).includes(dom);
    case "custom":
      return String(rc.customdays || "").split(",").map((x) => parseInt(x.trim(), 10)).includes(dom);
    default:
      return false;
  }
}

// Har daqiqa chaqiriladi. Kuniga bir marta (last_report_date guard) yuboradi.
async function maybeSendScheduled() {
  const rc = cfg.getReportConfig();
  if (!rc.enabled) return;
  const { iso, hhmm, dom } = tashkentParts();
  if (cfg.getSetting("last_report_date") === iso) return; // bugun yuborilgan
  if (hhmm < (rc.time || "19:00")) return;                // hali vaqti kelmagan
  if (!freqMatches(rc, iso, dom)) return;

  const d = anomalies.latestDay() || iso;
  if (rc.mode === "on_anomaly" && anomalies.computeForDate(d).length === 0) return;

  const res = await sendReport(d);
  cfg.setSetting("last_report_date", iso); // muvaffaqiyat/qismaн — kuniga bir marta urinamiz
  return res;
}

module.exports = { sendMessage, buildReportText, sendReport, maybeSendScheduled, tgApi };
