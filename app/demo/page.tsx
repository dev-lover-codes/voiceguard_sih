'use client';

import React, { useState, useCallback } from 'react';
import { LiveCallMonitor } from '@/components/LiveCallMonitor';
import { RiskGauge } from '@/components/RiskGauge';
import { RiskTimeline, TimelineDataPoint } from '@/components/RiskTimeline';
import { ConfidenceBreakdown } from '@/components/ConfidenceBreakdown';
import { PrivacyPanel, InferenceMode } from '@/components/PrivacyPanel';
import { WindowRiskResult, getOrLoadOnnxSession, logitsToRiskScore, downsampleTo16k } from '@/lib/onnx-inference';
import { SmoothedRiskEvaluation } from '@/lib/risk-scoring';
import { AlertEvent } from '@/types';
import Link from 'next/link';
import {
  Sparkles,
  Bell,
  Smartphone,
  Laptop,
  FlaskConical,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// DEV-ONLY model self-test helpers
// Remove this block (and the <ModelSelfTest> component below) before final
// submission. It is guarded behind process.env.NODE_ENV so it tree-shakes out
// of production builds automatically.
// ---------------------------------------------------------------------------

/** Fetches a WAV file, decodes PCM via AudioContext, and returns a 16 kHz Float32Array. */
async function loadWavAs16kPcm(url: string): Promise<Float32Array> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status} ${resp.statusText}`);
  const arrayBuffer = await resp.arrayBuffer();

  // AudioContext.decodeAudioData handles WAV, MP3, OGG, FLAC — whatever the browser supports.
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  await ctx.close();

  // Mix all channels to mono
  const numCh = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const mono = new Float32Array(length);
  for (let ch = 0; ch < numCh; ch++) {
    const chData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) mono[i] += chData[i] / numCh;
  }

  // Resample to 16 kHz if needed
  return downsampleTo16k(mono, audioBuffer.sampleRate);
}

/** Scores a 16kHz PCM buffer using the loaded ONNX session (or heuristic fallback). */
async function scoreBuffer(pcm16k: Float32Array): Promise<{ riskScore: number; modelUsed: boolean }> {
  const WINDOW = 64600;
  // Use the first full window; pad with zeros if the file is shorter.
  const window = new Float32Array(WINDOW);
  window.set(pcm16k.slice(0, WINDOW));

  const session = await getOrLoadOnnxSession();
  if (!session) {
    return { riskScore: -1, modelUsed: false }; // no model loaded
  }

  const ort = await import('onnxruntime-web');
  const inputTensor = new ort.Tensor('float32', window, [1, WINDOW]);
  const inputName = session.inputNames[0] || 'audio_input';
  const results = await session.run({ [inputName]: inputTensor });
  const outputName = session.outputNames[0] || 'spoof_score';
  const outputData = results[outputName]?.data;

  if (outputData && outputData.length >= 2) {
    return { riskScore: logitsToRiskScore(outputData), modelUsed: true };
  }
  return { riskScore: -1, modelUsed: false };
}

type SelfTestState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; genuineScore: number; clonedScore: number; passed: boolean; modelUsed: boolean }
  | { status: 'error'; message: string };

export default function DemoPage() {
  const [currentSmoothedScore, setCurrentSmoothedScore] = useState<number>(14);
  const [currentConfidence, setCurrentConfidence] = useState<number>(0.85);
  const [currentLabel, setCurrentLabel] = useState<'human' | 'synthetic' | 'uncertain'>('human');
  const [currentLatencyMs, setCurrentLatencyMs] = useState<number>(2.4);
  const [currentActionLabel, setCurrentActionLabel] = useState<string>('likely human, proceed');
  const [sessionAlerts, setSessionAlerts] = useState<AlertEvent[]>([]);
  const [inferenceMode, setInferenceMode] = useState<InferenceMode>('on_device');

  // ---- DEV-ONLY: model self-test state (remove before final submission) ----
  const [selfTest, setSelfTest] = useState<SelfTestState>({ status: 'idle' });

  const runSelfTest = useCallback(async () => {
    setSelfTest({ status: 'running' });
    try {
      // 1. Load both WAV fixtures as 16 kHz PCM
      const [genuinePcm, clonedPcm] = await Promise.all([
        loadWavAs16kPcm('/samples/genuine_voice.wav'),
        loadWavAs16kPcm('/samples/cloned_voice.wav'),
      ]);

      // 2. Score each through a full 64,600-sample ONNX window
      const [genuineResult, clonedResult] = await Promise.all([
        scoreBuffer(genuinePcm),
        scoreBuffer(clonedPcm),
      ]);

      const { riskScore: genuineScore, modelUsed } = genuineResult;
      const { riskScore: clonedScore } = clonedResult;

      // 3. console.table the results for easy inspection
       
      console.table([
        { file: 'genuine_voice.wav', riskScore: genuineScore, expected: '< cloned', modelUsed },
        { file: 'cloned_voice.wav',  riskScore: clonedScore,  expected: '> genuine', modelUsed },
      ]);

      // 4. Assert genuine < cloned
      const passed = genuineScore !== -1 && clonedScore !== -1 && genuineScore < clonedScore;

      if (!passed) {
         
        console.error(
          '[VoiceGuard SELF-TEST FAILED]',
          `genuine riskScore=${genuineScore}, cloned riskScore=${clonedScore}.`,
          'Check model file path and softmax logic before demoing to judges.',
        );
      } else {
         
        console.info('[VoiceGuard SELF-TEST PASSED] genuine <', clonedScore, '/ cloned >', genuineScore);
      }

      setSelfTest({ status: 'done', genuineScore, clonedScore, passed, modelUsed });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
       
      console.error('[VoiceGuard SELF-TEST ERROR]', message);
      setSelfTest({ status: 'error', message });
    }
  }, []);
  // ---- end DEV-ONLY block ----

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

      {/* Privacy & Regulatory Architecture Panel */}
      <PrivacyPanel
        inferenceMode={inferenceMode}
        onModeChange={setInferenceMode}
      />

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

      {/* ------------------------------------------------------------------ */}
      {/* DEV-ONLY: Model Self-Test Panel                                     */}
      {/* ⚠️  REMOVE THIS ENTIRE BLOCK BEFORE FINAL SUBMISSION  ⚠️           */}
      {/* ------------------------------------------------------------------ */}
      {process.env.NODE_ENV === 'development' && (
        <div className="p-5 bg-violet-950/30 backdrop-blur-md rounded-2xl border border-violet-700/50 shadow-xl space-y-4">
          {/* Panel header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-violet-900/60 border border-violet-700 text-violet-300">
                <FlaskConical className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-violet-200 flex items-center gap-2">
                  Model Self-Test
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-violet-900 border border-violet-700 text-violet-400">
                    DEV ONLY
                  </span>
                </h3>
                <p className="text-[11px] text-violet-400 mt-0.5">
                  Scores <code className="font-mono text-violet-300">genuine_voice.wav</code> and{' '}
                  <code className="font-mono text-violet-300">cloned_voice.wav</code> through a full ONNX window.
                  Genuine must score <strong>lower</strong> than cloned.
                </p>
              </div>
            </div>

            <button
              onClick={() => { void runSelfTest(); }}
              disabled={selfTest.status === 'running'}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                         bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed
                         text-white shadow-lg shadow-violet-900/50 transition-all active:scale-95"
            >
              {selfTest.status === 'running' ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Running…</>
              ) : (
                <><FlaskConical className="w-4 h-4" /> Run Model Self-Test</>
              )}
            </button>
          </div>

          {/* Result: error */}
          {selfTest.status === 'error' && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-950/50 border border-red-700 text-red-300 text-sm">
              <XCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-400" />
              <div>
                <p className="font-bold text-red-300 mb-1">Self-test crashed</p>
                <p className="font-mono text-xs text-red-400 break-all">{selfTest.message}</p>
                <p className="text-xs text-red-500 mt-1">Check that /samples/*.wav exist and the model is loaded.</p>
              </div>
            </div>
          )}

          {/* Result: done */}
          {selfTest.status === 'done' && (
            <div className="space-y-3">
              {/* Pass / Fail banner */}
              {selfTest.passed ? (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-950/50 border border-emerald-700 text-emerald-300 text-sm">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
                  <div>
                    <span className="font-bold">Self-test PASSED</span>
                    <span className="text-emerald-400 ml-2 text-xs">
                      genuine ({selfTest.genuineScore}/100) &lt; cloned ({selfTest.clonedScore}/100)
                    </span>
                    {!selfTest.modelUsed && (
                      <span className="ml-2 text-yellow-400 text-xs">(⚠ ONNX model not loaded — heuristic scores, load the real model!)</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-red-950/50 border border-red-700">
                  <XCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-400" />
                  <div>
                    <p className="font-bold text-red-300 text-sm">
                      Model self-test FAILED — check model file and softmax logic before demoing to judges
                    </p>
                    <p className="text-xs text-red-400 mt-1">
                      genuine riskScore = <strong className="text-red-300">{selfTest.genuineScore}</strong>
                      {' '}is NOT lower than cloned riskScore = <strong className="text-red-300">{selfTest.clonedScore}</strong>.
                      Verify the ONNX model at <code className="font-mono">/models/aasist_baseline.onnx</code> and the
                      softmax index convention (index 0 = spoof, index 1 = bonafide).
                    </p>
                  </div>
                </div>
              )}

              {/* Score table */}
              <div className="overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-800/60 text-slate-400">
                      <th className="text-left px-4 py-2 font-semibold">File</th>
                      <th className="text-center px-4 py-2 font-semibold">Risk Score</th>
                      <th className="text-center px-4 py-2 font-semibold">Expected</th>
                      <th className="text-center px-4 py-2 font-semibold">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-slate-800 hover:bg-slate-800/30">
                      <td className="px-4 py-2.5 text-slate-300">genuine_voice.wav</td>
                      <td className="px-4 py-2.5 text-center text-emerald-400 font-bold">{selfTest.genuineScore}/100</td>
                      <td className="px-4 py-2.5 text-center text-slate-500">&lt; {selfTest.clonedScore}</td>
                      <td className="px-4 py-2.5 text-center">
                        {selfTest.genuineScore < selfTest.clonedScore
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" />
                          : <XCircle className="w-4 h-4 text-red-400 mx-auto" />}
                      </td>
                    </tr>
                    <tr className="border-t border-slate-800 hover:bg-slate-800/30">
                      <td className="px-4 py-2.5 text-slate-300">cloned_voice.wav</td>
                      <td className="px-4 py-2.5 text-center text-red-400 font-bold">{selfTest.clonedScore}/100</td>
                      <td className="px-4 py-2.5 text-center text-slate-500">&gt; {selfTest.genuineScore}</td>
                      <td className="px-4 py-2.5 text-center">
                        {selfTest.clonedScore > selfTest.genuineScore
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" />
                          : <XCircle className="w-4 h-4 text-red-400 mx-auto" />}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-[10px] text-violet-500 text-right">
                {selfTest.modelUsed ? '✓ Real ONNX model was used' : '⚠ Heuristic fallback — load ONNX model!'} • Open DevTools console for full output
              </p>
            </div>
          )}

          {/* Removal reminder */}
          <p className="text-[10px] text-violet-600/70 border-t border-violet-800/40 pt-3">
            ⚠️ Remove this entire panel from <code className="font-mono">app/demo/page.tsx</code> before final submission.
          </p>
        </div>
      )}
      {/* ------------------------------------------------------------------ */}
      {/* END DEV-ONLY self-test panel                                        */}
      {/* ------------------------------------------------------------------ */}
    </div>
  );
}
