// ============================================================
// ClaimBot — Shared TypeScript Types
// ============================================================

export type PolicyStatus = "active" | "paid_out" | "cancelled" | "expired";
export type ClaimStatus  = "pending" | "approved" | "rejected" | "appealed";
export type Confidence   = "high" | "medium" | "low";
export type PolicyType   = "flood" | "crop" | "flight" | "cargo";

export interface Policy {
  policy_id:         string;
  holder:            string;
  template_id:       string;
  policy_type:       PolicyType;
  coverage_area:     string;
  trigger_condition: string;
  coverage_amount:   number;
  premium_paid:      number;
  expiry_block:      number;
  purchase_block:    number;
  active:            boolean;
  paid_out:          boolean;
  cancelled:         boolean;
  claim_ids:         string[];
}

export interface LLMResult {
  event_confirmed:  boolean;
  confidence:       Confidence;
  reasoning:        string;
  evidence_quality: string;
  red_flags:        string[];
}

export interface Claim {
  claim_id:          string;
  policy_id:         string;
  claimant:          string;
  event_description: string;
  source_urls:       string[];
  submitted_block:   number;
  status:            ClaimStatus;
  evidence_score:    number;
  score_breakdown:   Record<string, number>;
  llm_result:        LLMResult;
  payout_triggered:  boolean;
  appealed:          boolean;
  appeal_round:      number;
}

export interface PolicyTemplate {
  id:                     string;
  name:                   string;
  policy_type:            PolicyType;
  description:            string;
  trigger_template:       string;
  required_source_types:  string[];
  base_premium_bps:       number;
  max_coverage:           number;
  active:                 boolean;
}

export interface TreasuryState {
  pool_balance:          number;
  emergency_reserve:     number;
  liquid_available:      number;
  total_exposure:        number;
  dao_treasury:          number;
  required_reserve:      number;
  current_reserve_ratio: number;
  target_reserve_ratio:  number;
  is_solvent:            boolean;
  reinsurance_alert:     boolean;
  loss_ratio:            number;
  payout_count:          number;
}

export interface GlobalStats {
  total_policies:   number;
  total_premium:    number;
  total_payout:     number;
  active_policies:  number;
  pool_balance:     number;
  is_solvent:       boolean;
  loss_ratio:       number;
  payout_count:     number;
}

export interface Notification {
  id:      string;
  type:    "success" | "error" | "info" | "warning";
  message: string;
}

export interface AppealResult {
  claim_id:     string;
  appeal_round: number;
  approved:     boolean;
  score:        number;
  reasoning:    string;
}
