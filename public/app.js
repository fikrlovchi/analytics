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

  // Kategoriya donut ierarxiyasi (drill) — alohida boshqariladi
  let catChartInstance = null;
  let catParent = null; // joriy drill darajasi (guruh id yoki null = yuqori)

  function catHierarchy() {
    const groups = window.__GROUPS__ || [];
    const catmap = window.__CATMAP__ || {};
    const byCat = {};
    (D.byCategory || []).forEach((c) => { byCat[String(c.id)] = { name: c.name, expense: c.expense || 0 }; });
    const childGroups = {};
    groups.forEach((g) => { const k = g.parent_id == null ? "root" : String(g.parent_id); (childGroups[k] = childGroups[k] || []).push(g); });
    const catsByGroup = {};
    Object.keys(catmap).forEach((cid) => { const gid = String(catmap[cid]); (catsByGroup[gid] = catsByGroup[gid] || []).push(cid); });
    const groupById = {};
    groups.forEach((g) => (groupById[String(g.id)] = g));
    const memo = {};
    function groupExpense(gid) {
      gid = String(gid);
      if (memo[gid] != null) return memo[gid];
      let sum = 0;
      (catsByGroup[gid] || []).forEach((cid) => { if (byCat[cid]) sum += byCat[cid].expense; });
      (childGroups[gid] || []).forEach((g) => (sum += groupExpense(g.id)));
      memo[gid] = sum; return sum;
    }
    function hasChildren(gid) { gid = String(gid); return !!((childGroups[gid] && childGroups[gid].length) || (catsByGroup[gid] && catsByGroup[gid].length)); }
    return { catmap, byCat, childGroups, catsByGroup, groupById, groupExpense, hasChildren };
  }
  function catLevelNodes(H, parent) {
    const key = parent == null ? "root" : String(parent);
    const nodes = [];
    (H.childGroups[key] || []).forEach((g) => nodes.push({ type: "group", id: String(g.id), name: g.name, expense: H.groupExpense(g.id), drillable: H.hasChildren(g.id) }));
    Object.keys(H.byCat).forEach((cid) => {
      const gid = H.catmap[cid];
      const here = parent == null ? gid == null : String(gid) === String(parent);
      if (here) nodes.push({ type: "cat", id: cid, name: H.byCat[cid].name, expense: H.byCat[cid].expense, drillable: false });
    });
    return nodes.filter((n) => n.expense > 0).sort((a, b) => b.expense - a.expense);
  }
  function catCrumbPath(H, parent) {
    const path = [{ id: null, name: "Все" }];
    const chain = []; let cur = parent;
    while (cur != null) { const g = H.groupById[String(cur)]; if (!g) break; chain.unshift({ id: String(g.id), name: g.name }); cur = g.parent_id; }
    return path.concat(chain);
  }
  function renderCatChart() {
    const el = document.getElementById("catChart");
    if (!el || !window.Chart) return;
    const H = catHierarchy();
    if (catParent != null && !H.groupById[String(catParent)]) catParent = null;
    const nodes = catLevelNodes(H, catParent);
    const crumb = document.getElementById("catCrumb");
    if (crumb) {
      const path = catCrumbPath(H, catParent);
      crumb.innerHTML = path.map((p, i) => (i === path.length - 1
        ? `<span class="crumb-cur">${esc(p.name)}</span>`
        : `<a data-gid="${p.id == null ? "" : p.id}">${esc(p.name)}</a>`)).join(' <span class="crumb-sep">›</span> ');
      crumb.querySelectorAll("a[data-gid]").forEach((a) => a.addEventListener("click", () => {
        const v = a.getAttribute("data-gid"); catParent = v === "" ? null : v; renderCatChart();
      }));
    }
    if (catChartInstance) { catChartInstance.destroy(); catChartInstance = null; }
    if (!nodes.length) return;
    const TEXT = cssVar("--text") || "#e6edf3";
    catChartInstance = new Chart(el, {
      type: "doughnut",
      data: { labels: nodes.map((n) => n.name + (n.drillable ? " ▸" : "")), datasets: [{ data: nodes.map((n) => n.expense), backgroundColor: PALETTE, borderColor: cssVar("--panel") || "#0b0e13", borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        onHover: (e, els) => { e.native.target.style.cursor = els.length && nodes[els[0].index].drillable ? "pointer" : "default"; },
        onClick: (e, els) => { if (!els.length) return; const n = nodes[els[0].index]; if (n.drillable) { catParent = n.id; renderCatChart(); } },
        plugins: {
          legend: { position: "right", labels: { color: TEXT, boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label.replace(" ▸", "")}: ${fmt(ctx.parsed)} сум` } },
        },
      },
    });
  }

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

    renderCatChart(); // ierarxik donut (joriy drill darajasida)

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

  // Umumiy operatsiyalar jadvali (drill-down uchun)
  function opsTableHTML(ops, opts) {
    const showCat = opts && opts.showCategory;
    const showEmp = opts && opts.showEmployee;
    let h = "<table><thead><tr><th>Дата</th><th>Тип</th>";
    if (showCat) h += "<th>Категория</th>";
    if (showEmp) h += "<th>Сотрудник</th>";
    h += '<th class="num">Сумма</th><th>Комментарий</th></tr></thead><tbody>';
    for (const o of ops) {
      const amt = (o.is_income ? "+" : "−") + fmt(o.amount);
      const cls = o.is_income ? "pos" : "neg";
      h += `<tr><td>${fmtDate(o.day)}</td><td>${o.is_income ? '<span class="tag inc">приход</span>' : '<span class="tag exp">расход</span>'}</td>`;
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

  // ===================== Drill-down (kategoriya yozuvlari) =====================
  function typeTag(isIncome) {
    return isIncome ? '<span class="tag inc">приход</span>' : '<span class="tag exp">расход</span>';
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
      tr.innerHTML = `<td colspan="${cols}"><div class="drill-inner"><span class="muted">Загрузка…</span></div></td>`;
      row.after(tr);
      const inner = tr.querySelector(".drill-inner");
      try {
        const catId = row.getAttribute("data-cat");
        const res = await fetch(`/api/category-ops?${QS}&catId=${encodeURIComponent(catId)}`, { headers: { Accept: "application/json" } });
        const ops = await res.json();
        if (!Array.isArray(ops) || !ops.length) {
          inner.innerHTML = '<span class="muted">Нет записей за выбранный период</span>';
          return;
        }
        inner.innerHTML = opsTableHTML(ops, { showEmployee: true });
      } catch (e) {
        inner.innerHTML = '<span class="muted">Ошибка загрузки</span>';
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
