// ============================================================
// ClaimBot — GenLayer On-Chain Service (Backend)
// backend/src/services/genlayer.js
// ============================================================
// DEMO_MODE=true  → returns realistic mock data, no chain needed
// DEMO_MODE=false → calls real GenLayer RPC endpoint
// ============================================================

require("dotenv").config();
const axios  = require("axios");
const crypto = require("crypto");

const ENDPOINT      = process.env.GENLAYER_ENDPOINT || "https://testnet.genlayer.com";
const CONTRACT_ADDR = process.env.CONTRACT_ADDRESS  || "0x0000000000000000000000000000000000000000";
const DEMO_MODE     = process.env.DEMO_MODE !== "false"; // default ON

const TEMPLATE_PREMIUM_BPS = {
  "flood-ng": 200,
  "crop-failure": 300,
  "flight-delay": 150,
  "port-strike": 250,
};

// ── Mock templates ────────────────────────────────────────

const MOCK_TEMPLATES = [
  {
    id: "flood-ng",
    name: "Nigeria Flood Insurance",
    policy_type: "flood",
    description: "Pays out when flooding displaces residents in the covered Nigerian state.",
    trigger_template: "Flooding that displaces more than {threshold} residents in {area}",
    required_source_types: ["news", "government", "weather"],
    base_premium_bps: 200,
    max_coverage: 5_000_000_000_000,
    active: true,
  },
  {
    id: "crop-failure",
    name: "Crop Failure Insurance",
    policy_type: "crop",
    description: "Pays out when satellite NDVI confirms crop failure in your area.",
    trigger_template: "NDVI index below {ndvi_threshold} in {area} for {consecutive_weeks} consecutive weeks",
    required_source_types: ["satellite", "weather", "government"],
    base_premium_bps: 300,
    max_coverage: 2_000_000_000_000,
    active: true,
  },
  {
    id: "flight-delay",
    name: "Flight Delay Insurance",
    policy_type: "flight",
    description: "Pays out when a specific flight is delayed more than N hours.",
    trigger_template: "Flight {flight_number} delayed more than {delay_hours} hours on {date}",
    required_source_types: ["logistics", "news"],
    base_premium_bps: 150,
    max_coverage: 500_000_000_000,
    active: true,
  },
  {
    id: "port-strike",
    name: "Cargo / Port Strike Insurance",
    policy_type: "cargo",
    description: "Pays out when an official port strike disrupts cargo operations.",
    trigger_template: "Official port strike at {port_name} lasting more than {duration_hours} hours",
    required_source_types: ["logistics", "news", "government"],
    base_premium_bps: 250,
    max_coverage: 10_000_000_000_000,
    active: true,
  },
];

// ── Mock wallet data (demo) ───────────────────────────────

function mockPoliciesForWallet(wallet) {
  const seed  = wallet.toLowerCase().slice(2, 8);
  const n     = (parseInt(seed, 16) % 3) + 1; // 1-3 policies
  const types = ["flood", "crop", "flight", "cargo"];
  const areas = [
    "Lagos State, Nigeria",
    "Kano State, Nigeria",
    "Rivers State, Nigeria",
    "Abuja FCT, Nigeria",
  ];
  const policies = [];
  for (let i = 0; i < n; i++) {
    const typeIdx    = (parseInt(seed, 16) + i) % 4;
    const areaIdx    = (parseInt(seed, 16) + i + 1) % 4;
    const coverage   = [500_000_000_000, 1_000_000_000_000, 2_000_000_000_000][i % 3];
    const bps        = [200, 300, 150, 250][typeIdx];
    const premium    = Math.round((coverage * bps) / 10_000);
    const ptype      = types[typeIdx];
    const pid        = "POL-" + crypto.createHash("sha256")
      .update(`${wallet}:${ptype}:${i}`).digest("hex").slice(0, 16).toUpperCase();

    policies.push({
      policy_id:         pid,
      holder:            wallet,
      template_id:       ["flood-ng", "crop-failure", "flight-delay", "port-strike"][typeIdx],
      policy_type:       ptype,
      coverage_area:     areas[areaIdx],
      trigger_condition: `Demo trigger condition for ${ptype} in ${areas[areaIdx]}`,
      coverage_amount:   coverage,
      premium_paid:      premium,
      expiry_block:      999_999,
      purchase_block:    1000,
      active:            i < n - 1 ? true : true,
      paid_out:          false,
      cancelled:         false,
      claim_ids:         i === 0 ? [
        "CLM-" + crypto.createHash("sha256").update(`${wallet}:claim:0`).digest("hex").slice(0,16).toUpperCase()
      ] : [],
    });
  }
  return policies;
}

