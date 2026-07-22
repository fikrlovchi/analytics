const express = require("express");
const { runSync } = require("../sheets/sync");

const router = express.Router();

// Qo'lda sinxronizatsiya
router.post("/sync", async (req, res) => {
  const result = await runSync();
  if (req.headers["accept"] && req.headers["accept"].includes("application/json")) {
    return res.json(result);
  }
  res.redirect("/?synced=" + (result.ok ? "1" : "0"));
});

module.exports = router;
