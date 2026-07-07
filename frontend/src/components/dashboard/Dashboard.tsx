"use client";

import { useState } from "react";
import { Shield, RefreshCw, X, CheckCircle, AlertCircle, Info, AlertTriangle, Menu } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useClaimBot } from "@/hooks/useClaimBot";
import PoliciesTab    from "./PoliciesTab";
import FileClaimTab   from "./FileClaimTab";
import TreasuryTab    from "./TreasuryTab";
import AnalyticsTab   from "./AnalyticsTab";
import type { Notification } from "@/types";

type Tab = "policies" | "file-claim" | "treasury" | "analytics";

function Toast({ notif, onDismiss }: { notif: Notification; onDismiss: () => void }) {
  const styles = {
    success: "bg-accent-50 border-accent-100 text-accent-700",
    error:   "bg-red-50    border-red-100    text-red-700",
    warning: "bg-amber-50  border-amber-100  text-amber-700",
    info:    "bg-blue-50   border-blue-100   text-blue-700",
  };
  const icons = {
    success: <CheckCircle   className="w-4 h-4 shrink-0" />,
    error:   <AlertCircle   className="w-4 h-4 shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 shrink-0" />,
    info:    <Info          className="w-4 h-4 shrink-0" />,
  };
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.9, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-premium-lg text-sm w-[calc(100vw-2rem)] max-w-sm backdrop-blur-sm ${styles[notif.type]}`}
    >
      {icons[notif.type]}
      <span className="flex-1 min-w-0 break-words">{notif.message}</span>
      <button onClick={onDismiss} className="opacity-60 hover:opacity-100 mt-0.5 transition-opacity shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

export default function Dashboard() {
  const [tab,         setTab]         = useState<Tab>("policies");
  const [wallet,      setWallet]      = useState("");
  const [mobileMenu,  setMobileMenu]  = useState(false);
  const [walletOpen,  setWalletOpen]  = useState(false);

  const {
    policies, activePolicies, historicPolicies,
    claims, templates, treasury, stats,
    loading, notifs, notify, dismissNotif,
    refresh, watchClaim, claimsForPolicy,
  } = useClaimBot(wallet);

  const TABS: { id: Tab; label: string }[] = [
    { id: "policies",   label: activePolicies.length ? `Policies (${activePolicies.length})` : "My Policies" },
    { id: "file-claim", label: "File a Claim" },
    { id: "treasury",   label: "Treasury" },
    { id: "analytics",  label: "Analytics" },
  ];

  return (
    <div className="min-h-screen bg-ink-50">

      {/* ── Toasts ────────────────────────────────────────── */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {notifs.map(n => (
            <div key={n.id} className="pointer-events-auto">
              <Toast notif={n} onDismiss={() => dismissNotif(n.id)} />
            </div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Header ────────────────────────────────────────── */}
      <header className="bg-white/90 backdrop-blur-xl border-b border-ink-200/70 sticky top-0 z-40">

        {/* Top bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14 sm:h-16 gap-3">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-brand-600 to-brand-800 rounded-xl flex items-center justify-center shadow-glow-brand">
              <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
            </div>
            <span className="font-semibold text-ink-900 text-base sm:text-lg tracking-tight">ClaimBot</span>
            <span className="badge badge-amber hidden xs:inline-flex">Testnet</span>
          </Link>

          {/* Desktop: wallet input + refresh */}
          <div className="hidden md:flex items-center gap-2 flex-1 max-w-md justify-end">
            <div className="relative flex-1 max-w-xs">
              <input
                className="w-full text-sm border border-ink-200 rounded-xl px-3 py-2 font-mono bg-white shadow-inner-soft
                           focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 outline-none pr-7
                           text-ink-600 placeholder:text-ink-300 transition-all duration-200"
                placeholder="0x wallet address..."
                value={wallet}
                onChange={e => setWallet(e.target.value.trim())}
              />
              {wallet && (
                <button
                  onClick={() => setWallet("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-500 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button onClick={refresh} disabled={loading} className="btn-secondary py-2 shrink-0">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden lg:inline">{loading ? "Loading" : "Refresh"}</span>
            </button>
          </div>

          {/* Mobile: wallet icon + hamburger */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setWalletOpen(o => !o)}
              className={`btn-ghost p-2 ${wallet ? "text-brand-600" : ""}`}
              title="Set wallet"
            >
              <Shield className="w-4 h-4" />
            </button>
            <button
              onClick={refresh}
              disabled={loading}
              className="btn-ghost p-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setMobileMenu(o => !o)}
              className="btn-ghost p-2"
            >
              {mobileMenu ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile wallet input (collapsible) */}
        <AnimatePresence>
          {walletOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden md:hidden border-t border-ink-100"
            >
              <div className="px-4 py-3 flex gap-2">
                <div className="relative flex-1">
                  <input
                    className="w-full text-sm border border-ink-200 rounded-xl px-3 py-2.5 font-mono bg-white
                               focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 outline-none pr-7
                               text-ink-600 placeholder:text-ink-300"
                    placeholder="0x wallet address..."
                    value={wallet}
                    onChange={e => setWallet(e.target.value.trim())}
                    autoFocus
                  />
                  {wallet && (
                    <button
                      onClick={() => setWallet("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setWalletOpen(false)}
                  className="btn-primary py-2.5 px-3 shrink-0 text-xs"
                >
                  Done
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Desktop tabs */}
        <div className="hidden md:flex max-w-7xl mx-auto px-6 relative overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative px-4 lg:px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors duration-200 ${
                tab === t.id ? "text-brand-600" : "text-ink-500 hover:text-ink-800"
              }`}
            >
              {t.label}
              {tab === t.id && (
                <motion.div
                  layoutId="tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 rounded-full"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Mobile nav menu (hamburger) */}
        <AnimatePresence>
          {mobileMenu && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden md:hidden border-t border-ink-100"
            >
              <div className="px-4 py-2 grid grid-cols-2 gap-2">
                {TABS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setTab(t.id); setMobileMenu(false); }}
                    className={`py-2.5 px-3 rounded-xl text-sm font-medium text-left transition-all ${
                      tab === t.id
                        ? "bg-brand-50 text-brand-700 border border-brand-100"
                        : "text-ink-600 hover:bg-ink-50"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {wallet && (
                <p className="px-4 pb-3 text-xs text-ink-400 font-mono truncate">
                  {wallet.slice(0, 20)}...
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── Content ───────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-8">
        {!wallet && tab !== "treasury" && tab !== "analytics" && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 p-3.5 sm:p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700 flex items-start sm:items-center gap-2"
          >
            <Info className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              <span className="font-medium">Tap the shield icon</span>
              <span className="hidden sm:inline"> or use the wallet field above</span>
              {" "}to enter your wallet address and see your data.
            </span>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            {tab === "policies" && (
              <PoliciesTab
                activePolicies={activePolicies}
                historicPolicies={historicPolicies}
                templates={templates}
                wallet={wallet}
                claimsForPolicy={claimsForPolicy}
                notify={notify}
                onRefresh={refresh}
                watchClaim={watchClaim}
                loading={loading}
              />
            )}
            {tab === "file-claim" && (
              <FileClaimTab
                activePolicies={activePolicies}
                wallet={wallet}
                notify={notify}
                onRefresh={refresh}
                watchClaim={watchClaim}
              />
            )}
            {tab === "treasury" && (
              <TreasuryTab treasury={treasury} loading={loading} />
            )}
            {tab === "analytics" && (
              <AnalyticsTab policies={policies} claims={claims} treasury={treasury} stats={stats} loading={loading} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