function mockClaimsForWallet(wallet, policies) {
  if (!policies.length) return [];
  const claims = [];
  const policy = policies[0];
  const claimId = policy.claim_ids[0];
  if (!claimId) return [];

  claims.push({
    claim_id:          claimId,
    policy_id:         policy.policy_id,
    claimant:          wallet,
    event_description: `Demo: ${policy.policy_type} event occurred in ${policy.coverage_area} on June 12 2026`,
    source_urls: [
      "https://nihsa.gov.ng/flood-alert-demo",
      "https://channelstv.com/flooding-demo",
      "https://open-meteo.com/forecast/lagos",
    ],
    submitted_block: 1050,
    status: "approved",
    evidence_score: 75,
    score_breakdown: { government: 35, news: 20, weather: 20 },
    llm_result: {
      event_confirmed:  true,
      confidence:       "high",
      reasoning:        "NIHSA government bulletin confirmed the event with high credibility. Multiple independent sources corroborate.",
      evidence_quality: "sufficient",
      red_flags:        [],
    },
    payout_triggered: true,
    appealed:         false,
    appeal_round:     0,
  });
  return claims;
}

const MOCK_TREASURY = {
  pool_balance:          450_000_000_000_000,
  emergency_reserve:     112_500_000_000_000,
  liquid_available:      337_500_000_000_000,
  total_exposure:        2_800_000_000_000_000,
  dao_treasury:          22_500_000_000_000,
  required_reserve:      560_000_000_000_000,
  current_reserve_ratio: 1607,
  target_reserve_ratio:  2000,
  is_solvent:            false,
  reinsurance_alert:     true,
  loss_ratio:            3200,
  payout_count:          47,
};

const MOCK_STATS = {
  total_policies:  1240,
  active_policies: 823,
  total_premium:   249_000_000_000_000,
  total_coverage:  2_800_000_000_000_000,
  total_payout:    79_680_000_000_000,
  payout_count:    47,
  pool_balance:    450_000_000_000_000,
  is_solvent:      false,
  loss_ratio:      3200,
};

// ── RPC helper ────────────────────────────────────────────

async function rpcCall(method, params) {
  const res = await axios.post(
    ENDPOINT,
    { jsonrpc: "2.0", id: Date.now(), method, params },
    { timeout: 30_000 }
  );
  if (res.data.error) throw new Error(res.data.error.message);
  return res.data.result;
}

function parseContractJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed);
  } catch {
    return fallback;
  }
}

function toHexWei(value) {
  const amount = BigInt(Math.max(0, Math.trunc(Number(value) || 0)));
  return "0x" + amount.toString(16);
}

function buildTriggerOverride(templateId, coverageArea, triggerOverrides = {}) {
  if (typeof triggerOverrides === "string") return triggerOverrides;

  const area = triggerOverrides.area || coverageArea;
  switch (templateId) {
    case "flood-ng":
      return `Flooding that displaces more than ${triggerOverrides.threshold || "5000"} residents in ${area}`;
    case "crop-failure":
      return `NDVI index below ${triggerOverrides.ndvi_threshold || "0.3"} in ${area} for ${triggerOverrides.consecutive_weeks || "3"} consecutive weeks`;
    case "flight-delay":
      return `Flight ${triggerOverrides.flight_number || "specified flight"} delayed more than ${triggerOverrides.delay_hours || "3"} hours on ${triggerOverrides.date || "the covered date"}`;
    case "port-strike":
      return `Official port strike at ${triggerOverrides.port_name || area} lasting more than ${triggerOverrides.duration_hours || "24"} hours`;
    default:
      return triggerOverrides.trigger || `Covered event in ${area}`;
  }
}

async function readContract(functionName, args = []) {
  return rpcCall("gen_call", {
    to:   CONTRACT_ADDR,
    data: { function: functionName, args },
  });
}

