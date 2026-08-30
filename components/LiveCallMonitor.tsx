'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Play,
  Square,
  Upload,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Volume2,
  Clock,
  Radio,
  Sparkles,
  FileAudio,
  X,
  PhoneCall,
  CheckCircle2,
  MessageSquare,
  TriangleAlert,
} from 'lucide-react';
import { StreamingDetector, WindowRiskResult } from '@/lib/onnx-inference';
import { StreamingRiskScorer, SmoothedRiskEvaluation, computeCompositeRisk, evaluateKeywords } from '@/lib/risk-scoring';
import { computePhaseArtifactsScore } from '@/lib/prosody-analysis';
import {
  isSpeechRecognitionSupported,
  createSpeechRecognizer,
  SpeechRecognizerController,
} from '@/lib/speech-recognition';
import { ThrottledRiskLogger } from '@/lib/supabase-client';
import { AlertEvent } from '@/types';
import { formatTime } from '@/lib/utils';

export interface LiveCallMonitorProps {
  initialSource?: 'mic' | 'sample';
  hideSourceToggle?: boolean;
  onScoreUpdate?: (result: WindowRiskResult, evalResult: SmoothedRiskEvaluation) => void;
  onAlertTriggered?: (alert: AlertEvent) => void;
}

export const LiveCallMonitor: React.FC<LiveCallMonitorProps> = ({
  initialSource,
  hideSourceToggle,
  onScoreUpdate,
  onAlertTriggered,
}) => {
  // Source State: 'mic' | 'sample'
  const [selectedSource, setSelectedSource] = useState<'mic' | 'sample'>(initialSource || 'sample');
  const [sampleUrl, setSampleUrl] = useState<string>('/samples/cloned_voice.wav');
  const [sampleName, setSampleName] = useState<string>('AI-Cloned Voice (High-Risk Deepfake)');
  const [isMonitoring, setIsMonitoring] = useState<boolean>(false);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [activeAlert, setActiveAlert] = useState<AlertEvent | null>(null);
  const [waveformBars, setWaveformBars] = useState<number[]>(() => Array.from({ length: 32 }, () => 15));
  const [currentSmoothed, setCurrentSmoothed] = useState<number>(15);
  const [currentTier, setCurrentTier] = useState<'LOW' | 'SUSPICIOUS' | 'HIGH_RISK'>('LOW');

  // Multi-factor scoring state
  const [compositeScore, setCompositeScore] = useState<number>(15);
  const [transcript, setTranscript] = useState<string>('');
  const [flaggedKeywords, setFlaggedKeywords] = useState<string[]>([]);
  const [urgencyScore, setUrgencyScore] = useState<number>(0);
  const [prosodyScore, setProsodyScore] = useState<number>(50); // 50 = neutral until first window

  // Web Speech API STT State
  const [isSttActive, setIsSttActive] = useState<boolean>(false);
  const [isSttSupported] = useState<boolean>(() => isSpeechRecognitionSupported());
  const recognizerRef = useRef<SpeechRecognizerController | null>(null);

  // Holds the most recent 64,600-sample PCM window for prosody analysis
  const lastPcmWindowRef = useRef<Float32Array | null>(null);
  const transcriptRef = useRef<string>('');

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    if (!isSttSupported) return;

    const recognizer = createSpeechRecognizer({
      onTranscript: (text: string) => {
        setTranscript(text);
        transcriptRef.current = text;
        const kw = evaluateKeywords(text);
        setFlaggedKeywords(kw.flagged);
        setUrgencyScore(kw.urgencyScore);
      },
      onStateChange: (listening: boolean) => {
        setIsSttActive(listening);
      },
    });

    recognizerRef.current = recognizer;

    return () => {
      recognizer.stop();
      recognizerRef.current = null;
    };
  }, [isSttSupported]);

  const toggleStt = () => {
    if (!recognizerRef.current) return;
    if (isSttActive) {
      recognizerRef.current.stop();
      setIsSttActive(false);
    } else {
      recognizerRef.current.start();
      setIsSttActive(true);
    }
  };

  // Unified Pipeline Refs
  const detectorRef = useRef<StreamingDetector | null>(null);
  const scorerRef = useRef<StreamingRiskScorer | null>(null);
  const loggerRef = useRef<ThrottledRiskLogger | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Hidden audio element for "Play a sample call" mode
  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.crossOrigin = 'anonymous';
    audioElementRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
      audioElementRef.current = null;
    };
  }, []);

  // Scorer initialization
  useEffect(() => {
    const scorer = new StreamingRiskScorer('LIVE-CALL-STREAM', {
      alpha: 0.35,
      highRiskThreshold: 80,
      suspiciousThreshold: 50,
    });

    scorer.onAlert((alert) => {
      setActiveAlert(alert);
      if (onAlertTriggered) onAlertTriggered(alert);
    });

    scorerRef.current = scorer;
  }, [onAlertTriggered]);

  // Elapsed timer ticker
  useEffect(() => {
    if (!isMonitoring) return;
    const interval = setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isMonitoring]);

  // Real-time audio waveform visualizer loop
  useEffect(() => {
    if (!isMonitoring) return;

    const updateWaveform = () => {
      if (detectorRef.current) {
        const freqData = detectorRef.current.getFrequencyData();
        if (freqData && freqData.length > 0) {
          const step = Math.floor(freqData.length / 32) || 1;
          const bars: number[] = [];
          for (let i = 0; i < 32; i++) {
            const val = freqData[i * step] || 0;
            bars.push(Math.max(12, Math.min(95, Math.floor((val / 255) * 100))));
          }
          setWaveformBars(bars);
        }
      }
      animFrameRef.current = requestAnimationFrame(updateWaveform);
    };

    animFrameRef.current = requestAnimationFrame(updateWaveform);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isMonitoring]);

  // Stop monitoring cleanly
  const stopMonitoring = async () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (detectorRef.current) {
      await detectorRef.current.stop();
      detectorRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    if (audioElementRef.current) {
      audioElementRef.current.pause();
    }

    if (recognizerRef.current) {
      recognizerRef.current.stop();
      setIsSttActive(false);
    }

    if (loggerRef.current) {
      loggerRef.current.flush(currentSmoothed, 0.90, currentTier === 'HIGH_RISK' ? 'synthetic' : 'human');
    }

    setIsMonitoring(false);
  };

  // Start monitoring: feeds both Mic and MediaElement through the EXACT SAME pipeline
  const startMonitoring = async () => {
    try {
      if (isMonitoring) {
        await stopMonitoring();
      }

      setElapsedSec(0);
      setActiveAlert(null);
      setCompositeScore(15);
      setProsodyScore(50);
      lastPcmWindowRef.current = null;
      if (scorerRef.current) {
        scorerRef.current.reset('LIVE-CALL-STREAM');
      }

      loggerRef.current = new ThrottledRiskLogger(
        selectedSource === 'mic' ? 'hardware_mic' : 'simulated_call'
      );

      const detector = new StreamingDetector();
      detectorRef.current = detector;

      // Handle real-time window scores every ~1.5s hop
      detector.onScore((windowResult, pcmWindow?: Float32Array) => {
        if (!scorerRef.current) return;

        // --- Prosody analysis on the raw PCM window ---
        // pcmWindow is passed by the enhanced StreamingDetector callback (may be undefined
        // for browser builds that don't expose it yet — fall back to last stored window).
        const pcm = pcmWindow ?? lastPcmWindowRef.current;
        const prosodyPhase = pcm ? computePhaseArtifactsScore(pcm) : -1;
        if (pcm) {
          lastPcmWindowRef.current = pcm;
          setProsodyScore(100 - prosodyPhase); // naturalness score for display
        }

        // --- Keyword urgency score from transcript (updated live as user types) ---
        const kwResult = evaluateKeywords(transcriptRef.current);
        const currentUrgency = kwResult.urgencyScore;

        // --- Composite multi-factor risk score ---
        // Weights: 45% acoustic + 25% NLP urgency + 15% signaling + 15% biometric
        // Metadata anomaly defaults to 0 (no signaling data in browser demo)
        const compositeResult = computeCompositeRisk(
          windowResult.riskScore, // acoustic ONNX softmax score
          currentUrgency,          // NLP keyword urgency
          0,                       // metadata anomaly (no VoIP signaling data in demo)
          0,                       // biometric mismatch (no enrollment baseline)
          prosodyPhase,            // real prosody-derived phase artifacts score
        );

        // Feed COMPOSITE score (not raw acoustic) into EMA scorer
        const evalResult = scorerRef.current.evaluate(compositeResult.riskScore, windowResult.windowStartMs);

        setCompositeScore(compositeResult.riskScore);
        setCurrentSmoothed(evalResult.smoothedScore);
        setCurrentTier(
          evalResult.smoothedScore >= 80
            ? 'HIGH_RISK'
            : evalResult.smoothedScore >= 50
            ? 'SUSPICIOUS'
            : 'LOW'
        );

        // Throttled logging (state change, 15s heartbeat, or session end)
        if (loggerRef.current) {
          loggerRef.current.logWindow(
            evalResult.smoothedScore,
            windowResult.confidence,
            windowResult.label,
            evalResult.actionLabel
          );
        }

        if (onScoreUpdate) {
          onScoreUpdate(windowResult, evalResult);
        }
      });

      if (selectedSource === 'mic') {
        // Option A: Live Microphone
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        await detector.start(stream);
      } else {
        // Option B: Sample Call Audio Element
        if (!audioElementRef.current) return;
        audioElementRef.current.src = sampleUrl;
        await audioElementRef.current.play();
        await detector.start(audioElementRef.current);
      }

      setIsMonitoring(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown audio error';
      alert(`Could not start audio monitoring: ${msg}. Please ensure microphone permission is granted or switch to 'Play a sample call'.`);
      setIsMonitoring(false);
    }
  };

  // Handle local audio file upload for sample mode
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setSampleUrl(objectUrl);
    setSampleName(file.name);
    setSelectedSource('sample');

    if (isMonitoring) {
      void stopMonitoring();
    }
  };

  const selectPreloadedSample = (url: string, name: string) => {
    setSampleUrl(url);
    setSampleName(name);
    setSelectedSource('sample');

    if (isMonitoring) {
      void stopMonitoring();
    }
  };

  return (
    <div className="flex flex-col bg-slate-900/70 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl overflow-hidden">
      {/* Live Mid-Stream Alert Banner */}
      {activeAlert && (
        <div
          className={`p-4 border-b flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-3 ${
            activeAlert.severity === 'critical'
              ? 'bg-red-950/90 border-red-800 text-red-100 shadow-[0_0_25px_rgba(239,68,68,0.4)]'
              : 'bg-amber-950/90 border-amber-800 text-amber-100 shadow-[0_0_25px_rgba(245,158,11,0.3)]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl ${
                activeAlert.severity === 'critical' ? 'bg-red-900/80 text-white' : 'bg-amber-900/80 text-white'
              }`}
            >
              {activeAlert.severity === 'critical' ? (
                <ShieldAlert className="w-5 h-5 animate-bounce" />
              ) : (
                <AlertTriangle className="w-5 h-5 animate-pulse" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xs tracking-wider uppercase">
                  {activeAlert.title}
                </span>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/40 border border-white/20">
                  {activeAlert.snippetTime}
                </span>
              </div>
              <p className="text-xs text-white/80 mt-0.5 leading-snug">
                {activeAlert.description}
              </p>
            </div>
          </div>

          <button
            onClick={() => setActiveAlert(null)}
            className="p-1.5 rounded-lg hover:bg-black/30 text-white/70 hover:text-white transition-colors"
            title="Dismiss Alert Banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Banner with Caller Telemetry & Source */}
      <div className="p-5 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div
            className={`p-3 rounded-xl border flex items-center justify-center transition-all ${
              isMonitoring
                ? currentTier === 'HIGH_RISK'
                  ? 'bg-red-950/60 border-red-500 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                  : currentTier === 'SUSPICIOUS'
                  ? 'bg-amber-950/60 border-amber-500 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                  : 'bg-cyan-950/60 border-cyan-500 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <PhoneCall className={`w-5 h-5 ${isMonitoring ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-100 font-mono tracking-tight">
                {selectedSource === 'mic' ? 'Live Inbound Stream (Microphone)' : sampleName}
              </h2>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
              <span className="flex items-center gap-1 font-mono">
                <Radio className="w-3.5 h-3.5 text-cyan-400" />
                {selectedSource === 'mic' ? 'Hardware Mic PCM' : 'MediaElement PCM'} • 16kHz Resampled
              </span>
              <span>•</span>
              <span className="text-slate-400 font-mono">AudioWorklet Pipeline</span>
            </div>
          </div>
        </div>

        {/* Call Timer & Status Indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-slate-300">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{formatTime(elapsedSec)}</span>
          </div>

          <div
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
              isMonitoring
                ? currentTier === 'HIGH_RISK'
                  ? 'bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse'
                  : currentTier === 'SUSPICIOUS'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {isMonitoring ? (
              currentTier === 'HIGH_RISK' ? (
                <>
                  <ShieldAlert className="w-4 h-4 text-red-400" />
                  <span>DEEPFAKE FLAGGED ({Math.round(currentSmoothed)})</span>
                </>
              ) : currentTier === 'SUSPICIOUS' ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>SUSPICIOUS ({Math.round(currentSmoothed)})</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                  <span>AUTHENTIC ({Math.round(currentSmoothed)})</span>
                </>
              )
            ) : (
              <span>STANDBY</span>
            )}
          </div>
        </div>
      </div>

      {/* Unified Source Picker & Pre-loaded Fallbacks */}
      <div className="p-4 bg-slate-950/50 border-b border-slate-800/80 flex flex-col gap-3">
        {!hideSourceToggle && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              Audio Source (Unified Worklet Pipeline):
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSelectedSource('mic');
                  if (isMonitoring) void stopMonitoring();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                  selectedSource === 'mic'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-md'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Live mic (incoming call)</span>
              </button>

              <button
                onClick={() => {
                  setSelectedSource('sample');
                  if (isMonitoring) void stopMonitoring();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                  selectedSource === 'sample'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-md'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
                }`}
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Play a sample call</span>
              </button>
            </div>
          </div>
        )}

        {/* Pre-loaded Sample Buttons & Upload (Available when in sample mode) */}
        {selectedSource === 'sample' && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-slate-400 font-mono text-[11px]">Quick Pre-loaded Samples:</span>
          
          <button
            onClick={() => selectPreloadedSample('/samples/genuine_voice.wav', 'Sample: Genuine Human Voice')}
            className={`px-2.5 py-1 rounded-md border font-medium flex items-center gap-1.5 transition-all ${
              selectedSource === 'sample' && sampleUrl.includes('genuine_voice')
                ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sample: genuine voice</span>
          </button>

          <button
            onClick={() => selectPreloadedSample('/samples/cloned_voice.wav', 'Sample: AI-Cloned Deepfake Voice')}
            className={`px-2.5 py-1 rounded-md border font-medium flex items-center gap-1.5 transition-all ${
              selectedSource === 'sample' && sampleUrl.includes('cloned_voice')
                ? 'bg-red-950/60 border-red-500 text-red-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            <span>Sample: AI-cloned voice</span>
          </button>

          {/* Lightweight file upload (routes to exact same streaming pipeline) */}
          <label className="cursor-pointer px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] font-medium flex items-center gap-1.5 transition-all">
            <Upload className="w-3 h-3 text-slate-400" />
            <span>Upload custom audio</span>
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      )}
    </div>

      {/* Real-Time Waveform Visualizer */}
      <div className="p-5 bg-gradient-to-b from-slate-950/40 to-slate-900/60 border-b border-slate-800/80">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2 font-mono">
          <span className="flex items-center gap-1.5">
            <FileAudio className={`w-3.5 h-3.5 ${isMonitoring ? 'text-cyan-400 animate-pulse' : 'text-slate-500'}`} />
            Live Inbound Acoustic Stream (Fast Fourier Transform)
          </span>
          <span className="text-slate-500">Sliding Window: 64.6k samples (4.03s) • 1.5s hop</span>
        </div>

        <div className="h-20 flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-950/70 rounded-xl border border-slate-800/80 overflow-hidden">
          {waveformBars.map((height, i) => (
            <div
              key={i}
              className={`w-2 rounded-full transition-all duration-150 ${
                currentTier === 'HIGH_RISK'
                  ? 'bg-gradient-to-t from-red-600 to-red-400 shadow-[0_0_6px_rgba(239,68,68,0.5)]'
                  : currentTier === 'SUSPICIOUS'
                  ? 'bg-gradient-to-t from-amber-600 to-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.5)]'
                  : 'bg-gradient-to-t from-cyan-600 to-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.5)]'
              }`}
              style={{
                height: isMonitoring ? `${height}%` : '8%',
                opacity: isMonitoring ? (i % 2 === 0 ? 0.95 : 0.75) : 0.25,
              }}
            />
          ))}
        </div>
      </div>

      {/* Single "Start Monitoring" / "Stop Monitoring" Action Bar */}
      <div className="p-4 bg-slate-950/90 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={isMonitoring ? stopMonitoring : startMonitoring}
            className={`px-6 py-3 rounded-xl font-bold text-xs flex items-center gap-2 transition-all transform hover:-translate-y-0.5 ${
              isMonitoring
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]'
                : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-[0_0_25px_rgba(6,182,212,0.4)]'
            }`}
          >
            {isMonitoring ? (
              <>
                <Square className="w-4 h-4" />
                <span>Stop Monitoring</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Start Monitoring</span>
              </>
            )}
          </button>

          <span className="text-xs text-slate-400 font-mono">
            {isMonitoring
              ? 'Analyzing continuous background stream (no stop needed)...'
              : 'Ready to stream & evaluate 16kHz resampled audio.'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
            EMA Smoother: <strong className="text-cyan-400">α = 0.35</strong>
          </span>
        </div>
      </div>

      {/* ── Call Notes / Transcript Panel ─────────────────────────────────── */}
      {/* Feeds evaluateKeywords() for live NLP urgency scoring.              */}
      <div className="p-4 border-t border-slate-800/70 bg-slate-950/60 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
            <span>Call Notes / Transcript</span>
            <span className="text-slate-500 font-normal hidden sm:inline">(NLP keyword matching — live voice STT or manual notes)</span>
          </div>

          <div className="flex items-center gap-2">
            {isSttSupported ? (
              <button
                type="button"
                onClick={toggleStt}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-all ${
                  isSttActive
                    ? 'bg-red-950/80 text-red-300 border border-red-500/60 shadow-[0_0_10px_rgba(239,68,68,0.3)] animate-pulse'
                    : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
                }`}
                title={isSttActive ? 'Stop Live Browser Speech-to-Text' : 'Enable Live Browser Speech-to-Text'}
              >
                <Mic className={`w-3 h-3 ${isSttActive ? 'text-red-400' : 'text-cyan-400'}`} />
                <span>{isSttActive ? 'Live STT: Listening...' : 'Enable Live STT (Mic)'}</span>
              </button>
            ) : (
              <span className="text-[10px] font-mono text-slate-500 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                Browser STT unavailable (Manual Entry Active)
              </span>
            )}
          </div>
        </div>

        <textarea
          value={transcript}
          onChange={(e) => {
            const text = e.target.value;
            setTranscript(text);
            const kw = evaluateKeywords(text);
            setFlaggedKeywords(kw.flagged);
            setUrgencyScore(kw.urgencyScore);
          }}
          placeholder="Paste call transcript or type keywords heard... e.g. 'Your bank account is blocked, please share OTP urgently'"
          rows={3}
          className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-300 placeholder-slate-600 resize-none focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 font-mono"
        />

        {/* Flagged keywords display */}
        {flaggedKeywords.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-slate-500 font-mono shrink-0 flex items-center gap-1">
              <TriangleAlert className="w-3 h-3 text-amber-400" />
              Flagged ({urgencyScore}/100):
            </span>
            {flaggedKeywords.map((kw) => (
              <span
                key={kw}
                className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-950/60 border border-amber-700/60 text-amber-300"
              >
                {kw}
              </span>
            ))}
          </div>
        )}

      </div>
      {/* ── end transcript panel ────────────────────────────────────────────── */}
    </div>
  );
};
