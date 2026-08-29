'use client';

import React, { useState, useCallback } from 'react';
import { LiveCallMonitor } from '@/components/LiveCallMonitor';
import { RiskGauge } from '@/components/RiskGauge';
import { RiskTimeline, TimelineDataPoint } from '@/components/RiskTimeline';
import { ConfidenceBreakdown } from '@/components/ConfidenceBreakdown';
import { WindowRiskResult } from '@/lib/onnx-inference';
import { SmoothedRiskEvaluation } from '@/lib/risk-scoring';
import { AlertEvent } from '@/types';
import Link from 'next/link';
import {
  Sparkles,
  Bell,
  Smartphone,
  Laptop,
} from 'lucide-react';

export default function DemoPage() {
  const [currentSmoothedScore, setCurrentSmoothedScore] = useState<number>(14);
  const [currentConfidence, setCurrentConfidence] = useState<number>(0.85);
  const [currentLabel, setCurrentLabel] = useState<'human' | 'synthetic' | 'uncertain'>('human');
  const [currentLatencyMs, setCurrentLatencyMs] = useState<number>(2.4);
  const [currentActionLabel, setCurrentActionLabel] = useState<string>('likely human, proceed');
  const [sessionAlerts, setSessionAlerts] = useState<AlertEvent[]>([]);

  // Timeline data capped at 30 points (approx 45 seconds of rolling history)
  const [timelineData, setTimelineData] = useState<TimelineDataPoint[]>([
    { time: '00:00', second: 0, smoothedScore: 14, rawScore: 12 },
  ]);

  // Handler for every 1.5s window score from LiveCallMonitor
  const handleScoreUpdate = useCallback(
    (windowResult: WindowRiskResult, evalResult: SmoothedRiskEvaluation) => {
      setCurrentSmoothedScore(evalResult.smoothedScore);
      setCurrentConfidence(windowResult.confidence);
      setCurrentLabel(windowResult.label);
      setCurrentLatencyMs(windowResult.inferenceLatencyMs);
      setCurrentActionLabel(evalResult.actionLabel);

      const sec = Math.floor(windowResult.windowStartMs / 1000);
      const mins = Math.floor(sec / 60).toString().padStart(2, '0');
      const secs = (sec % 60).toString().padStart(2, '0');

      setTimelineData((prev) => {
        const next = [
          ...prev,
          {
            time: `${mins}:${secs}`,
            second: sec,
            smoothedScore: evalResult.smoothedScore,
            rawScore: windowResult.riskScore,
          },
        ];
        // Cap at 30 points to prevent memory leakage during continuous live judging sessions
        return next.slice(-30);
      });
    },
    []
  );

  // Handler for mid-stream threshold breach alerts
  const handleAlertTriggered = useCallback((alert: AlertEvent) => {
    setSessionAlerts((prev) => [alert, ...prev.slice(0, 15)]);
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Sparkles className="w-7 h-7 text-cyan-400" />
            Live Voice Deepfake & Anti-Spoofing Monitor
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time AudioWorklet PCM streaming resampled to 16kHz • 64.6k sample sliding windows with EMA smoothing
          </p>
        </div>

        {/* Demo Mode Navigation & WASM status */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <span className="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40 shadow-sm">
              Single Device
            </span>
            <Link
              href="/demo/caller"
              className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Caller Phone</span>
            </Link>
            <Link
              href="/demo/receiver"
              className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              <Laptop className="w-3.5 h-3.5" />
              <span>Receiver Screen</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Grid Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): LiveCallMonitor (Source picker, start button, live waveform) & RiskTimeline */}
        <div className="lg:col-span-7 space-y-6">
          <LiveCallMonitor
            onScoreUpdate={handleScoreUpdate}
            onAlertTriggered={handleAlertTriggered}
          />

          {/* Rolling Smoothed Risk Timeline (Capped at 30 points) */}
          <RiskTimeline
            data={timelineData}
            currentScore={currentSmoothedScore}
            highRiskThreshold={80}
            suspiciousThreshold={50}
          />
        </div>

        {/* Right Column (5 cols): Live Gauge & Confidence Breakdown */}
        <div className="lg:col-span-5 space-y-6">
          {/* Live Smoothed Gauge */}
          <RiskGauge
            score={currentSmoothedScore}
            latencyMs={currentLatencyMs}
            subtext={`Recommended action: ${currentActionLabel}`}
            size="lg"
            highRiskThreshold={80}
            suspiciousThreshold={50}
          />

          {/* Indicative Contributing Factors */}
          <ConfidenceBreakdown
            score={currentSmoothedScore}
            confidence={currentConfidence}
            label={currentLabel}
          />
        </div>
      </div>

      {/* Mid-Stream Session Threat Audit Feed */}
      {sessionAlerts.length > 0 && (
        <div className="p-5 bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-red-950/60 border border-red-800 text-red-400">
                <Bell className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-slate-200">
                Live Mid-Stream Alerts Log ({sessionAlerts.length})
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Triggered immediately upon threshold boundary crossing
            </span>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
            {sessionAlerts.map((alt) => (
              <div
                key={alt.id}
                className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
                  <span className="font-mono text-slate-400">{alt.snippetTime}</span>
                  <span className="font-bold text-slate-200">{alt.title}</span>
                  <span className="text-slate-400 hidden sm:inline">• {alt.description}</span>
                </div>

                <span className="font-mono text-red-400 font-bold px-2 py-0.5 rounded bg-red-950/60 border border-red-900">
                  {alt.riskScore}/100
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
