"use client";
// ============================================================
// TreasuryTab + AnalyticsTab
// ============================================================

import { AlertTriangle, CheckCircle, TrendingUp, Shield, Zap, DollarSign } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import type { Policy, Claim, TreasuryState, GlobalStats } from "@/types";
import { formatGEN, formatBPS } from "@/services/api";
import { TreasurySkeleton, StatCardSkeleton } from "@/components/ui/Skeleton";

// ── Shared stat card ──────────────────────────────────────
function StatCard({
  label, value, sub, icon,
}: {
  label:  string;
  value:  string;
  sub?:   string;
  icon?:  React.ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs text-ink-400 mb-1">{label}</p>
          <p className="text-lg sm:text-xl font-bold text-ink-800 truncate leading-tight">{value}</p>
          {sub && <p className="text-xs text-ink-400 mt-0.5">{sub}</p>}
        </div>
        {icon && (
          <div className="w-9 h-9 bg-ink-50 rounded-lg flex items-center justify-center text-ink-400 shrink-0 ml-2">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TREASURY TAB
// ═══════════════════════════════════════════════════════════
export function TreasuryTab({
  treasury,
  loading,
}: {
  treasury: TreasuryState | null;
  loading?: boolean;
}) {
  if (loading || !treasury) {
    return (
      <div>
        <h1 className="text-lg sm:text-xl font-semibold text-ink-900 mb-5 sm:mb-6 tracking-tight">Treasury</h1>
        <TreasurySkeleton />
      </div>
    );
  }

  const solvencyPct = Math.min(
    100,
    (treasury.current_reserve_ratio / Math.max(treasury.target_reserve_ratio, 1)) * 100
  );

  const poolParts = [
    { name: "Liquid pool",       value: Math.max(treasury.liquid_available, 0),  color: "#3b82f6" },
    { name: "Emergency reserve", value: Math.max(treasury.emergency_reserve, 0), color: "#f59e0b" },
    { name: "DAO treasury",      value: Math.max(treasury.dao_treasury, 0),      color: "#8b5cf6" },
  ].filter(p => p.value > 0);

  return (
    <div>
      <h1 className="text-lg sm:text-xl font-semibold text-ink-900 mb-5 sm:mb-6 tracking-tight">Treasury</h1>

      {/* Alerts */}
      {!treasury.is_solvent && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-sm text-red-700">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Treasury undercapitalized</p>
            <p className="text-red-600 text-xs mt-0.5">
              Reserve ratio ({formatBPS(treasury.current_reserve_ratio)}) is below the
              target ({formatBPS(treasury.target_reserve_ratio)}). New payouts may be paused.
            </p>
          </div>
        </div>
      )}
      {treasury.reinsurance_alert && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-sm text-amber-700">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Reinsurance threshold reached</p>
            <p className="text-amber-600 text-xs mt-0.5">
              Total exposure exceeds 75% of pool. Autonomous reinsurance agent has been notified.
            </p>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <StatCard label="Pool balance"       value={formatGEN(treasury.pool_balance)}      icon={<DollarSign className="w-4 h-4" />} />
        <StatCard label="Emergency reserve"  value={formatGEN(treasury.emergency_reserve)} icon={<Shield className="w-4 h-4" />} />
        <StatCard
          label="Total exposure"
          value={formatGEN(treasury.total_exposure)}
          sub={treasury.pool_balance > 0
            ? `${Math.round((treasury.total_exposure / treasury.pool_balance) * 100)}% of pool`
            : undefined}
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <StatCard label="DAO treasury" value={formatGEN(treasury.dao_treasury)} icon={<Zap className="w-4 h-4" />} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
        {/* Solvency */}
        <div className="card p-4 sm:p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-ink-700">Reserve ratio</h2>
            <span className={`flex items-center gap-1.5 text-sm font-semibold ${treasury.is_solvent ? "text-accent-600" : "text-red-600"}`}>
              {treasury.is_solvent
                ? <><CheckCircle className="w-4 h-4" /> Solvent</>
                : <><AlertTriangle className="w-4 h-4" /> Undercapitalized</>}
            </span>
          </div>
          <div className="relative h-3 bg-ink-100 rounded-full mb-2 overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all duration-700 ${treasury.is_solvent ? "bg-accent-500" : "bg-red-500"}`}
              style={{ width: `${solvencyPct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-ink-400 mb-6">
            <span>Current: <strong className="text-ink-600">{formatBPS(treasury.current_reserve_ratio)}</strong></span>
            <span>Target: <strong className="text-ink-600">{formatBPS(treasury.target_reserve_ratio)}</strong></span>
          </div>
          <div className="space-y-2.5 text-sm">
            {[
              { label: "Liquid available", value: formatGEN(treasury.liquid_available) },
              { label: "Loss ratio",       value: formatBPS(treasury.loss_ratio), red: treasury.loss_ratio > 7000 },
              { label: "Total payouts",    value: `${treasury.payout_count} claims` },
            ].map(r => (
              <div key={r.label} className="flex justify-between">
                <span className="text-ink-500">{r.label}</span>
                <span className={`font-medium ${r.red ? "text-red-600" : "text-ink-700"}`}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pie */}
        <div className="card p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-ink-700 mb-2">Pool distribution</h2>
          {poolParts.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={poolParts}
                  cx="50%" cy="50%"
                  innerRadius={55} outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {poolParts.map((p, i) => <Cell key={i} fill={p.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatGEN(v)} />
                <Legend formatter={v => <span className="text-xs text-ink-600">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-ink-300 text-sm">
              No pool data
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ANALYTICS TAB
// ═══════════════════════════════════════════════════════════

const POLICY_COLORS: Record<string, string> = {
  flood:  "#3b82f6",
  crop:   "#22c55e",
  flight: "#8b5cf6",
  cargo:  "#f59e0b",
};

export function AnalyticsTab({
  policies, claims, treasury, stats, loading,
}: {
  policies:  Policy[];
  claims:    Claim[];
  treasury:  TreasuryState | null;
  stats:     GlobalStats | null;
  loading?:  boolean;
}) {
  if (loading) {
    return (
      <div>
        <h1 className="text-lg sm:text-xl font-semibold text-ink-900 mb-5 sm:mb-6 tracking-tight">Analytics</h1>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          {[1,2,3,4].map(i => <StatCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  const approved     = claims.filter(c => c.status === "approved").length;
  const rejected     = claims.filter(c => c.status === "rejected").length;
  const appealed     = claims.filter(c => c.appealed).length;
  const approvalRate = claims.length > 0 ? Math.round((approved / claims.length) * 100) : 0;

  const displayPolicies = stats?.total_policies ?? policies.length;
  const displayClaims   = claims.length;

  const byType = policies.reduce((acc: Record<string, number>, p) => {
    acc[p.policy_type] = (acc[p.policy_type] ?? 0) + 1;
    return acc;
  }, {});

  const typeChartData = Object.entries(byType).map(([type, count]) => ({
    name:  type.charAt(0).toUpperCase() + type.slice(1),
    count,
    fill:  POLICY_COLORS[type] ?? "#94a3b8",
  }));

  const scoreBuckets = [
    { label: "0–29",   count: claims.filter(c => c.evidence_score < 30).length },
    { label: "30–49",  count: claims.filter(c => c.evidence_score >= 30 && c.evidence_score < 50).length },
    { label: "50–69",  count: claims.filter(c => c.evidence_score >= 50 && c.evidence_score < 70).length },
    { label: "70–84",  count: claims.filter(c => c.evidence_score >= 70 && c.evidence_score < 85).length },
    { label: "85–100", count: claims.filter(c => c.evidence_score >= 85).length },
  ];

  return (
    <div>
      <h1 className="text-lg sm:text-xl font-semibold text-ink-900 mb-5 sm:mb-6 tracking-tight">Analytics</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <StatCard label="Total policies"  value={displayPolicies.toLocaleString()} icon={<Shield className="w-4 h-4" />} />
        <StatCard label="Claims filed"    value={displayClaims.toString()}          icon={<TrendingUp className="w-4 h-4" />} />
        <StatCard label="Approval rate"   value={`${approvalRate}%`}                icon={<CheckCircle className="w-4 h-4" />} />
        <StatCard
          label="Loss ratio"
          value={treasury ? formatBPS(treasury.loss_ratio) : "—"}
          icon={<Zap className="w-4 h-4" />}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
        {/* Policy type bar chart */}
        <div className="card p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-ink-700 mb-4">Policy types</h2>
          {typeChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={typeChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" radius={[4,4,0,0]}>
                  {typeChartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-ink-300 text-sm">No policies yet</div>
          )}
        </div>

        {/* Evidence score distribution */}
        <div className="card p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-ink-700 mb-4">Evidence score distribution</h2>
          {claims.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={scoreBuckets} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-ink-300 text-sm">No claims yet</div>
          )}
        </div>
      </div>

      {/* Claim outcome bars */}
      <div className="card p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-ink-700 mb-5">Claim outcomes</h2>
        {claims.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-4">No claims filed yet for this wallet.</p>
        ) : (
          <div className="space-y-4">
            {[
              { label: "Approved", count: approved, color: "bg-accent-500" },
              { label: "Rejected", count: rejected, color: "bg-red-400" },
              { label: "Appealed", count: appealed, color: "bg-purple-400" },
            ].map(row => (
              <div key={row.label}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-ink-600 font-medium">{row.label}</span>
                  <span className="text-ink-500">
                    {row.count}{" "}
                    <span className="text-ink-400 text-xs">
                      ({Math.round((row.count / claims.length) * 100)}%)
                    </span>
                  </span>
                </div>
                <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
                  <div
                    className={`h-2 rounded-full ${row.color} transition-all duration-500`}
                    style={{ width: `${(row.count / claims.length) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
