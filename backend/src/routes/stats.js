// backend/src/routes/stats.js
const express = require("express");
const router  = express.Router();
const gl      = require("../services/genlayer");
const { query } = require("../db/pool");

// GET /api/stats
router.get("/", async (req, res, next) => {
  try {
    // Try DB aggregate — only use if DB is actually reachable
    try {
      const [polRes, clmRes] = await Promise.all([
        query(`SELECT COUNT(*) AS total,
                      COUNT(*) FILTER (WHERE status='active') AS active,
                      SUM(premium_paid)    AS total_premium,
                      SUM(coverage_amount) AS total_coverage
               FROM policies`),
        query(`SELECT COUNT(*) AS total, SUM(payout_amount) AS total_payout
               FROM claims WHERE status = 'approved'`),
      ]);

      const p = polRes.rows[0];
      const c = clmRes.rows[0];

      // Only return DB stats if we have real data
      if (Number(p.total) > 0) {
        return res.json({
          total_policies:  Number(p.total),
          active_policies: Number(p.active ?? 0),
          total_premium:   Number(p.total_premium  ?? 0),
          total_coverage:  Number(p.total_coverage ?? 0),
          total_payout:    Number(c.total_payout   ?? 0),
          payout_count:    Number(c.total ?? 0),
          pool_balance:    0,
          is_solvent:      true,
          loss_ratio:      0,
        });
      }
    } catch {
      // DB unavailable — fall through to genlayer service (demo mock)
    }

    // Demo mode or empty DB → return mock stats from genlayer service
    const stats = await gl.getGlobalStats();
    res.json(stats);
  } catch (err) { next(err); }
});

module.exports = router;
