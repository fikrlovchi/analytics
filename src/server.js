const path = require("path");
const express = require("express");
const session = require("express-session");

const config = require("./config");
require("./db"); // migratsiyalarni qo'llaydi

const { requireAuth } = require("./middleware/auth");
const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const syncRoutes = require("./routes/sync");
const apiRoutes = require("./routes/api");
const { runSync, getMeta } = require("./sheets/sync");

const app = express();
app.set("trust proxy", 1);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.COOKIE_SECURE,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.get("/health", (req, res) => res.json({ ok: true, lastSync: getMeta("last_sync") }));

app.use(authRoutes);
app.use(requireAuth, syncRoutes);
app.use(requireAuth, apiRoutes);
app.use(requireAuth, dashboardRoutes);

// ---- Davriy sinxronizatsiya ----
function scheduleSync() {
  const ms = Math.max(5, config.SYNC_INTERVAL_MIN) * 60 * 1000;
  setInterval(() => {
    runSync().then((r) => {
      if (!r.ok && r.error) console.error("[sync] xato:", r.error);
      else if (r.ok) console.log(`[sync] ok: ${r.operations} op, ${r.kassaDays} kassa kun`);
    });
  }, ms);
}

app.listen(config.PORT, "127.0.0.1", () => {
  console.log(`buyodashboard ${config.PORT}-portda ishga tushdi`);
  // Boshlang'ich sinxronizatsiya (fon)
  runSync().then((r) => {
    if (r.ok) console.log(`[sync] boshlang'ich: ${r.operations} op, ${r.kassaDays} kassa kun`);
    else if (r.error) console.error("[sync] boshlang'ich xato:", r.error);
  });
  scheduleSync();
});
