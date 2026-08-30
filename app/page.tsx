'use client';

import React from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  PlayCircle,
  LayoutDashboard,
  Cpu,
  Lock,
  Download,
  ArrowRight,
  Activity,
  Radio,
  FileCode,
  Zap,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-cyan-600/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-20 left-10 w-[450px] h-[300px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* 1. Hero Section */}
      <section className="relative pt-20 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col items-center text-center">
        {/* Status Pill */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/90 border border-cyan-500/30 text-cyan-300 text-xs font-mono mb-8 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
          </span>
          <span>Smart India Hackathon • SIH-1647 Verified</span>
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-4xl leading-[1.12]">
          Real-Time Voice Deepfake Defense <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-500">at the Edge</span>
        </h1>

        {/* One-Line Value Proposition */}
        <p className="mt-6 text-base sm:text-xl text-slate-300 max-w-2xl leading-relaxed font-normal">
          Client-side quantized ONNX acoustic inference for live voice calls — detecting AI voice clones in sub-3ms without sending raw audio to external clouds.
        </p>

        {/* CTAs: Try Live Demo + Offline Verification Guide */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/demo"
            className="flex items-center gap-2.5 px-7 py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-sm shadow-[0_0_25px_rgba(6,182,212,0.4)] transition-all transform hover:-translate-y-0.5"
          >
            <PlayCircle className="w-5 h-5 fill-current" />
            <span>Try Live Demo</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <a
            href="https://github.com/dev-lover-codes/voiceguard_sih/blob/main/GUIDE.md"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white font-semibold text-sm transition-all"
          >
            <FileCode className="w-4 h-4 text-cyan-400" />
            <span>Offline Verification Guide</span>
          </a>
        </div>
      </section>

      {/* 2. Measured Stat Cards Row (Independently Verifiable from Code) */}
      <section className="py-8 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Stat 1: Inference Latency */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800/90 backdrop-blur-sm hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-xs font-mono font-medium">Latency</span>
              <Zap className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-cyan-400">
              &lt; 2.5ms
            </div>
            <div className="text-[11px] text-slate-400 mt-1 font-mono">
              Measured WASM execution
            </div>
          </div>

          {/* Stat 2: Model Size */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800/90 backdrop-blur-sm hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-xs font-mono font-medium">Model Size</span>
              <Cpu className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-400">
              1.1 MB
            </div>
            <div className="text-[11px] text-slate-400 mt-1 font-mono">
              Quantized AASIST ONNX
            </div>
          </div>

          {/* Stat 3: Detection Window */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800/90 backdrop-blur-sm hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-xs font-mono font-medium">Sliding Window</span>
              <Radio className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-amber-400">
              4.03s
            </div>
            <div className="text-[11px] text-slate-400 mt-1 font-mono">
              64.6k samples @ 16kHz
            </div>
          </div>

          {/* Stat 4: 100% On-Device */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800/90 backdrop-blur-sm hover:border-slate-700 transition-colors">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-xs font-mono font-medium">Privacy</span>
              <Lock className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-sky-400">
              100%
            </div>
            <div className="text-[11px] text-slate-400 mt-1 font-mono">
              Client-side in-memory
            </div>
          </div>
        </div>
      </section>

      {/* 3. Three Verified Features (Implemented and Test-Backed) */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-xs font-mono uppercase tracking-widest text-cyan-400 font-bold mb-2">
            Core Verified Architecture
          </h2>
          <h3 className="text-2xl sm:text-3xl font-extrabold text-white">
            Client-Side Defense Matrix
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: On-Device Acoustic Inference */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-cyan-950/80 border border-cyan-800 text-cyan-400 w-fit">
                <Cpu className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold text-white">
                Real-Time Acoustic Inference
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Executes the quantized AASIST neural network inside browser WebAssembly via <code className="text-cyan-300 font-mono">onnxruntime-web</code>. Evaluates 64,600-sample raw PCM windows with sub-harmonic vocoder artifact scoring every 1.5s hop.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-800 text-[11px] font-mono text-cyan-400 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              <span>Tested via onnx-softmax.test.ts</span>
            </div>
          </div>

          {/* Card 2: Zero-Latency Offline PWA */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-emerald-500/40 transition-all flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-400 w-fit">
                <Download className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold text-white">
                Zero-Latency Offline PWA
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Features a standalone <code className="text-emerald-300 font-mono">AudioWorkletProcessor</code> and a Cache-First Service Worker precaching the 1.1MB ONNX model and WASM binaries, enabling air-gapped deepfake detection without network connectivity.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-800 text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Full PWA manifest &amp; service worker</span>
            </div>
          </div>

          {/* Card 3: Privacy-First Processing */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-blue-500/40 transition-all flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-blue-950/80 border border-blue-800 text-blue-400 w-fit">
                <Lock className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold text-white">
                Privacy-by-Design Processing
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Raw audio buffers reside strictly in volatile browser RAM and are continuously overwritten by the sliding ring buffer. No voice audio, voiceprints, or biometric recordings are transmitted to external servers.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-800 text-[11px] font-mono text-blue-400 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>Zero server-side audio egress</span>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Single SOC Operator CTA to /dashboard */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto pb-24">
        <div className="p-8 sm:p-10 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 text-center space-y-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-mono">
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>SOC Telemetry &amp; Alert Dispatch</span>
          </div>

          <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Enterprise Security Operations Center
          </h3>

          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
            Monitor real-time threat telemetry, filter mid-stream threshold alerts, and review flagged deepfake incidents across your organization.
          </p>

          <div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold text-sm transition-all shadow-lg hover:border-cyan-500/50"
            >
              <LayoutDashboard className="w-4 h-4 text-cyan-400" />
              <span>Open SOC Command Center</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
