// Sheets qiymatlarini tozalash yordamchilari (Python sheets.py bilan bir xil mantiq).

function parseAmount(raw) {
  if (raw === null || raw === undefined) return 0;
  let s = String(raw).trim().replace(/\s/g, "").replace(/,/g, ".");
  if (!s) return 0;
  const neg = s.startsWith("-");
  s = s.replace(/[^0-9.]/g, "");
  if (!s || s === ".") return 0;
  const val = parseFloat(s);
  if (Number.isNaN(val)) return 0;
  return neg ? -val : val;
}

// 'DD.MM.YYYY HH:MM:SS' yoki 'DD.MM.YYYY' yoki 'M/D/YYYY' -> 'YYYY-MM-DD'
function parseDateISO(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // M/D/YYYY
  if (m) return `${m[3]}-${pad(m[1])}-${pad(m[2])}`;
  return null;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

module.exports = { parseAmount, parseDateISO, pad };
