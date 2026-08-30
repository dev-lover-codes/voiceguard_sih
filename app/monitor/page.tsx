'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import type { Peer, MediaConnection } from 'peerjs';
import {
  Phone,
  PhoneOff,
  PhoneIncoming,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Radio,
  Volume2,
  VolumeX,
  Copy,
  Check,
  RefreshCw,
  Mic,
  Activity,
  Zap,
  Eye,
  Clock,
  TrendingUp,
  X,
  Bell,
} from 'lucide-react';
import { StreamingDetector, WindowRiskResult } from '@/lib/onnx-inference';
import { StreamingRiskScorer, SmoothedRiskEvaluation, computeCompositeRisk, evaluateKeywords } from '@/lib/risk-scoring';
import { RiskTimeline, TimelineDataPoint } from '@/components/RiskTimeline';
import { ConfidenceBreakdown } from '@/components/ConfidenceBreakdown';
import { AlertEvent } from '@/types';

type ConnectionState = 'idle' | 'listening' | 'ringing' | 'connected' | 'ended' | 'error';
type CallerVerdict = 'scanning' | 'human' | 'suspicious' | 'ai_clone';

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return `VG-${Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')}`;
}

function scoreToVerdict(score: number, windowsAnalyzed: number): CallerVerdict {
  if (windowsAnalyzed < 2) return 'scanning';
  if (score >= 75) return 'ai_clone';
  if (score >= 45) return 'suspicious';
  return 'human';
}

const VERDICT_CONFIG = {
  scanning: {
    label: 'Scanning\u2026',
    sublabel: 'Analyzing voice biometrics',
    icon: Eye,
    color: 'text-slate-300',
    bg: 'bg-slate-900/80',
    border: 'border-slate-700',
    glow: '',
    ringColor: 'border-slate-600',
    badgeBg: 'bg-slate-800 text-slate-300 border-slate-700',
    dot: 'bg-slate-500',
  },
  human: {
    label: 'REAL HUMAN',
    sublabel: 'Authentic biological voice confirmed',
    icon: ShieldCheck,
    color: 'text-emerald-300',
    bg: 'bg-emerald-950/30',
    border: 'border-emerald-500/50',
    glow: 'shadow-[0_0_60px_rgba(16,185,129,0.25)]',
    ringColor: 'border-emerald-400',
    badgeBg: 'bg-emerald-950 text-emerald-300 border-emerald-800',
    dot: 'bg-emerald-400',
  },
  suspicious: {
    label: 'SUSPICIOUS',
    sublabel: 'Acoustic anomalies detected',
    icon: AlertTriangle,
    color: 'text-amber-300',
    bg: 'bg-amber-950/30',
    border: 'border-amber-500/50',
    glow: 'shadow-[0_0_60px_rgba(245,158,11,0.25)]',
    ringColor: 'border-amber-400',
    badgeBg: 'bg-amber-950 text-amber-300 border-amber-800',
    dot: 'bg-amber-400',
  },
  ai_clone: {
    label: 'AI / CLONE',
    sublabel: 'Synthetic deepfake voice detected!',
    icon: ShieldAlert,
    color: 'text-red-300',
    bg: 'bg-red-950/30',
    border: 'border-red-500/50',
    glow: 'shadow-[0_0_60px_rgba(239,68,68,0.35)]',
    ringColor: 'border-red-400',
    badgeBg: 'bg-red-950 text-red-300 border-red-800',
    dot: 'bg-red-500',
  },
};

