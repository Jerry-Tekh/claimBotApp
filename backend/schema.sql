-- ============================================================
-- ClaimBot — PostgreSQL Schema
-- Run migrations in order: 001 → 002 → ...
-- ============================================================

-- ── 001_create_users ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address  TEXT UNIQUE NOT NULL,
    display_name    TEXT,
    email           TEXT UNIQUE,
    kyc_verified    BOOLEAN DEFAULT FALSE,
    kyc_verified_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_wallet ON users(wallet_address);

-- ── 002_create_policies ──────────────────────────────────

CREATE TABLE IF NOT EXISTS policies (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id        TEXT UNIQUE NOT NULL,      -- on-chain ID e.g. POL-ABCD1234
    user_id          UUID REFERENCES users(id),
    wallet_address   TEXT NOT NULL,
    template_id      TEXT NOT NULL,
    policy_type      TEXT NOT NULL,             -- flood | crop | flight | cargo
    coverage_area    TEXT NOT NULL,
    trigger_condition TEXT NOT NULL,
    coverage_amount  BIGINT NOT NULL,           -- in GEN smallest unit
    premium_paid     BIGINT NOT NULL,
    expiry_block     BIGINT NOT NULL,
    purchase_block   BIGINT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'active',  -- active | paid_out | cancelled | expired
    tx_hash          TEXT,                       -- purchase transaction hash
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_policies_wallet   ON policies(wallet_address);
CREATE INDEX idx_policies_status   ON policies(status);
CREATE INDEX idx_policies_type     ON policies(policy_type);
CREATE INDEX idx_policies_area     ON policies(coverage_area);

-- ── 003_create_claims ────────────────────────────────────

CREATE TABLE IF NOT EXISTS claims (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id          TEXT UNIQUE NOT NULL,      -- on-chain ID e.g. CLM-ABCD1234
    policy_id         TEXT NOT NULL REFERENCES policies(policy_id),
    claimant_wallet   TEXT NOT NULL,
    event_description TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | appealed
    evidence_score    INTEGER NOT NULL DEFAULT 0,       -- 0-100
    llm_reasoning     TEXT,
    llm_confidence    TEXT,                             -- high | medium | low
    payout_amount     BIGINT DEFAULT 0,
    appeal_round      INTEGER DEFAULT 0,
    submitted_block   BIGINT,
    processed_block   BIGINT,
    tx_hash           TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_claims_policy     ON claims(policy_id);
CREATE INDEX idx_claims_claimant   ON claims(claimant_wallet);
CREATE INDEX idx_claims_status     ON claims(status);
CREATE INDEX idx_claims_created    ON claims(created_at DESC);

-- ── 004_create_claim_evidence ────────────────────────────

CREATE TABLE IF NOT EXISTS claim_evidence (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id     TEXT NOT NULL REFERENCES claims(claim_id),
    url          TEXT NOT NULL,
    UNIQUE(claim_id, url),
    source_type  TEXT NOT NULL,       -- news | government | satellite | weather | logistics
    domain       TEXT NOT NULL,
    is_trusted   BOOLEAN DEFAULT TRUE,
    points_awarded INTEGER DEFAULT 0,
    fetch_status TEXT DEFAULT 'pending',   -- pending | fetched | error
    content_hash TEXT,                -- SHA-256 of fetched content (tamper evidence)
    fetched_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_evidence_claim ON claim_evidence(claim_id);

-- ── 005_create_validator_votes ───────────────────────────

CREATE TABLE IF NOT EXISTS validator_votes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id        TEXT NOT NULL REFERENCES claims(claim_id),
    validator_id    TEXT NOT NULL,          -- GenLayer validator address
    appeal_round    INTEGER DEFAULT 0,
    vote_confirmed  BOOLEAN NOT NULL,
    confidence      TEXT NOT NULL,          -- high | medium | low
    reasoning       TEXT,
    voted_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_votes_claim     ON validator_votes(claim_id);
CREATE INDEX idx_votes_validator ON validator_votes(validator_id);

-- ── 006_create_payouts ───────────────────────────────────

CREATE TABLE IF NOT EXISTS payouts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_id     TEXT UNIQUE NOT NULL,     -- e.g. PAY-CLM-ABCD1234
    claim_id      TEXT NOT NULL REFERENCES claims(claim_id),
    policy_id     TEXT NOT NULL REFERENCES policies(policy_id),
    holder_wallet TEXT NOT NULL,
    amount        BIGINT NOT NULL,
    tx_hash       TEXT,
    block_number  BIGINT,
    confirmed_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payouts_claim  ON payouts(claim_id);
CREATE INDEX idx_payouts_holder ON payouts(holder_wallet);

-- ── 007_create_treasury_transactions ─────────────────────

CREATE TABLE IF NOT EXISTS treasury_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tx_type         TEXT NOT NULL,  -- premium_in | payout_out | refund | dao_fee
    reference_id    TEXT NOT NULL,  -- policy_id or claim_id
    amount          BIGINT NOT NULL,
    pool_balance    BIGINT NOT NULL,    -- snapshot after tx
    exposure_total  BIGINT NOT NULL,
    reserve_ratio   INTEGER NOT NULL,   -- in BPS
    block_number    BIGINT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_treasury_type    ON treasury_transactions(tx_type);
CREATE INDEX idx_treasury_created ON treasury_transactions(created_at DESC);

-- ── 008_create_governance_proposals ──────────────────────

CREATE TABLE IF NOT EXISTS governance_proposals (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id      TEXT UNIQUE NOT NULL,
    proposer_wallet  TEXT NOT NULL,
    proposal_type    TEXT NOT NULL,
    description      TEXT NOT NULL,
    payload          JSONB NOT NULL DEFAULT '{}',
    votes_for        INTEGER DEFAULT 0,
    votes_against    INTEGER DEFAULT 0,
    status           TEXT DEFAULT 'active',  -- active | passed | failed | executed
    submitted_block  BIGINT,
    executable_after BIGINT,
    executed_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── 009_create_fraud_flags ───────────────────────────────

CREATE TABLE IF NOT EXISTS fraud_flags (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id     TEXT REFERENCES claims(claim_id),
    wallet       TEXT NOT NULL,
    flag_type    TEXT NOT NULL,   -- duplicate_event | fake_url | prompt_injection | velocity
    severity     TEXT NOT NULL,   -- low | medium | high | critical
    details      JSONB DEFAULT '{}',
    auto_blocked BOOLEAN DEFAULT FALSE,
    reviewed     BOOLEAN DEFAULT FALSE,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fraud_wallet   ON fraud_flags(wallet);
CREATE INDEX idx_fraud_severity ON fraud_flags(severity);

-- ── 010_create_disaster_monitors ─────────────────────────

CREATE TABLE IF NOT EXISTS disaster_monitors (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_type TEXT NOT NULL,   -- flood | hurricane | earthquake | wildfire | drought
    region       TEXT NOT NULL,
    source_url   TEXT NOT NULL,
    last_checked TIMESTAMPTZ,
    alert_active BOOLEAN DEFAULT FALSE,
    alert_detail TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Views ─────────────────────────────────────────────────

CREATE OR REPLACE VIEW claim_summary AS
SELECT
    c.claim_id,
    c.policy_id,
    c.claimant_wallet,
    c.status,
    c.evidence_score,
    c.llm_confidence,
    c.payout_amount,
    c.appeal_round,
    c.created_at,
    p.policy_type,
    p.coverage_area,
    p.coverage_amount,
    p.template_id,
    COUNT(ce.id) AS evidence_sources,
    COUNT(vv.id) AS validator_votes
FROM claims c
JOIN policies p ON c.policy_id = p.policy_id
LEFT JOIN claim_evidence ce ON c.claim_id = ce.claim_id
LEFT JOIN validator_votes vv ON c.claim_id = vv.claim_id
GROUP BY c.claim_id, c.policy_id, c.claimant_wallet, c.status,
         c.evidence_score, c.llm_confidence, c.payout_amount,
         c.appeal_round, c.created_at, p.policy_type,
         p.coverage_area, p.coverage_amount, p.template_id;

CREATE OR REPLACE VIEW treasury_dashboard AS
SELECT
    SUM(CASE WHEN tx_type = 'premium_in'  THEN amount ELSE 0 END) AS total_premiums,
    SUM(CASE WHEN tx_type = 'payout_out'  THEN amount ELSE 0 END) AS total_payouts,
    SUM(CASE WHEN tx_type = 'refund'      THEN amount ELSE 0 END) AS total_refunds,
    SUM(CASE WHEN tx_type = 'dao_fee'     THEN amount ELSE 0 END) AS total_dao_fees,
    COUNT(CASE WHEN tx_type = 'payout_out' THEN 1 END)             AS payout_count,
    MAX(pool_balance)                                               AS peak_pool,
    MIN(reserve_ratio)                                              AS min_reserve_ratio,
    (MAX(created_at))                                               AS last_activity
FROM treasury_transactions;
