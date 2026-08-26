(function () {
  const D = window.__DATA__ || {};
  const QS = window.__QS__ || "";
  const PALETTE = ["#38bdf8","#2ecc8f","#fbbf24","#f87171","#a78bfa","#f472b6","#34d399","#60a5fa","#fb923c","#c084fc","#4ade80","#e879f9"];

  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function fmt(n) {
    n = Math.round(n || 0);
    const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return (n < 0 ? "−" : "") + s;
  }
  // 'YYYY-MM-DD' -> 'dd.mm.yyyy'
  function fmtDate(iso) {
    if (!iso) return "";
    const p = String(iso).slice(0, 10).split("-");
    return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso);
  }
  function fmtDateShort(iso) {
    const p = String(iso).slice(0, 10).split("-");
    return p.length === 3 ? `${p[2]}.${p[1]}` : String(iso);
  }

  // ===================== Grafiklar =====================
  let charts = [];
  function destroyCharts() { charts.forEach((c) => c.destroy()); charts = []; }

  // Kategoriya donutlari — 3 metrika (total/expense/income), har biri mustaqil drill
  const CAT_METRICS = [
    { key: "total", canvas: "chart-total", crumb: "crumb-total" },
    { key: "expense", canvas: "chart-expense", crumb: "crumb-expense" },
    { key: "income", canvas: "chart-income", crumb: "crumb-income" },
  ];
  const catState = { total: { parent: null, inst: null }, expense: { parent: null, inst: null }, income: { parent: null, inst: null } };

  function catHierarchy() {
    const groups = window.__GROUPS__ || [];
    const catmap = window.__CATMAP__ || {};
    const catColors = window.__CATCOLORS__ || {};
    const byCat = {};
    (D.byCategory || []).forEach((c) => {
      const exp = c.expense || 0, inc = c.income || 0;
      byCat[String(c.id)] = { name: c.name, expense: exp, income: inc, total: exp - inc, color: catColors[String(c.id)] || null };
    });
    const childGroups = {};
    groups.forEach((g) => { const k = g.parent_id == null ? "root" : String(g.parent_id); (childGroups[k] = childGroups[k] || []).push(g); });
    const catsByGroup = {};
    Object.keys(catmap).forEach((cid) => { const gid = String(catmap[cid]); (catsByGroup[gid] = catsByGroup[gid] || []).push(cid); });
    const groupById = {};
    groups.forEach((g) => (groupById[String(g.id)] = g));
    const memo = {};
    function agg(gid, metric) {
      const mk = gid + "|" + metric;
      if (memo[mk] != null) return memo[mk];
      let s = 0;
      (catsByGroup[String(gid)] || []).forEach((cid) => { if (byCat[cid]) s += byCat[cid][metric]; });
      (childGroups[String(gid)] || []).forEach((g) => (s += agg(g.id, metric)));
      memo[mk] = s; return s;
    }
    function hasChildren(gid) { gid = String(gid); return !!((childGroups[gid] && childGroups[gid].length) || (catsByGroup[gid] && catsByGroup[gid].length)); }
    return { catmap, byCat, childGroups, catsByGroup, groupById, agg, hasChildren };
  }
  function catLevelNodes(H, parent, metric) {
    const key = parent == null ? "root" : String(parent);
    const nodes = [];
    (H.childGroups[key] || []).forEach((g) => nodes.push({ type: "group", id: String(g.id), name: g.name, value: H.agg(g.id, metric), drillable: H.hasChildren(g.id), color: g.color || null }));
    Object.keys(H.byCat).forEach((cid) => {
      const gid = H.catmap[cid];
      const here = parent == null ? gid == null : String(gid) === String(parent);
      if (here) nodes.push({ type: "cat", id: cid, name: H.byCat[cid].name, value: H.byCat[cid][metric], drillable: false, color: H.byCat[cid].color });
    });
    return nodes.filter((n) => n.value > 0).sort((a, b) => b.value - a.value);
  }
  function catCrumbPath(H, parent) {
    const path = [{ id: null, name: "Все" }];
    const chain = []; let cur = parent;
    while (cur != null) { const g = H.groupById[String(cur)]; if (!g) break; chain.unshift({ id: String(g.id), name: g.name }); cur = g.parent_id; }
    return path.concat(chain);
  }
  function renderMetric(m) {
    const el = document.getElementById(m.canvas);
    if (!el || !window.Chart) return;
    const H = catHierarchy();
    const st = catState[m.key];
    if (st.parent != null && !H.groupById[String(st.parent)]) st.parent = null;
    const nodes = catLevelNodes(H, st.parent, m.key);
    const crumb = document.getElementById(m.crumb);
    if (crumb) {
      const path = catCrumbPath(H, st.parent);
      crumb.innerHTML = path.map((p, i) => (i === path.length - 1
        ? `<span class="crumb-cur">${esc(p.name)}</span>`
        : `<a data-gid="${p.id == null ? "" : p.id}">${esc(p.name)}</a>`)).join(' <span class="crumb-sep">›</span> ');
      crumb.querySelectorAll("a[data-gid]").forEach((a) => a.addEventListener("click", () => {
        const v = a.getAttribute("data-gid"); st.parent = v === "" ? null : v; renderMetric(m);
      }));
    }
    if (st.inst) { st.inst.destroy(); st.inst = null; }
    if (!nodes.length) return;
    const TEXT = cssVar("--text") || "#e6edf3";
    const colors = nodes.map((n, i) => n.color || PALETTE[i % PALETTE.length]);
    st.inst = new Chart(el, {
      type: "doughnut",
      data: { labels: nodes.map((n) => n.name + (n.drillable ? " ▸" : "")), datasets: [{ data: nodes.map((n) => n.value), backgroundColor: colors, borderColor: cssVar("--panel") || "#0b0e13", borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        onHover: (e, els) => { e.native.target.style.cursor = els.length && nodes[els[0].index].drillable ? "pointer" : "default"; },
        onClick: (e, els) => { if (!els.length) return; const n = nodes[els[0].index]; if (n.drillable) { st.parent = n.id; renderMetric(m); } },
        plugins: {
          legend: { position: "bottom", labels: { color: TEXT, boxWidth: 12, padding: 8, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label.replace(" ▸", "")}: ${fmt(ctx.parsed)} сум` } },
        },
      },
    });
  }
  function renderCatCharts() { CAT_METRICS.forEach(renderMetric); }

  function buildCharts() {
    if (!window.Chart) return;
    destroyCharts();
    const TEXT = cssVar("--text") || "#e6edf3";
    const MUTED = cssVar("--muted") || "#8b97a7";
    const GRID = cssVar("--grid") || "rgba(148,163,184,.15)";
    const GREEN = cssVar("--accent-green") || "#2ecc8f";
    const RED = cssVar("--danger") || "#f87171";
    const BLUE = cssVar("--accent") || "#38bdf8";
    Chart.defaults.color = MUTED;
    Chart.defaults.font.family = "Montserrat, Segoe UI, sans-serif";

    renderCatCharts(); // 3 ta ierarxik donut (total/expense/income)

    const tr = D.dailyTrend || [];
    const trendEl = document.getElementById("trendChart");
    if (trendEl && tr.length) {
      charts.push(new Chart(trendEl, {
        type: "bar",
        data: {
          labels: tr.map((r) => fmtDateShort(r.day)),
          datasets: [
            { label: "Приход", data: tr.map((r) => r.income), backgroundColor: GREEN },
            { label: "Расход", data: tr.map((r) => r.expense), backgroundColor: RED },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: TEXT } }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)} сум` } } },
          scales: {
            x: { grid: { color: GRID }, ticks: { color: MUTED, maxRotation: 0, autoSkip: true } },
            y: { grid: { color: GRID }, ticks: { color: MUTED, callback: (v) => fmt(v) } },
          },
        },
      }));
    }

    const emp = (D.byEmployee || []).filter((e) => e.expense > 0).slice(0, 10);
    const empEl = document.getElementById("empChart");
    if (empEl && emp.length) {
      charts.push(new Chart(empEl, {
        type: "bar",
        data: { labels: emp.map((e) => e.name), datasets: [{ label: "Расход", data: emp.map((e) => e.expense), backgroundColor: BLUE }] },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          onHover: (evt, els) => { evt.native.target.style.cursor = els.length ? "pointer" : "default"; },
          onClick: (evt, els) => { if (els.length) showEmpDrill(emp[els[0].index]); },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${fmt(ctx.parsed.x)} сум` } } },
          scales: {
            x: { grid: { color: GRID }, ticks: { color: MUTED, callback: (v) => fmt(v) } },
            y: { grid: { display: false }, ticks: { color: TEXT } },
          },
        },
      }));
    }
  }

  // Umumiy operatsiyalar jadvali (drill-down uchun).
  // opts.selectable — har qatorda belgilash katakchasi: tanlanganlar yig'indisi
  // pastdagi panelda ko'rinadi va faqat o'shalarni .xlsx qilib olish mumkin.
  function opsTableHTML(ops, opts) {
    const showCat = opts && opts.showCategory;
    const showEmp = opts && opts.showEmployee;
    const pick = !!(opts && opts.selectable);
    let h = `<table${pick ? ' class="pickable"' : ""}><thead><tr>`;
    if (pick) h += '<th class="pick"><input type="checkbox" class="pick-all" title="Выбрать все"></th>';
    h += "<th>Дата</th><th>Тип</th>";
    if (showCat) h += "<th>Категория</th>";
    if (showEmp) h += "<th>Сотрудник</th>";
    h += '<th class="num">Сумма</th><th>Комментарий</th></tr></thead><tbody>';
    for (const o of ops) {
      const amt = (o.is_income ? "+" : "−") + fmt(o.amount);
      const cls = o.is_income ? "pos" : "neg";
      const on = pick && SEL.has(String(o.id));
      h += pick
        ? `<tr class="op-row${on ? " picked" : ""}" data-id="${esc(o.id)}">` +
          `<td class="pick"><input type="checkbox" class="pick-one"${on ? " checked" : ""}></td>`
        : "<tr>";
      h += `<td>${fmtDate(o.day)}</td><td>${o.is_income ? '<span class="tag inc">приход</span>' : '<span class="tag exp">расход</span>'}</td>`;
      if (showCat) h += `<td>${esc(o.category)}</td>`;
      if (showEmp) h += `<td>${esc(o.employee)}</td>`;
      h += `<td class="num ${cls}">${amt}</td><td>${esc(o.comment)}</td></tr>`;
    }
    h += "</tbody></table>";
    return h;
  }

  // Xodim ustuni bosilganda uning yozuvlari
  let empDrillLogin = null;
  async function showEmpDrill(e) {
    const box = document.getElementById("empDrill");
    if (!box || !e) return;
    if (empDrillLogin === e.login) { box.innerHTML = ""; empDrillLogin = null; return; } // qayta bosilsa yopiladi
    empDrillLogin = e.login;
    box.innerHTML = '<div class="drill-inner"><span class="muted">Загрузка…</span></div>';
    try {
      const res = await fetch(`/api/employee-ops?${QS}&login=${encodeURIComponent(e.login)}`, { headers: { Accept: "application/json" } });
      const ops = await res.json();
      if (!Array.isArray(ops) || !ops.length) {
        box.innerHTML = `<div class="drill-inner"><b>${esc(e.name)}</b> — <span class="muted">нет записей за период</span></div>`;
        return;
      }
      box.innerHTML = `<div class="drill-inner"><b>${esc(e.name)}</b> · записей: ${ops.length}` + opsTableHTML(ops, { showCategory: true }) + "</div>";
    } catch (err) {
      box.innerHTML = '<div class="drill-inner"><span class="muted">Ошибка загрузки</span></div>';
    }
  }

  buildCharts();

  // ===================== Mavzu (light/dark) =====================
  const currentTheme = () => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
  const themeBtn = document.getElementById("themeToggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const next = currentTheme() === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
      buildCharts(); // yangi mavzu ranglari bilan qayta chizamiz
      applyBg(next);
      updateBgUI(next);
    });
  }

  // ===================== Fon rasmlari (mavzu bo'yicha) =====================
  const BG = window.__BG__ || { light: false, dark: false };
  function applyBg(theme, bust) {
    if (BG[theme]) {
      document.body.style.backgroundImage = `url(/bg/${theme}${bust ? "?t=" + Date.now() : ""})`;
      document.body.classList.add("has-bg");
    } else {
      document.body.style.backgroundImage = "";
      document.body.classList.remove("has-bg");
    }
  }
  const bgBtn = document.getElementById("bgBtn");
  const bgPop = document.getElementById("bgPop");
  const bgFile = document.getElementById("bgFile");
  const bgDrop = document.getElementById("bgDrop");
  const bgRemove = document.getElementById("bgRemove");
  const bgStatus = document.getElementById("bgStatus");
  const bgThemeName = document.getElementById("bgThemeName");

  function updateBgUI(theme) {
    if (bgThemeName) bgThemeName.textContent = theme === "light" ? "Светлая" : "Тёмная";
    if (bgStatus) bgStatus.textContent = BG[theme] ? "Фон установлен" : "Фон не задан";
  }
  async function uploadBg(file) {
    const theme = currentTheme();
    if (!file || !file.type.startsWith("image/")) { if (bgStatus) bgStatus.textContent = "Только изображение"; return; }
    if (bgStatus) bgStatus.textContent = "Загрузка…";
    try {
      const r = await fetch("/api/background/" + theme, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      const j = await r.json();
      if (j.ok) { BG[theme] = true; applyBg(theme, true); updateBgUI(theme); if (bgStatus) bgStatus.textContent = "Готово ✓"; }
      else if (bgStatus) bgStatus.textContent = "Ошибка: " + (j.error || "");
    } catch (e) { if (bgStatus) bgStatus.textContent = "Ошибка загрузки"; }
  }
  if (bgBtn && bgPop) {
    bgBtn.addEventListener("click", (e) => { e.stopPropagation(); bgPop.classList.toggle("open"); updateBgUI(currentTheme()); });
    bgPop.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => bgPop.classList.remove("open"));
    if (bgFile) bgFile.addEventListener("change", () => { if (bgFile.files[0]) uploadBg(bgFile.files[0]); });
    if (bgDrop) {
      ["dragover", "dragenter"].forEach((ev) => bgDrop.addEventListener(ev, (e) => { e.preventDefault(); bgDrop.classList.add("drag"); }));
      ["dragleave"].forEach((ev) => bgDrop.addEventListener(ev, (e) => { e.preventDefault(); bgDrop.classList.remove("drag"); }));
      bgDrop.addEventListener("drop", (e) => { e.preventDefault(); bgDrop.classList.remove("drag"); const f = e.dataTransfer.files[0]; if (f) uploadBg(f); });
    }
    if (bgRemove) bgRemove.addEventListener("click", async () => {
      const theme = currentTheme();
      try { await fetch("/api/background/" + theme, { method: "DELETE" }); } catch (e) {}
      BG[theme] = false; applyBg(theme); updateBgUI(theme); if (bgStatus) bgStatus.textContent = "Удалено";
    });
    updateBgUI(currentTheme());
  }
  applyBg(currentTheme());

  // ===================== Multiselect =====================
  document.querySelectorAll("[data-ms]").forEach((ms) => {
    const btn = ms.querySelector("[data-ms-btn]");
    const panel = ms.querySelector("[data-ms-panel]");
    const boxes = () => Array.from(panel.querySelectorAll('input[type="checkbox"]'));
    const label = () => {
      const checked = boxes().filter((b) => b.checked);
      const txt = checked.length === 0 ? "Все" : checked.length + " выбрано";
      btn.childNodes[0].nodeValue = txt + " ";
    };
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll("[data-ms-panel].open").forEach((p) => { if (p !== panel) p.classList.remove("open"); });
      panel.classList.toggle("open");
    });
    panel.addEventListener("click", (e) => e.stopPropagation());
    const all = panel.querySelector("[data-ms-all]");
    const none = panel.querySelector("[data-ms-none]");
    if (all) all.addEventListener("click", () => { boxes().forEach((b) => (b.checked = true)); label(); });
    if (none) none.addEventListener("click", () => { boxes().forEach((b) => (b.checked = false)); label(); });
    panel.addEventListener("change", label);
    label();
  });
  document.addEventListener("click", () => {
    document.querySelectorAll("[data-ms-panel].open").forEach((p) => p.classList.remove("open"));
  });

  // ===================== Tanlangan yozuvlar (Kategoriya bloki) =====================
  // Kategoriya ochilganda chiqadigan yozuvlarni belgilab, aynan o'shalarning
  // yig'indisini ko'rish va faqat o'shalarni .xlsx qilib yuklab olish mumkin.
  const OPS = new Map(); // id -> operatsiya (drill-down'da yuklangani)
  const SEL = new Set(); // belgilangan id'lar (kategoriya yopilib-ochilsa ham saqlanadi)

  const selBar = document.getElementById("selBar");
  const selEl = (n) => (selBar ? selBar.querySelector("[data-sel-" + n + "]") : null);
  const selCount = selEl("count"), selExpense = selEl("expense"), selIncome = selEl("income");
  const selTotal = selEl("total"), selDl = selEl("dl"), selClear = selEl("clear"), selMsg = selEl("msg");

  function selTotals() {
    let expense = 0, income = 0;
    SEL.forEach((id) => {
      const o = OPS.get(id);
      if (!o) return;
      if (o.is_income) income += o.amount;
      else expense += o.amount;
    });
    // Итого — «Категории» jadvalidagi kabi: расход − приход
    return { expense, income, total: expense - income };
  }

  function setSelMsg(text) {
    if (selMsg) { selMsg.textContent = text || ""; selMsg.hidden = !text; }
  }

  function renderSelBar() {
    if (!selBar) return;
    if (!SEL.size) { selBar.hidden = true; setSelMsg(""); return; }
    const t = selTotals();
    selBar.hidden = false;
    if (selCount) selCount.textContent = SEL.size;
    if (selExpense) selExpense.textContent = t.expense ? "\u2212" + fmt(t.expense) : "0";
    if (selIncome) selIncome.textContent = t.income ? "+" + fmt(t.income) : "0";
    if (selTotal) selTotal.textContent = fmt(t.total);
  }

  function setPicked(tr, on) {
    const id = tr.getAttribute("data-id");
    if (!id) return;
    if (on) SEL.add(id);
    else SEL.delete(id);
    tr.classList.toggle("picked", on);
  }

  // Sarlavhadagi «hammasi» katakchasi: to'liq / qisman / bo'sh holat
  function refreshPickAll(table) {
    if (!table) return;
    const all = table.querySelector(".pick-all");
    if (!all) return;
    const total = table.querySelectorAll("tr.op-row").length;
    const on = table.querySelectorAll("tr.op-row.picked").length;
    all.checked = total > 0 && on === total;
    all.indeterminate = on > 0 && on < total;
  }

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.classList.contains("pick-one")) {
      const tr = t.closest("tr.op-row");
      if (!tr) return;
      setPicked(tr, t.checked);
      refreshPickAll(t.closest("table"));
      renderSelBar();
    } else if (t.classList.contains("pick-all")) {
      const table = t.closest("table");
      if (!table) return;
      table.querySelectorAll("tr.op-row").forEach((tr) => {
        const cb = tr.querySelector(".pick-one");
        if (cb) cb.checked = t.checked;
        setPicked(tr, t.checked);
      });
      refreshPickAll(table);
      renderSelBar();
    }
  });

  // Qatorning istalgan joyiga bosilsa ham belgilanadi
  document.addEventListener("click", (e) => {
    if (!e.target || !e.target.closest) return;
    if (e.target.closest("input, a, button")) return;
    const tr = e.target.closest("tr.op-row");
    if (!tr) return;
    const cb = tr.querySelector(".pick-one");
    if (!cb) return;
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
  });

  if (selClear) selClear.addEventListener("click", () => {
    SEL.clear();
    document.querySelectorAll("tr.op-row.picked").forEach((tr) => tr.classList.remove("picked"));
    document.querySelectorAll(".pick-one").forEach((cb) => (cb.checked = false));
    document.querySelectorAll("table.pickable").forEach(refreshPickAll);
    renderSelBar();
  });

  // Content-Disposition'dan fayl nomi (rus tilidagi nom UTF-8''... ko'rinishida keladi)
  function fileNameFrom(cd) {
    if (!cd) return null;
    const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    if (m) { try { return decodeURIComponent(m[1]); } catch (e) { /* pastdagi variant */ } }
    const m2 = /filename="([^"]+)"/i.exec(cd);
    return m2 ? m2[1] : null;
  }

  if (selDl) selDl.addEventListener("click", async () => {
    if (!SEL.size) return;
    const label = selDl.textContent;
    selDl.disabled = true;
    selDl.textContent = "\u0413\u043e\u0442\u043e\u0432\u0438\u043c\u2026";
    setSelMsg("");
    try {
      const res = await fetch(`/export/selection.xlsx?${QS}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(SEL) }),
      });
      if (!res.ok) {
        let msg = "\u041e\u0448\u0438\u0431\u043a\u0430 \u0432\u044b\u0433\u0440\u0443\u0437\u043a\u0438";
        try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (e) { /* JSON emas */ }
        setSelMsg(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileNameFrom(res.headers.get("Content-Disposition")) || "\u0412\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u0435 \u0437\u0430\u043f\u0438\u0441\u0438.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      setSelMsg("\u041e\u0448\u0438\u0431\u043a\u0430 \u0432\u044b\u0433\u0440\u0443\u0437\u043a\u0438");
    } finally {
      selDl.disabled = false;
      selDl.textContent = label;
    }
  });

  // ===================== Drill-down (kategoriya yozuvlari) =====================
  function typeTag(isIncome) {
    return isIncome ? '<span class="tag inc">\u043f\u0440\u0438\u0445\u043e\u0434</span>' : '<span class="tag exp">\u0440\u0430\u0441\u0445\u043e\u0434</span>';
  }
  document.querySelectorAll("tr.cat-row").forEach((row) => {
    row.addEventListener("click", async () => {
      const cols = parseInt(row.getAttribute("data-cols") || "4", 10);
      const next = row.nextElementSibling;
      if (next && next.classList.contains("drill")) {
        next.remove();
        row.classList.remove("open");
        return;
      }
      row.classList.add("open");
      const tr = document.createElement("tr");
      tr.className = "drill";
      tr.innerHTML = `<td colspan="${cols}"><div class="drill-inner"><span class="muted">\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430\u2026</span></div></td>`;
      row.after(tr);
      const inner = tr.querySelector(".drill-inner");
      try {
        const catId = row.getAttribute("data-cat");
        const res = await fetch(`/api/category-ops?${QS}&catId=${encodeURIComponent(catId)}`, { headers: { Accept: "application/json" } });
        const ops = await res.json();
        if (!Array.isArray(ops) || !ops.length) {
          inner.innerHTML = '<span class="muted">\u041d\u0435\u0442 \u0437\u0430\u043f\u0438\u0441\u0435\u0439 \u0437\u0430 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u0439 \u043f\u0435\u0440\u0438\u043e\u0434</span>';
          return;
        }
        ops.forEach((o) => OPS.set(String(o.id), o));
        inner.innerHTML =
          '<div class="pick-hint muted">\u041e\u0442\u043c\u0435\u0442\u044c\u0442\u0435 \u0437\u0430\u043f\u0438\u0441\u0438 \u2014 \u0432\u043d\u0438\u0437\u0443 \u043f\u043e\u044f\u0432\u0438\u0442\u0441\u044f \u0438\u0445 \u0441\u0443\u043c\u043c\u0430 \u0438 \u0432\u044b\u0433\u0440\u0443\u0437\u043a\u0430</div>' +
          opsTableHTML(ops, { showEmployee: true, selectable: true });
        refreshPickAll(inner.querySelector("table"));
      } catch (e) {
        inner.innerHTML = '<span class="muted">\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438</span>';
      }
    });
  });

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ===================== Sana maydonlari (dd.mm.yyyy) =====================
  function toISO(s) {
    const m = String(s || "").trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) return null;
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  function fromISO(iso) {
    const p = String(iso || "").split("-");
    return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : "";
  }
  document.querySelectorAll(".datefield").forEach((df) => {
    const txt = df.querySelector(".date-txt");
    const hidden = df.querySelector('input[type="hidden"]');
    const native = df.querySelector(".date-native");
    const cal = df.querySelector(".cal-wrap");
    txt.addEventListener("input", () => {
      const iso = toISO(txt.value);
      if (iso) { hidden.value = iso; if (native) native.value = iso; }
    });
    if (native) native.addEventListener("change", () => {
      if (native.value) { hidden.value = native.value; txt.value = fromISO(native.value); }
    });
    // 📅 bosilganda native kalendarni ochamiz (showPicker)
    if (cal && native) cal.addEventListener("click", () => {
      try { native.showPicker(); }
      catch (e) { try { native.focus(); native.click(); } catch (_) {} }
    });
  });
  const filterForm = document.querySelector("form.filters");
  if (filterForm) {
    filterForm.addEventListener("submit", () => {
      document.querySelectorAll(".datefield").forEach((df) => {
        const iso = toISO(df.querySelector(".date-txt").value);
        if (iso) df.querySelector('input[type="hidden"]').value = iso;
      });
    });
  }

  // ===================== Sozlamalar: bog'liq maydonlarni yoqish/hiralashtirish =====================
  const repForm = document.getElementById("reportForm");
  if (repForm) {
    const enabled = document.getElementById("repEnabled");
    const schedBox = document.getElementById("schedBox");
    const deps = repForm.querySelectorAll(".dep");
    function refreshReport() {
      const on = enabled.checked;
      schedBox.classList.toggle("off", !on);
      const modeEl = repForm.querySelector('input[name="mode"]:checked');
      const mode = modeEl ? modeEl.value : "";
      // faqat tanlangan rejimga tegishli maydon faol; qolganlari hiralashadi
      deps.forEach((d) => d.classList.toggle("off", !(on && d.getAttribute("data-dep") === mode)));
    }
    enabled.addEventListener("change", refreshReport);
    repForm.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener("change", refreshReport));
    refreshReport();
  }
})();
