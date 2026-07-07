// backend/src/routes/treasury.js
const express = require("express");
const router  = express.Router();
const gl      = require("../services/genlayer");
const { query } = require("../db/pool");

// GET /api/treasury
router.get("/", async (req, res, next) => {
  try {
    // Try DB dashboard view first
    try {
      const dbRes = await query(`SELECT * FROM treasury_dashboard`).catch(() => ({ rows: [] }));
      if (dbRes.rows.length > 0 && dbRes.rows[0].total_premiums !== null) {
        const r = dbRes.rows[0];
        return res.json({
          pool_balance:          Number(r.total_premiums ?? 0) - Number(r.total_payouts ?? 0),
          emergency_reserve:     Math.round(Number(r.total_premiums ?? 0) * 0.25),
          liquid_available:      Math.round(Number(r.total_premiums ?? 0) * 0.70) - Number(r.total_payouts ?? 0),
          total_exposure:        0,
          dao_treasury:          Number(r.total_dao_fees ?? 0),
          required_reserve:      0,
          current_reserve_ratio: 2000,
          target_reserve_ratio:  2000,
          is_solvent:            true,
          reinsurance_alert:     false,
          loss_ratio:            Number(r.total_premiums ?? 1) > 0
            ? Math.round((Number(r.total_payouts ?? 0) / Number(r.total_premiums ?? 1)) * 10000)
            : 0,
          payout_count: Number(r.payout_count ?? 0),
        });
      }
    } catch { /* fall through to chain */ }

    const treasury = await gl.getTreasury();
    res.json(treasury);
  } catch (err) { next(err); }
});

module.exports = router;
