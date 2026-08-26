const ExcelJS = require("exceljs");
const A = require("./analytics");

const MONEY = "#,##0";

function dmy(iso) {
  if (!iso) return "";
  const p = String(iso).split("-");
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso);
}

// Bir varaqni formatlaydi. totalRow berilsa — pastda ajratilgan «Итого» qatori.
function applySheet(ws, columns, rows, totalRow) {
  ws.columns = columns.map((c) => ({ header: c.h, key: c.k, width: c.w || 16 }));
  rows.forEach((r) => ws.addRow(r));

  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.f) col.numFmt = c.f;
    col.alignment = { horizontal: c.a || "left", vertical: "middle" };
  });

  const hr = ws.getRow(1);
  hr.height = 22;
  hr.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F6F54" } };
    cell.alignment = { horizontal: "left", vertical: "middle" };
  });

  for (let i = 2; i <= rows.length + 1; i++) {
    if (i % 2 === 0) {
      ws.getRow(i).eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F6F4" } };
      });
    }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  if (totalRow) {
    const tr = ws.addRow(totalRow);
    tr.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6EFEA" } };
      cell.border = { top: { style: "medium", color: { argb: "FF1F6F54" } } };
    });
  }
}

// block -> [{sheet, columns, rows}, ...]
function specs(block, q, extra) {
  if (block === "categories") {
    return [{
      sheet: "Категории",
      columns: [
        { h: "Категория", k: "name", w: 30 },
        { h: "Итого", k: "total", w: 16, f: MONEY, a: "right" },
        { h: "Расход", k: "expense", w: 16, f: MONEY, a: "right" },
        { h: "Приход", k: "income", w: 16, f: MONEY, a: "right" },
      ],
      rows: A.expenseByCategory(q).map((r) => ({
        name: r.name,
        total: (r.expense || 0) - (r.income || 0),
        expense: r.expense,
        income: r.income,
      })),
    }];
  }
  if (block === "trend") {
    return [{
      sheet: "Динамика по дням",
      columns: [
        { h: "Дата", k: "date", w: 14 },
        { h: "Приход", k: "income", w: 16, f: MONEY, a: "right" },
        { h: "Расход", k: "expense", w: 16, f: MONEY, a: "right" },
      ],
      rows: A.dailyTrend(q).map((r) => ({ date: dmy(r.day), income: r.income, expense: r.expense })),
    }];
  }
  if (block === "employees") {
    return [{
      sheet: "Сотрудники",
      columns: [
        { h: "Сотрудник", k: "name", w: 26 },
        { h: "Расход", k: "expense", w: 16, f: MONEY, a: "right" },
        { h: "Приход", k: "income", w: 16, f: MONEY, a: "right" },
        { h: "Операций", k: "count", w: 12, a: "right" },
      ],
      rows: A.byEmployee(q),
    }];
  }
  if (block === "stats") {
    return [{
      sheet: "Средние по категориям",
      columns: [
        { h: "Категория", k: "name", w: 30 },
        { h: "Мес. средн.", k: "ma", w: 15, f: MONEY, a: "right" },
        { h: "Мес. макс", k: "mx", w: 15, f: MONEY, a: "right" },
        { h: "Мес. мин", k: "mn", w: 15, f: MONEY, a: "right" },
        { h: "Нед. средн.", k: "wa", w: 15, f: MONEY, a: "right" },
        { h: "Нед. макс", k: "wx", w: 15, f: MONEY, a: "right" },
        { h: "Нед. мин", k: "wn", w: 15, f: MONEY, a: "right" },
      ],
      rows: A.categoryStats().map((s) => ({
        name: s.name,
        ma: Math.round(s.month.avg), mx: s.month.max, mn: s.month.min,
        wa: Math.round(s.week.avg), wx: s.week.max, wn: s.week.min,
      })),
    }];
  }
  if (block === "reconciliation") {
    return [{
      sheet: "Сверка AppSheet-Касса",
      columns: [
        { h: "Дата", k: "date", w: 14 },
        { h: "AppSheet расход", k: "ae", w: 18, f: MONEY, a: "right" },
        { h: "Касса расход", k: "ke", w: 16, f: MONEY, a: "right" },
        { h: "Δ расход", k: "de", w: 14, f: MONEY, a: "right" },
        { h: "AppSheet приход", k: "ai", w: 18, f: MONEY, a: "right" },
        { h: "Касса приход", k: "ki", w: 16, f: MONEY, a: "right" },
        { h: "Δ приход", k: "di", w: 14, f: MONEY, a: "right" },
        { h: "Статус", k: "st", w: 10 },
      ],
      rows: A.reconciliation(q).map((r) => ({
        date: dmy(r.day),
        ae: r.as_expense, ke: r.k_expense, de: r.diff_expense,
        ai: r.as_income, ki: r.k_income, di: r.diff_income,
        st: r.ok ? "ОК" : "≠",
      })),
    }];
  }
  if (block === "selection") {
    // Kategoriya blokida belgilab olingan aynan shu yozuvlar
    const ops = A.operationsByIds((extra && extra.ids) || []);
    const expense = ops.reduce((s2, o) => s2 + (o.is_income ? 0 : o.amount), 0);
    const income = ops.reduce((s2, o) => s2 + (o.is_income ? o.amount : 0), 0);
    return [{
      sheet: "Выбранные записи",
      columns: [
        { h: "Дата", k: "date", w: 14 },
        { h: "Тип", k: "type", w: 10 },
        { h: "Категория", k: "category", w: 26 },
        { h: "Сотрудник", k: "employee", w: 22 },
        { h: "Сумма", k: "amount", w: 16, f: MONEY, a: "right" },
        { h: "Комментарий", k: "comment", w: 50 },
      ],
      rows: ops.map((o) => ({
        date: dmy(o.day),
        type: o.is_income ? "приход" : "расход",
        category: o.category,
        employee: o.employee,
        amount: o.is_income ? o.amount : -o.amount,
        comment: o.comment,
      })),
      // Итого = приход − расход (jadvaldagi «Сумма» ustuni yig'indisi)
      totalRow: {
        date: "ИТОГО",
        type: "",
        category: `записей: ${ops.length}`,
        employee: "",
        amount: income - expense,
        comment: `расход: ${expense.toLocaleString("ru-RU")} · приход: ${income.toLocaleString("ru-RU")}`,
      },
    }];
  }
  if (block === "operations") {
    // Ikki varaq: AppSheet operatsiyalari + Kassa yozuvlari (filtr bo'yicha)
    return [
      {
        sheet: "AppSheet операции",
        columns: [
          { h: "Дата", k: "date", w: 14 },
          { h: "Тип", k: "type", w: 10 },
          { h: "Категория", k: "category", w: 26 },
          { h: "Сотрудник", k: "employee", w: 22 },
          { h: "Сумма", k: "amount", w: 16, f: MONEY, a: "right" },
          { h: "Комментарий", k: "comment", w: 50 },
        ],
        rows: A.operationsList(q).map((o) => ({
          date: dmy(o.day),
          type: o.is_income ? "приход" : "расход",
          category: o.category,
          employee: o.employee,
          amount: o.is_income ? o.amount : -o.amount,
          comment: o.comment,
        })),
      },
      {
        sheet: "Касса",
        columns: [
          { h: "Дата", k: "date", w: 14 },
          { h: "Сумма", k: "amount", w: 16, f: MONEY, a: "right" },
          { h: "Комментарий", k: "comment", w: 60 },
        ],
        rows: A.kassaEntriesList(q).map((e) => ({ date: dmy(e.day), amount: e.amount, comment: e.comment })),
      },
    ];
  }
  return null;
}

async function buildBlock(block, q, extra) {
  const sheets = specs(block, q, extra);
  if (!sheets) return null;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Buyo Kassa Dashboard";
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.sheet);
    applySheet(ws, s.columns, s.rows, s.totalRow);
  }
  return wb.xlsx.writeBuffer();
}

module.exports = { buildBlock, dmy };
