const express = require("express");
const analytics = require("../services/analytics");
const { getMeta } = require("../sheets/sync");
const db = require("../db");
const fmt = require("../utils/format");
const bg = require("../utils/backgrounds");
const anomalies = require("../services/anomalies");
const cfg = require("../services/config-store");

const router = express.Router();

router.get("/", (req, res) => {
  // Ko'p tanlov: category/employee massiv bo'lishi mumkin
  const cats = [].concat(req.query.category || []).filter(Boolean).map(String);
  const emps = [].concat(req.query.employee || []).filter(Boolean).map(String);
  const q = {
    from: req.query.from,
    to: req.query.to,
    category: cats,
    employee: emps,
  };
  const { from, to } = analytics.bounds(q);
  const filters = { from, to, category: cats, employee: emps };

  const opCount = db.prepare("SELECT COUNT(*) AS n FROM operations").get().n;

  const data = {
    overview: analytics.overview(q),
    byCategory: analytics.expenseByCategory(q),
    dailyTrend: analytics.dailyTrend(q),
    byEmployee: analytics.byEmployee(q),
    reconciliation: analytics.reconciliation(q),
    categoryStats: analytics.categoryStats(),
  };

  const anomalyDay = anomalies.latestDay();
  const anomalyList = anomalyDay ? anomalies.computeForDate(anomalyDay) : [];

  res.render("dashboard", {
    fmtMoney: fmt.fmtMoney,
    fmtDate: fmt.fmtDate,
    fmtDateTime: fmt.fmtDateTime,
    backgrounds: { light: bg.has("light"), dark: bg.has("dark") },
    anomalyDay,
    anomalyList,
    groups: cfg.listGroups(),
    groupMap: cfg.listGroupMap(),
    catColors: cfg.listCatColors(),
    filters,
    data,
    categories: analytics.categoriesList(),
    employees: analytics.employeesList(),
    hasData: opCount > 0,
    sync: {
      lastSync: getMeta("last_sync"),
      lastError: getMeta("last_error"),
      counts: {
        operations: getMeta("count_operations"),
        kassaDays: getMeta("count_kassa_days"),
      },
    },
    synced: req.query.synced || null,
  });
});

module.exports = router;
