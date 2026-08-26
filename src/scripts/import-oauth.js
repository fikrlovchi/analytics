#!/usr/bin/env node
// oauth.json ni analytics loyihasining ICHIGA ko'chiradi (<ROOT>/oauth.json).
//
// Nima uchun: ilgari .env dagi OAUTH_FILE boshqa loyihaga (/root/uzumOrderToMC/oauth.json)
// ko'rsatardi. O'sha loyiha mcorders ga almashtirilgach sinxronizatsiya
// "ENOENT: ... /root/uzumOrderToMC/oauth.json" xatosi bilan to'xtab qoldi.
// Shu skript kalitni analytics'ning o'ziga nusxalaydi — boshqa loyihaga bog'liqlik qolmaydi.
//
// Ishlatish:
//   node src/scripts/import-oauth.js                  # ma'lum yo'llardan avtomatik topadi
//   node src/scripts/import-oauth.js /root/mcorders/oauth.json
//   npm run import-oauth -- /root/mcorders/oauth.json

const fs = require("fs");
const path = require("path");
const config = require("../config");

const DEST = path.join(config.ROOT, "oauth.json");
const REQUIRED = ["client_id", "client_secret", "refresh_token"];

function readValid(file) {
  const creds = JSON.parse(fs.readFileSync(file, "utf8"));
  const missing = REQUIRED.filter((k) => !creds[k]);
  if (missing.length) throw new Error(`yetishmayotgan maydonlar: ${missing.join(", ")}`);
  return creds;
}

function pickSource(argSrc) {
  if (argSrc) {
    const p = path.resolve(argSrc);
    if (!fs.existsSync(p)) throw new Error(`Manba fayl topilmadi: ${p}`);
    return p;
  }
  const tried = [];
  for (const p of config.OAUTH_CANDIDATES) {
    // DEST ning o'zi manba bo'la olmaydi
    if (!p || p === DEST || tried.includes(p)) continue;
    tried.push(p);
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch (e) {
      /* yo'q */
    }
  }
  throw new Error(
    "oauth.json hech bir ma'lum yo'ldan topilmadi:\n  " +
      tried.join("\n  ") +
      "\nManba yo'lini argument qilib bering: node src/scripts/import-oauth.js /yo'l/oauth.json"
  );
}

function main() {
  let src;
  try {
    src = pickSource(process.argv[2]);
  } catch (e) {
    console.error("✖ " + e.message);
    process.exit(1);
  }
  if (path.resolve(src) === DEST) {
    console.log(`✔ oauth.json allaqachon shu yerda: ${DEST}`);
    return;
  }

  let creds;
  try {
    creds = readValid(src);
  } catch (e) {
    console.error(`✖ Manba yaroqsiz (${src}): ${e.message}`);
    process.exit(1);
  }

  if (fs.existsSync(DEST)) {
    const backup = DEST + ".bak";
    fs.copyFileSync(DEST, backup);
    console.log(`ℹ Eski nusxa saqlandi: ${backup}`);
  }

  // Faqat kerakli maydonlar, chiroyli JSON, egasiga tegishli huquqlar (0600)
  const out = {};
  for (const k of REQUIRED) out[k] = creds[k];
  fs.writeFileSync(DEST, JSON.stringify(out, null, 2) + "\n", { mode: 0o600 });
  try {
    fs.chmodSync(DEST, 0o600);
  } catch (e) {
    /* Windows'da e'tiborsiz */
  }

  console.log(`✔ Ko'chirildi: ${src}\n            → ${DEST}`);
  console.log("Endi .env da: OAUTH_FILE=oauth.json  (yoki umuman olib tashlang — standart shu)");
  console.log("So'ng: sudo systemctl restart analytics");
}

main();
