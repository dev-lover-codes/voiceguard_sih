'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { Peer, MediaConnection } from 'peerjs';
import {
  Laptop,
  Radio,
  PhoneOff,
  Volume2,
  VolumeX,
  Copy,
  Check,
  ShieldAlert,
  AlertTriangle,
  ExternalLink,
  Bell,
  X,
} from 'lucide-react';
import { StreamingDetector, WindowRiskResult } from '@/lib/onnx-inference';
import { StreamingRiskScorer, SmoothedRiskEvaluation } from '@/lib/risk-scoring';
import { ThrottledRiskLogger } from '@/lib/supabase-client';
import { RiskGauge } from '@/components/RiskGauge';
import { RiskTimeline, TimelineDataPoint } from '@/components/RiskTimeline';
import { ConfidenceBreakdown } from '@/components/ConfidenceBreakdown';
import { AlertEvent } from '@/types';
import { formatTime } from '@/lib/utils';

export default function ReceiverPage() {
  const [roomCode, setRoomCode] = useState<string>('VG-9088');
  const [copied, setCopied] = useState<boolean>(false);
  
  // Connection state: 'listening' | 'incoming' | 'connected' | 'ended' | 'error'
  const [connectionState, setConnectionState] = useState<string>('listening');
  const [callerPeerId, setCallerPeerId] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Scoring state
  const [smoothedScore, setSmoothedScore] = useState<number>(12);
  const [confidence, setConfidence] = useState<number>(0.88);
  const [label, setLabel] = useState<'human' | 'synthetic' | 'uncertain'>('human');
  const [latencyMs, setLatencyMs] = useState<number>(2.4);
  const [actionLabel, setActionLabel] = useState<string>('likely human, proceed');
  const [activeAlert, setActiveAlert] = useState<AlertEvent | null>(null);
  const [sessionAlerts, setSessionAlerts] = useState<AlertEvent[]>([]);

  // Waveform visualization
  const [waveformBars, setWaveformBars] = useState<number[]>(() => Array.from({ length: 32 }, () => 10));

  // Rolling timeline data (capped at 30 points)
  const [timelineData, setTimelineData] = useState<TimelineDataPoint[]>([
    { time: '00:00', second: 0, smoothedScore: 12, rawScore: 10 },
  ]);

  // Audio & WebRTC Refs
  const peerRef = useRef<Peer | null>(null);
  const activeCallRef = useRef<MediaConnection | null>(null);
  const detectorRef = useRef<StreamingDetector | null>(null);
  const scorerRef = useRef<StreamingRiskScorer | null>(null);
  const loggerRef = useRef<ThrottledRiskLogger | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Scorer initialization
  useEffect(() => {
    const scorer = new StreamingRiskScorer('WEBRTC-INBOUND-01', {
      alpha: 0.35,
      highRiskThreshold: 80,
      suspiciousThreshold: 50,
    });

    scorer.onAlert((alert) => {
      setActiveAlert(alert);
      setSessionAlerts((prev) => [alert, ...prev.slice(0, 10)]);
    });

    scorerRef.current = scorer;
  }, []);

  // Call duration counter
  useEffect(() => {
    if (connectionState !== 'connected') return;
    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [connectionState]);

  // Real-time audio waveform visualizer loop
  useEffect(() => {
    if (connectionState !== 'connected') return;

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
  }, [connectionState]);

  // Initialize Receiver Peer listener inside useEffect
  useEffect(() => {
    let isCleanedUp = false;

    const setupPeer = async () => {
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }

      const cleanCode = roomCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
      const targetPeerId = `voiceguard-sih-room-${cleanCode}`;

      try {
        const { default: Peer } = await import('peerjs');
        if (isCleanedUp) return;
        const peer = new Peer(targetPeerId);
        peerRef.current = peer;

        peer.on('open', () => {
          if (!isCleanedUp) setConnectionState('listening');
        });

        peer.on('call', (call: MediaConnection) => {
          if (isCleanedUp) return;
          setConnectionState('incoming');
          setCallerPeerId(call.peer);
          activeCallRef.current = call;

          // Answer call and attach remote audio stream
          call.answer();

          call.on('stream', async (remoteStream: MediaStream) => {
            if (isCleanedUp) return;
            setConnectionState('connected');
            setCallDuration(0);

            // Play remote stream through laptop speakers
            if (remoteAudioRef.current) {
              remoteAudioRef.current.srcObject = remoteStream;
              void remoteAudioRef.current.play();
            }

            // Feed into SAME StreamingDetector as other modes!
            if (detectorRef.current) {
              await detectorRef.current.stop();
            }

            const detector = new StreamingDetector();
            detectorRef.current = detector;

            loggerRef.current = new ThrottledRiskLogger('webrtc_call');

            detector.onScore((windowResult: WindowRiskResult) => {
              if (isCleanedUp || !scorerRef.current) return;
              const evalResult: SmoothedRiskEvaluation = scorerRef.current.evaluate(
                windowResult.riskScore,
                windowResult.windowStartMs
              );

              setSmoothedScore(evalResult.smoothedScore);
              setConfidence(windowResult.confidence);
              setLabel(windowResult.label);
              setLatencyMs(windowResult.inferenceLatencyMs);
              setActionLabel(evalResult.actionLabel);

              // Throttled logging (state change, 15s heartbeat, or session end)
              if (loggerRef.current) {
                loggerRef.current.logWindow(
                  evalResult.smoothedScore,
                  windowResult.confidence,
                  windowResult.label,
                  evalResult.actionLabel
                );
              }

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
                return next.slice(-30);
              });
            });

            await detector.start(remoteStream);
          });

          call.on('close', () => {
            if (!isCleanedUp) {
              setConnectionState('ended');
              if (detectorRef.current) {
                void detectorRef.current.stop();
              }
            }
          });

          call.on('error', () => {
            if (!isCleanedUp) setConnectionState('error');
          });
        });

        peer.on('error', (err: unknown) => {
          const peerErr = err as { type?: string };
          if (peerErr?.type === 'unavailable-id') {
            const fallbackCode = `${cleanCode}-${Math.floor(10 + Math.random() * 90)}`;
            if (!isCleanedUp) setRoomCode(fallbackCode);
          } else {
            if (!isCleanedUp) setConnectionState('error');
          }
        });
      } catch {
        if (!isCleanedUp) setConnectionState('error');
      }
    };

    void setupPeer();

    return () => {
      isCleanedUp = true;
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
      if (detectorRef.current) {
        void detectorRef.current.stop();
      }
    };
  }, [roomCode]);

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const terminateCall = async () => {
    if (activeCallRef.current) {
      activeCallRef.current.close();
      activeCallRef.current = null;
    }
    if (detectorRef.current) {
      await detectorRef.current.stop();
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    setConnectionState('listening');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Hidden audio element to output caller voice to laptop speaker */}
      <audio ref={remoteAudioRef} autoPlay />

      {/* Header & Sub-Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold">
              WEBRTC TWO-DEVICE DEMO
            </span>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs text-slate-400">Judge / Laptop Display Screen</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Laptop className="w-7 h-7 text-cyan-400" />
            Live WebRTC Receiver & Fraud Scoring Console
          </h1>
        </div>

        {/* Navigation sub-tabs */}
        <div className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
          <Link href="/demo" className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white">
            Single Device
          </Link>
          <Link
            href="/demo/caller"
            target="_blank"
            className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white flex items-center gap-1"
          >
            <span>📱 Caller Phone</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
          <span className="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40 shadow-sm">
            💻 Receiver (Judges)
          </span>
        </div>
      </div>

      {/* Mid-Stream Alert Banner */}
      {activeAlert && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-3 ${
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
            title="Dismiss Alert"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Two-Device Instructions & Room Code Bar */}
      <div className="p-5 bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-cyan-950/40 rounded-2xl border border-cyan-500/30 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white flex items-center gap-1.5">
              <span>Step 1: Open</span>
              <code className="px-2 py-0.5 rounded bg-slate-950 text-cyan-300 font-mono text-xs border border-cyan-500/40">
                /demo/caller
              </code>
              <span>on your Phone</span>
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Step 2: Enter Room Code below and press Call. Audio streams live over WebRTC and scores on this screen!
          </p>
        </div>

        {/* Room Code Badge & Copy */}
        <div className="flex items-center gap-3 bg-slate-950/80 p-2 rounded-xl border border-slate-800">
          <div className="flex flex-col pl-2">
            <span className="text-[10px] text-slate-500 uppercase font-mono tracking-wider">Room Code</span>
            <span className="text-lg font-mono font-extrabold text-cyan-300 tracking-wider">
              {roomCode}
            </span>
          </div>

          <button
            onClick={copyRoomCode}
            className="px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Code'}</span>
          </button>
        </div>
      </div>

      {/* Connection State Bar */}
      <div className="p-4 bg-slate-900/70 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-xl border flex items-center justify-center ${
              connectionState === 'connected'
                ? smoothedScore >= 80
                  ? 'bg-red-950/60 border-red-500 text-red-400 animate-pulse'
                  : smoothedScore >= 50
                  ? 'bg-amber-950/60 border-amber-500 text-amber-400'
                  : 'bg-cyan-950/60 border-cyan-500 text-cyan-400'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <Radio className={`w-5 h-5 ${connectionState === 'connected' ? 'animate-pulse' : ''}`} />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100 font-mono">
                {connectionState === 'connected'
                  ? `Inbound WebRTC Stream Active (Peer: ${callerPeerId?.slice(0, 12)}...)`
                  : connectionState === 'incoming'
                  ? 'Incoming Call Connecting...'
                  : `Listening on Room: ${roomCode}`}
              </h3>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
              <span>Protocol: WebRTC (PeerJS Cloud)</span>
              <span>•</span>
              <span className="font-mono">
                Duration: {formatTime(callDuration)}
              </span>
            </div>
          </div>
        </div>

        {/* Call Controls */}
        <div className="flex items-center gap-2">
          {connectionState === 'connected' && (
            <>
              <button
                onClick={() => {
                  if (remoteAudioRef.current) {
                    remoteAudioRef.current.muted = !isMuted;
                    setIsMuted(!isMuted);
                  }
                }}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                title={isMuted ? 'Unmute Speakers' : 'Mute Speakers'}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <button
                onClick={terminateCall}
                className="px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-[0_0_15px_rgba(239,68,68,0.4)] transition-all"
              >
                <PhoneOff className="w-3.5 h-3.5" />
                <span>Disconnect Call</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Real-Time Waveform Visualizer */}
      <div className="p-5 bg-slate-900/60 rounded-2xl border border-slate-800">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2 font-mono">
          <span>Real-Time Inbound PCM Stream (Resampled to 16kHz via Linear Interpolation)</span>
          <span className="text-cyan-400">Sliding Window: 64,600 samples (~4.03s) • 1.5s hop</span>
        </div>

        <div className="h-16 flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
          {waveformBars.map((height, i) => (
            <div
              key={i}
              className={`w-2 rounded-full transition-all duration-150 ${
                smoothedScore >= 80
                  ? 'bg-gradient-to-t from-red-600 to-red-400 shadow-[0_0_6px_rgba(239,68,68,0.5)]'
                  : smoothedScore >= 50
                  ? 'bg-gradient-to-t from-amber-600 to-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.5)]'
                  : 'bg-gradient-to-t from-cyan-600 to-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.5)]'
              }`}
              style={{
                height: connectionState === 'connected' ? `${height}%` : '8%',
                opacity: connectionState === 'connected' ? (i % 2 === 0 ? 0.95 : 0.75) : 0.25,
              }}
            />
          ))}
        </div>
      </div>

      {/* Main Scoring Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): RiskTimeline */}
        <div className="lg:col-span-7 space-y-6">
          <RiskTimeline
            data={timelineData}
            currentScore={smoothedScore}
            highRiskThreshold={80}
            suspiciousThreshold={50}
          />
        </div>

        {/* Right Column (5 cols): Live Gauge & Confidence Breakdown */}
        <div className="lg:col-span-5 space-y-6">
          <RiskGauge
            score={smoothedScore}
            latencyMs={latencyMs}
            subtext={`Recommended action: ${actionLabel}`}
            size="lg"
            highRiskThreshold={80}
            suspiciousThreshold={50}
          />

          <ConfidenceBreakdown
            score={smoothedScore}
            confidence={confidence}
            label={label}
          />
        </div>
      </div>

      {/* Session Alerts Log */}
      {sessionAlerts.length > 0 && (
        <div className="p-5 bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-red-950/60 border border-red-800 text-red-400">
                <Bell className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-slate-200">
                WebRTC Threat Incident Log ({sessionAlerts.length})
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Live Mid-Stream Boundary Alerts
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
