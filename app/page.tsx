'use client';

import React from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  ShieldAlert,
  PlayCircle,
  LayoutDashboard,
  Cpu,
  Zap,
  Lock,
  Radio,
  Activity,
  ArrowRight,
  Waves,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-cyan-600/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-[400px] h-[300px] bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-20 left-10 w-[450px] h-[300px] bg-red-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Hero Section */}
      <section className="relative pt-16 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col items-center text-center">
        {/* Status Pill */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/90 border border-cyan-500/30 text-cyan-300 text-xs font-mono mb-8 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
          <span>Smart India Hackathon (SIH) • Live Acoustic Guard</span>
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-4xl leading-[1.15]">
          Real-Time Voice Deepfake & <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-500">Vishing Fraud Defense</span>
        </h1>

        <p className="mt-6 text-base sm:text-lg text-slate-400 max-w-2xl leading-relaxed">
          Protect financial transactions and live voice calls with edge-based ONNX acoustic inference,
          sub-harmonic vocoder artifact detection, and multi-factor threat scoring.
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/demo"
            className="flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm shadow-[0_0_25px_rgba(6,182,212,0.4)] transition-all transform hover:-translate-y-0.5"
          >
            <PlayCircle className="w-5 h-5" />
            <span>Launch Live Simulator</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold text-sm transition-all"
          >
            <LayoutDashboard className="w-5 h-5 text-cyan-400" />
            <span>Open SOC Command Center</span>
          </Link>
        </div>

        {/* Live Metrics Grid */}
        <div className="mt-16 w-full grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl">
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm">
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-cyan-400">
              &lt; 2.5ms
            </div>
            <div className="text-xs text-slate-400 mt-1 font-medium">Inference Latency</div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm">
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400">
              99.4%
            </div>
            <div className="text-xs text-slate-400 mt-1 font-medium">Synthetic Accuracy</div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm">
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-amber-400">
              100%
            </div>
            <div className="text-xs text-slate-400 mt-1 font-medium">Client Privacy (WASM)</div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm">
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-red-400">
              3-Tier
            </div>
            <div className="text-xs text-slate-400 mt-1 font-medium">Color Risk System</div>
          </div>
        </div>
      </section>

      {/* 3-Tier Color Coded Design System Demonstration */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-900">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-xs font-mono uppercase tracking-widest text-cyan-400 font-bold mb-2">
            Dynamic Visual Threat System
          </h2>
          <h3 className="text-2xl sm:text-3xl font-extrabold text-white">
            Instant Risk Assessment at a Glance
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Verified Card */}
          <div className="p-6 rounded-2xl bg-slate-900/70 border border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.15)] flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <div className="p-2.5 rounded-xl bg-cyan-950/80 border border-cyan-800 text-cyan-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                0 - 34 SCORE
              </span>
            </div>
            <div>
              <h4 className="text-lg font-bold text-cyan-300">Biometric Verified</h4>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Natural vocal tract glottal pulses, biological micro-tremors, and authentic caller ID metadata confirm safe legitimate caller identity.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-800 flex items-center gap-2 text-xs font-mono text-cyan-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>Status: Safe to proceed</span>
            </div>
          </div>

          {/* Suspicious Card */}
          <div className="p-6 rounded-2xl bg-slate-900/70 border border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.15)] flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <div className="p-2.5 rounded-xl bg-amber-950/80 border border-amber-800 text-amber-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                35 - 69 SCORE
              </span>
            </div>
            <div>
              <h4 className="text-lg font-bold text-amber-300">Suspicious Anomaly</h4>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Elevated spectral phase jitter, unnatural silence distribution, or moderate conversational urgency detected. Secondary auth advised.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-800 flex items-center gap-2 text-xs font-mono text-amber-400">
              <Activity className="w-4 h-4" />
              <span>Status: Trigger biometric challenge</span>
            </div>
          </div>

          {/* High-Risk Flagged Card */}
          <div className="p-6 rounded-2xl bg-slate-900/70 border border-red-500/40 shadow-[0_0_25px_rgba(239,68,68,0.2)] flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <div className="p-2.5 rounded-xl bg-red-950/80 border border-red-800 text-red-400">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse">
                70 - 100 SCORE
              </span>
            </div>
            <div>
              <h4 className="text-lg font-bold text-red-400">High-Risk Flagged</h4>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Synthetic neural vocoder fingerprints matched (e.g. ElevenLabs, VITS) combined with active OTP / banking extortion prompts.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-800 flex items-center gap-2 text-xs font-mono text-red-400">
              <Lock className="w-4 h-4" />
              <span>Status: Auto-terminate / Alert SOC</span>
            </div>
          </div>
        </div>
      </section>

      {/* Architecture Deep Dive */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-900">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-xs font-mono uppercase tracking-widest text-cyan-400 font-bold mb-2">
            End-To-End Architecture
          </h2>
          <h3 className="text-2xl sm:text-3xl font-extrabold text-white">
            Multi-Layer Defense Matrix
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-3">
            <div className="p-2.5 rounded-xl bg-slate-800 w-fit text-cyan-400">
              <Cpu className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-100">1. ONNX Runtime WASM</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Runs client-side quantized deep learning models on raw PCM audio frames without network latency.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-3">
            <div className="p-2.5 rounded-xl bg-slate-800 w-fit text-indigo-400">
              <Waves className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-100">2. Acoustic Phase Analyzer</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Detects frequency harmonics, sub-band phase discontinuity, and vocoder synthesis artifacts.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-3">
            <div className="p-2.5 rounded-xl bg-slate-800 w-fit text-amber-400">
              <Zap className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-100">3. Vishing NLP Engine</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Identifies panic induction, OTP extortion, customs clearance fraud, and social engineering patterns in real time.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-3">
            <div className="p-2.5 rounded-xl bg-slate-800 w-fit text-red-400">
              <Radio className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-100">4. Carrier Signaling Heuristics</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Cross-checks VoIP gateway hops, jitter profiles, and caller ID spoofing indicators.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
