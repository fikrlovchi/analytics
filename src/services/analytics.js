const db = require("../db");

const CAT_NAME = "COALESCE(NULLIF(c.ru,''), NULLIF(c.uz,''), 'ID '||o.category_id)";

function isoDaysAgo(n) {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().slice(0, 10);
}

function bounds(q = {}) {
  const to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || "") ? q.to : isoDaysAgo(0);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || "") ? q.from : isoDaysAgo(29);
  return { from, to };
}

function normList(v) {
  if (v === undefined || v === null || v === "") return [];
  return (Array.isArray(v) ? v : [v]).filter((x) => x !== undefined && x !== null && x !== "");
}

// Qo'shimcha filtrlar (kategoriya/xodim, ko'p tanlov) uchun WHERE bo'laklari
function opFilter(q, params) {
  let sql = " AND o.op_date BETWEEN @from AND @to ";
  const cats = normList(q.category);
  if (cats.length) {
    const ph = cats.map((_, i) => `@cat${i}`).join(",");
    sql += ` AND o.category_id IN (${ph}) `;
    cats.forEach((c, i) => (params[`cat${i}`] = String(c)));
  }
  const emps = normList(q.employee);
  if (emps.length) {
    const ph = emps.map((_, i) => `@emp${i}`).join(",");
    sql += ` AND o.employee_login IN (${ph}) `;
    emps.forEach((e, i) => (params[`emp${i}`] = String(e)));
  }
  return sql;
}

