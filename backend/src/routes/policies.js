// backend/src/routes/policies.js
const express = require("express");
const router  = express.Router();
const gl      = require("../services/genlayer");
const { query } = require("../db/pool");

const TEMPLATE_META = {
  "flood-ng": { policyType: "flood", premiumBps: 200 },
  "crop-failure": { policyType: "crop", premiumBps: 300 },
  "flight-delay": { policyType: "flight", premiumBps: 150 },
  "port-strike": { policyType: "cargo", premiumBps: 250 },
};

function defaultExpiryTimestamp() {
  return Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
}

// GET /api/policies/:wallet
router.get("/:wallet", async (req, res, next) => {
  try {
    const { wallet } = req.params;
    if (!wallet.startsWith("0x")) return res.status(400).json({ error: "Invalid wallet address" });

    // Try DB first (faster), fall back to genlayer service on any error
    try {
      const dbRes = await query(
        `SELECT * FROM policies WHERE wallet_address = $1 ORDER BY created_at DESC`,
        [wallet.toLowerCase()]
      );
      if (dbRes.rows.length > 0) {
        return res.json(dbRes.rows.map(rowToPolicy));
      }
    } catch (_dbErr) {
      // DB unavailable (e.g. demo mode with no Postgres) — fall through
    }

    const onChain = await gl.getWalletPolicies(wallet);
    res.json(onChain ?? []);
  } catch (err) { next(err); }
});

// GET /api/policy/:policyId
router.get("/:policyId/detail", async (req, res, next) => {
  try {
    const { policyId } = req.params;
    const dbRes = await query(`SELECT * FROM policies WHERE policy_id = $1`, [policyId]);
    if (dbRes.rows.length > 0) return res.json(rowToPolicy(dbRes.rows[0]));
    const onChain = await gl.getPolicy(policyId);
    if (!onChain) return res.status(404).json({ error: "Policy not found" });
    res.json(onChain);
  } catch (err) { next(err); }
});

// POST /api/policies/purchase
router.post("/purchase", async (req, res, next) => {
  try {
    const { wallet, templateId, coverageArea, coverageAmount, expiryBlock, triggerOverrides } = req.body;

    if (!wallet || !templateId || !coverageArea || !coverageAmount) {
      return res.status(400).json({ error: "Missing required fields: wallet, templateId, coverageArea, coverageAmount" });
    }
    if (!wallet.startsWith("0x") || wallet.length < 10) {
      return res.status(400).json({ error: "Invalid wallet address format" });
    }
    if (typeof coverageAmount !== "number" || coverageAmount <= 0) {
      return res.status(400).json({ error: "coverageAmount must be a positive number" });
    }

    const result = await gl.purchasePolicy({
      wallet, templateId, coverageArea, coverageAmount, expiryBlock: expiryBlock ?? defaultExpiryTimestamp(), triggerOverrides: triggerOverrides ?? {},
    });

    // Persist to DB
    try {
      const meta = TEMPLATE_META[templateId] || { policyType: templateId.split("-")[0], premiumBps: 200 };
      await query(
        `INSERT INTO policies (policy_id, wallet_address, template_id, policy_type, coverage_area,
          trigger_condition, coverage_amount, premium_paid, expiry_block, purchase_block, status, tx_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (policy_id) DO NOTHING`,
        [
          result.policy_id, wallet.toLowerCase(), templateId,
          meta.policyType,
          coverageArea,
          triggerOverrides?.area ?? coverageArea,
          coverageAmount,
          Math.round((coverageAmount * meta.premiumBps) / 10000),
          expiryBlock ?? defaultExpiryTimestamp(), 0, "active", result.tx_hash,
        ]
      );
    } catch (dbErr) {
      console.warn("[DB] Could not persist policy:", dbErr.message);
    }

    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/policies/cancel
router.post("/cancel", async (req, res, next) => {
  try {
    const { wallet, policyId } = req.body;
    if (!wallet || !policyId) return res.status(400).json({ error: "Missing fields" });

    const result = await gl.cancelPolicy({ wallet, policyId });

    try {
      await query(`UPDATE policies SET status = 'cancelled', updated_at = NOW() WHERE policy_id = $1`, [policyId]);
    } catch (dbErr) {
      console.warn("[DB] Could not update policy status:", dbErr.message);
    }

    res.json(result);
  } catch (err) { next(err); }
});

// ── Helper ────────────────────────────────────────────────

function rowToPolicy(row) {
  return {
    policy_id:         row.policy_id,
    holder:            row.wallet_address,
    template_id:       row.template_id,
    policy_type:       row.policy_type,
    coverage_area:     row.coverage_area,
    trigger_condition: row.trigger_condition,
    coverage_amount:   Number(row.coverage_amount),
    premium_paid:      Number(row.premium_paid),
    expiry_block:      Number(row.expiry_block),
    purchase_block:    Number(row.purchase_block),
    active:            row.status === "active",
    paid_out:          row.status === "paid_out",
    cancelled:         row.status === "cancelled",
    claim_ids:         [],
  };
}

module.exports = router;
