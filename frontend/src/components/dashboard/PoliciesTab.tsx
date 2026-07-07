"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronDown, ChevronUp, Plus, Droplets, Wheat,
  Plane, Anchor, X, Shield,
} from "lucide-react";
import type { Policy, Claim, PolicyTemplate, Notification } from "@/types";
import { purchasePolicy, cancelPolicyApi, formatGEN, formatBPS, calcPremium } from "@/services/api";
import ClaimRow from "./ClaimRow";
import { PolicySkeleton, StatCardSkeleton } from "@/components/ui/Skeleton";

// ── Icons per policy type ─────────────────────────────────
const POLICY_ICONS: Record<string, React.ReactNode> = {
  flood:  <Droplets className="w-5 h-5 text-brand-500" />,
  crop:   <Wheat    className="w-5 h-5 text-accent-500" />,
  flight: <Plane    className="w-5 h-5 text-purple-500" />,
  cargo:  <Anchor   className="w-5 h-5 text-amber-500" />,
};

function defaultExpiryTimestamp() {
  return Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
}

function statusBadge(policy: Policy) {
  if (policy.paid_out)  return <span className="badge badge-blue">paid out</span>;
  if (policy.cancelled) return <span className="badge badge-gray">cancelled</span>;
  if (policy.active)    return <span className="badge badge-green">active</span>;
  return                       <span className="badge badge-gray">expired</span>;
}

