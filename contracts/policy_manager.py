# ============================================================
# ClaimBot — PolicyManager Module
# GenLayer Intelligent Contract
# ============================================================
# Responsibilities:
#   - Policy template creation (via DAO governance)
#   - Policy purchase by policyholders
#   - Policy cancellation (within cooling-off window)
#   - Policy expiry enforcement
#   - Anti-fraud: duplicate policy detection per wallet
# ============================================================

from genlayer import *
from genlayer.std import advanced_json
import json
import hashlib

# ──────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────
COOLING_OFF_BLOCKS      = 50        # ~10 minutes on GenLayer testnet
MIN_COVERAGE_AMOUNT     = 100_000   # 0.1 GEN in smallest unit
MAX_COVERAGE_AMOUNT     = 10_000_000_000  # 10,000 GEN
MAX_POLICIES_PER_WALLET = 5         # Sybil resistance
MAX_SOURCES_REQUIRED    = 5

POLICY_TYPES = {
    "flood":    {"min_sources": 3, "required_source_types": ["news", "government", "weather"]},
    "crop":     {"min_sources": 3, "required_source_types": ["satellite", "weather", "government"]},
    "flight":   {"min_sources": 2, "required_source_types": ["logistics", "news"]},
    "cargo":    {"min_sources": 3, "required_source_types": ["logistics", "news", "government"]},
}


