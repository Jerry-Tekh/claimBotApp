"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Policy, Claim, PolicyTemplate, TreasuryState, GlobalStats, Notification } from "@/types";
import {
  fetchWalletPolicies, fetchWalletClaims, fetchTemplates,
  fetchTreasury, fetchGlobalStats, pollClaimStatus,
} from "@/services/api";

export function useClaimBot(wallet: string) {
  const [policies,  setPolicies]  = useState<Policy[]>([]);
  const [claims,    setClaims]    = useState<Claim[]>([]);
  const [templates, setTemplates] = useState<PolicyTemplate[]>([]);
  const [treasury,  setTreasury]  = useState<TreasuryState | null>(null);
  const [stats,     setStats]     = useState<GlobalStats | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [notifs,    setNotifs]    = useState<Notification[]>([]);
  const pollingRef   = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const mountedRef   = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const polling = pollingRef.current;
    return () => {
      mountedRef.current = false;
      Object.values(polling).forEach(clearInterval);
    };
  }, []);

  const notify = useCallback((type: Notification["type"], message: string) => {
    const id = Math.random().toString(36).slice(2);
    setNotifs(n => [...n, { id, type, message }]);
    setTimeout(() => {
      if (mountedRef.current) setNotifs(n => n.filter(x => x.id !== id));
    }, 7000);
  }, []);

  const dismissNotif = useCallback((id: string) => {
    setNotifs(n => n.filter(x => x.id !== id));
  }, []);

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    const failures: string[] = [];

    // Always load public data. Keep successful responses even if one endpoint fails.
    const [tpls, trs, gstats] = await Promise.allSettled([
      fetchTemplates(),
      fetchTreasury(),
      fetchGlobalStats(),
    ]);

    if (!mountedRef.current) return;

    if (tpls.status === "fulfilled") setTemplates(tpls.value);
    else failures.push("templates");

    if (trs.status === "fulfilled") setTreasury(trs.value);
    else failures.push("treasury");

    if (gstats.status === "fulfilled") setStats(gstats.value);
    else failures.push("analytics");

    // Load wallet-specific data only if wallet is set.
    if (wallet && wallet.startsWith("0x") && wallet.length >= 10) {
      const [pols, cls] = await Promise.allSettled([
        fetchWalletPolicies(wallet),
        fetchWalletClaims(wallet),
      ]);
      if (!mountedRef.current) return;

      if (pols.status === "fulfilled") setPolicies(pols.value ?? []);
      else failures.push("policies");

      if (cls.status === "fulfilled") setClaims(cls.value ?? []);
      else failures.push("claims");
    } else {
      setPolicies([]);
      setClaims([]);
    }

    if (failures.length > 0 && mountedRef.current) {
      notify("error", `Failed to load ${failures.join(", ")}. Check the backend URL and try Refresh.`);
    }

    if (mountedRef.current) {
      setLoading(false);
    }
  }, [wallet, notify]);

  const safeRefresh = useCallback(async () => {
    try {
      await refresh();
    } catch (e: unknown) {
      if (mountedRef.current) {
        notify("error", "Failed to load data: " + (e instanceof Error ? e.message : "unknown error"));
        setLoading(false);
      }
    }
  }, [refresh, notify]);

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const watchRefresh = useCallback(() => {
    refreshRef.current();
  }, []);

  const activePolicies   = policies.filter(p => p.active && !p.cancelled && !p.paid_out);
  const historicPolicies = policies.filter(p => !p.active || p.paid_out || p.cancelled);

  // Initial load + refresh on wallet change
  useEffect(() => {
    safeRefresh();
  }, [safeRefresh]);

  // Auto-refresh every 30s (only when tab is visible)
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") safeRefresh();
    }, 30_000);
    return () => clearInterval(interval);
  }, [safeRefresh]);

  // Poll a specific claim until terminal state
  const watchClaim = useCallback((claimId: string) => {
    if (pollingRef.current[claimId]) return; // already polling

    let attempts = 0;
    const maxAttempts = 60; // 5 min at 5s intervals

    const interval = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(pollingRef.current[claimId]);
        delete pollingRef.current[claimId];
        return;
      }

      try {
        const updated = await pollClaimStatus(claimId);
        if (!mountedRef.current) return;

        setClaims(prev =>
          prev.some(c => c.claim_id === claimId)
            ? prev.map(c => c.claim_id === claimId ? updated : c)
            : [...prev, updated]
        );

        if (updated.status === "approved") {
          notify("success", `✅ Claim approved! Payout transferred to your wallet.`);
          clearInterval(pollingRef.current[claimId]);
          delete pollingRef.current[claimId];
          watchRefresh();
        } else if (updated.status === "rejected") {
          notify("warning", `❌ Claim rejected. Score: ${updated.evidence_score}/100. You may appeal.`);
          clearInterval(pollingRef.current[claimId]);
          delete pollingRef.current[claimId];
        }
      } catch { /* keep polling */ }
    }, 5000);

    pollingRef.current[claimId] = interval;
  }, [notify, watchRefresh]);

  const claimsForPolicy = useCallback(
    (policyId: string) => claims.filter(c => c.policy_id === policyId),
    [claims]
  );

  return {
    policies,
    activePolicies,
    historicPolicies,
    claims,
    templates,
    treasury,
    stats,
    loading,
    notifs,
    notify,
    dismissNotif,
    refresh: safeRefresh,
    watchClaim,
    claimsForPolicy,
  };
}
