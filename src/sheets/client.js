const { google } = require("googleapis");
const config = require("../config");

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
];

let _api;
function api() {
  if (_api) return _api;
  const auth = new google.auth.GoogleAuth({
    keyFile: config.GOOGLE_CREDENTIALS_FILE,
    scopes: SCOPES,
  });
  _api = google.sheets({ version: "v4", auth });
  return _api;
}

async function getValues(spreadsheetId, range) {
  const res = await api().spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values || [];
}

async function batchGet(spreadsheetId, ranges) {
  if (!ranges.length) return [];
  const res = await api().spreadsheets.values.batchGet({ spreadsheetId, ranges });
  return res.data.valueRanges || [];
}

async function getSheetTitles(spreadsheetId) {
  const res = await api().spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  return (res.data.sheets || []).map((s) => s.properties.title);
}

module.exports = { getValues, batchGet, getSheetTitles };
