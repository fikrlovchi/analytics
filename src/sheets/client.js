const fs = require("fs");
const { sheets, auth } = require("@googleapis/sheets");
const config = require("../config");

// OAuth2 — haqiqiy Google akkaunt (uzbuyo@gmail.com) nomidan ishlaydi.
// oauth.json (git'da YO'Q) uzumPDFs/uzumOrderToMC loyihalaridagi bilan bir xil:
//   { "client_id": "...", "client_secret": "...", "refresh_token": "1//..." }
// Yo'li config.OAUTH_FILE (env OAUTH_FILE) orqali beriladi.
let _api;
function api() {
  if (_api) return _api;
  const creds = JSON.parse(fs.readFileSync(config.OAUTH_FILE, "utf8"));
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

module.exports = { getValues, batchGet, getSheetTitles };
