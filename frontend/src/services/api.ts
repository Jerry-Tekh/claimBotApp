// ============================================================
// ClaimBot — Backend API Service
// frontend/src/services/api.ts
// ============================================================

import axios from "axios";
import type {
  Policy, Claim, PolicyTemplate,
  TreasuryState, GlobalStats, AppealResult,
} from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 45_000,
  headers: { "Content-Type": "application/json" },
});

const WRITE_TIMEOUT_MS = 180_000;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function canRetryRequest(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  const method = err.config?.method?.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return false;
  if (!err.response) return true;
  return [408, 425, 429, 500, 502, 503, 504].includes(err.response.status);
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config = axios.isAxiosError(err) ? err.config as (typeof err.config & { _retryCount?: number }) : undefined;
    if (config && canRetryRequest(err)) {
      config._retryCount = config._retryCount ?? 0;
      if (config._retryCount < 2) {
        config._retryCount += 1;
        await sleep(800 * config._retryCount);
        return api.request(config);
      }
    }

    const message = err.response?.data?.error || err.message || "Request failed";
    throw new Error(message);
  }
);

// ── Policy APIs ───────────────────────────────────────────

export async function fetchTemplates(): Promise<PolicyTemplate[]> {
  const { data } = await api.get("/api/templates");
  return data;
}

export async function fetchWalletPolicies(wallet: string): Promise<Policy[]> {
  const { data } = await api.get(`/api/policies/${wallet}`);
  return data;
}

export async function fetchPolicy(policyId: string): Promise<Policy> {
  const { data } = await api.get(`/api/policies/${policyId}/detail`);
  return data;
}

export async function purchasePolicy(params: {
  wallet:           string;
  templateId:       string;
  coverageArea:     string;
  coverageAmount:   number;
  expiryBlock?:     number;
  triggerOverrides?: Record<string, string>;
}): Promise<{ policy_id: string; tx_hash: string; evm_tx_hash?: string; confirmation_status?: string }> {
  const { data } = await api.post("/api/policies/purchase", params, { timeout: WRITE_TIMEOUT_MS });
  return data;
}

export async function cancelPolicyApi(params: {
  wallet:   string;
  policyId: string;
}): Promise<{ tx_hash: string; evm_tx_hash?: string; confirmation_status?: string }> {
  const { data } = await api.post("/api/policies/cancel", params, { timeout: WRITE_TIMEOUT_MS });
  return data;
}

// ── Claim APIs ────────────────────────────────────────────

export async function fetchWalletClaims(wallet: string): Promise<Claim[]> {
  const { data } = await api.get(`/api/claims/wallet/${wallet}`);
  return data;
}

export async function fetchClaim(claimId: string): Promise<Claim> {
  const { data } = await api.get(`/api/claims/${claimId}`);
  return data;
}

export async function pollClaimStatus(claimId: string): Promise<Claim> {
  const { data } = await api.get(`/api/claims/${claimId}/status`);
  return data;
}

export async function submitClaim(params: {
  wallet:           string;
  policyId:         string;
  eventDescription: string;
  sourceUrls:       string[];
  sourceTypeHints:  Record<string, string>;
}): Promise<{
  claim_id: string;
  tx_hash: string;
  status: string;
  evm_tx_hash?: string;
  confirmation_status?: string;
  evidence_score?: number;
}> {
  const { data } = await api.post("/api/claims/submit", params, { timeout: WRITE_TIMEOUT_MS });
  return data;
}

export async function submitAppeal(params: {
  wallet:            string;
  claimId:           string;
  additionalSources: string[];
  appealStatement:   string;
}): Promise<AppealResult> {
  const { data } = await api.post("/api/claims/appeal", params, { timeout: WRITE_TIMEOUT_MS });
  return data;
}

// ── Treasury / Stats APIs ─────────────────────────────────

export async function fetchTreasury(): Promise<TreasuryState> {
  const { data } = await api.get("/api/treasury");
  return data;
}

export async function fetchGlobalStats(): Promise<GlobalStats> {
  const { data } = await api.get("/api/stats");
  return data;
}

// ── Client-side helpers ───────────────────────────────────

export function detectSourceType(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    // Government FIRST — .gov.ng and .gov are always government
    if (hostname.endsWith(".gov.ng") || hostname.endsWith(".gov")) return "government";
    if (/nigerian|federal|ministry|nimasa/.test(hostname))          return "government";
    if (/flightaware|flightradar|marinetraffic|portoflagos|faan/.test(hostname)) return "logistics";
    if (/copernicus|earthdata|sentinel|firms/.test(hostname))       return "satellite";
    if (/nasa/.test(hostname) && !hostname.endsWith(".gov"))        return "satellite";
    if (/open-meteo|wunderground|weather\.com/.test(hostname))     return "weather";
  } catch { /* invalid URL */ }
  return "news";
}

export const SOURCE_POINTS: Record<string, number> = {
  government: 35,
  satellite:  25,
  weather:    20,
  news:       20,
  logistics:  25,
};

export function calcEvidenceScore(urls: string[]): {
  score: number;
  breakdown: Record<string, number>;
} {
  const seen      = new Set<string>();
  const breakdown: Record<string, number> = {};
  for (const url of urls) {
    try {
      const domain = new URL(url).hostname.replace("www.", "");
      if (seen.has(domain)) continue;
      seen.add(domain);
      const type = detectSourceType(url);
      if (!(type in breakdown)) {
        breakdown[type] = SOURCE_POINTS[type] ?? 10;
      }
    } catch { /* skip invalid */ }
  }
  return {
    score:     Object.values(breakdown).reduce((a, b) => a + b, 0),
    breakdown,
  };
}

export function formatGEN(amount: number): string {
  if (amount === 0) return "0 GEN";
  return (amount / 1e9).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }) + " GEN";
}

export function formatBPS(bps: number): string {
  return (bps / 100).toFixed(1) + "%";
}

export function calcPremium(coverageGEN: number, bps: number): number {
  return (coverageGEN * bps) / 10_000;
}
