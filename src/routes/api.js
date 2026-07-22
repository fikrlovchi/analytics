const express = require("express");
const A = require("../services/analytics");
const { buildBlock } = require("../services/export");
const bg = require("../utils/backgrounds");

const router = express.Router();

// Yuklab olinadigan fayl nomlari — rus tilida
const FILE_NAMES = {
  categories: "Категории",
  trend: "Динамика по дням",
  employees: "Сотрудники",
  stats: "Средние по категориям",
  reconciliation: "Сверка AppSheet-Касса",
  operations: "Выгрузка данных (AppSheet + Касса)",
};

function q(req) {
  return {
    from: req.query.from,
    to: req.query.to,
    category: req.query.category,
    employee: req.query.employee,
  };
}

// Blok ma'lumotini .xlsx qilib yuklab olish
router.get("/export/:file", async (req, res) => {
  const block = String(req.params.file).replace(/\.xlsx$/i, "");
  let buf;
  try {
    buf = await buildBlock(block, q(req));
  } catch (e) {
    return res.status(500).send("Xatolik: " + e.message);
  }
  if (!buf) return res.status(404).send("Noma'lum blok");

  const { from, to } = A.bounds(q(req));
  const ruName = `${FILE_NAMES[block] || block} ${from}—${to}.xlsx`;
  // Cyrillic fayl nomi uchun RFC 5987 (filename*), + ASCII zaxira nom
  const asciiFallback = `export_${block}_${from}_${to}.xlsx`;
  const encoded = encodeURIComponent(ruName);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`
  );
  res.send(Buffer.from(buf));
});

// Drill-down: kategoriya bo'yicha operatsiyalar
router.get("/api/category-ops", (req, res) => {
  const catId = req.query.catId;
  if (!catId) return res.status(400).json({ error: "catId kerak" });
  res.json(A.categoryOperations(q(req), catId));
});

// Drill-down: xodim bo'yicha operatsiyalar
router.get("/api/employee-ops", (req, res) => {
  const login = req.query.login;
  if (!login) return res.status(400).json({ error: "login kerak" });
  res.json(A.employeeOperations(q(req), login));
});

// ===== Mavzu bo'yicha fon rasmi =====
// Rasmni raw binary sifatida yuklaymiz (multer shart emas)
router.post(
  "/api/background/:theme",
  express.raw({ type: () => true, limit: "12mb" }),
  (req, res) => {
    const theme = req.params.theme;
    if (!bg.isTheme(theme)) return res.status(400).json({ error: "noto'g'ri theme" });
    if (!req.body || !req.body.length) return res.status(400).json({ error: "bo'sh fayl" });
    try {
      bg.saveBg(theme, req.body, req.headers["content-type"]);
      res.json({ ok: true, url: `/bg/${theme}?t=${req.body.length}` });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

router.delete("/api/background/:theme", (req, res) => {
  if (!bg.isTheme(req.params.theme)) return res.status(400).json({ error: "noto'g'ri theme" });
  bg.removeBg(req.params.theme);
  res.json({ ok: true });
});

router.get("/bg/:theme", (req, res) => {
  const f = bg.findFile(req.params.theme);
  if (!f) return res.status(404).end();
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(f);
});

module.exports = router;
