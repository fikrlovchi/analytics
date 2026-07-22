// Bir martalik sinxronizatsiya (test / cron uchun): node src/scripts/sync-once.js
require("../db");
const { runSync } = require("../sheets/sync");

runSync().then((r) => {
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
});
