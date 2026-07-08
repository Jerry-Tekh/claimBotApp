"use client";

import { useState } from "react";
import { CheckCircle, AlertTriangle, ExternalLink, Loader2, Clock3 } from "lucide-react";
import type { Policy, Notification } from "@/types";
import { submitClaim, detectSourceType, calcEvidenceScore, formatGEN, SOURCE_POINTS } from "@/services/api";

const SOURCE_ICONS: Record<string, string> = {
  government: "🏛️",
  satellite:  "🛰️",
  weather:    "🌦️",
  news:       "📰",
  logistics:  "✈️",
};

const TRUSTED_EXAMPLES: Record<string, string[]> = {
  government: ["nihsa.gov.ng", "nimet.gov.ng", "ncdc.gov.ng", "faan.gov.ng"],
  satellite:  ["copernicus.eu", "earthdata.nasa.gov", "firms.modaps.eosdis.nasa.gov"],
  weather:    ["open-meteo.com", "wunderground.com", "weather.gov"],
  news:       ["channelstv.com", "punchng.com", "reuters.com", "vanguardngr.com"],
  logistics:  ["flightaware.com", "flightradar24.com", "marinetraffic.com"],
};

interface SubmittedClaim {
  claim_id:        string;
  tx_hash:         string;
  status:          string;
  evidence_score?: number;
}

