// backend/src/routes/claims.js
const express   = require("express");
const router    = express.Router();
const gl        = require("../services/genlayer");
const { query } = require("../db/pool");

// ── Helpers ───────────────────────────────────────────────

function extractDomain(url) {
  try { return new URL(url).hostname.replace("www.", ""); }
  catch { return ""; }
}

function detectSourceType(url) {
  const l = url.toLowerCase();
  if (/gov\.ng|\.gov|nihsa|nimet|ncdc|nigerian|federal|ministry/.test(l)) return "government";
  if (/faan|flightaware|flightradar|marinetraffic|portoflagos|nimasa/.test(l)) return "logistics";
  if (/copernicus|nasa|firms|earthdata|sentinel/.test(l)) return "satellite";
  if (/weather\.com|open-meteo|wunderground|noaa/.test(l)) return "weather";
  return "news";
}

const SOURCE_POINTS = { government: 35, satellite: 25, weather: 20, news: 20, logistics: 25 };

function rowToClaim(row) {
  return {
    claim_id:          row.claim_id,
    policy_id:         row.policy_id,
    claimant:          row.claimant_wallet,
    event_description: row.event_description,
    source_urls:       [],
    submitted_block:   Number(row.submitted_block ?? 0),
    status:            row.status,
    evidence_score:    Number(row.evidence_score ?? 0),
    score_breakdown:   {},
    llm_result: {
      event_confirmed:  row.status === "approved",
      confidence:       row.llm_confidence ?? "low",
      reasoning:        row.llm_reasoning ?? "",
      evidence_quality: Number(row.evidence_score ?? 0) >= 70 ? "sufficient" : "insufficient",
      red_flags:        [],
    },
    payout_triggered: row.status === "approved",
    appealed:         row.appealed ?? false,
    appeal_round:     Number(row.appeal_round ?? 0),
  };
}

function finalizeDemoPendingClaim(claim) {
  if (!gl.DEMO_MODE || claim.status !== "pending") return claim;

  const score = Number(claim.evidence_score || 0) ||
    Object.values(claim.score_breakdown || {}).reduce((sum, points) => sum + Number(points || 0), 0);
  const approved = score >= 70;

  return {
    ...claim,
    status: approved ? "approved" : "rejected",
    evidence_score: score,
    llm_result: {
      ...(claim.llm_result || {}),
      event_confirmed: approved,
      confidence: approved ? "high" : "low",
      reasoning: approved
        ? "Demo validators confirmed the submitted event using enough trusted evidence sources."
        : "Demo validators could not confirm the event with the submitted evidence score.",
      evidence_quality: approved ? "sufficient" : "insufficient",
      red_flags: claim.llm_result?.red_flags || [],
    },
    payout_triggered: approved,
  };
}

function groupClaimRows(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.claim_id)) {
      map.set(row.claim_id, { ...rowToClaim(row), source_urls: [], score_breakdown: {} });
    }
    const claim = map.get(row.claim_id);
    if (row.url) {
      if (!claim.source_urls.includes(row.url)) claim.source_urls.push(row.url);
      if (row.source_type && row.points_awarded) {
        claim.score_breakdown[row.source_type] = Number(row.points_awarded);
      }
    }
  }
  return Array.from(map.values()).map(finalizeDemoPendingClaim);
}

// ── GET /api/claims/wallet/:wallet ────────────────────────
router.get("/wallet/:wallet", async (req, res, next) => {
  try {
    const { wallet } = req.params;
    if (!wallet.startsWith("0x")) return res.status(400).json({ error: "Invalid wallet address" });

    const dbRes = await query(
      `SELECT c.*, ce.url, ce.source_type, ce.points_awarded
       FROM claims c
       LEFT JOIN claim_evidence ce ON c.claim_id = ce.claim_id
       WHERE c.claimant_wallet = $1
       ORDER BY c.created_at DESC`,
      [wallet.toLowerCase()]
    ).catch(() => ({ rows: [] }));

    if (dbRes.rows.length > 0) return res.json(groupClaimRows(dbRes.rows));

    const onChain = await gl.getWalletClaims(wallet);
    res.json(onChain ?? []);
  } catch (err) { next(err); }
});

