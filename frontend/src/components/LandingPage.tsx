"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { motion, useScroll, useTransform, useInView } from "framer-motion";
import {
  Shield, Zap, Globe, TrendingUp, ChevronRight,
  Droplets, Wheat, Plane, Anchor, CheckCircle, Clock, Lock, Sparkles,
} from "lucide-react";

const fadeUp = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

const stagger = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.08 } },
};

function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div ref={ref} initial="hidden" animate={inView ? "visible" : "hidden"} variants={fadeUp} transition={{ delay }} className={className}>
      {children}
    </motion.div>
  );
}

function AnimatedCounter({ end, suffix = "" }: { end: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    const duration = 1600;
    const steps = 50;
    const inc = end / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += inc;
      if (current >= end) { setCount(end); clearInterval(timer); }
      else setCount(Math.floor(current));
    }, duration / steps);
    return () => clearInterval(timer);
  }, [end, inView]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

const CATEGORIES = [
  { icon: Droplets, title: "Flood Insurance", description: "Instant payouts when NIHSA confirms flooding displaces residents in your area. No paperwork.", gradient: "from-blue-500 to-cyan-400", light: "bg-blue-50/60 border-blue-100", sources: ["NIHSA", "NiMet", "News sources"], premium: "From 2% of coverage", tag: "Most popular" },
  { icon: Wheat, title: "Crop Failure", description: "Satellite NDVI data from Copernicus confirms your crop failure automatically. Farmers paid in days.", gradient: "from-emerald-500 to-green-400", light: "bg-emerald-50/60 border-emerald-100", sources: ["Copernicus satellite", "NiMet", "Government"], premium: "From 3% of coverage", tag: "Smallholder farmers" },
  { icon: Plane, title: "Flight Delay", description: "FlightAware confirms your delay. Payout hits your wallet before you land.", gradient: "from-violet-500 to-purple-400", light: "bg-violet-50/60 border-violet-100", sources: ["FlightAware", "FlightRadar24"], premium: "From 1.5% of coverage", tag: "Business travel" },
  { icon: Anchor, title: "Port Strike / Cargo", description: "Port authority bulletins and logistics trackers confirm strikes. Cargo owners protected instantly.", gradient: "from-amber-500 to-orange-400", light: "bg-amber-50/60 border-amber-100", sources: ["Port authority", "MarineTraffic", "Reuters"], premium: "From 2.5% of coverage", tag: "Traders & shippers" },
];

const STEPS = [
  { step: "01", title: "Buy a policy", description: "Choose your coverage type, area, and amount. Premium is locked in a transparent on-chain treasury.", icon: Shield },
  { step: "02", title: "Event occurs", description: "A flood, crop failure, flight delay, or port strike happens in your covered area.", icon: Globe },
  { step: "03", title: "File a claim", description: "Submit your claim with 2–5 source URLs. Our contract fetches and scores every source automatically.", icon: Clock },
  { step: "04", title: "AI validators confirm", description: "5 independent LLM validators on GenLayer read the evidence and reach consensus. No humans. No delays.", icon: Zap },
  { step: "05", title: "Instant payout", description: "Confirmed? GEN tokens are transferred to your wallet automatically. Median time: under 10 minutes.", icon: CheckCircle },
];

const SECURITY_FEATURES = [
  { icon: Lock, title: "Domain whitelist", desc: "Only URLs from verified government, satellite, news, weather, and logistics domains are accepted as evidence." },
  { icon: Globe, title: "Multi-source scoring", desc: "A claim needs 70+ evidence points. Government sources score highest (35pts). Single sources can never pass alone." },
  { icon: Shield, title: "25-validator appeals", desc: "Contested claims escalate from 5 → 13 → 25 independent LLM validators. Majority always wins." },
  { icon: Zap, title: "Solvency enforcement", desc: "Every payout checks treasury health first. No single claim can exceed 10% of the pool." },
  { icon: TrendingUp, title: "Prompt injection defence", desc: "Evidence content is wrapped in UNTRUSTED delimiters. LLMs are explicitly told to ignore instructions inside." },
  { icon: CheckCircle, title: "Double-payout prevention", desc: "The paid_out flag is set atomically on-chain before any GEN transfer. Replay attacks are impossible." },
];