@gl.contract
class PolicyManager:
    """
    Manages the full lifecycle of parametric insurance policies.

    Storage layout:
        policies          : policy_id -> PolicyRecord dict
        wallet_policy_ids : wallet_address -> list[policy_id]
        policy_templates  : template_id -> PolicyTemplate dict
        global_stats      : singleton stats dict
    """

    policies:           TreeMap[str, dict]
    wallet_policy_ids:  TreeMap[str, list]
    policy_templates:   TreeMap[str, dict]
    global_stats:       TreeMap[str, dict]

    def __init__(self):
        self.policies          = TreeMap()
        self.wallet_policy_ids = TreeMap()
        self.policy_templates  = TreeMap()
        self.global_stats      = TreeMap()

        # Seed genesis stats
        self.global_stats["stats"] = {
            "total_policies":   0,
            "total_premium":    0,
            "total_payout":     0,
            "active_policies":  0,
        }

        # Seed built-in policy templates
        self._seed_templates()

    # ──────────────────────────────────────────────────────
    # Internal helpers
    # ──────────────────────────────────────────────────────

    def _seed_templates(self) -> None:
        """Create default parametric insurance templates."""
        templates = [
            {
                "id": "flood-ng",
                "name": "Nigeria Flood Insurance",
                "policy_type": "flood",
                "description": "Pays out when flooding displaces residents in the covered Nigerian state.",
                "trigger_template": "Flooding that displaces more than {threshold} residents in {area}",
                "required_source_types": ["news", "government", "weather"],
                "base_premium_bps": 200,   # 2% of coverage
                "max_coverage": 5_000_000_000,
                "active": True,
            },
            {
                "id": "crop-failure",
                "name": "Crop Failure Insurance",
                "policy_type": "crop",
                "description": "Pays out when satellite NDVI data confirms crop failure in covered area.",
                "trigger_template": "NDVI index below {ndvi_threshold} in {area} for {consecutive_weeks} consecutive weeks",
                "required_source_types": ["satellite", "weather", "government"],
                "base_premium_bps": 300,
                "max_coverage": 2_000_000_000,
                "active": True,
            },
            {
                "id": "flight-delay",
                "name": "Flight Delay Insurance",
                "policy_type": "flight",
                "description": "Pays out when a specific flight is delayed more than N hours.",
                "trigger_template": "Flight {flight_number} delayed more than {delay_hours} hours on {date}",
                "required_source_types": ["logistics", "news"],
                "base_premium_bps": 150,
                "max_coverage": 500_000_000,
                "active": True,
            },
            {
                "id": "port-strike",
                "name": "Cargo / Port Strike Insurance",
                "policy_type": "cargo",
                "description": "Pays out when an official port strike disrupts cargo operations.",
                "trigger_template": "Official port strike at {port_name} lasting more than {duration_hours} hours",
                "required_source_types": ["logistics", "news", "government"],
                "base_premium_bps": 250,
                "max_coverage": 10_000_000_000,
                "active": True,
            },
        ]
        for t in templates:
            self.policy_templates[t["id"]] = t

    def _generate_policy_id(self, caller: str, template_id: str, coverage_area: str) -> str:
        """Deterministic ID — prevents duplicate claims on the same event."""
        raw = f"{caller}:{template_id}:{coverage_area}:{gl.message.block_number}"
        return "POL-" + hashlib.sha256(raw.encode()).hexdigest()[:16].upper()

    def _get_wallet_policies(self, wallet: str) -> list:
        try:
            return self.wallet_policy_ids[wallet]
        except KeyError:
            return []

    def _check_duplicate(self, caller: str, template_id: str, coverage_area: str) -> bool:
        """Return True if wallet already has an active policy for same (template, area)."""
        for pid in self._get_wallet_policies(caller):
            try:
                pol = self.policies[pid]
                if (
                    pol["template_id"] == template_id
                    and pol["coverage_area"] == coverage_area
                    and pol["active"]
                    and not pol["paid_out"]
                ):
                    return True
            except KeyError:
                continue
        return False

    # ──────────────────────────────────────────────────────
    # Public write — purchase policy
    # ──────────────────────────────────────────────────────

    @gl.public.write
    def purchase_policy(
        self,
        template_id:       str,
        coverage_area:     str,
        coverage_amount:   int,
        expiry_block:      int,
        trigger_overrides: dict,   # e.g. {"threshold": "5000", "area": "Lagos Island"}
    ) -> str:
        """
        Purchase a parametric insurance policy.

        Args:
            template_id:       Which policy template to use.
            coverage_area:     Geographic scope, e.g. "Lagos State, Nigeria"
            coverage_amount:   Payout in GEN (smallest unit). Premium = coverage * bps / 10000.
            expiry_block:      Block number after which the policy cannot be claimed.
            trigger_overrides: Dict of template placeholder values.

        Returns:
            policy_id (str)

        Reverts:
            - Unknown template
            - Coverage out of allowed range
            - Too many policies for this wallet (Sybil guard)
            - Duplicate active policy for same (template, area)
        """
        caller = gl.message.sender_address

        # ── Validate template ──────────────────────────────
        assert template_id in self.policy_templates, f"Unknown template: {template_id}"
        template = self.policy_templates[template_id]
        assert template["active"], "This policy template is currently suspended"

        # ── Coverage bounds ────────────────────────────────
        assert MIN_COVERAGE_AMOUNT <= coverage_amount <= template["max_coverage"], (
            f"Coverage must be between {MIN_COVERAGE_AMOUNT} and {template['max_coverage']}"
        )

        # ── Sybil resistance ───────────────────────────────
        wallet_pols = self._get_wallet_policies(caller)
        assert len(wallet_pols) < MAX_POLICIES_PER_WALLET, (
            f"Maximum {MAX_POLICIES_PER_WALLET} active policies per wallet"
        )

        # ── Duplicate check ────────────────────────────────
        assert not self._check_duplicate(caller, template_id, coverage_area), (
            "An active policy for this template and area already exists on this wallet"
        )

        # ── Expiry sanity ──────────────────────────────────
        current_block = gl.message.block_number
        assert expiry_block > current_block + 10, "Expiry block too soon"

        # ── Premium calculation ────────────────────────────
        premium = (coverage_amount * template["base_premium_bps"]) // 10_000
        assert gl.message.value >= premium, (
            f"Insufficient premium. Required: {premium}, sent: {gl.message.value}"
        )

        # ── Build trigger condition string ─────────────────
        trigger = template["trigger_template"]
        for k, v in trigger_overrides.items():
            trigger = trigger.replace("{" + k + "}", str(v))

        # ── Write policy ───────────────────────────────────
        policy_id = self._generate_policy_id(caller, template_id, coverage_area)
        self.policies[policy_id] = {
            "policy_id":            policy_id,
            "holder":               caller,
            "template_id":          template_id,
            "policy_type":          template["policy_type"],
            "coverage_area":        coverage_area,
            "trigger_condition":    trigger,
            "coverage_amount":      coverage_amount,
            "premium_paid":         premium,
            "expiry_block":         expiry_block,
            "purchase_block":       current_block,
            "cooling_off_until":    current_block + COOLING_OFF_BLOCKS,
            "required_source_types": template["required_source_types"],
            "active":               True,
            "paid_out":             False,
            "cancelled":            False,
            "claim_ids":            [],
        }

        # ── Update wallet index ────────────────────────────
        updated_pols = wallet_pols + [policy_id]
        self.wallet_policy_ids[caller] = updated_pols

        # ── Update global stats ────────────────────────────
        stats = self.global_stats["stats"]
        stats["total_policies"] += 1
        stats["total_premium"]  += premium
        stats["active_policies"] += 1
        self.global_stats["stats"] = stats

        # Forward excess to treasury (handled externally via TreasuryManager callback)
        return policy_id

    # ──────────────────────────────────────────────────────
    # Public write — cancel policy (cooling-off only)
    # ──────────────────────────────────────────────────────

    @gl.public.write
    def cancel_policy(self, policy_id: str) -> None:
        """
        Cancel a policy within the cooling-off window and receive a pro-rata refund.
        After the cooling-off window, cancellation is only available via governance.
        """
        caller = gl.message.sender_address
        policy = self.policies[policy_id]

        assert policy["holder"] == caller, "Not the policy holder"
        assert policy["active"], "Policy is not active"
        assert not policy["paid_out"], "Policy already paid out"
        assert gl.message.block_number <= policy["cooling_off_until"], (
            "Cooling-off period has ended. Contact DAO governance for dispute resolution."
        )

        # Mark cancelled
        policy["active"]    = False
        policy["cancelled"] = True
        self.policies[policy_id] = policy

        # Refund full premium
        Address(caller).transfer(policy["premium_paid"])

        # Update stats
        stats = self.global_stats["stats"]
        stats["active_policies"] -= 1
        self.global_stats["stats"] = stats

    # ──────────────────────────────────────────────────────
    # Internal — mark policy as paid out (called by ClaimManager)
    # ──────────────────────────────────────────────────────

    @gl.public.write
    def mark_paid_out(self, policy_id: str, claim_id: str) -> None:
        """
        Called by ClaimManager after a successful payout.
        Prevents double-payout: sets paid_out = True.
        """
        policy = self.policies[policy_id]
        assert not policy["paid_out"], "Already paid out — double payout attempt blocked"
        assert policy["active"], "Policy inactive"

        policy["paid_out"] = True
        policy["active"]   = False
        policy["claim_ids"].append(claim_id)
        self.policies[policy_id] = policy

        stats = self.global_stats["stats"]
        stats["active_policies"] -= 1
        stats["total_payout"] += policy["coverage_amount"]
        self.global_stats["stats"] = stats

    # ──────────────────────────────────────────────────────
    # Public views
    # ──────────────────────────────────────────────────────

    @gl.public.view
    def get_policy(self, policy_id: str) -> dict:
        return self.policies[policy_id]

    @gl.public.view
    def get_wallet_policies(self, wallet: str) -> list:
        ids = self._get_wallet_policies(wallet)
        return [self.policies[pid] for pid in ids if pid in self.policies]

    @gl.public.view
    def get_template(self, template_id: str) -> dict:
        return self.policy_templates[template_id]

    @gl.public.view
    def list_templates(self) -> list:
        result = []
        for key in self.policy_templates:
            result.append(self.policy_templates[key])
        return result

    @gl.public.view
    def get_global_stats(self) -> dict:
        return self.global_stats["stats"]

    @gl.public.view
    def is_policy_claimable(self, policy_id: str) -> dict:
        """Returns eligibility status and reason."""
        policy = self.policies[policy_id]
        current_block = gl.message.block_number
        if not policy["active"]:
            return {"claimable": False, "reason": "Policy inactive"}
        if policy["paid_out"]:
            return {"claimable": False, "reason": "Already paid out"}
        if policy["cancelled"]:
            return {"claimable": False, "reason": "Policy cancelled"}
        if current_block > policy["expiry_block"]:
            return {"claimable": False, "reason": "Policy expired"}
        if current_block <= policy["cooling_off_until"]:
            return {
                "claimable": False,
                "reason": f"Still in cooling-off period (until block {policy['cooling_off_until']})"
            }
        return {"claimable": True, "reason": "Policy active and within coverage period"}