// ── GET /api/claims/:claimId ──────────────────────────────
router.get("/:claimId", async (req, res, next) => {
  try {
    const { claimId } = req.params;
    const dbRes = await query(
      `SELECT c.*, ce.url, ce.source_type, ce.points_awarded
       FROM claims c
       LEFT JOIN claim_evidence ce ON c.claim_id = ce.claim_id
       WHERE c.claim_id = $1`,
      [claimId]
    ).catch(() => ({ rows: [] }));

    if (dbRes.rows.length > 0) {
      const [claim] = groupClaimRows(dbRes.rows);
      return res.json(claim);
    }
    const onChain = await gl.getClaim(claimId);
    if (!onChain) return res.status(404).json({ error: "Claim not found" });
    res.json(onChain);
  } catch (err) { next(err); }
});

// ── GET /api/claims/:claimId/status ──────────────────────
router.get("/:claimId/status", async (req, res, next) => {
  try {
    const { claimId } = req.params;
    const dbRes = await query(
      `SELECT c.*, ce.url, ce.source_type, ce.points_awarded
       FROM claims c
       LEFT JOIN claim_evidence ce ON c.claim_id = ce.claim_id
       WHERE c.claim_id = $1`,
      [claimId]
    ).catch(() => ({ rows: [] }));

    if (dbRes.rows.length > 0) {
      const [claim] = groupClaimRows(dbRes.rows);
      return res.json(claim);
    }
    const onChain = await gl.getClaim(claimId);
    if (!onChain) return res.status(404).json({ error: "Claim not found" });
    res.json(onChain);
  } catch (err) { next(err); }
});

// ── POST /api/claims/submit ───────────────────────────────
router.post("/submit", async (req, res, next) => {
  try {
    const { wallet, policyId, eventDescription, sourceUrls, sourceTypeHints } = req.body;
    if (!wallet || !policyId || !eventDescription || !sourceUrls?.length)
      return res.status(400).json({ error: "Missing required fields: wallet, policyId, eventDescription, sourceUrls" });
    if (sourceUrls.length < 2)
      return res.status(400).json({ error: "Minimum 2 source URLs required" });

    const result = await gl.submitClaim({ wallet, policyId, eventDescription, sourceUrls, sourceTypeHints: sourceTypeHints ?? {} });

    try {
      await query(
        `INSERT INTO claims (
           claim_id, policy_id, claimant_wallet, event_description, status,
           evidence_score, submitted_block, tx_hash, llm_reasoning, llm_confidence
         )
         VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9)
         ON CONFLICT (claim_id) DO NOTHING`,
        [
          result.claim_id,
          policyId,
          wallet.toLowerCase(),
          eventDescription,
          result.status ?? "pending",
          result.evidence_score ?? 0,
          result.tx_hash,
          result.llm_result?.reasoning ?? null,
          result.llm_result?.confidence ?? null,
        ]
      );
      for (const url of sourceUrls) {
        const stype = (sourceTypeHints ?? {})[url] ?? detectSourceType(url);
        await query(
          `INSERT INTO claim_evidence (claim_id, url, source_type, domain, points_awarded)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [result.claim_id, url, stype, extractDomain(url), SOURCE_POINTS[stype] ?? 10]
        ).catch(() => {});
      }
    } catch (dbErr) { console.warn("[DB] claim persist:", dbErr.message); }

    res.json(result);
  } catch (err) { next(err); }
});

// ── POST /api/claims/appeal ───────────────────────────────
router.post("/appeal", async (req, res, next) => {
  try {
    const { wallet, claimId, additionalSources, appealStatement } = req.body;
    if (!wallet || !claimId || !additionalSources?.length || !appealStatement)
      return res.status(400).json({ error: "Missing required fields" });

    const result = await gl.submitAppeal({ wallet, claimId, additionalSources, appealStatement });

    try {
      await query(
        `UPDATE claims SET status = 'appealed', appeal_round = appeal_round + 1, updated_at = NOW() WHERE claim_id = $1`,
        [claimId]
      );
    } catch (dbErr) { console.warn("[DB] appeal update:", dbErr.message); }

    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
