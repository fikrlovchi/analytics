const config = require("../config");
const db = require("../db");
const { getValues, batchGet, getSheetTitles } = require("./client");
const { parseAmount, parseDateISO, pad } = require("./parse");

let _running = false;

function todayISO(tz) {
  // Asia/Tashkent bo'yicha bugungi sana (YYYY-MM-DD)
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts; // en-CA -> YYYY-MM-DD
}

function windowDays(days, tz) {
  const out = [];
  const [y, m, d] = todayISO(tz).split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i < days; i++) {
    const dt = new Date(base.getTime() - i * 86400000);
    out.push({
      iso: `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`,
      day: dt.getUTCDate(),
      month: dt.getUTCMonth() + 1,
    });
  }
  return out;
}

function setMeta(key, value) {
  db.prepare(
    "INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).run(key, String(value));
}

function getMeta(key) {
  const row = db.prepare("SELECT value FROM sync_meta WHERE key=?").get(key);
  return row ? row.value : null;
}

async function runSync() {
  if (_running) return { skipped: true, reason: "already_running" };
  _running = true;
  const started = Date.now();
  try {
    // ---- AppSheet ----
    const [cats, users, ops] = await Promise.all([
      getValues(config.APPSHEET_SPREADSHEET_ID, "Category"),
      getValues(config.APPSHEET_SPREADSHEET_ID, "User"),
      getValues(config.APPSHEET_SPREADSHEET_ID, "Money_Operation"),
    ]);

    const parsedCats = cats.slice(1).filter((r) => r && r[0]).map((r) => ({
      id: String(r[0]).trim(),
      uz: (r[1] || "").trim(),
      ru: (r[2] || "").trim(),
      is_income: (r[3] || "").toString().trim().toUpperCase() === "TRUE" ? 1 : 0,
      is_expense: (r[4] || "").toString().trim().toUpperCase() === "TRUE" ? 1 : 0,
    }));

    const parsedUsers = users.slice(1).filter((r) => r && r[0]).map((r) => ({
      login: String(r[0]).trim(),
      full_name: (r[4] || String(r[0])).toString().trim(),
    }));

    const parsedOps = [];
    for (const r of ops.slice(1)) {
      if (!r || !r[0]) continue;
      const iso = parseDateISO(r[3]);
      parsedOps.push({
        id: String(r[0]).trim(),
        op_date: iso,
        created_by: (r[2] || "").toString().trim(),
        is_income: (r[4] || "").toString().trim().toUpperCase() === "TRUE" ? 1 : 0,
        category_id: (r[5] || "").toString().trim(),
        amount: Math.abs(parseAmount(r[6])),
        employee_login: (r[7] || "").toString().trim(),
        request_id: (r[8] || "").toString().trim(),
        comment: (r[9] || "").toString().trim(),
      });
    }

    // ---- Kassa (qo'lda jadval) ----
    const kassa = await syncKassaData();

    // ---- Yozish (tranzaksiya) ----
    const writeAll = db.transaction(() => {
      db.prepare("DELETE FROM categories").run();
      const ci = db.prepare(
        "INSERT INTO categories (id, uz, ru, is_income, is_expense) VALUES (@id,@uz,@ru,@is_income,@is_expense)"
      );
      for (const c of parsedCats) ci.run(c);

      db.prepare("DELETE FROM users").run();
      const ui = db.prepare("INSERT INTO users (login, full_name) VALUES (@login,@full_name)");
      for (const u of parsedUsers) ui.run(u);

      db.prepare("DELETE FROM operations").run();
      const oi = db.prepare(`INSERT INTO operations
        (id, op_date, created_by, is_income, category_id, amount, employee_login, request_id, comment)
        VALUES (@id,@op_date,@created_by,@is_income,@category_id,@amount,@employee_login,@request_id,@comment)`);
      for (const o of parsedOps) oi.run(o);

      // Kassa: sinxron qilingan kunlarni yangilaymiz (window tashqarisidagi eski kunlar saqlanadi)
      const delEntries = db.prepare("DELETE FROM kassa_entries WHERE day=?");
      const upsDay = db.prepare(`INSERT INTO kassa_days (day, income, expense, found)
        VALUES (@day,@income,@expense,1)
        ON CONFLICT(day) DO UPDATE SET income=excluded.income, expense=excluded.expense, found=1`);
      const insEntry = db.prepare("INSERT INTO kassa_entries (day, amount, comment) VALUES (?,?,?)");
      for (const kd of kassa) {
        delEntries.run(kd.day);
        upsDay.run(kd);
        for (const e of kd.entries) insEntry.run(kd.day, e.amount, e.comment);
      }
    });
    writeAll();

    setMeta("last_sync", new Date().toISOString());
    setMeta("last_error", "");
    setMeta("count_operations", parsedOps.length);
    setMeta("count_categories", parsedCats.length);
    setMeta("count_users", parsedUsers.length);
    setMeta("count_kassa_days", kassa.length);
    setMeta("last_duration_ms", Date.now() - started);

    return {
      ok: true,
      operations: parsedOps.length,
      categories: parsedCats.length,
      users: parsedUsers.length,
      kassaDays: kassa.length,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    setMeta("last_error", err.message || String(err));
    return { ok: false, error: err.message || String(err) };
  } finally {
    _running = false;
  }
}

async function syncKassaData() {
  if (!config.MANUAL_SPREADSHEET_ID) return [];
  const titles = await getSheetTitles(config.MANUAL_SPREADSHEET_ID);
  const titleMap = new Map(); // "d.m" -> title
  const re = /^\s*(\d{1,2})[.\-/](\d{1,2})/;
  for (const t of titles) {
    const m = t.match(re);
    if (m) titleMap.set(`${Number(m[1])}.${Number(m[2])}`, t);
  }

  const days = windowDays(config.KASSA_SYNC_DAYS, config.TZ);
  // A ustunidan O gacha, 2-qatordan skan chegarasigacha o'qiymiz (N=summa, O=izoh,
  // A=ИТОГО belgisi). Kengayadigan struktura: yangi qatorlar qo'shilsa ham ishlaydi.
  const lastRow = config.KASSA_SCAN_LAST_ROW;
  const marker = (config.KASSA_TOTAL_MARKER || "ИТОГО").toUpperCase();
  const wanted = [];
  for (const d of days) {
    const title = titleMap.get(`${d.day}.${d.month}`);
    if (title) wanted.push({ iso: d.iso, range: `'${title.replace(/'/g, "''")}'!A2:O${lastRow}` });
  }
  if (!wanted.length) return [];

  const valueRanges = await batchGet(config.MANUAL_SPREADSHEET_ID, wanted.map((w) => w.range));
  const result = [];
  for (let i = 0; i < wanted.length; i++) {
    const rows = (valueRanges[i] && valueRanges[i].values) || [];
    let income = 0;
    let expense = 0;
    const entries = [];
    for (const r of rows) {
      const colA = ((r && r[0]) || "").toString().trim();
      if (colA.toUpperCase().startsWith(marker)) break; // ИТОГО qatoriga yetdik — to'xtaymiz
      const raw = r && r[13]; // N ustuni (A=0 ... N=13)
      if (raw === undefined || raw === null || String(raw).trim() === "") continue;
      const amt = parseAmount(raw) * config.MANUAL_UNIT_SCALE;
      if (amt === 0) continue;
      const comment = ((r[14] || "")).toString().trim(); // O ustuni
      entries.push({ amount: amt, comment });
      if (amt >= 0) income += amt;
      else expense += -amt;
    }
    result.push({ day: wanted[i].iso, income, expense, entries });
  }
  return result;
}

module.exports = { runSync, getMeta, setMeta };