// ── Individual Policy Card ────────────────────────────────
function PolicyCard({
  policy, claims, notify, onRefresh, watchClaim, compact = false,
}: {
  policy:    Policy;
  claims:    Claim[];
  notify:    (t: Notification["type"], m: string) => void;
  onRefresh: () => void;
  watchClaim:(id: string) => void;
  compact?:  boolean;
}) {
  const [open,       setOpen]       = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    if (!confirm("Cancel this policy? A refund will be issued if you're within the cooling-off window (first 50 blocks after purchase).")) return;
    setCancelling(true);
    try {
      await cancelPolicyApi({ wallet: policy.holder, policyId: policy.policy_id });
      notify("success", "Policy cancellation submitted. Refund in progress.");
      onRefresh();
    } catch (e: unknown) {
      notify("error", "Cancel failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <motion.div
      variants={{ hidden: { opacity:0, y:16 }, visible: { opacity:1, y:0, transition:{ duration:0.4, ease:[0.16,1,0.3,1] } } }}
      className="card overflow-hidden"
    >
      <button
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-ink-50 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-ink-50 border border-ink-100 rounded-xl flex items-center justify-center shrink-0">
            {POLICY_ICONS[policy.policy_type] ?? <Shield className="w-5 h-5 text-ink-400" />}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-ink-800 text-sm">{policy.coverage_area}</p>
            {!compact && (
              <p className="text-xs text-ink-400 mt-0.5 truncate max-w-sm">{policy.trigger_condition}</p>
            )}
            <p className="text-xs text-ink-300 font-mono mt-0.5">{policy.policy_id}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0 ml-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-ink-800">{formatGEN(policy.coverage_amount)}</p>
            <p className="text-xs text-ink-400">coverage</p>
          </div>
          {statusBadge(policy)}
          {open
            ? <ChevronUp   className="w-4 h-4 text-ink-300" />
            : <ChevronDown className="w-4 h-4 text-ink-300" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-ink-100 bg-ink-50/60 px-5 pt-4 pb-5 animate-fade-in">
          {/* Details grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 mb-5 text-sm">
            {[
              { label: "Premium paid",   value: formatGEN(policy.premium_paid) },
              { label: "Coverage",       value: formatGEN(policy.coverage_amount) },
              { label: "Type",           value: policy.policy_type },
              { label: "Expiry block",   value: policy.expiry_block.toLocaleString() },
            ].map(r => (
              <div key={r.label}>
                <p className="text-xs text-ink-400 mb-0.5">{r.label}</p>
                <p className="text-sm font-medium text-ink-700 capitalize">{r.value}</p>
              </div>
            ))}
          </div>

          {/* Claims */}
          {claims.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-2">
                Claims ({claims.length})
              </p>
              <div className="space-y-2">
                {claims.map(c => (
                  <ClaimRow
                    key={c.claim_id}
                    claim={c}
                    notify={notify}
                    onRefresh={onRefresh}
                    watchClaim={watchClaim}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {policy.active && !policy.paid_out && !policy.cancelled && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="text-xs text-red-500 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {cancelling ? "Cancelling..." : "Cancel policy"}
              </button>
              <span className="text-xs text-ink-400 self-center">(cooling-off window only)</span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ── Buy Policy Modal ──────────────────────────────────────
function BuyModal({
  templates, wallet, notify, onClose, onSuccess,
}: {
  templates: PolicyTemplate[];
  wallet:    string;
  notify:    (t: Notification["type"], m: string) => void;
  onClose:   () => void;
  onSuccess: () => void;
}) {
  const [templateId,  setTemplateId]  = useState(templates[0]?.id ?? "");
  const [area,        setArea]        = useState("");
  const [coverageGEN, setCoverageGEN] = useState("100");
  const [submitting,  setSubmitting]  = useState(false);

  const template   = templates.find(t => t.id === templateId);
  const coverage   = parseFloat(coverageGEN) || 0;
  const premiumGEN = template ? calcPremium(coverage, template.base_premium_bps) : 0;
  const canBuy     = !submitting && !!wallet && area.trim().length > 3 && coverage > 0;

  const handleBuy = async () => {
    if (!wallet)          { notify("error",   "Enter your wallet address first."); return; }
    if (!area.trim())     { notify("warning", "Enter a coverage area."); return; }
    if (coverage <= 0)    { notify("warning", "Enter a valid coverage amount."); return; }
    if (!templateId)      { notify("warning", "Select a policy type."); return; }

    setSubmitting(true);
    try {
      const result = await purchasePolicy({
        wallet,
        templateId,
        coverageArea:     area.trim(),
        coverageAmount:   Math.round(coverage * 1e9),
        expiryBlock:      defaultExpiryTimestamp(),
        triggerOverrides: { area: area.trim() },
      });
      notify("success", `Policy purchased! ID: ${result.policy_id.slice(-8)}`);
      onSuccess();
    } catch (e: unknown) {
      notify("error", "Purchase failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity:0 }}
      animate={{ opacity:1 }}
      exit={{ opacity:0 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
    >
      <motion.div
        initial={{ opacity:0, y:48 }}
        animate={{ opacity:1, y:0 }}
        exit={{ opacity:0, y:48 }}
        transition={{ type:"spring", stiffness:400, damping:32 }}
        className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md shadow-premium-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100">
          <h2 className="font-semibold text-ink-800">Buy a Policy</h2>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-600 transition-colors rounded-lg p-1 hover:bg-ink-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Type selector */}
          <div>
            <label className="label">Coverage type</label>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTemplateId(t.id)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left text-sm transition-all ${
                    templateId === t.id
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-ink-200 hover:border-ink-300 text-ink-600"
                  }`}
                >
                  {POLICY_ICONS[t.policy_type]}
                  <span className="font-medium text-xs">{t.name.replace(" Insurance", "")}</span>
                </button>
              ))}
            </div>
            {template && (
              <p className="text-xs text-ink-400 mt-2">{template.description}</p>
            )}
          </div>

          {/* Area */}
          <div>
            <label className="label">Coverage area</label>
            <input
              className="input"
              placeholder="e.g. Lagos State, Nigeria"
              value={area}
              onChange={e => setArea(e.target.value)}
            />
          </div>

          {/* Amount */}
          <div>
            <label className="label">Coverage amount (GEN)</label>
            <input
              className="input"
              type="number"
              min="0.1"
              step="10"
              placeholder="100"
              value={coverageGEN}
              onChange={e => setCoverageGEN(e.target.value)}
            />
            {template && (
              <p className="text-xs text-ink-400 mt-1">
                Min: 0.1 GEN · Max: {formatGEN(template.max_coverage)}
              </p>
            )}
          </div>

          {/* Price summary */}
          <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-ink-600">Coverage</span>
              <span className="font-semibold">{coverage.toFixed(2)} GEN</span>
            </div>
            <div className="flex justify-between text-sm border-t border-brand-100 pt-2">
              <span className="text-ink-600">
                Premium ({formatBPS(template?.base_premium_bps ?? 0)})
              </span>
              <span className="font-bold text-brand-700">{premiumGEN.toFixed(4)} GEN</span>
            </div>
            {template && (
              <p className="text-xs text-ink-500 pt-1">
                Required evidence: {template.required_source_types.join(" · ")}
              </p>
            )}
          </div>

          {!wallet && (
            <p className="text-xs text-red-500 text-center">⚠ Enter your wallet address in the header first</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5">
          <button
            onClick={handleBuy}
            disabled={!canBuy}
            className="btn-primary w-full py-3 text-base disabled:opacity-40"
          >
            {submitting
              ? "Submitting..."
              : `Buy for ${premiumGEN.toFixed(4)} GEN`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Policies Tab ──────────────────────────────────────────
export default function PoliciesTab({
  activePolicies,
  historicPolicies,
  templates,
  wallet,
  claimsForPolicy,
  notify,
  onRefresh,
  watchClaim,
  loading,
}: {
  activePolicies:   Policy[];
  historicPolicies: Policy[];
  templates:        PolicyTemplate[];
  wallet:           string;
  claimsForPolicy:  (id: string) => Claim[];
  notify:           (t: Notification["type"], m: string) => void;
  onRefresh:        () => void;
  watchClaim:       (id: string) => void;
  loading?:         boolean;
}) {
  const [showModal, setShowModal] = useState(false);
  const allPolicies = [...activePolicies, ...historicPolicies];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 sm:mb-6 gap-3">
        <h1 className="text-lg sm:text-xl font-semibold text-ink-900 mb-0 tracking-tight">My Policies</h1>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Buy </span>Policy
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
        {loading ? (
          [1,2,3].map(i => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <div className="stat-card">
              <p className="text-xs text-ink-400">Active policies</p>
              <p className="text-2xl font-bold text-ink-800">{activePolicies.length}</p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-ink-400">Total coverage</p>
              <p className="text-2xl font-bold text-ink-800">
                {formatGEN(allPolicies.reduce((s, p) => s + p.coverage_amount, 0))}
              </p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-ink-400">Premiums paid</p>
              <p className="text-2xl font-bold text-ink-800">
                {formatGEN(allPolicies.reduce((s, p) => s + p.premium_paid, 0))}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Active policies */}
      {loading ? (
        <div className="space-y-3">
          {[1,2].map(i => <PolicySkeleton key={i} />)}
        </div>
      ) : activePolicies.length === 0 ? (
        <div className="text-center py-16">
          <Shield className="w-14 h-14 mx-auto mb-4 text-ink-200" />
          <p className="text-ink-400 mb-1">
            {wallet ? "No active policies." : "Enter your wallet address to view policies."}
          </p>
          {wallet && (
            <button
              onClick={() => setShowModal(true)}
              className="btn-primary mt-4 inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Buy your first policy
            </button>
          )}
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ hidden:{}, visible:{ transition:{ staggerChildren:0.06 } } }}
          className="space-y-3"
        >
          {activePolicies.map(p => (
            <PolicyCard
              key={p.policy_id}
              policy={p}
              claims={claimsForPolicy(p.policy_id)}
              notify={notify}
              onRefresh={onRefresh}
              watchClaim={watchClaim}
            />
          ))}
        </motion.div>
      )}

      {/* History */}
      {!loading && historicPolicies.length > 0 && (
        <div className="mt-6 sm:mt-10">
          <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-3">History</p>
          <div className="space-y-2">
            {historicPolicies.map(p => (
              <PolicyCard
                key={p.policy_id}
                policy={p}
                claims={claimsForPolicy(p.policy_id)}
                notify={notify}
                onRefresh={onRefresh}
                watchClaim={watchClaim}
                compact
              />
            ))}
          </div>
        </div>
      )}

      {/* Buy modal */}
      {showModal && (
        <BuyModal
          templates={templates}
          wallet={wallet}
          notify={notify}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); onRefresh(); }}
        />
      )}
    </div>
  );
}
