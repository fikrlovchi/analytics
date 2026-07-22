const fs = require("fs");
const path = require("path");
const config = require("../config");

const DIR = path.join(config.ROOT, "data", "backgrounds");
fs.mkdirSync(DIR, { recursive: true });

const THEMES = ["light", "dark"];

function extForMime(mime) {
  const map = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
  };
  return map[String(mime || "").toLowerCase()] || null;
}

function isTheme(t) {
  return THEMES.includes(t);
}

// theme.* faylini topadi (masalan dark.png)
function findFile(theme) {
  if (!isTheme(theme)) return null;
  try {
    const f = fs.readdirSync(DIR).find((n) => n.startsWith(theme + "."));
    return f ? path.join(DIR, f) : null;
  } catch (e) {
    return null;
  }
}

function has(theme) {
  return !!findFile(theme);
}

function removeBg(theme) {
  const f = findFile(theme);
  if (f) fs.rmSync(f, { force: true });
}

function saveBg(theme, buffer, mime) {
  if (!isTheme(theme)) throw new Error("noto'g'ri theme");
  const ext = extForMime(mime);
  if (!ext) throw new Error("faqat rasm (png/jpg/webp/gif/avif)");
  removeBg(theme); // eskisini o'chiramiz
  fs.writeFileSync(path.join(DIR, theme + ext), buffer);
  return true;
}

module.exports = { DIR, THEMES, isTheme, findFile, has, removeBg, saveBg };
