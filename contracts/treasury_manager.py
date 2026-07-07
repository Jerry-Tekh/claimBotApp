# ============================================================
# ClaimBot — TreasuryManager Module
# GenLayer Intelligent Contract
# ============================================================
# Responsibilities:
#   - Premium collection and pooling
#   - Reserve ratio enforcement (solvency)
#   - Payout disbursement with cap checks
#   - Emergency reserve (25% of pool, locked)
#   - DAO treasury fee (5% of premiums)
#   - Capital adequacy reporting
# ============================================================

from genlayer import *
import json

# ──────────────────────────────────────────────────────────
# Treasury parameters
# ──────────────────────────────────────────────────────────
RESERVE_RATIO_BPS       = 2000   # 20% of total exposure must be held in reserve
EMERGENCY_RESERVE_BPS   = 2500   # 25% of pool locked as emergency buffer
DAO_FEE_BPS             = 500    # 5% of premiums go to DAO treasury
MAX_SINGLE_PAYOUT_BPS   = 1000   # Single payout ≤ 10% of total pool (concentration risk)
REINSURANCE_TRIGGER_BPS = 7500   # If exposure > 75% of pool → alert reinsurance agent


@gl.contract
class TreasuryManager:
    """
    Insurance treasury with solvency enforcement and DAO fee routing.

    Pool structure:
        premium_pool      : Premiums paid in, available for payouts
        reserve_pool      : Mandatory reserve (RESERVE_RATIO_BPS of exposure)
        emergency_reserve : Locked buffer (EMERGENCY_RESERVE_BPS of pool)
        dao_treasury      : DAO fee accumulation (governance / grants)

    Solvency invariant (enforced before every payout):
        (premium_pool - payout_amount) * 10000 / total_exposure >= RESERVE_RATIO_BPS
    """

    treasury: TreeMap[str, dict]       # singleton "state" key
    payout_log: TreeMap[str, dict]     # payout_id -> record

    def __init__(self):
        self.treasury   = TreeMap()
        self.payout_log = TreeMap()
        self.treasury["state"] = {
            "premium_pool":       0,
            "reserve_pool":       0,
            "emergency_reserve":  0,
            "dao_treasury":       0,
            "total_exposure":     0,    # sum of all active policy coverage amounts
            "total_paid_out":     0,
            "total_premiums_in":  0,
            "payout_count":       0,
        }

    # ──────────────────────────────────────────────────────
    # Internal helpers
    # ──────────────────────────────────────────────────────

    def _state(self) -> dict:
        return self.treasury["state"]

    def _save(self, state: dict) -> None:
        self.treasury["state"] = state

    def _solvency_check(self, payout_amount: int) -> dict:
        """
        Returns solvency assessment before a payout.
        Enforces:
          1. Pool has enough liquid funds
          2. Single payout ≤ MAX_SINGLE_PAYOUT_BPS of pool
          3. Reserve ratio maintained after payout
        """
        s = self._state()
        liquid = s["premium_pool"] - s["emergency_reserve"]

        if payout_amount > liquid:
            return {
                "solvent": False,
                "reason": f"Insufficient liquid funds. Available: {liquid}, required: {payout_amount}",
            }

        # Concentration risk
        max_single = (s["premium_pool"] * MAX_SINGLE_PAYOUT_BPS) // 10_000
        if payout_amount > max_single:
            return {
                "solvent": False,
                "reason": f"Payout exceeds single-payout cap ({MAX_SINGLE_PAYOUT_BPS/100}% of pool = {max_single})",
            }

        # Post-payout reserve ratio
        pool_after     = s["premium_pool"] - payout_amount
        required_reserve = (s["total_exposure"] * RESERVE_RATIO_BPS) // 10_000
        if pool_after < required_reserve:
            return {
                "solvent": False,
                "reason": (
                    f"Post-payout pool ({pool_after}) would breach reserve ratio. "
                    f"Required reserve: {required_reserve}"
                ),
            }

        return {"solvent": True, "reason": "Solvency checks passed"}

    # ──────────────────────────────────────────────────────
    # Public write — deposit premium (called by PolicyManager)
    # ──────────────────────────────────────────────────────

    @gl.public.write
    def deposit_premium(
        self,
        policy_id:       str,
        premium_amount:  int,
        coverage_amount: int,
    ) -> dict:
        """
        Record an incoming premium.
        Splits into:
            DAO fee    = premium * DAO_FEE_BPS / 10000
            Emergency  = premium * EMERGENCY_RESERVE_BPS / 10000
            Pool       = remainder
        Also adds coverage_amount to total_exposure.
        """
        dao_fee   = (premium_amount * DAO_FEE_BPS)             // 10_000
        emergency = (premium_amount * EMERGENCY_RESERVE_BPS)   // 10_000
        pool_add  = premium_amount - dao_fee - emergency

        s = self._state()
        s["premium_pool"]       += pool_add
        s["emergency_reserve"]  += emergency
        s["dao_treasury"]       += dao_fee
        s["total_exposure"]     += coverage_amount
        s["total_premiums_in"]  += premium_amount
        self._save(s)

        return {
            "pool_credited":      pool_add,
            "dao_fee":            dao_fee,
            "emergency_reserve":  emergency,
            "new_pool_balance":   s["premium_pool"],
        }

    # ──────────────────────────────────────────────────────
    # Public write — process payout (called by ClaimManager)
    # ──────────────────────────────────────────────────────

    @gl.public.write
    def process_payout(
        self,
        claim_id:       str,
        policy_id:      str,
        holder:         str,
        payout_amount:  int,
        coverage_amount: int,
    ) -> dict:
        """
        Disburse a validated claim payout.
        Enforces solvency before transfer.
        Reduces total_exposure after payout (policy closed).
        """
        # ── Solvency enforcement ───────────────────────────
        check = self._solvency_check(payout_amount)
        assert check["solvent"], f"Treasury solvency check failed: {check['reason']}"

        # ── Transfer ───────────────────────────────────────
        Address(holder).transfer(payout_amount)

        # ── Update state ───────────────────────────────────
        s = self._state()
        s["premium_pool"]   -= payout_amount
        s["total_exposure"] -= coverage_amount
        s["total_paid_out"] += payout_amount
        s["payout_count"]   += 1
        self._save(s)

        # ── Log payout ─────────────────────────────────────
        payout_id = f"PAY-{claim_id}"
        self.payout_log[payout_id] = {
            "payout_id":     payout_id,
            "claim_id":      claim_id,
            "policy_id":     policy_id,
            "holder":        holder,
            "amount":        payout_amount,
            "block":         gl.message.block_number,
        }

        # ── Reinsurance alert ──────────────────────────────
        reinsurance_trigger = (
            s["total_exposure"] * 10_000 // max(s["premium_pool"], 1)
        ) >= REINSURANCE_TRIGGER_BPS

        return {
            "success":              True,
            "payout_id":            payout_id,
            "amount_transferred":   payout_amount,
            "pool_balance_after":   s["premium_pool"],
            "reinsurance_alert":    reinsurance_trigger,
        }

    # ──────────────────────────────────────────────────────
    # Public write — return premium on cancellation
    # ──────────────────────────────────────────────────────

    @gl.public.write
    def refund_premium(
        self,
        policy_id:       str,
        holder:          str,
        premium_amount:  int,
        coverage_amount: int,
    ) -> None:
        """Return premium to policyholder on cooling-off cancellation."""
        s = self._state()

        # Reconstruct what was split on deposit
        dao_fee   = (premium_amount * DAO_FEE_BPS)           // 10_000
        emergency = (premium_amount * EMERGENCY_RESERVE_BPS) // 10_000
        pool_part = premium_amount - dao_fee - emergency

        # Only reverse pool portion (DAO fee is non-refundable, covers gas)
        refund = pool_part + emergency

        assert s["premium_pool"] + s["emergency_reserve"] >= refund, "Insufficient treasury balance for refund"

        s["premium_pool"]      -= pool_part
        s["emergency_reserve"] -= emergency
        s["total_exposure"]    -= coverage_amount
        s["total_premiums_in"] -= premium_amount
        self._save(s)

        Address(holder).transfer(refund)

    # ──────────────────────────────────────────────────────
    # Public views
    # ──────────────────────────────────────────────────────

    @gl.public.view
    def get_treasury_state(self) -> dict:
        return self._state()

    @gl.public.view
    def get_solvency_report(self) -> dict:
        s = self._state()
        pool        = s["premium_pool"]
        exposure    = s["total_exposure"]
        emergency   = s["emergency_reserve"]
        liquid      = pool - emergency

        required_reserve = (exposure * RESERVE_RATIO_BPS) // 10_000
        reserve_ratio    = (pool * 10_000 // exposure) if exposure > 0 else 10_000

        return {
            "pool_balance":          pool,
            "emergency_reserve":     emergency,
            "liquid_available":      liquid,
            "total_exposure":        exposure,
            "dao_treasury":          s["dao_treasury"],
            "required_reserve":      required_reserve,
            "current_reserve_ratio": reserve_ratio,
            "target_reserve_ratio":  RESERVE_RATIO_BPS,
            "is_solvent":            reserve_ratio >= RESERVE_RATIO_BPS,
            "reinsurance_alert":     (exposure * 10_000 // max(pool, 1)) >= REINSURANCE_TRIGGER_BPS,
            "loss_ratio":            (s["total_paid_out"] * 10_000 // max(s["total_premiums_in"], 1)),
            "payout_count":          s["payout_count"],
        }

    @gl.public.view
    def get_payout_log(self, payout_id: str) -> dict:
        return self.payout_log[payout_id]
