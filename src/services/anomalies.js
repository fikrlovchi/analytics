const db = require("../db");
const cfg = require("./config-store");

const CAT_NAME = "COALESCE(NULLIF(c.ru,''), NULLIF(c.uz,''), 'ID '||o.category_id)";
const RECONCILE_TOL = 1000;

function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmt(n) {
  n = Math.round(n || 0);
  const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (n < 0 ? "−" : "") + s;
}
function pctStr(p) {
  if (p == null) return "нов.";
  return (p >= 0 ? "+" : "−") + Math.abs(Math.round(p)) + "%";
}

// So'nggi sinxronlangan kun (operatsiyalar bo'yicha) — odatда "bugun"
function latestDay() {
  const r = db.prepare("SELECT MAX(op_date) AS d FROM operations").get();
  return r && r.d ? r.d : null;
}

// Berilgan kun uchun anomaliyalar (qoidalar asosida)
function computeForDate(d) {
  if (!d) return [];
  const monthStart = addDays(d, -30);
  const weekStart = addDays(d, -7);

  const today = db.prepare(`
    SELECT o.category_id AS id, ${CAT_NAME} AS name, SUM(o.amount) AS expense, COUNT(*) AS cnt
    FROM operations o LEFT JOIN categories c ON c.id=o.category_id
    WHERE o.is_income=0 AND o.op_date=? GROUP BY o.category_id
  `).all(d);

  const hist = db.prepare(`
    SELECT category_id AS id, op_date AS day, SUM(amount) AS expense
    FROM operations WHERE is_income=0 AND op_date>=? AND op_date<? GROUP BY category_id, op_date
  `).all(monthStart, d);

  const mAgg = {}, wAgg = {};
  for (const r of hist) {
    (mAgg[r.id] = mAgg[r.id] || []).push(r.expense);
    if (r.day >= weekStart) (wAgg[r.id] = wAgg[r.id] || []).push(r.expense);
  }
  const avg = (arr, days) => (arr && arr.length ? arr.reduce((a, b) => a + b, 0) / days : 0);

  const rules = cfg.listRules();
  const out = [];

  for (const t of today) {
    const rule = cfg.ruleFor(t.id, rules);
    if (!rule) continue;
    if (t.expense < rule.min_sum) continue;

    const ma = avg(mAgg[t.id], 30);
    const wa = avg(wAgg[t.id], 7);
    const pm = ma > 0 ? ((t.expense - ma) / ma) * 100 : null;
    const pw = wa > 0 ? ((t.expense - wa) / wa) * 100 : null;

    if (pm == null && pw == null) {
      out.push({
        kind: "new", severity: "warn", category: t.name, expense: t.expense,
        pctMonth: null, pctWeek: null,
        text: `«${t.name}» — ${fmt(t.expense)} сум: новая категория (нет истории за месяц)`,
      });
      continue;
    }
    const worst = Math.max(Math.abs(pm || 0), Math.abs(pw || 0));
    if (worst >= rule.pct) {
      out.push({
        kind: "category", severity: worst >= 100 ? "high" : "warn",
        category: t.name, expense: t.expense, pctMonth: pm, pctWeek: pw, monthAvg: ma, weekAvg: wa,
        text: `«${t.name}» — ${fmt(t.expense)} сум: ${pctStr(pm)} к месяцу (${fmt(ma)}/д), ${pctStr(pw)} к неделе (${fmt(wa)}/д)`,
      });
    }
  }

  // Kassa <-> AppSheet solishtiruvi
  const as = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN is_income=1 THEN amount END),0) AS inc,
           COALESCE(SUM(CASE WHEN is_income=0 THEN amount END),0) AS exp
    FROM operations WHERE op_date=?
  `).get(d);
  const k = db.prepare("SELECT income, expense, found FROM kassa_days WHERE day=?").get(d);
  if (k && k.found) {
    if (Math.abs(as.inc - k.income) > RECONCILE_TOL) {
      out.push({ kind: "reconcile", severity: "high", text: `ПРИХОД: AppSheet ${fmt(as.inc)} ↔ Касса ${fmt(k.income)} (разница ${fmt(Math.abs(as.inc - k.income))})` });
    }
    if (Math.abs(as.exp - k.expense) > RECONCILE_TOL) {
      out.push({ kind: "reconcile", severity: "high", text: `РАСХОД: AppSheet ${fmt(as.exp)} ↔ Касса ${fmt(k.expense)} (разница ${fmt(Math.abs(as.exp - k.expense))})` });
    }
  }

  return out;
}

module.exports = { computeForDate, latestDay, fmt };
