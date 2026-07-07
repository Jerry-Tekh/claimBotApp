"use client";
// ============================================================
// ClaimRow — inline claim history with appeal flow
// ============================================================

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, ExternalLink, AlertTriangle } from "lucide-react";
import type { Claim, Notification } from "@/types";
import { submitAppeal } from "@/services/api";

function statusClass(status: string): string {
  const m: Record<string, string> = {
    approved: "badge-green",
    rejected: "badge-red",
    pending:  "badge-amber",
    appealed: "badge-purple",
  };
  return `badge ${m[status] ?? "badge-gray"}`;
}

export default function ClaimRow({
  claim, notify, onRefresh, watchClaim,
}: {
  claim:      Claim;
  notify:     (t: Notification["type"], m: string) => void;
  onRefresh:  () => void;
  watchClaim: (id: string) => void;
}) {
  const [open,      setOpen]      = useState(false);
  const [appealing, setAppealing] = useState(false);
  const [statement, setStatement] = useState("");
  const [newUrls,   setNewUrls]   = useState("");
  const [loading,   setLoading]   = useState(false);

  const scoreColor = claim.evidence_score >= 70 ? "text-accent-600" : "text-red-500";
  const canAppeal  = claim.status === "rejected" && (claim.appeal_round ?? 0) < 2;

  const handleAppeal = async () => {
    const sources = newUrls.split("\n").map(s => s.trim()).filter(Boolean);
    if (!statement.trim()) { notify("warning", "Write an appeal statement."); return; }
    if (sources.length === 0) { notify("warning", "Add at least one additional source URL."); return; }

    setLoading(true);
    try {
      const result = await submitAppeal({
        wallet:            claim.claimant,
        claimId:           claim.claim_id,
        additionalSources: sources,
        appealStatement:   statement,
      });

      notify("info", `Appeal round ${result.appeal_round} submitted. Awaiting ${result.appeal_round === 1 ? "13" : "25"} validators...`);
      watchClaim(claim.claim_id); // start polling this claim
      setAppealing(false);
      setStatement("");
      setNewUrls("");
      onRefresh();
    } catch (e: unknown) {
      notify("error", "Appeal failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-ink-100 rounded-xl overflow-hidden">
      {/* Header row */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-ink-50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2">
            <span className="font-mono text-2xs sm:text-xs text-ink-400 shrink-0 hidden xs:inline">{claim.claim_id.slice(-8)}</span>
            <span className="text-xs text-ink-600 truncate block">{claim.event_description}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 ml-2 sm:ml-3">
          <span className={`text-xs sm:text-sm font-bold ${scoreColor} hidden xs:inline`}>{claim.evidence_score}/100</span>
          <span className={statusClass(claim.status)}>{claim.status}</span>
          {open
            ? <ChevronUp   className="w-3.5 h-3.5 text-ink-300" />
            : <ChevronDown className="w-3.5 h-3.5 text-ink-300" />}
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity:0, height:0 }}
          animate={{ opacity:1, height:"auto" }}
          exit={{ opacity:0, height:0 }}
          transition={{ duration:0.25, ease:[0.16,1,0.3,1] }}
          className="overflow-hidden"
        >
        <div className="border-t border-ink-50 px-4 pb-4 pt-3 space-y-4">

          {/* Validator reasoning */}
          {claim.llm_result?.reasoning && (
            <div className="bg-ink-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-ink-500 mb-1">Validator reasoning</p>
              <p className="text-xs text-ink-600 italic">"{claim.llm_result.reasoning}"</p>
              <div className="flex flex-wrap gap-4 mt-2 text-xs text-ink-400">
                <span>Confidence: <strong className="text-ink-600">{claim.llm_result.confidence}</strong></span>
                <span>Appeal round: {claim.appeal_round ?? 0}/2</span>
                <span>Payout: {claim.payout_triggered ? "✅ triggered" : "❌ not triggered"}</span>
              </div>
              {claim.llm_result.red_flags?.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600">
                  <AlertTriangle className="w-3 h-3" />
                  Flags: {claim.llm_result.red_flags.join(", ")}
                </div>
              )}
            </div>
          )}

          {/* Score breakdown */}
          {claim.score_breakdown && Object.keys(claim.score_breakdown).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink-500 mb-1.5">Evidence score breakdown</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(claim.score_breakdown).map(([type, pts]) => (
                  <span key={type} className="text-xs bg-brand-50 border border-brand-100 text-brand-700 px-2.5 py-0.5 rounded-full">
                    {type}: {pts}pts
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Source URLs */}
          {claim.source_urls?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink-500 mb-1.5">Evidence sources</p>
              <div className="space-y-1">
                {claim.source_urls.map(url => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs text-brand-600 hover:underline min-w-0"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    {url}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Appeal section */}
          {canAppeal && (
            <div className="border-t border-ink-100 pt-3">
              {!appealing ? (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-ink-500">
                    Appeal round {(claim.appeal_round ?? 0) + 1} available
                    ({(claim.appeal_round ?? 0) === 0 ? "13 validators" : "25 validators — final"})
                  </p>
                  <button
                    onClick={() => setAppealing(true)}
                    className="text-xs text-brand-600 font-semibold hover:underline"
                  >
                    File appeal →
                  </button>
                </div>
              ) : (
                <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} transition={{duration:0.2}} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-ink-700">
                      Appeal round {(claim.appeal_round ?? 0) + 1}
                      {" — "}
                      {(claim.appeal_round ?? 0) === 0 ? "13 validators" : "25 validators (final)"}
                    </p>
                    <button onClick={() => setAppealing(false)} className="text-ink-400 hover:text-ink-600">
                      <ChevronUp className="w-4 h-4" />
                    </button>
                  </div>
                  <div>
                    <label className="label">Appeal statement</label>
                    <textarea
                      className="input text-xs resize-none"
                      rows={3}
                      placeholder="Explain why the claim should be reconsidered. Reference specific evidence..."
                      value={statement}
                      onChange={e => setStatement(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Additional source URLs (one per line)</label>
                    <textarea
                      className="input text-xs font-mono resize-none"
                      rows={3}
                      placeholder="https://nihsa.gov.ng/additional-report&#10;https://copernicus.eu/satellite-data"
                      value={newUrls}
                      onChange={e => setNewUrls(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col xs:flex-row gap-2">
                    <button
                      onClick={handleAppeal}
                      disabled={loading}
                      className="btn-primary text-xs py-1.5"
                    >
                      {loading ? "Submitting..." : "Submit appeal"}
                    </button>
                    <button
                      onClick={() => setAppealing(false)}
                      className="btn-secondary text-xs py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          )}

          {/* Final appeal rejected */}
          {claim.status === "rejected" && (claim.appeal_round ?? 0) >= 2 && (
            <div className="border-t border-ink-100 pt-3">
              <p className="text-xs text-ink-400 text-center">
                Final appeal (round 2, 25 validators) has been processed. No further appeals available.
              </p>
            </div>
          )}
        </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