async function writeContract(functionName, args = [], { from, value = 0 } = {}) {
  return rpcCall("gen_sendTransaction", {
    to:   CONTRACT_ADDR,
    data: { function: functionName, args },
    from: from || process.env.ADMIN_WALLET || "0x0",
    value: toHexWei(value),
  });
}

// ── Public API ────────────────────────────────────────────

async function getTemplates() {
  if (DEMO_MODE) return MOCK_TEMPLATES;
  return parseContractJson(await readContract("list_templates"), []);
}

async function getWalletPolicies(wallet) {
  if (DEMO_MODE) return mockPoliciesForWallet(wallet);
  return parseContractJson(await readContract("get_wallet_policies", [wallet]), []);
}

async function getPolicy(policyId) {
  if (DEMO_MODE) return null;
  return parseContractJson(await readContract("get_policy", [policyId]), null);
}

async function getTreasury() {
  if (DEMO_MODE) return MOCK_TREASURY;
  return parseContractJson(await readContract("get_treasury"), null);
}

async function getGlobalStats() {
  if (DEMO_MODE) return MOCK_STATS;
  return parseContractJson(await readContract("get_global_stats"), null);
}

async function getWalletClaims(wallet) {
  if (DEMO_MODE) {
    const policies = mockPoliciesForWallet(wallet);
    return mockClaimsForWallet(wallet, policies);
  }
  return parseContractJson(await readContract("get_wallet_claims", [wallet]), []);
}

async function getClaim(claimId) {
  if (DEMO_MODE) return null;
  return parseContractJson(await readContract("get_claim", [claimId]), null);
}

async function purchasePolicy({ wallet, templateId, coverageArea, coverageAmount, expiryBlock, triggerOverrides }) {
  const raw      = `${wallet}:${templateId}:${coverageArea}:${Date.now()}`;
  const policyId = "POL-" + crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16).toUpperCase();

  if (DEMO_MODE) {
    return { tx_hash: "0x" + crypto.randomBytes(32).toString("hex"), policy_id: policyId };
  }
  const triggerOverride = buildTriggerOverride(templateId, coverageArea, triggerOverrides);
  const premium = Math.round((coverageAmount * (TEMPLATE_PREMIUM_BPS[templateId] || 200)) / 10_000);
  const txHash = await writeContract("purchase_policy", [
    policyId,
    templateId,
    coverageArea,
    coverageAmount,
    expiryBlock ?? 999_999,
    triggerOverride,
  ], { from: wallet, value: premium });
  return { tx_hash: txHash, policy_id: policyId };
}

async function cancelPolicy({ wallet, policyId }) {
  if (DEMO_MODE) {
    return { tx_hash: "0x" + crypto.randomBytes(32).toString("hex") };
  }
  const txHash = await writeContract("cancel_policy", [policyId], { from: wallet });
  return { tx_hash: txHash };
}

async function submitClaim({ wallet, policyId, eventDescription, sourceUrls, sourceTypeHints }) {
  const raw     = `${policyId}:${wallet}:${Date.now()}`;
  const claimId = "CLM-" + crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16).toUpperCase();

  if (DEMO_MODE) {
    return {
      tx_hash:  "0x" + crypto.randomBytes(32).toString("hex"),
      claim_id: claimId,
      status:   "pending",
    };
  }
  const txHash = await writeContract("file_claim", [
    claimId,
    policyId,
    eventDescription,
    JSON.stringify(sourceUrls),
  ], { from: wallet });
  return { tx_hash: txHash, claim_id: claimId, status: "pending" };
}

async function submitAppeal({ wallet, claimId, additionalSources, appealStatement }) {
  if (DEMO_MODE) {
    return { claim_id: claimId, appeal_round: 1, approved: false, score: 0, reasoning: "Appeal submitted to validators" };
  }
  await writeContract("appeal_claim", [claimId, JSON.stringify(additionalSources), appealStatement], { from: wallet });
  return { claim_id: claimId, appeal_round: 1, approved: false, score: 0, reasoning: "Processing" };
}

module.exports = {
  getTemplates,
  getWalletPolicies,
  getPolicy,
  getTreasury,
  getGlobalStats,
  getWalletClaims,
  getClaim,
  purchasePolicy,
  cancelPolicy,
  submitClaim,
  submitAppeal,
  DEMO_MODE,
};
