const config = require("../config");

function fmtMoney(n) {
  n = Math.round(n || 0);
  const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (n < 0 ? "−" : "") + s;
}

// 'YYYY-MM-DD...' -> 'dd.mm.yyyy'
function fmtDate(iso) {
  if (!iso) return "";
  const p = String(iso).slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso);
}

// ISO datetime -> 'dd.mm.yyyy hh:mm' (Asia/Tashkent)
function fmtDateTime(val) {
  const d = new Date(val);
  if (isNaN(d)) return String(val);
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: config.TZ, day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = (t) => (parts.find((x) => x.type === t) || {}).value || "";
  return `${g("day")}.${g("month")}.${g("year")} ${g("hour")}:${g("minute")}`;
}

module.exports = { fmtMoney, fmtDate, fmtDateTime };