export default function LandingPage() {
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 0.15], [0, -40]);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? "bg-white/85 backdrop-blur-xl border-b border-ink-200/60 shadow-premium-sm" : "bg-transparent"}`}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 bg-gradient-to-br from-brand-600 to-brand-800 rounded-xl flex items-center justify-center shadow-glow-brand group-hover:scale-105 transition-transform duration-300">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-ink-900 text-lg tracking-tight">ClaimBot</span>
          </Link>
          <div className="hidden sm:flex items-center gap-6 lg:gap-8 text-sm text-ink-500">
            {["How it works", "Coverage", "Security"].map((label) => (
              <a key={label} href={`#${label.toLowerCase().replace(/\s/g, "-")}`} className="hover:text-ink-900 transition-colors relative group">
                {label}
                <span className="absolute -bottom-1 left-0 w-0 h-px bg-brand-600 group-hover:w-full transition-all duration-300" />
              </a>
            ))}
          </div>
          <Link href="/dashboard" className="btn-primary text-sm">
            Open app <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </motion.nav>

      <section
        className="relative pt-28 sm:pt-36 md:pt-40 pb-16 sm:pb-20 md:pb-24 px-4 sm:px-6 text-center overflow-hidden bg-[#f3ece7]"
        style={{
          backgroundImage: "url('/claimbot.webp')",
          backgroundPosition: "center top",
          backgroundRepeat: "no-repeat",
          backgroundSize: "min(1040px, 115vw) auto",
        }}
      >
        <div className="absolute inset-0 bg-white/70" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/60 via-white/70 to-white" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent" />
        <motion.div style={{ opacity: heroOpacity, y: heroY }} className="relative max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="inline-flex items-center gap-2 bg-white border border-ink-200 rounded-full px-4 py-1.5 text-xs text-ink-600 font-medium mb-7 shadow-premium-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-brand-500" />
            Built on GenLayer
            <span className="w-1 h-1 rounded-full bg-ink-300" />
            <span className="flex items-center gap-1.5 text-accent-600">
              <span className="w-1.5 h-1.5 bg-accent-500 rounded-full animate-pulse-slow" />
              Testnet live
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="text-4xl sm:text-5xl md:text-7xl font-bold text-ink-950 leading-[1.05] mb-5 sm:mb-6 text-balance tracking-tight"
          >
            Insurance that pays out
            <br />
            <span className="text-gradient">automatically.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="text-base sm:text-lg md:text-xl text-ink-500 max-w-2xl mx-auto mb-8 sm:mb-10 text-balance leading-relaxed px-2 sm:px-0"
          >
            Parametric insurance for Nigerian farmers, traders, and travellers.
            No adjusters. No paperwork. AI validators confirm your claim from real web sources
            and transfer your payout in minutes.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col xs:flex-row items-center justify-center gap-3 px-4 sm:px-0"
          >
            <Link href="/dashboard" className="btn-primary text-sm sm:text-base px-5 sm:px-7 py-3 sm:py-3.5 w-full xs:w-auto justify-center">
              Get covered today <ChevronRight className="w-4 h-4" />
            </Link>
            <a href="#how-it-works" className="btn-secondary text-sm sm:text-base px-5 sm:px-7 py-3 sm:py-3.5 w-full xs:w-auto justify-center">
              See how it works
            </a>
          </motion.div>
        </motion.div>
      </section>

      <section className="py-12 sm:py-16 bg-ink-950 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-[0.06]" />
        <div className="max-w-5xl mx-auto px-6 relative">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-50px" }} variants={stagger} className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 text-center text-white">
            {[
              { label: "Policies sold", end: 1240, suffix: "+" },
              { label: "Claims paid", end: 312, suffix: "" },
              { label: "Payout time", end: 8, suffix: " min avg" },
              { label: "Claims approved", end: 94, suffix: "%" },
            ].map((s) => (
              <motion.div key={s.label} variants={fadeUp}>
                <div className="text-3xl sm:text-4xl font-bold text-white mb-1 tabular-nums">
                  <AnimatedCounter end={s.end} suffix={s.suffix} />
                </div>
                <div className="text-sm text-ink-400">{s.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section id="coverage" className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <Reveal className="text-center mb-10 sm:mb-14">
            <p className="section-eyebrow text-center">Coverage</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-ink-950 mb-3 tracking-tight">Built for real risk</h2>
            <p className="text-ink-500 max-w-xl mx-auto">Each policy type uses specific verified data sources to confirm your claim automatically.</p>
          </Reveal>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <motion.div
                  key={cat.title}
                  variants={fadeUp}
                  whileHover={{ y: -6 }}
                  transition={{ type: "spring", stiffness: 300, damping: 24 }}
                  className={`relative rounded-2xl border p-6 ${cat.light} shadow-premium-sm hover:shadow-premium-md transition-shadow duration-300`}
                >
                  {cat.tag && (
                    <span className="inline-block text-2xs font-semibold px-2.5 py-1 bg-white/80 backdrop-blur border border-ink-200/60 rounded-full text-ink-600 mb-4 tracking-wide">
                      {cat.tag}
                    </span>
                  )}
                  <div className={`w-11 h-11 bg-gradient-to-br ${cat.gradient} rounded-xl flex items-center justify-center mb-4 shadow-premium`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="font-semibold text-ink-900 mb-2">{cat.title}</h3>
                  <p className="text-sm text-ink-500 mb-4 leading-relaxed">{cat.description}</p>
                  <div className="space-y-1.5 mb-4">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">Data sources</p>
                    {cat.sources.map(s => (
                      <div key={s} className="flex items-center gap-1.5 text-xs text-ink-500">
                        <CheckCircle className="w-3 h-3 text-accent-500 shrink-0" />
                        {s}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs font-bold text-ink-700 pt-3 border-t border-ink-200/50">{cat.premium}</p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      <section id="how-it-works" className="py-16 sm:py-24 px-4 sm:px-6 bg-gradient-to-b from-ink-50 to-white">
        <div className="max-w-5xl mx-auto">
          <Reveal className="text-center mb-16">
            <p className="section-eyebrow text-center">Process</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-ink-950 mb-3 tracking-tight">How it works</h2>
            <p className="text-ink-500">From policy purchase to payout — fully on-chain.</p>
          </Reveal>

          <div className="relative">
            <div className="absolute left-8 top-8 bottom-8 w-px bg-gradient-to-b from-brand-200 via-ink-200 to-transparent hidden md:block" />
            <div className="space-y-8">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <Reveal key={s.step} delay={i * 0.08}>
                    <div className="flex gap-6 items-start group">
                      <motion.div
                        whileHover={{ scale: 1.08, rotate: 4 }}
                        transition={{ type: "spring", stiffness: 400, damping: 20 }}
                        className="relative z-10 w-12 h-12 sm:w-16 sm:h-16 bg-white border-2 border-brand-100 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 shadow-premium group-hover:border-brand-300 group-hover:shadow-glow-brand transition-all duration-300"
                      >
                        <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-brand-600" />
                      </motion.div>
                      <div className="pt-3.5">
                        <div className="text-xs font-mono text-ink-400 mb-1 tracking-wider">STEP {s.step}</div>
                        <h3 className="font-semibold text-ink-900 mb-1.5 text-lg">{s.title}</h3>
                        <p className="text-sm text-ink-500 leading-relaxed">{s.description}</p>
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="security" className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <Reveal className="text-center mb-10 sm:mb-14">
            <p className="section-eyebrow text-center">Security</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-ink-950 mb-3 tracking-tight">Built to resist fraud</h2>
            <p className="text-ink-500 max-w-xl mx-auto">Every layer of the system is hardened against manipulation — from evidence to payouts.</p>
          </Reveal>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="grid md:grid-cols-3 gap-5">
            {SECURITY_FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <motion.div key={f.title} variants={fadeUp} whileHover={{ y: -4 }} className="card p-5 hover:shadow-premium-md transition-shadow duration-300">
                  <div className="w-9 h-9 bg-brand-50 rounded-lg flex items-center justify-center mb-3.5">
                    <Icon className="w-4.5 h-4.5 text-brand-600" />
                  </div>
                  <h3 className="font-semibold text-ink-900 mb-1.5 text-sm">{f.title}</h3>
                  <p className="text-xs text-ink-500 leading-relaxed">{f.desc}</p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      <section className="py-16 sm:py-24 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-600 via-brand-700 to-violet-800" />
        <div className="absolute inset-0 bg-grid opacity-[0.08]" />
        <motion.div
          className="absolute -top-20 -right-20 w-96 h-96 bg-white/10 rounded-full blur-3xl"
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <Reveal className="max-w-3xl mx-auto text-center text-white relative">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 tracking-tight">Start protecting what matters</h2>
          <p className="text-brand-100 mb-6 sm:mb-8 text-base sm:text-lg">Buy your first policy in under 2 minutes. Premiums start at 1.5% of coverage.</p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 bg-white text-brand-700 font-semibold px-8 py-3.5 rounded-xl hover:bg-brand-50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-premium-lg"
          >
            Open ClaimBot app <ChevronRight className="w-4 h-4" />
          </Link>
        </Reveal>
      </section>

      <footer className="py-12 px-6 bg-ink-950 text-ink-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-brand-600 rounded-lg flex items-center justify-center">
              <Shield className="w-3 h-3 text-white" />
            </div>
            <span className="text-white font-medium text-sm">ClaimBot</span>
            <span className="text-xs">— Parametric Insurance on GenLayer</span>
          </div>
          <div className="flex items-center gap-6 text-xs">
            <a href="https://genlayer.com" className="hover:text-white transition-colors" target="_blank" rel="noreferrer">GenLayer</a>
            <a href="https://docs.genlayer.com" className="hover:text-white transition-colors" target="_blank" rel="noreferrer">Docs</a>
            <a href="https://genlayer.foundation/grants" className="hover:text-white transition-colors" target="_blank" rel="noreferrer">Grants</a>
            <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
          </div>
          <div className="text-xs">© {new Date().getFullYear()} ClaimBot. Testnet only — not financial advice.</div>
        </div>
      </footer>
    </div>
  );
}