export default function FileClaimTab({
  activePolicies, wallet, notify, onRefresh, watchClaim, onCheckStatus,
}: {
  activePolicies: Policy[];
  wallet:         string;
  notify:         (t: Notification["type"], m: string) => void;
  onRefresh:      () => void;
  watchClaim:     (id: string) => void;
  onCheckStatus:  (claimId: string) => void;
}) {
  const [policyId,    setPolicyId]    = useState("");
  const [description, setDescription] = useState("");
  const [urlInput,    setUrlInput]    = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState<SubmittedClaim | null>(null);

  const sourceUrls = urlInput
    .split("\n")
    .map(s => s.trim())
    .filter(s => s.startsWith("http"));

  const { score, breakdown } = calcEvidenceScore(sourceUrls);
  const selectedPolicy = activePolicies.find(p => p.policy_id === policyId);
  const policyComplete = Boolean(selectedPolicy);
  const descriptionComplete = description.trim().length >= 10;
  const sourceCountReady = sourceUrls.length >= 2;
  const evidenceReady = sourceCountReady && score >= 70;
  const canSubmit = !submitting && policyComplete && descriptionComplete && evidenceReady;
  const currentStep = !policyComplete ? 1 : !descriptionComplete ? 2 : !evidenceReady ? 3 : 4;
  const nextInstruction = !policyComplete
    ? "Choose the active policy this claim belongs to."
    : !descriptionComplete
      ? "Describe what happened, including the date, location, and impact."
      : !sourceCountReady
        ? "Add at least two trusted source URLs, one per line."
        : score < 70
          ? "Improve the evidence score to 70 or higher before submitting."
          : wallet
            ? "Review the claim details, then submit it to GenLayer validators."
            : "Enter your wallet address in the header, then submit the claim.";

  const stepBadge = (step: number, complete: boolean, active: boolean) => (
    <span
      className={`w-5 h-5 sm:w-6 sm:h-6 text-2xs sm:text-xs rounded-full flex items-center justify-center font-bold shrink-0 transition-colors ${
        complete
          ? "bg-accent-500 text-white"
          : active
            ? "bg-brand-600 text-white"
            : "bg-ink-100 text-ink-400"
      }`}
    >
      {complete ? <CheckCircle className="w-3.5 h-3.5" /> : step}
    </span>
  );

  const resetForm = () => {
    setPolicyId("");
    setDescription("");
    setUrlInput("");
    setSubmitted(null);
  };

  const handleSubmit = async () => {
    if (!wallet) { notify("error", "Enter your wallet address in the header first."); return; }
    if (!policyId) { notify("warning", "Select a policy."); return; }
    if (description.trim().length < 10) { notify("warning", "Describe the event in more detail."); return; }
    if (sourceUrls.length < 2) { notify("warning", "Add at least 2 source URLs."); return; }
    if (score < 70) { notify("warning", "Evidence score is below 70. Add a government or satellite source."); return; }

    setSubmitting(true);
    try {
      const hints: Record<string, string> = {};
      for (const url of sourceUrls) hints[url] = detectSourceType(url);

      const result = await submitClaim({
        wallet,
        policyId,
        eventDescription: description,
        sourceUrls,
        sourceTypeHints:  hints,
      });

      setSubmitted(result);
      if (result.status === "approved") {
        notify("success", `Claim ${result.claim_id.slice(-6)} approved. Evidence score: ${result.evidence_score ?? score}/100.`);
      } else if (result.status === "rejected") {
        notify("warning", `Claim ${result.claim_id.slice(-6)} rejected. Evidence score: ${result.evidence_score ?? score}/100.`);
      } else {
        notify("info", `Claim ${result.claim_id.slice(-6)} submitted. Validators reviewing (up to 5 min)...`);
        watchClaim(result.claim_id);
      }
      onCheckStatus(result.claim_id);
    } catch (e: unknown) {
      notify("error", "Submission failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success state ─────────────────────────────────────────
  if (submitted) {
    const finalStatus = submitted.status === "approved" || submitted.status === "rejected";
    const approved = submitted.status === "approved";
    const pending = !finalStatus;

    return (
      <div className="w-full max-w-2xl">
        <h1 className="text-lg sm:text-xl font-semibold text-ink-900 mb-5 sm:mb-6 tracking-tight">File a Claim</h1>
        <div className="card p-8 text-center animate-fade-in">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
            finalStatus
              ? approved ? "bg-accent-50" : "bg-red-50"
              : "bg-brand-50"
          }`}>
            {finalStatus ? (
              approved
                ? <CheckCircle className="w-8 h-8 text-accent-500" />
                : <AlertTriangle className="w-8 h-8 text-red-500" />
            ) : (
              <Clock3 className="w-8 h-8 text-brand-500" />
            )}
          </div>
          <h2 className="text-lg font-semibold text-ink-800 mb-2">
            {finalStatus ? `Claim ${submitted.status}` : "Claim submitted"}
          </h2>
          {pending && (
            <p className="text-sm font-medium text-brand-600 mb-2">
              Status: pending validator review
            </p>
          )}
          <p className="text-sm text-ink-500 mb-1">
            Claim ID: <span className="font-mono font-medium text-ink-700">{submitted.claim_id}</span>
          </p>
          {submitted.evidence_score !== undefined && (
            <p className="text-sm text-ink-500 mb-1">
              Evidence score: <span className="font-semibold text-ink-700">{submitted.evidence_score}/100</span>
            </p>
          )}
          <p className="text-xs text-ink-400 font-mono mb-6 truncate">tx: {submitted.tx_hash}</p>
          <p className="text-sm text-ink-600 mb-8">
            {finalStatus
              ? "This claim has already been processed. You can review the result under My Policies."
              : "5 independent AI validators are reviewing your evidence on the GenLayer network. You'll see the result under My Policies once confirmed."}
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={resetForm} className="btn-secondary">
              File another claim
            </button>
            <button onClick={() => onCheckStatus(submitted.claim_id)} className="btn-primary">
              Check status
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg sm:text-xl font-semibold text-ink-900 mb-5 sm:mb-6 tracking-tight">File a Claim</h1>

      {activePolicies.length === 0 ? (
        <div className="text-center py-16 text-ink-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-ink-200" />
          <p className="mb-2">No claimable policies found.</p>
          <p className="text-xs">Buy a policy first, or enter your wallet address above.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
            <p className="text-2xs font-bold uppercase text-brand-600 tracking-wide mb-1">
              Step {currentStep} of 4
            </p>
            <p className="text-sm text-ink-700">{nextInstruction}</p>
          </div>

          {/* Step 1 — Policy */}
          <div className="card p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-4">
              {stepBadge(1, policyComplete, currentStep === 1)}
              <h2 className="text-sm font-semibold text-ink-700">Select policy</h2>
            </div>
            <select
              className="input"
              value={policyId}
              onChange={e => setPolicyId(e.target.value)}
            >
              <option value="">— choose a policy —</option>
              {activePolicies.map(p => (
                <option key={p.policy_id} value={p.policy_id}>
                  {p.policy_id.slice(-8)} · {p.coverage_area} · {formatGEN(p.coverage_amount)}
                </option>
              ))}
            </select>
            {selectedPolicy && (
              <div className="mt-3 bg-brand-50 border border-brand-100 rounded-lg px-4 py-3 space-y-1">
                <p className="text-xs text-ink-600">
                  <span className="font-medium">Trigger: </span>{selectedPolicy.trigger_condition}
                </p>
                <p className="text-xs text-ink-500">
                  <span className="font-medium">Required sources: </span>
                  {selectedPolicy.policy_type === "flood"  ? "news · government · weather" :
                   selectedPolicy.policy_type === "crop"   ? "satellite · weather · government" :
                   selectedPolicy.policy_type === "flight" ? "logistics · news" :
                                                             "logistics · news · government"}
                </p>
                <p className="text-xs text-ink-500">
                  <span className="font-medium">Coverage: </span>{formatGEN(selectedPolicy.coverage_amount)}
                </p>
              </div>
            )}
          </div>

          {/* Step 2 — Description */}
          {policyComplete && (
            <div className="card p-4 sm:p-5 animate-fade-in">
              <div className="flex items-center gap-2 mb-4">
                {stepBadge(2, descriptionComplete, currentStep === 2)}
                <h2 className="text-sm font-semibold text-ink-700">Describe the event</h2>
              </div>
              <textarea
                className="input resize-none"
                rows={4}
                placeholder="Be specific: include the date, location, and scale of the event.&#10;&#10;Example: 'Major flooding hit Lagos Island on June 12 2026. Approximately 8,500 residents were displaced according to NIHSA. Water levels reached 2.3m in low-lying areas.'"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
              <p className={`text-xs mt-1.5 ${descriptionComplete ? "text-accent-600" : "text-ink-400"}`}>
                {description.trim().length}/500 characters {descriptionComplete ? "✓" : "(minimum 10)"}
              </p>
            </div>
          )}

          {/* Step 3 — Evidence */}
          {policyComplete && descriptionComplete && (
            <div className="card p-4 sm:p-5 animate-fade-in">
              <div className="flex items-center gap-2 mb-4">
                {stepBadge(3, evidenceReady, currentStep === 3)}
                <h2 className="text-sm font-semibold text-ink-700">Evidence sources</h2>
              </div>
              <p className="text-xs text-ink-400 mb-3">
                One URL per line. Must be from trusted domains. Aim for at least 3 different source types.
              </p>
              <textarea
                className="input font-mono text-xs resize-none"
                rows={5}
                placeholder={"https://nihsa.gov.ng/flood-alert-lagos-june-2026\nhttps://channelstv.com/flooding-lagos-2026\nhttps://open-meteo.com/forecast/lagos"}
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
              />

              {/* Trusted domains accordion */}
              <details className="mt-3">
                <summary className="text-xs text-brand-600 cursor-pointer hover:underline select-none">
                  View accepted domains per source type →
                </summary>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.entries(TRUSTED_EXAMPLES).map(([type, domains]) => (
                    <div key={type} className="bg-ink-50 border border-ink-100 rounded-lg p-2.5">
                      <p className="text-xs font-semibold text-ink-700 mb-1">
                        {SOURCE_ICONS[type]} {type}
                        <span className="text-ink-400 font-normal ml-1">({SOURCE_POINTS[type]}pts)</span>
                      </p>
                      {domains.map(d => (
                        <p key={d} className="text-xs text-ink-400 font-mono">{d}</p>
                      ))}
                    </div>
                  ))}
                </div>
              </details>

              {/* Live score preview */}
              {sourceUrls.length > 0 && (
                <div className={`mt-4 rounded-xl p-4 border ${score >= 70 ? "bg-accent-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-ink-700">Evidence score</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xl font-bold ${score >= 70 ? "text-accent-600" : "text-amber-600"}`}>
                        {score}
                      </span>
                      <span className="text-ink-400 text-sm">/100</span>
                      {score >= 70
                        ? <CheckCircle className="w-5 h-5 text-accent-500" />
                        : <AlertTriangle className="w-5 h-5 text-amber-500" />}
                    </div>
                  </div>

                  {/* Per-type bars */}
                  <div className="space-y-2 mb-4">
                    {Object.entries(SOURCE_POINTS).map(([type, maxPts]) => {
                      const earned = breakdown[type] ?? 0;
                      return (
                        <div key={type} className="flex items-center gap-2.5">
                          <span className="text-sm w-4 shrink-0">{SOURCE_ICONS[type]}</span>
                          <div className="flex-1 bg-white/70 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full transition-all duration-300 ${earned > 0 ? "bg-brand-500" : "bg-transparent"}`}
                              style={{ width: `${(earned / maxPts) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-ink-500 w-32 shrink-0 capitalize">
                            {type}: <strong>{earned}</strong>/{maxPts}pts
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Threshold bar */}
                  <div className="relative">
                    <div className="h-2.5 bg-ink-200 rounded-full overflow-hidden">
                      <div
                        className={`h-2.5 rounded-full transition-all duration-500 ${score >= 70 ? "bg-accent-500" : "bg-amber-400"}`}
                        style={{ width: `${Math.min(score, 100)}%` }}
                      />
                    </div>
                    <div
                      className="absolute top-0 h-2.5 w-0.5 bg-ink-600"
                      style={{ left: "70%" }}
                    />
                    <span className="text-xs text-ink-500 absolute -bottom-4" style={{ left: "70%", transform: "translateX(-50%)" }}>
                      70 min
                    </span>
                  </div>

                  {score < 70 && (
                    <p className="text-xs text-amber-700 mt-6 font-medium">
                      ⚠ Need {70 - score} more points.
                      {!breakdown["government"] && " Add a government source (+35pts)."}
                      {!breakdown["satellite"]  && !breakdown["government"] && " Or a satellite source (+25pts)."}
                    </p>
                  )}

                  {/* Valid URL list */}
                  <div className="mt-3 pt-3 border-t border-white/50">
                    <p className="text-xs font-medium text-ink-600 mb-1.5">Accepted URLs ({sourceUrls.length}):</p>
                    {sourceUrls.map(url => (
                      <div key={url} className="flex items-center gap-1.5 text-xs text-ink-500 mb-0.5">
                        <ExternalLink className="w-2.5 h-2.5 shrink-0 text-blue-400" />
                        <span className="truncate min-w-0 flex-1">{url}</span>
                        <span className="text-ink-400 shrink-0">→ {detectSourceType(url)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Submit */}
          {policyComplete && descriptionComplete && (
            <>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="btn-primary w-full py-3.5 sm:py-4 text-sm sm:text-base flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {submitting
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting to validators...</>
                  : "Submit claim to GenLayer validators"
                }
              </button>

              {!wallet && evidenceReady && (
                <p className="text-xs text-center text-red-500">⚠ Enter your wallet address in the header to submit</p>
              )}
              {wallet && sourceUrls.length > 0 && !evidenceReady && (
                <p className="text-xs text-center text-amber-600">Evidence needs at least 2 URLs and a score of 70 before submitting</p>
              )}
            </>
          )}

        </div>
      )}
    </div>
  );
}
