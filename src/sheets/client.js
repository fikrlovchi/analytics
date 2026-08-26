const fs = require("fs");
const { sheets, auth } = require("@googleapis/sheets");
const config = require("../config");

// OAuth2 — haqiqiy Google akkaunt (uzbuyo@gmail.com) nomidan ishlaydi.
// oauth.json (git'da YO'Q):
//   { "client_id": "...", "client_secret": "...", "refresh_token": "1//..." }
//
// Fayl analytics loyihasining O'ZIDA turishi kerak (<ROOT>/oauth.json) — shunda
// yonma-yon loyihalar ko'chirilsa/qayta nomlansa ham (uzumOrderToMC -> mcorders)
// sinxronizatsiya buzilmaydi. Nusxalash: `npm run import-oauth`.
// config.OAUTH_CANDIDATES — tekshiriladigan yo'llar ketma-ketligi (OAUTH_FILE birinchi).

// Topilgan yo'lni eslab qolamiz (loglar bir marta chiqsin)
let _resolved = null;

function resolveOauthFile() {
  const tried = [];
  for (const p of config.OAUTH_CANDIDATES) {
    if (!p || tried.includes(p)) continue;
    tried.push(p);
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch (e) {
      /* yo'q — keyingisiga o'tamiz */
    }
  }
  throw new Error(
    "oauth.json topilmadi. Tekshirilgan yo'llar: " +
      tried.join(", ") +
      ". Faylni analytics papkasiga qo'ying (npm run import-oauth) yoki .env dagi OAUTH_FILE ni to'g'rilang."
  );
}

function readCreds() {
  const file = resolveOauthFile();
  let creds;
  try {
    creds = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`oauth.json o'qilmadi (${file}): ${e.message}`);
  }
  const missing = ["client_id", "client_secret", "refresh_token"].filter((k) => !creds[k]);
  if (missing.length) {
    throw new Error(`oauth.json to'liq emas (${file}) — yetishmayapti: ${missing.join(", ")}`);
  }
  if (_resolved !== file) {
    _resolved = file;
    console.log(`[sheets] OAuth fayl: ${file}`);
  }
  return creds;
}

let _api;
function api() {
  if (_api) return _api;
  const creds = readCreds();
  const oauth2 = new auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    "https://developers.google.com/oauthplayground"
  );
  oauth2.setCredentials({ refresh_token: creds.refresh_token });
  _api = sheets({ version: "v4", auth: oauth2 });
  return _api;
}

const REQ_TIMEOUT = 30000; // 30s — osilib qolgan so'rovni uzadi

async function getValues(spreadsheetId, range) {
  const res = await api().spreadsheets.values.get({ spreadsheetId, range }, { timeout: REQ_TIMEOUT });
  return res.data.values || [];
}

async function batchGet(spreadsheetId, ranges) {
  if (!ranges.length) return [];
  const res = await api().spreadsheets.values.batchGet({ spreadsheetId, ranges }, { timeout: REQ_TIMEOUT });
  return res.data.valueRanges || [];
}

async function getSheetTitles(spreadsheetId) {
  const res = await api().spreadsheets.get(
    { spreadsheetId, fields: "sheets.properties.title" },
    { timeout: REQ_TIMEOUT }
  );
  return (res.data.sheets || []).map((s) => s.properties.title);
}

module.exports = { getValues, batchGet, getSheetTitles, resolveOauthFile };