export default function MonitorPage() {
  const [roomCode, setRoomCode] = useState<string>(() => generateRoomCode());
  const [copied, setCopied] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const [smoothedScore, setSmoothedScore] = useState(0);
  const [confidence, setConfidence] = useState(0.5);
  const [label, setLabel] = useState<'human' | 'synthetic' | 'uncertain'>('human');
  const [latencyMs, setLatencyMs] = useState(0);
  const [windowsAnalyzed, setWindowsAnalyzed] = useState(0);
  const [verdict, setVerdict] = useState<CallerVerdict>('scanning');

  const [waveformBars, setWaveformBars] = useState<number[]>(() => Array.from({ length: 40 }, () => 8));
  const [timelineData, setTimelineData] = useState<TimelineDataPoint[]>([]);
  const [activeAlert, setActiveAlert] = useState<AlertEvent | null>(null);
  const [sessionAlerts, setSessionAlerts] = useState<AlertEvent[]>([]);

  // Multi-factor scoring state
  const [transcript, setTranscript] = useState<string>('');
  const [flaggedKeywords, setFlaggedKeywords] = useState<string[]>([]);
  const [urgencyScore, setUrgencyScore] = useState<number>(0);
  const [compositeScore, setCompositeScore] = useState<number>(0);

  const peerRef = useRef<Peer | null>(null);
  const activeCallRef = useRef<MediaConnection | null>(null);
  const detectorRef = useRef<StreamingDetector | null>(null);
  const scorerRef = useRef<StreamingRiskScorer | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const windowCountRef = useRef(0);
  // Always holds the latest transcript string so onScore closures aren't stale
  const transcriptRef = useRef<string>('');
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  useEffect(() => {
    const scorer = new StreamingRiskScorer('MONITOR-INBOUND', {
      alpha: 0.35,
      highRiskThreshold: 75,
      suspiciousThreshold: 45,
    });
    scorer.onAlert((alert) => {
      setActiveAlert(alert);
      setSessionAlerts((prev) => [alert, ...prev.slice(0, 15)]);
    });
    scorerRef.current = scorer;
    return () => { scorerRef.current = null; };
  }, []);

  useEffect(() => {
    if (connectionState !== 'connected') return;
    const iv = setInterval(() => setCallDuration((p) => p + 1), 1000);
    return () => clearInterval(iv);
  }, [connectionState]);

  useEffect(() => {
    if (connectionState !== 'connected') {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }
    const updateWaveform = () => {
      if (detectorRef.current) {
        const freqData = detectorRef.current.getFrequencyData();
        if (freqData && freqData.length > 0) {
          const step = Math.floor(freqData.length / 40) || 1;
          const bars: number[] = [];
          for (let i = 0; i < 40; i++) {
            const val = freqData[i * step] ?? 0;
            bars.push(Math.max(8, Math.min(100, Math.floor((val / 255) * 100))));
          }
          setWaveformBars(bars);
        }
      }
      animFrameRef.current = requestAnimationFrame(updateWaveform);
    };
    animFrameRef.current = requestAnimationFrame(updateWaveform);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [connectionState]);

  useEffect(() => {
    if (connectionState !== 'ringing' && connectionState !== 'listening') return;
    const startTime = Date.now();
    const iv = setInterval(() => {
      setWaveformBars(Array.from({ length: 40 }, (_, i) =>
        connectionState === 'ringing'
          ? Math.floor(20 + Math.sin(((Date.now() - startTime) / 200) + i * 0.4) * 18 + Math.random() * 10)
          : 8
      ));
    }, 100);
    return () => clearInterval(iv);
  }, [connectionState]);

  const startListening = useCallback(async () => {
    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }
    windowCountRef.current = 0;
    setWindowsAnalyzed(0);
    setSmoothedScore(0);
    setVerdict('scanning');
    setTimelineData([]);
    setSessionAlerts([]);
    setActiveAlert(null);
    setCallDuration(0);
    scorerRef.current?.reset('MONITOR-INBOUND');
    setConnectionState('listening');
    setIsListening(true);

    const cleanCode = roomCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    const peerId = `voiceguard-sih-room-${cleanCode}`;

    try {
      const { default: Peer } = await import('peerjs');
      const peer = new Peer(peerId);
      peerRef.current = peer;

      peer.on('open', () => setConnectionState('listening'));

      peer.on('call', (call: MediaConnection) => {
        setConnectionState('ringing');
        activeCallRef.current = call;
        call.answer();

        call.on('stream', async (remoteStream: MediaStream) => {
          setConnectionState('connected');
          setCallDuration(0);

          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            void remoteAudioRef.current.play();
          }

          if (detectorRef.current) await detectorRef.current.stop();
          const detector = new StreamingDetector();
          detectorRef.current = detector;

          detector.onScore((windowResult: WindowRiskResult) => {
            if (!scorerRef.current) return;

            // Compute NLP urgency from transcript at time of window (read latest ref)
            const kwResult = evaluateKeywords(transcriptRef.current);
            const currentUrgency = kwResult.urgencyScore;

            // Composite multi-factor score (no prosody window available in WebRTC path)
            const compositeResult = computeCompositeRisk(
              windowResult.riskScore, // ONNX softmax acoustic score
              currentUrgency,          // NLP urgency from transcript
              0,                       // metadata anomaly (no signaling data)
              0,                       // biometric mismatch (no enrollment)
              -1,                      // prosody: not computed (no pcm window ref)
            );

            const evalResult: SmoothedRiskEvaluation = scorerRef.current.evaluate(
              compositeResult.riskScore,
              windowResult.windowStartMs
            );
            windowCountRef.current += 1;
            const wCount = windowCountRef.current;
            setWindowsAnalyzed(wCount);
            setSmoothedScore(evalResult.smoothedScore);
            setCompositeScore(compositeResult.riskScore);
            setConfidence(windowResult.confidence);
            setLabel(windowResult.label);
            setLatencyMs(windowResult.inferenceLatencyMs);
            setVerdict(scoreToVerdict(evalResult.smoothedScore, wCount));

            const sec = Math.floor(windowResult.windowStartMs / 1000);
            const mins = Math.floor(sec / 60).toString().padStart(2, '0');
            const secs = (sec % 60).toString().padStart(2, '0');
            setTimelineData((prev) =>
              [...prev, { time: `${mins}:${secs}`, second: sec, smoothedScore: evalResult.smoothedScore, rawScore: windowResult.riskScore }].slice(-30)
            );
          });

          await detector.start(remoteStream);
        });

        call.on('close', () => { setConnectionState('ended'); void detectorRef.current?.stop(); });
        call.on('error', () => setConnectionState('error'));
      });

      peer.on('error', (err: unknown) => {
        const peerErr = err as { type?: string };
        if (peerErr?.type === 'unavailable-id') {
          setRoomCode(generateRoomCode());
        } else {
          setConnectionState('error');
        }
      });
    } catch {
      setConnectionState('error');
    }
  }, [roomCode]);

  const stopListening = useCallback(async () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (activeCallRef.current) { activeCallRef.current.close(); activeCallRef.current = null; }
    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }
    if (detectorRef.current) { await detectorRef.current.stop(); detectorRef.current = null; }
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    setConnectionState('idle');
    setIsListening(false);
    setVerdict('scanning');
    setWaveformBars(Array.from({ length: 40 }, () => 8));
  }, []);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => () => { void stopListening(); }, [stopListening]);

  const cfg = VERDICT_CONFIG[verdict];
  const VerdictIcon = cfg.icon;

  const scoreBarColor =
    verdict === 'ai_clone' ? 'bg-gradient-to-r from-red-700 to-red-400' :
    verdict === 'suspicious' ? 'bg-gradient-to-r from-amber-700 to-amber-400' :
    verdict === 'human' ? 'bg-gradient-to-r from-emerald-700 to-emerald-400' :
    'bg-gradient-to-r from-slate-700 to-slate-500';

  const waveColor =
    verdict === 'ai_clone' ? 'from-red-600 to-red-400 shadow-[0_0_6px_rgba(239,68,68,0.7)]' :
    verdict === 'suspicious' ? 'from-amber-600 to-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.5)]' :
    verdict === 'human' ? 'from-emerald-600 to-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.5)]' :
    'from-slate-600 to-slate-400';

  return (
    <div className="min-h-screen bg-[#070B14] py-6 px-4 sm:px-6 lg:px-8">
      <audio ref={remoteAudioRef} autoPlay />

      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                LIVE CALL GUARD
              </span>
              <span className="text-xs text-slate-500">Auto-Monitor Inbound Calls</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <div className="relative">
                <Phone className="w-7 h-7 text-emerald-400" />
                {connectionState === 'connected' && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                )}
              </div>
              Call Guard — Receive &amp; Scan
            </h1>
          </div>
          <div className="flex items-center gap-1 p-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <Link href="/demo" className="px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-white transition-colors">Single Device</Link>
            <Link href="/demo/caller" className="px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-white transition-colors">📱 Caller</Link>
            <Link href="/demo/receiver" className="px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-white transition-colors">💻 Receiver</Link>
            <span className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">🛡️ Monitor</span>
          </div>
        </div>

        {/* Alert Banner */}
        {activeAlert && (
          <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-3 ${
            activeAlert.severity === 'critical'
              ? 'bg-red-950/90 border-red-800 text-red-100 shadow-[0_0_30px_rgba(239,68,68,0.4)]'
              : 'bg-amber-950/90 border-amber-800 text-amber-100 shadow-[0_0_25px_rgba(245,158,11,0.3)]'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${activeAlert.severity === 'critical' ? 'bg-red-900/80' : 'bg-amber-900/80'}`}>
                {activeAlert.severity === 'critical'
                  ? <ShieldAlert className="w-5 h-5 animate-bounce" />
                  : <AlertTriangle className="w-5 h-5 animate-pulse" />}
              </div>
              <div>
                <div className="font-extrabold text-xs tracking-wider uppercase">{activeAlert.title}</div>
                <p className="text-xs text-white/80 mt-0.5">{activeAlert.description}</p>
              </div>
            </div>
            <button onClick={() => setActiveAlert(null)} className="p-1.5 rounded-lg hover:bg-black/30 text-white/70 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* Left Column: Controls */}
          <div className="lg:col-span-5 space-y-4">

            {/* Room Code */}
            <div className="p-5 bg-slate-900/70 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-950/60 border border-emerald-900">
                  <Mic className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Your Monitor Room Code</h2>
                  <p className="text-[11px] text-slate-400">Share with caller — monitoring starts automatically</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 font-mono text-xl font-extrabold text-emerald-300 tracking-[0.2em] text-center select-all">
                  {roomCode}
                </div>
                <button onClick={handleCopyCode} className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors" title="Copy">
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
                <button onClick={() => !isListening && setRoomCode(generateRoomCode())} disabled={isListening} className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors disabled:opacity-40" title="New Code">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              <div className="text-[11px] text-slate-500 font-mono text-center">
                Caller opens <span className="text-cyan-400">/demo/caller</span> → enters this code → presses Call
              </div>
            </div>

            {/* Start/Stop Button */}
            {!isListening ? (
              <button onClick={startListening} className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-base flex items-center justify-center gap-2.5 shadow-[0_0_30px_rgba(16,185,129,0.35)] transition-all transform hover:-translate-y-0.5">
                <PhoneIncoming className="w-5 h-5" />
                Start Listening for Calls
              </button>
            ) : (
              <button onClick={stopListening} className="w-full py-4 rounded-2xl bg-gradient-to-r from-red-700 to-rose-700 hover:from-red-600 hover:to-rose-600 text-white font-extrabold text-base flex items-center justify-center gap-2.5 shadow-[0_0_25px_rgba(239,68,68,0.3)] transition-all">
                <PhoneOff className="w-5 h-5" />
                Stop &amp; Hang Up
              </button>
            )}

            {/* Status */}
            <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full shrink-0 ${
                  connectionState === 'connected' ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]' :
                  connectionState === 'ringing' ? 'bg-amber-400 animate-ping' :
                  connectionState === 'listening' ? 'bg-cyan-400 animate-pulse' :
                  'bg-slate-600'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-100">
                    {connectionState === 'connected' ? 'Call Connected — Monitoring Active' :
                     connectionState === 'ringing' ? '📞 Incoming Call\u2026' :
                     connectionState === 'listening' ? 'Waiting for incoming call\u2026' :
                     connectionState === 'ended' ? 'Call Ended' :
                     connectionState === 'error' ? 'Connection Error' : 'Not Listening'}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5 font-mono flex-wrap">
                    {connectionState === 'connected' && (
                      <>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(callDuration)}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1"><Zap className="w-3 h-3" />{latencyMs.toFixed(1)}ms</span>
                        <span>•</span>
                        <span className="flex items-center gap-1"><Activity className="w-3 h-3" />{windowsAnalyzed} windows</span>
                      </>
                    )}
                    {connectionState === 'listening' && <span>Room: {roomCode}</span>}
                    {connectionState === 'ringing' && <span className="text-amber-400 animate-pulse">Auto-answering\u2026</span>}
                  </div>
                </div>
                {connectionState === 'connected' && (
                  <button onClick={() => { if (remoteAudioRef.current) { remoteAudioRef.current.muted = !isMuted; setIsMuted(!isMuted); } }} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors" title={isMuted ? 'Unmute' : 'Mute'}>
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>

            {/* How it works */}
            {!isListening && (
              <div className="p-4 bg-slate-900/40 rounded-2xl border border-slate-800/60 space-y-3">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">How It Works</h3>
                <div className="space-y-2">
                  {[
                    { n: '1', t: 'Press "Start Listening" to open your monitor room', c: 'bg-emerald-500' },
                    { n: '2', t: 'Share your room code with the caller', c: 'bg-cyan-500' },
                    { n: '3', t: 'Call is auto-answered — scanning begins instantly', c: 'bg-amber-500' },
                    { n: '4', t: 'Live verdict updates every ~1.5s: Real Human / Suspicious / AI Clone', c: 'bg-red-500' },
                  ].map(({ n, t, c }) => (
                    <div key={n} className="flex items-start gap-2.5 text-[11px] text-slate-400">
                      <span className={`w-4 h-4 rounded-full ${c} text-white flex items-center justify-center font-bold text-[9px] shrink-0 mt-0.5`}>{n}</span>
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Verdict */}
          <div className="lg:col-span-7 space-y-4">

            {/* Big Verdict Card */}
            <div className={`relative p-6 rounded-3xl border-2 transition-all duration-700 ${cfg.bg} ${cfg.border} ${cfg.glow} overflow-hidden`}>
              {verdict === 'ai_clone' && (
                <div className="absolute inset-0 bg-red-500/5 animate-pulse rounded-3xl pointer-events-none" />
              )}

              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Radio className={`w-4 h-4 ${connectionState === 'connected' ? 'text-emerald-400 animate-pulse' : 'text-slate-600'}`} />
                  <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                    {connectionState === 'connected' ? 'Live Analysis' : 'Standby'}
                  </span>
                </div>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono font-bold ${cfg.badgeBg}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${connectionState === 'connected' ? 'animate-pulse' : ''}`} />
                  {verdict === 'scanning' ? 'SCANNING' : verdict === 'human' ? 'VERIFIED HUMAN' : verdict === 'suspicious' ? 'ANOMALY DETECTED' : 'THREAT DETECTED'}
                </div>
              </div>

              <div className="text-center py-4">
                <div className={`inline-flex p-5 rounded-3xl border-2 ${cfg.ringColor} ${cfg.bg} mb-4 ${verdict !== 'scanning' ? cfg.glow : ''}`}>
                  <VerdictIcon className={`w-16 h-16 ${cfg.color} ${verdict === 'ai_clone' ? 'animate-pulse' : ''}`} />
                </div>
                <div className={`text-4xl sm:text-5xl font-black tracking-tight ${cfg.color} mb-2`}>
                  {cfg.label}
                </div>
                <div className="text-sm text-slate-400">{cfg.sublabel}</div>
              </div>

              <div className="space-y-2 mt-4">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">Deepfake Risk Score</span>
                  <span className={`font-extrabold text-lg ${cfg.color}`}>{smoothedScore}<span className="text-slate-500 text-xs">/100</span></span>
                </div>
                <div className="h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                  <div className={`h-full rounded-full transition-all duration-700 ${scoreBarColor}`} style={{ width: `${smoothedScore}%` }} />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-slate-600">
                  <span>0 — Safe</span>
                  <span>45 — Suspicious</span>
                  <span>75+ — AI Clone</span>
                </div>
              </div>

              {connectionState === 'connected' && (
                <div className="grid grid-cols-3 gap-3 mt-5">
                  {[
                    { lbl: 'Confidence', val: `${(confidence * 100).toFixed(0)}%`, Icon: TrendingUp },
                    { lbl: 'Windows', val: windowsAnalyzed.toString(), Icon: Activity },
                    { lbl: 'Latency', val: `${latencyMs.toFixed(1)}ms`, Icon: Zap },
                  ].map(({ lbl, val, Icon }) => (
                    <div key={lbl} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                      <Icon className="w-3.5 h-3.5 text-slate-500 mx-auto mb-1" />
                      <div className="text-base font-extrabold text-slate-200 font-mono">{val}</div>
                      <div className="text-[10px] text-slate-500">{lbl}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Waveform */}
            <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono mb-3">
                <span>Inbound Voice Stream — PCM @ 16kHz</span>
                <span className={connectionState === 'connected' ? 'text-emerald-400' : 'text-slate-600'}>
                  {connectionState === 'connected' ? '\u25CF LIVE' : '\u25CB IDLE'}
                </span>
              </div>
              <div className="h-16 flex items-end justify-center gap-1 px-2">
                {waveformBars.map((height, i) => (
                  <div
                    key={i}
                    className={`flex-1 max-w-[6px] rounded-full transition-all duration-150 ${
                      connectionState === 'connected' ? `bg-gradient-to-t ${waveColor}` : 'bg-slate-800'
                    }`}
                    style={{
                      height: `${connectionState === 'connected' ? height : 8}%`,
                      opacity: connectionState === 'connected' ? (i % 2 === 0 ? 0.95 : 0.75) : 0.2,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Confidence Breakdown */}
            {connectionState === 'connected' && windowsAnalyzed > 0 && (
              <ConfidenceBreakdown score={smoothedScore} confidence={confidence} label={label} />
            )}
          </div>
        </div>

        {/* Risk Timeline */}
        {timelineData.length > 1 && (
          <RiskTimeline data={timelineData} currentScore={smoothedScore} highRiskThreshold={75} suspiciousThreshold={45} />
        )}

        {/* Alerts Log */}
        {sessionAlerts.length > 0 && (
          <div className="p-5 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-red-950/60 border border-red-800 text-red-400">
                  <Bell className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-slate-200">Threat Incident Log ({sessionAlerts.length})</h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">Mid-stream alerts</span>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
              {sessionAlerts.map((alt) => (
                <div key={alt.id} className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
                    <span className="font-mono text-slate-400">{alt.snippetTime}</span>
                    <span className="font-bold text-slate-200">{alt.title}</span>
                    <span className="text-slate-400 hidden sm:inline">• {alt.description}</span>
                  </div>
                  <span className="font-mono text-red-400 font-bold px-2 py-0.5 rounded bg-red-950/60 border border-red-900">{alt.riskScore}/100</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Call Notes / Transcript Panel (NLP keyword matching) ─────────── */}
        <div className="p-5 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <X className="w-3.5 h-3.5 text-cyan-400 rotate-0" />
            <span>Call Notes / Transcript</span>
            <span className="text-slate-500 font-normal">(NLP keyword matching — paste or type what you hear)</span>
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
            placeholder="Paste call transcript or type keywords... e.g. 'Your bank account is blocked, share OTP immediately'"
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-300 placeholder-slate-600 resize-none focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 font-mono"
          />
          {flaggedKeywords.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-slate-500 font-mono shrink-0">
                ⚠ Flagged ({urgencyScore}/100):
              </span>
              {flaggedKeywords.map((kw) => (
                <span key={kw} className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-950/60 border border-amber-700/60 text-amber-300">
                  {kw}
                </span>
              ))}
            </div>
          )}
          {/* Score breakdown when connected */}
          {connectionState === 'connected' && (
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { label: 'Acoustic', value: smoothedScore, color: 'text-cyan-400' },
                { label: 'NLP Urgency', value: urgencyScore, color: 'text-amber-400' },
                { label: 'Composite', value: compositeScore, color: smoothedScore >= 75 ? 'text-red-400' : smoothedScore >= 45 ? 'text-amber-400' : 'text-emerald-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
                  <div className={`text-base font-extrabold font-mono ${color}`}>{value}<span className="text-slate-600 text-xs">/100</span></div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* ── end transcript panel ──────────────────────────────────────────── */}

      </div>
    </div>
  );
}