function overview(q) {
  const { from, to } = bounds(q);
  const params = { from, to };
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN o.is_income=1 THEN o.amount END),0) AS income,
      COALESCE(SUM(CASE WHEN o.is_income=0 THEN o.amount END),0) AS expense,
      COUNT(*) AS op_count
    FROM operations o
    LEFT JOIN categories c ON c.id=o.category_id
    WHERE 1=1 ${opFilter(q, params)}
  `).get(params);
  return {
    from, to,
    income: row.income,
    expense: row.expense,
    net: row.income - row.expense,
    opCount: row.op_count,
  };
}

function expenseByCategory(q) {
  const { from, to } = bounds(q);
  const params = { from, to };
  // Kategoriya filtriga bo'ysunadi (tanlangan kategoriyalargina ko'rinadi)
  return db.prepare(`
    SELECT o.category_id AS id, ${CAT_NAME} AS name,
      COALESCE(SUM(CASE WHEN o.is_income=0 THEN o.amount END),0) AS expense,
      COALESCE(SUM(CASE WHEN o.is_income=1 THEN o.amount END),0) AS income,
      COUNT(*) AS count
    FROM operations o
    LEFT JOIN categories c ON c.id=o.category_id
    WHERE 1=1 ${opFilter(q, params)}
    GROUP BY o.category_id
    ORDER BY expense DESC, income DESC
  `).all(params);
}

function dailyTrend(q) {
  const { from, to } = bounds(q);
  const params = { from, to };
  return db.prepare(`
    SELECT o.op_date AS day,
      COALESCE(SUM(CASE WHEN o.is_income=1 THEN o.amount END),0) AS income,
      COALESCE(SUM(CASE WHEN o.is_income=0 THEN o.amount END),0) AS expense
    FROM operations o
    LEFT JOIN categories c ON c.id=o.category_id
    WHERE o.op_date IS NOT NULL ${opFilter(q, params)}
    GROUP BY o.op_date
    ORDER BY o.op_date
  `).all(params);
}

function byEmployee(q) {
  const { from, to } = bounds(q);
  const params = { from, to };
  const qq = { ...q, employee: undefined };
  return db.prepare(`
    SELECT o.employee_login AS login,
      COALESCE(u.full_name, o.employee_login) AS name,
      COALESCE(SUM(CASE WHEN o.is_income=0 THEN o.amount END),0) AS expense,
      COALESCE(SUM(CASE WHEN o.is_income=1 THEN o.amount END),0) AS income,
      COUNT(*) AS count
    FROM operations o
    LEFT JOIN categories c ON c.id=o.category_id
    LEFT JOIN users u ON u.login=o.employee_login
    WHERE 1=1 ${opFilter(qq, params)}
    GROUP BY o.employee_login
    ORDER BY expense DESC
  `).all(params);
}

// Kassa <-> AppSheet kunlik solishtiruvi
function reconciliation(q) {
  const { from, to } = bounds(q);
  const rows = db.prepare(`
    WITH appsheet AS (
      SELECT op_date AS day,
        SUM(CASE WHEN is_income=1 THEN amount END) AS income,
        SUM(CASE WHEN is_income=0 THEN amount END) AS expense
      FROM operations WHERE op_date BETWEEN ? AND ? GROUP BY op_date
    )
    SELECT
      COALESCE(a.day, k.day) AS day,
      COALESCE(a.income,0) AS as_income, COALESCE(a.expense,0) AS as_expense,
      COALESCE(k.income,0) AS k_income, COALESCE(k.expense,0) AS k_expense,
      k.found AS k_found
    FROM appsheet a
    FULL OUTER JOIN kassa_days k ON k.day=a.day
    WHERE COALESCE(a.day,k.day) BETWEEN ? AND ?
    ORDER BY day DESC
  `).all(from, to, from, to);
  return rows.map((r) => ({
    ...r,
    diff_income: r.as_income - r.k_income,
    diff_expense: r.as_expense - r.k_expense,
    ok: Math.abs(r.as_income - r.k_income) <= 1000 && Math.abs(r.as_expense - r.k_expense) <= 1000,
  }));
}

// Kategoriya statistikasi: oy (30) va hafta (7) o'rtacha/max/min (bugungacha)
function categoryStats() {
  const monthStart = isoDaysAgo(30);
  const weekStart = isoDaysAgo(7);
  const rows = db.prepare(`
    SELECT o.category_id AS id, ${CAT_NAME} AS name, o.op_date AS day,
      SUM(o.amount) AS expense
    FROM operations o
    LEFT JOIN categories c ON c.id=o.category_id
    WHERE o.is_income=0 AND o.op_date >= ? AND o.op_date < ?
    GROUP BY o.category_id, o.op_date
  `).all(monthStart, isoDaysAgo(0));

  const byCat = new Map();
  for (const r of rows) {
    if (!byCat.has(r.id)) byCat.set(r.id, { id: r.id, name: r.name, month: [], week: [] });
    const c = byCat.get(r.id);
    c.month.push(r.expense);
    if (r.day >= weekStart) c.week.push(r.expense);
  }
  const stat = (vals, days) => {
    if (!vals.length) return { avg: 0, max: 0, min: 0, days: 0 };
    const total = vals.reduce((a, b) => a + b, 0);
    return { avg: total / days, max: Math.max(...vals), min: Math.min(...vals), days: vals.length };
  };
  return Array.from(byCat.values())
    .map((c) => ({ id: c.id, name: c.name, month: stat(c.month, 30), week: stat(c.week, 7) }))
    .sort((a, b) => b.month.avg - a.month.avg);
}

// Drill-down: bitta kategoriya agregatsiyasini tashkil etgan operatsiyalar
function categoryOperations(q, catId) {
  const { from, to } = bounds(q);
  const params = { from, to };
  // kategoriya aynan catId ga majburlanadi, xodim filtri saqlanadi
  const filt = opFilter({ ...q, category: [catId] }, params);
  return db.prepare(`
    SELECT o.id, o.op_date AS day, o.is_income, o.amount,
      COALESCE(u.full_name, o.employee_login) AS employee,
      ${CAT_NAME} AS category, o.comment, o.request_id
    FROM operations o
    LEFT JOIN categories c ON c.id=o.category_id
    LEFT JOIN users u ON u.login=o.employee_login
    WHERE 1=1 ${filt}
    ORDER BY o.op_date DESC, o.amount DESC
  `).all(params);
}

// Drill-down: bitta xodim bo'yicha operatsiyalar (kategoriya filtri saqlanadi)
function employeeOperations(q, empLogin) {
  const { from, to } = bounds(q);
  const params = { from, to };
  const filt = opFilter({ ...q, employee: [empLogin] }, params);
  return db.prepare(`
    SELECT o.id, o.op_date AS day, o.is_income, o.amount,
      ${CAT_NAME} AS category,
      COALESCE(u.full_name, o.employee_login) AS employee,
      o.comment, o.request_id
    FROM operations o
    LEFT JOIN categories c ON c.id=o.category_id
    LEFT JOIN users u ON u.login=o.employee_login
    WHERE 1=1 ${filt}
    ORDER BY o.op_date DESC, o.amount DESC
  `).all(params);
}

// To'liq yuklama uchun: filtrlangan AppSheet operatsiyalari
function operationsList(q) {
  const { from, to } = bounds(q);
  const params = { from, to };
  const filt = opFilter(q, params);
  return db.prepare(`
    SELECT o.op_date AS day, o.is_income,
      ${CAT_NAME} AS category,
      COALESCE(u.full_name, o.employee_login) AS employee,
      o.amount, o.comment
    FROM operations o
    LEFT JOIN categories c ON c.id=o.category_id
    LEFT JOIN users u ON u.login=o.employee_login
    WHERE 1=1 ${filt}
    ORDER BY o.op_date DESC, o.amount DESC
  `).all(params);
}

// To'liq yuklama uchun: sana oralig'idagi Kassa yozuvlari (kategoriya/xodim tegishli emas)
function kassaEntriesList(q) {
  const { from, to } = bounds(q);
  return db.prepare(`
    SELECT day, amount, comment FROM kassa_entries
    WHERE day BETWEEN ? AND ?
    ORDER BY day DESC, id
  `).all(from, to);
}

function categoriesList() {
  return db.prepare(`
    SELECT id, COALESCE(NULLIF(ru,''), NULLIF(uz,''), 'ID '||id) AS name
    FROM categories ORDER BY name
  `).all();
}

function employeesList() {
  return db.prepare(`
    SELECT DISTINCT o.employee_login AS login, COALESCE(u.full_name, o.employee_login) AS name
    FROM operations o LEFT JOIN users u ON u.login=o.employee_login
    WHERE o.employee_login <> '' ORDER BY name
  `).all();
}

module.exports = {
  bounds, overview, expenseByCategory, dailyTrend, byEmployee,
  reconciliation, categoryStats, categoryOperations, employeeOperations,
  operationsList, kassaEntriesList, categoriesList, employeesList,
};
