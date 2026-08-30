'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Peer, MediaConnection } from 'peerjs';
import {
  Sparkles,
  Mic,
  Volume2,
  Smartphone,
  Laptop,
  Radio,
  Phone,
  PhoneOff,
  PhoneIncoming,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  VolumeX,
  Copy,
  Check,
  RefreshCw,
  Bell,
  Eye,
  MessageSquare,
  TriangleAlert,
  Upload,
  MicOff,
  Activity,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { LiveCallMonitor } from '@/components/LiveCallMonitor';
import { RiskGauge } from '@/components/RiskGauge';
import { RiskTimeline, TimelineDataPoint } from '@/components/RiskTimeline';
import { ConfidenceBreakdown } from '@/components/ConfidenceBreakdown';
import { PrivacyPanel, InferenceMode } from '@/components/PrivacyPanel';
import { StreamingDetector, WindowRiskResult } from '@/lib/onnx-inference';
import {
  StreamingRiskScorer,
  SmoothedRiskEvaluation,
  computeCompositeRisk,
  evaluateKeywords,
} from '@/lib/risk-scoring';
import { computePhaseArtifactsScore } from '@/lib/prosody-analysis';
import {
  isSpeechRecognitionSupported,
  createSpeechRecognizer,
  SpeechRecognizerController,
} from '@/lib/speech-recognition';
import { ThrottledRiskLogger } from '@/lib/supabase-client';
import { AlertEvent } from '@/types';
import { formatTime } from '@/lib/utils';

type DemoMode = 'mic' | 'sample' | 'two_device';
type TwoDeviceTab = 'receiver' | 'caller';
type CallerVerdict = 'scanning' | 'human' | 'suspicious' | 'ai_clone';

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
    label: 'Scanning Voice…',
    sublabel: 'Analyzing acoustic harmonics & vocal tract resonance',
    icon: Eye,
    color: 'text-slate-300',
    bg: 'bg-slate-800/80 border-slate-700',
    pill: 'bg-slate-700 text-slate-300',
  },
  human: {
    label: 'REAL HUMAN (SAFE)',
    sublabel: 'Natural prosody, organic glottal pulses & micro-tremors verified',
    icon: ShieldCheck,
    color: 'text-cyan-300',
    bg: 'bg-cyan-950/60 border-cyan-500/50 shadow-[0_0_25px_rgba(6,182,212,0.25)]',
    pill: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',
  },
  suspicious: {
    label: 'SUSPICIOUS ANOMALY',
    sublabel: 'Acoustic phase jitter or linguistic conversational urgency anomaly',
    icon: AlertTriangle,
    color: 'text-amber-300',
    bg: 'bg-amber-950/60 border-amber-500/50 shadow-[0_0_25px_rgba(245,158,11,0.25)]',
    pill: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  },
  ai_clone: {
    label: 'AI DEEPFAKE CLONE',
    sublabel: 'Synthetic neural vocoder signature identified (>4kHz phase discontinuity)',
    icon: ShieldAlert,
    color: 'text-red-300',
    bg: 'bg-red-950/60 border-red-500/60 shadow-[0_0_30px_rgba(239,68,68,0.35)] animate-pulse',
    pill: 'bg-red-500/20 text-red-300 border border-red-500/40',
  },
};

export default function UnifiedDemoPage() {
  // Main Top-Level Segmented Control
  const [demoMode, setDemoMode] = useState<DemoMode>('mic');
  const [twoDeviceTab, setTwoDeviceTab] = useState<TwoDeviceTab>('receiver');

  // Expandable Technical Details state (collapsed by default)
  const [showDetails, setShowDetails] = useState<boolean>(false);

  // Shared Scoring State for Single-Device Modes (Mic / Sample)
  const [currentSmoothedScore, setCurrentSmoothedScore] = useState<number>(14);
  const [currentConfidence, setCurrentConfidence] = useState<number>(0.85);
  const [currentLabel, setCurrentLabel] = useState<'human' | 'synthetic' | 'uncertain'>('human');
  const [currentLatencyMs, setCurrentLatencyMs] = useState<number>(2.4);
  const [currentActionLabel, setCurrentActionLabel] = useState<string>('likely human, proceed');
  const [sessionAlerts, setSessionAlerts] = useState<AlertEvent[]>([]);
  const [inferenceMode, setInferenceMode] = useState<InferenceMode>('on_device');

  // Timeline data for single-device modes (capped at 30 points)
  const [timelineData, setTimelineData] = useState<TimelineDataPoint[]>([
    { time: '00:00', second: 0, smoothedScore: 14, rawScore: 12 },
  ]);

  // -------------------------------------------------------------------------
  // Two-Device State (Shared Room Code, Caller, & Receiver/Call-Guard)
  // -------------------------------------------------------------------------
  const [roomCode, setRoomCode] = useState<string>(() => generateRoomCode());
  const [copied, setCopied] = useState<boolean>(false);
  const [autoAnswer, setAutoAnswer] = useState<boolean>(true);

  // Receiver State
  const [receiverState, setReceiverState] = useState<'idle' | 'listening' | 'ringing' | 'connected' | 'ended' | 'error'>('listening');
  const [receiverDuration, setReceiverDuration] = useState<number>(0);
  const [receiverMuted, setReceiverMuted] = useState<boolean>(false);
  const [windowsAnalyzed, setWindowsAnalyzed] = useState<number>(0);
  const [receiverVerdict, setReceiverVerdict] = useState<CallerVerdict>('scanning');
  const [receiverSmoothed, setReceiverSmoothed] = useState<number>(12);
  const [receiverConfidence, setReceiverConfidence] = useState<number>(0.88);
  const [receiverLabel, setReceiverLabel] = useState<'human' | 'synthetic' | 'uncertain'>('human');
  const [receiverLatencyMs, setReceiverLatencyMs] = useState<number>(2.4);
  const [receiverWaveform, setReceiverWaveform] = useState<number[]>(() => Array.from({ length: 28 }, () => 12));
  const [receiverTimeline, setReceiverTimeline] = useState<TimelineDataPoint[]>([
    { time: '00:00', second: 0, smoothedScore: 12, rawScore: 10 },
  ]);

  // Receiver Transcript & STT
  const [receiverTranscript, setReceiverTranscript] = useState<string>('');
  const [receiverFlagged, setReceiverFlagged] = useState<string[]>([]);
  const [receiverUrgency, setReceiverUrgency] = useState<number>(0);
  const [receiverSttActive, setReceiverSttActive] = useState<boolean>(false);
  const [isSttSupported] = useState<boolean>(() => isSpeechRecognitionSupported());

  const receiverTranscriptRef = useRef<string>('');
  useEffect(() => {
    receiverTranscriptRef.current = receiverTranscript;
  }, [receiverTranscript]);

  const receiverPeerRef = useRef<Peer | null>(null);
  const receiverCallRef = useRef<MediaConnection | null>(null);
  const pendingIncomingCallRef = useRef<MediaConnection | null>(null);
  const receiverDetectorRef = useRef<StreamingDetector | null>(null);
  const receiverScorerRef = useRef<StreamingRiskScorer | null>(null);
  const receiverLoggerRef = useRef<ThrottledRiskLogger | null>(null);
  const receiverAudioRef = useRef<HTMLAudioElement | null>(null);
  const receiverAnimFrameRef = useRef<number | null>(null);
  const receiverWindowCountRef = useRef(0);
  const receiverRecognizerRef = useRef<SpeechRecognizerController | null>(null);

  // -------------------------------------------------------------------------
  // Caller State
  // -------------------------------------------------------------------------
  const [callerSource, setCallerSource] = useState<'cloned' | 'mic' | 'genuine' | 'custom'>('cloned');
  const [callerCustomUrl, setCallerCustomUrl] = useState<string | null>(null);
  const [callerCustomName, setCallerCustomName] = useState<string>('');
  const [callerStatus, setCallerStatus] = useState<string>('idle');
  const [callerStatusMsg, setCallerStatusMsg] = useState<string>('Ready to place call');
  const [callerDuration, setCallerDuration] = useState<number>(0);
  const [callerMuted, setCallerMuted] = useState<boolean>(false);
  const [callerWaveform, setCallerWaveform] = useState<number[]>(() => Array.from({ length: 24 }, () => 10));

  const callerPeerRef = useRef<Peer | null>(null);
  const callerCallRef = useRef<MediaConnection | null>(null);
  const callerStreamRef = useRef<MediaStream | null>(null);
  const callerAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const callerAudioContextRef = useRef<AudioContext | null>(null);

  // -------------------------------------------------------------------------
  // Single-Device Score Update Callbacks
  // -------------------------------------------------------------------------
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
        return next.slice(-30);
      });
    },
    []
  );

  const handleAlertTriggered = useCallback((alert: AlertEvent) => {
    setSessionAlerts((prev) => [alert, ...prev.slice(0, 15)]);
  }, []);

  // -------------------------------------------------------------------------
  // Receiver Lifecycle & WebRTC Inbound Processing
  // -------------------------------------------------------------------------
  const teardownReceiverCall = useCallback(async () => {
    if (receiverAnimFrameRef.current) {
      cancelAnimationFrame(receiverAnimFrameRef.current);
      receiverAnimFrameRef.current = null;
    }
    if (receiverRecognizerRef.current) {
      receiverRecognizerRef.current.stop();
      setReceiverSttActive(false);
    }
    if (receiverCallRef.current) {
      receiverCallRef.current.close();
      receiverCallRef.current = null;
    }
    if (pendingIncomingCallRef.current) {
      pendingIncomingCallRef.current.close();
      pendingIncomingCallRef.current = null;
    }
    if (receiverDetectorRef.current) {
      await receiverDetectorRef.current.stop();
      receiverDetectorRef.current = null;
    }
    if (receiverAudioRef.current) {
      receiverAudioRef.current.srcObject = null;
    }
  }, []);

  const attachReceiverStream = useCallback(async (remoteStream: MediaStream) => {
    setReceiverState('connected');
    setReceiverDuration(0);
    receiverWindowCountRef.current = 0;
    setWindowsAnalyzed(0);
    setReceiverVerdict('scanning');

    if (receiverAudioRef.current) {
      receiverAudioRef.current.srcObject = remoteStream;
      receiverAudioRef.current.muted = receiverMuted;
      void receiverAudioRef.current.play();
    }

    if (receiverDetectorRef.current) {
      await receiverDetectorRef.current.stop();
    }

    const detector = new StreamingDetector();
    receiverDetectorRef.current = detector;
    receiverLoggerRef.current = new ThrottledRiskLogger('webrtc_call');

    detector.onScore((windowResult: WindowRiskResult, pcmWindow?: Float32Array) => {
      if (!receiverScorerRef.current) return;

      const freqData = detector.getFrequencyData();
      const prosodyPhase = pcmWindow ? computePhaseArtifactsScore(pcmWindow, freqData) : -1;

      const kw = evaluateKeywords(receiverTranscriptRef.current);
      const composite = computeCompositeRisk(
        windowResult.riskScore,
        kw.urgencyScore,
        0,
        0,
        prosodyPhase
      );

      const evaluation = receiverScorerRef.current.evaluate(
        composite.riskScore,
        windowResult.windowStartMs
      );

      receiverWindowCountRef.current += 1;
      const count = receiverWindowCountRef.current;

      setWindowsAnalyzed(count);
      setReceiverSmoothed(evaluation.smoothedScore);
      setReceiverConfidence(windowResult.confidence);
      setReceiverLabel(windowResult.label);
      setReceiverLatencyMs(windowResult.inferenceLatencyMs);
      setReceiverVerdict(scoreToVerdict(evaluation.smoothedScore, count));

      if (receiverLoggerRef.current) {
        receiverLoggerRef.current.logWindow(
          evaluation.smoothedScore,
          windowResult.confidence,
          windowResult.label,
          evaluation.actionLabel
        );
      }

      const sec = Math.floor(windowResult.windowStartMs / 1000);
      const mins = Math.floor(sec / 60).toString().padStart(2, '0');
      const secs = (sec % 60).toString().padStart(2, '0');

      setReceiverTimeline((prev) =>
        [
          ...prev,
          {
            time: `${mins}:${secs}`,
            second: sec,
            smoothedScore: evaluation.smoothedScore,
            rawScore: composite.riskScore,
          },
        ].slice(-30)
      );
    });

    // Waveform visualization loop
    const updateWaveform = () => {
      if (receiverDetectorRef.current) {
        const freqData = receiverDetectorRef.current.getFrequencyData();
        if (freqData && freqData.length > 0) {
          const step = Math.floor(freqData.length / 28);
          const bars: number[] = [];
          for (let i = 0; i < 28; i++) {
            const val = freqData[i * step] || 0;
            bars.push(Math.max(10, Math.min(95, Math.floor((val / 255) * 100))));
          }
          setReceiverWaveform(bars);
        }
      }
      receiverAnimFrameRef.current = requestAnimationFrame(updateWaveform);
    };
    receiverAnimFrameRef.current = requestAnimationFrame(updateWaveform);

    await detector.start(remoteStream);
  }, [receiverMuted]);

  // Setup PeerJS host when in Two-Device mode
  useEffect(() => {
    if (demoMode !== 'two_device') {
      void teardownReceiverCall();
      return;
    }

    let isCleanedUp = false;

    const scorer = new StreamingRiskScorer('WEBRTC-RECEIVER', {
      alpha: 0.35,
      highRiskThreshold: 75,
      suspiciousThreshold: 45,
    });
    scorer.onAlert((alert) => {
      setSessionAlerts((prev) => [alert, ...prev.slice(0, 15)]);
    });
    receiverScorerRef.current = scorer;

    const setupReceiverPeer = async () => {
      try {
        setReceiverState('listening');
        const cleanCode = roomCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
        const hostPeerId = `voiceguard-sih-room-${cleanCode}`;

        const { default: Peer } = await import('peerjs');
        const peer = new Peer(hostPeerId, { debug: 0 });
        receiverPeerRef.current = peer;

        peer.on('open', () => {
          if (!isCleanedUp) setReceiverState('listening');
        });

        peer.on('call', (incomingCall: MediaConnection) => {
          if (isCleanedUp) return;

          if (autoAnswer) {
            incomingCall.answer();
            receiverCallRef.current = incomingCall;

            incomingCall.on('stream', (remoteStream: MediaStream) => {
              if (!isCleanedUp) void attachReceiverStream(remoteStream);
            });

            incomingCall.on('close', () => {
              if (!isCleanedUp) {
                setReceiverState('ended');
                void receiverDetectorRef.current?.stop();
              }
            });

            incomingCall.on('error', () => {
              if (!isCleanedUp) setReceiverState('error');
            });
          } else {
            pendingIncomingCallRef.current = incomingCall;
            setReceiverState('ringing');
          }
        });

        peer.on('error', (err: unknown) => {
          const peerErr = err as { type?: string };
          if (peerErr?.type === 'unavailable-id') {
            const fallback = `${cleanCode}-${Math.floor(10 + Math.random() * 90)}`;
            if (!isCleanedUp) setRoomCode(fallback);
          } else {
            if (!isCleanedUp) setReceiverState('error');
          }
        });
      } catch {
        if (!isCleanedUp) setReceiverState('error');
      }
    };

    void setupReceiverPeer();

    return () => {
      isCleanedUp = true;
      void teardownReceiverCall();
      if (receiverPeerRef.current) {
        receiverPeerRef.current.destroy();
        receiverPeerRef.current = null;
      }
      receiverScorerRef.current = null;
    };
  }, [demoMode, roomCode, autoAnswer, attachReceiverStream, teardownReceiverCall]);

  // Receiver Call Duration ticker
  useEffect(() => {
    if (receiverState !== 'connected') return;
    const interval = setInterval(() => {
      setReceiverDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [receiverState]);

  // Web Speech API STT listener initialization for Receiver
  useEffect(() => {
    if (!isSttSupported) return;

    const recognizer = createSpeechRecognizer({
      onTranscript: (text: string) => {
        setReceiverTranscript(text);
        receiverTranscriptRef.current = text;
        const kw = evaluateKeywords(text);
        setReceiverFlagged(kw.flagged);
        setReceiverUrgency(kw.urgencyScore);
      },
      onStateChange: (listening: boolean) => {
        setReceiverSttActive(listening);
      },
    });

    receiverRecognizerRef.current = recognizer;

    return () => {
      recognizer.stop();
      receiverRecognizerRef.current = null;
    };
  }, [isSttSupported]);

  const toggleReceiverStt = () => {
    if (!receiverRecognizerRef.current) return;
    if (receiverSttActive) {
      receiverRecognizerRef.current.stop();
      setReceiverSttActive(false);
    } else {
      receiverRecognizerRef.current.start();
      setReceiverSttActive(true);
    }
  };

  const answerManualCall = () => {
    if (!pendingIncomingCallRef.current) return;
    const call = pendingIncomingCallRef.current;
    receiverCallRef.current = call;
    call.answer();

    call.on('stream', (remoteStream: MediaStream) => {
      void attachReceiverStream(remoteStream);
    });
    call.on('close', () => {
      setReceiverState('ended');
      void receiverDetectorRef.current?.stop();
    });
    call.on('error', () => {
      setReceiverState('error');
    });
  };

  const rejectManualCall = () => {
    if (pendingIncomingCallRef.current) {
      pendingIncomingCallRef.current.close();
      pendingIncomingCallRef.current = null;
    }
    setReceiverState('listening');
  };

  const endReceiverCall = async () => {
    await teardownReceiverCall();
    setReceiverState('ended');
  };

  // -------------------------------------------------------------------------
  // Caller Lifecycle & Dialing Pipeline
  // -------------------------------------------------------------------------
  const hangUpCaller = useCallback(async () => {
    if (callerCallRef.current) {
      callerCallRef.current.close();
      callerCallRef.current = null;
    }
    if (callerPeerRef.current) {
      callerPeerRef.current.destroy();
      callerPeerRef.current = null;
    }
    if (callerStreamRef.current) {
      callerStreamRef.current.getTracks().forEach((t) => t.stop());
      callerStreamRef.current = null;
    }
    if (callerAudioElementRef.current) {
      callerAudioElementRef.current.pause();
      callerAudioElementRef.current = null;
    }
    if (callerAudioContextRef.current && callerAudioContextRef.current.state !== 'closed') {
      try {
        await callerAudioContextRef.current.close();
      } catch {
        // ignore
      }
      callerAudioContextRef.current = null;
    }
    setCallerStatus('idle');
    setCallerStatusMsg('Call disconnected.');
  }, []);

  useEffect(() => {
    if (callerStatus !== 'connected') return;
    const interval = setInterval(() => setCallerDuration((p) => p + 1), 1000);
    return () => clearInterval(interval);
  }, [callerStatus]);

  useEffect(() => {
    if (callerStatus !== 'connected') return;
    const interval = setInterval(() => {
      setCallerWaveform(Array.from({ length: 24 }, () => Math.floor(Math.random() * 80) + 15));
    }, 200);
    return () => clearInterval(interval);
  }, [callerStatus]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCallerCustomUrl(url);
    setCallerCustomName(file.name);
    setCallerSource('custom');
  };

  const getCallerAudioStream = async (): Promise<MediaStream> => {
    if (callerSource === 'mic') {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    let audioSrc = '/samples/cloned_voice.wav';
    if (callerSource === 'genuine') {
      audioSrc = '/samples/genuine_voice.wav';
    } else if (callerSource === 'custom' && callerCustomUrl) {
      audioSrc = callerCustomUrl;
    }

    const audio = new Audio(audioSrc);
    audio.loop = true;
    audio.crossOrigin = 'anonymous';
    callerAudioElementRef.current = audio;

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    callerAudioContextRef.current = audioCtx;

    const source = audioCtx.createMediaElementSource(audio);
    const destination = audioCtx.createMediaStreamDestination();
    source.connect(destination);
    source.connect(audioCtx.destination);

    await audio.play();
    return destination.stream;
  };

  const startCallerCall = async () => {
    try {
      setCallerStatus('initializing');
      setCallerStatusMsg('Initializing WebRTC Peer connection...');
      setCallerDuration(0);

      const cleanCode = roomCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
      if (!cleanCode) {
        alert('Please enter a valid Room Code');
        setCallerStatus('idle');
        return;
      }

      const stream = await getCallerAudioStream();
      callerStreamRef.current = stream;

      const { default: Peer } = await import('peerjs');
      const peer = new Peer();
      callerPeerRef.current = peer;

      peer.on('open', () => {
        setCallerStatus('dialing');
        const targetPeerId = `voiceguard-sih-room-${cleanCode}`;
        setCallerStatusMsg(`Dialing Receiver at Room: ${cleanCode}...`);

        const call = peer.call(targetPeerId, stream);
        callerCallRef.current = call;

        if (!call) {
          setCallerStatus('error');
          setCallerStatusMsg('Could not initiate call. Please ensure Receiver screen is open.');
          return;
        }

        setCallerStatus('connected');
        setCallerStatusMsg(`Live WebRTC Audio Streaming to Receiver (${cleanCode})`);

        call.on('close', () => {
          setCallerStatus('ended');
          setCallerStatusMsg('Call ended by Receiver.');
        });

        call.on('error', (err: unknown) => {
          const errMessage = err instanceof Error ? err.message : 'Connection lost';
          setCallerStatus('error');
          setCallerStatusMsg(`Call error: ${errMessage}`);
        });
      });

      peer.on('error', (err: unknown) => {
        const peerErr = err as { type?: string; message?: string };
        setCallerStatus('error');
        setCallerStatusMsg(`PeerJS error: ${peerErr?.type === 'peer-unavailable' ? 'Receiver not found for room ' + cleanCode : peerErr?.message || 'Connection failed'}`);
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Audio setup failed';
      setCallerStatus('error');
      setCallerStatusMsg(`Error: ${msg}`);
    }
  };

  const toggleCallerMute = () => {
    if (callerStreamRef.current) {
      const audioTrack = callerStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = callerMuted;
        setCallerMuted(!callerMuted);
      }
    }
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Compute single-device verdict
  const singleDeviceVerdict: CallerVerdict =
    currentSmoothedScore >= 80 ? 'ai_clone' : currentSmoothedScore >= 50 ? 'suspicious' : 'human';
  const SingleVerdictIcon = VERDICT_CONFIG[singleDeviceVerdict].icon;
  const ReceiverVerdictIcon = VERDICT_CONFIG[receiverVerdict].icon;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Hidden audio element for WebRTC receiver audio playback */}
      <audio ref={receiverAudioRef} autoPlay playsInline className="hidden" />

      {/* Header & Mode Segmented Control */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Sparkles className="w-7 h-7 text-cyan-400" />
            Live Voice Deepfake &amp; Anti-Spoofing Monitor
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Client-side ONNX WASM acoustic inference • 4.03s sliding window • Multi-factor risk scoring
          </p>
        </div>

        {/* Top-Level Inline Segmented Control */}
        <div className="flex items-center p-1.5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg self-start md:self-auto">
          <button
            onClick={() => setDemoMode('mic')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              demoMode === 'mic'
                ? 'bg-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Live Microphone</span>
          </button>

          <button
            onClick={() => setDemoMode('sample')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              demoMode === 'sample'
                ? 'bg-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Play Sample Call</span>
          </button>

          <button
            onClick={() => setDemoMode('two_device')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              demoMode === 'two_device'
                ? 'bg-cyan-500 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Two-Device Call Test</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODE 1 & 2: Single-Device Modes (Live Microphone / Play Sample Call) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {demoMode !== 'two_device' && (
        <div className="space-y-6">
          {/* PRIMARY FOCAL POINT: Centered Threat Verdict & Large RiskGauge */}
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            {/* Primary Threat Verdict Banner */}
            <div
              className={`w-full max-w-2xl p-4 rounded-2xl border flex items-center justify-center gap-3.5 transition-all ${VERDICT_CONFIG[singleDeviceVerdict].bg}`}
            >
              <div className={`p-2.5 rounded-xl ${VERDICT_CONFIG[singleDeviceVerdict].pill}`}>
                <SingleVerdictIcon className={`w-6 h-6 ${VERDICT_CONFIG[singleDeviceVerdict].color}`} />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono uppercase text-slate-400 font-semibold">Live Threat Verdict:</span>
                  <span className={`text-base font-extrabold ${VERDICT_CONFIG[singleDeviceVerdict].color}`}>
                    {VERDICT_CONFIG[singleDeviceVerdict].label}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">{VERDICT_CONFIG[singleDeviceVerdict].sublabel}</p>
              </div>
            </div>

            {/* Centered Large Risk Gauge */}
            <div className="w-full max-w-2xl">
              <RiskGauge
                score={currentSmoothedScore}
                latencyMs={currentLatencyMs}
                subtext={`Recommended action: ${currentActionLabel}`}
                size="lg"
                highRiskThreshold={80}
                suspiciousThreshold={50}
              />
            </div>
          </div>

          {/* Audio Ingestion & Live Monitoring Control Panel */}
          <div className="max-w-3xl mx-auto w-full">
            <LiveCallMonitor
              key={demoMode}
              initialSource={demoMode === 'mic' ? 'mic' : 'sample'}
              hideSourceToggle={true}
              onScoreUpdate={handleScoreUpdate}
              onAlertTriggered={handleAlertTriggered}
            />
          </div>

          {/* Collapsible "Show Details" Section (Collapsed by Default) */}
          <div className="max-w-3xl mx-auto w-full space-y-4">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="w-full py-3 px-5 rounded-2xl bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 text-xs font-semibold text-slate-300 flex items-center justify-between transition-all shadow-md group"
            >
              <span className="flex items-center gap-2.5">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span>Technical Analysis &amp; Timeline Breakdown</span>
              </span>
              <span className="text-slate-400 font-mono text-[11px] px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-1.5 group-hover:text-cyan-300">
                <span>{showDetails ? 'Hide Details' : 'Show Details'}</span>
                {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </span>
            </button>

            {showDetails && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
                <RiskTimeline
                  data={timelineData}
                  currentScore={currentSmoothedScore}
                  highRiskThreshold={80}
                  suspiciousThreshold={50}
                />
                <ConfidenceBreakdown
                  score={currentSmoothedScore}
                  confidence={currentConfidence}
                  label={currentLabel}
                />
              </div>
            )}
          </div>

          <div className="max-w-3xl mx-auto w-full">
            <PrivacyPanel
              inferenceMode={inferenceMode}
              onModeChange={setInferenceMode}
            />
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODE 3: Two-Device Call Test (Caller Phone & Receiver / Call Guard) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {demoMode === 'two_device' && (
        <div className="space-y-6">
          {/* Sub-tab Navigation within Two-Device Call Test */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/80 border border-slate-800 max-w-4xl mx-auto">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-cyan-950 border border-cyan-800 text-cyan-400">
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-200">
                  Two-Device Real-Time WebRTC Simulation
                </h2>
                <p className="text-xs text-slate-400">
                  Open this page on phone (Caller) and laptop (Receiver) to test live over the air
                </p>
              </div>
            </div>

            {/* Sub-Tab Switcher */}
            <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold">
              <button
                onClick={() => setTwoDeviceTab('receiver')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  twoDeviceTab === 'receiver'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Laptop className="w-3.5 h-3.5" />
                <span>Receiver / Call Guard Screen</span>
              </button>

              <button
                onClick={() => setTwoDeviceTab('caller')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  twoDeviceTab === 'caller'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Caller Phone Dialer</span>
              </button>
            </div>
          </div>

          {/* Sub-Tab 1: RECEIVER / CALL GUARD */}
          {twoDeviceTab === 'receiver' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              {/* Room Code & Auto-Answer Configuration Banner */}
              <div className="p-5 bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-cyan-950 border border-cyan-800 text-cyan-400 font-mono font-bold text-sm">
                    {roomCode}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                      <span>Receiver Room Code (Share with Caller Phone)</span>
                      <button
                        onClick={copyRoomCode}
                        className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono"
                      >
                        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copied ? 'Copied!' : 'Copy'}</span>
                      </button>
                      <button
                        onClick={() => setRoomCode(generateRoomCode())}
                        className="text-xs text-slate-500 hover:text-slate-300"
                        title="Generate New Room Code"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Peer ID: <code className="font-mono text-cyan-300">voiceguard-sih-room-{roomCode}</code>
                    </p>
                  </div>
                </div>

                {/* Auto-Answer Toggle */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setAutoAnswer(!autoAnswer)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-all ${
                      autoAnswer
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    <PhoneIncoming className={`w-3.5 h-3.5 ${autoAnswer ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span>Auto-Answer Calls: <strong className="font-bold">{autoAnswer ? 'ON' : 'OFF'}</strong></span>
                  </button>

                  <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${receiverState === 'connected' ? 'bg-emerald-400' : 'bg-cyan-400'} opacity-75`} />
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${receiverState === 'connected' ? 'bg-emerald-500' : 'bg-cyan-500'}`} />
                    </span>
                    <span className="capitalize">{receiverState}</span>
                    {receiverState === 'connected' && <span>• {formatTime(receiverDuration)}</span>}
                  </div>
                </div>
              </div>

              {/* Manual Ringing Notification (When Auto-Answer is OFF) */}
              {receiverState === 'ringing' && (
                <div className="p-5 rounded-2xl bg-amber-950/90 border border-amber-500 text-amber-100 flex flex-wrap items-center justify-between gap-4 shadow-[0_0_30px_rgba(245,158,11,0.3)] animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-900 text-amber-200">
                      <PhoneIncoming className="w-6 h-6 animate-bounce" />
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold tracking-tight text-white">
                        Incoming Call from Phone (Room: {roomCode})
                      </h3>
                      <p className="text-xs text-amber-300">
                        Caller is waiting. Accept call to initiate real-time ONNX anti-spoofing scan.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={rejectManualCall}
                      className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold border border-slate-700 transition-all"
                    >
                      Reject
                    </button>
                    <button
                      onClick={answerManualCall}
                      className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center gap-2 shadow-lg shadow-emerald-900/50 transition-all"
                    >
                      <Phone className="w-4 h-4 fill-current" />
                      <span>Answer &amp; Scan</span>
                    </button>
                  </div>
                </div>
              )}

              {/* PRIMARY FOCAL POINT: Centered Verdict & Large RiskGauge */}
              <div className="flex flex-col items-center justify-center space-y-4 text-center">
                {/* Large Caller Verdict Banner */}
                <div className={`w-full max-w-2xl p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 transition-all ${VERDICT_CONFIG[receiverVerdict].bg}`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${VERDICT_CONFIG[receiverVerdict].pill}`}>
                      <ReceiverVerdictIcon className={`w-6 h-6 ${VERDICT_CONFIG[receiverVerdict].color}`} />
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono uppercase text-slate-400 font-semibold">Live Threat Verdict:</span>
                        <span className={`text-base font-extrabold ${VERDICT_CONFIG[receiverVerdict].color}`}>
                          {VERDICT_CONFIG[receiverVerdict].label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-0.5">{VERDICT_CONFIG[receiverVerdict].sublabel}</p>
                    </div>
                  </div>

                  {receiverState === 'connected' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (receiverAudioRef.current) {
                            receiverAudioRef.current.muted = !receiverMuted;
                            setReceiverMuted(!receiverMuted);
                          }
                        }}
                        className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 text-xs hover:text-white"
                        title={receiverMuted ? 'Unmute Receiver Audio' : 'Mute Receiver Audio'}
                      >
                        {receiverMuted ? <VolumeX className="w-4 h-4 text-amber-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
                      </button>
                      <button
                        onClick={endReceiverCall}
                        className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-red-950"
                      >
                        <PhoneOff className="w-4 h-4" />
                        <span>Disconnect</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Centered Large Gauge */}
                <div className="w-full max-w-2xl">
                  <RiskGauge
                    score={receiverSmoothed}
                    latencyMs={receiverLatencyMs}
                    subtext={
                      receiverVerdict === 'ai_clone'
                        ? 'High-Risk Synthetic AI Voice Clone'
                        : receiverVerdict === 'suspicious'
                        ? 'Suspicious Acoustic / Prosody Anomaly'
                        : 'Authentic Human Voice Biometrics'
                    }
                    size="lg"
                    highRiskThreshold={75}
                    suspiciousThreshold={45}
                  />
                </div>
              </div>

              {/* Inbound Audio Waveform Visualizer */}
              <div className="p-5 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Radio className={`w-3.5 h-3.5 ${receiverState === 'connected' ? 'text-cyan-400 animate-pulse' : 'text-slate-600'}`} />
                    Inbound WebRTC Stream (16kHz Resampled)
                  </span>
                  <span>Windows Analyzed: {windowsAnalyzed}</span>
                </div>

                <div className="h-16 flex items-center justify-center gap-1 px-2 bg-slate-950 rounded-xl border border-slate-800/80">
                  {receiverWaveform.map((height, i) => (
                    <div
                      key={i}
                      className={`w-1.5 rounded-full transition-all duration-150 ${
                        receiverState === 'connected'
                          ? receiverVerdict === 'ai_clone'
                            ? 'bg-gradient-to-t from-red-600 to-red-400'
                            : receiverVerdict === 'suspicious'
                            ? 'bg-gradient-to-t from-amber-600 to-amber-400'
                            : 'bg-gradient-to-t from-cyan-600 to-cyan-400'
                          : 'bg-slate-800'
                      }`}
                      style={{ height: receiverState === 'connected' ? `${height}%` : '15%' }}
                    />
                  ))}
                </div>
              </div>

              {/* Call Notes & Speech-to-Text Transcript Panel */}
              <div className="p-5 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                    <MessageSquare className="w-4 h-4 text-cyan-400" />
                    <span>Live Call Notes &amp; Speech-to-Text</span>
                    <span className="text-slate-500 font-normal hidden sm:inline">(NLP urgency keyword matching)</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isSttSupported ? (
                      <button
                        type="button"
                        onClick={toggleReceiverStt}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-all ${
                          receiverSttActive
                            ? 'bg-red-950/80 text-red-300 border border-red-500/60 shadow-[0_0_10px_rgba(239,68,68,0.3)] animate-pulse'
                            : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
                        }`}
                      >
                        <Mic className={`w-3 h-3 ${receiverSttActive ? 'text-red-400' : 'text-cyan-400'}`} />
                        <span>{receiverSttActive ? 'Live STT: Listening...' : 'Enable Live STT (Mic)'}</span>
                      </button>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-500 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                        Browser STT unavailable (Manual Entry Active)
                      </span>
                    )}
                  </div>
                </div>

                <textarea
                  value={receiverTranscript}
                  onChange={(e) => {
                    const text = e.target.value;
                    setReceiverTranscript(text);
                    const kw = evaluateKeywords(text);
                    setReceiverFlagged(kw.flagged);
                    setReceiverUrgency(kw.urgencyScore);
                  }}
                  placeholder="Paste call transcript or type keywords heard from caller... e.g. 'Your bank account is blocked, please share OTP urgently for KYC update'"
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:ring-1 focus:ring-cyan-500/50 font-mono"
                />

                {receiverFlagged.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[11px] text-slate-400 font-mono shrink-0 flex items-center gap-1">
                      <TriangleAlert className="w-3.5 h-3.5 text-amber-400" />
                      Scam Keywords Flagged ({receiverUrgency}/100):
                    </span>
                    {receiverFlagged.map((kw) => (
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

              {/* Collapsible "Show Details" Section (Collapsed by Default) */}
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setShowDetails(!showDetails)}
                  className="w-full py-3 px-5 rounded-2xl bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 text-xs font-semibold text-slate-300 flex items-center justify-between transition-all shadow-md group"
                >
                  <span className="flex items-center gap-2.5">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <span>Technical Analysis &amp; Spectral Timeline Breakdown</span>
                  </span>
                  <span className="text-slate-400 font-mono text-[11px] px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-1.5 group-hover:text-cyan-300">
                    <span>{showDetails ? 'Hide Details' : 'Show Details'}</span>
                    {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </span>
                </button>

                {showDetails && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    <RiskTimeline
                      data={receiverTimeline}
                      currentScore={receiverSmoothed}
                      highRiskThreshold={75}
                      suspiciousThreshold={45}
                    />
                    <ConfidenceBreakdown
                      score={receiverSmoothed}
                      confidence={receiverConfidence}
                      label={receiverLabel}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sub-Tab 2: CALLER PHONE DIALER */}
          {twoDeviceTab === 'caller' && (
            <div className="max-w-lg mx-auto bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-6">
              <div className="text-center space-y-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-800 text-cyan-300 text-xs font-mono mb-2">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>WebRTC Phone Caller Dialer</span>
                </div>
                <h3 className="text-2xl font-extrabold text-white tracking-tight">
                  VoiceGuard Live Caller
                </h3>
                <p className="text-xs text-slate-400">
                  Streams live voice or simulated deepfake audio to the Receiver screen
                </p>
              </div>

              {/* Target Room Code Input */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Target Room Code:</span>
                  <span className="text-[11px] text-slate-500 font-mono">Must match Receiver Room Code</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={roomCode}
                    disabled={callerStatus === 'connected' || callerStatus === 'dialing'}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    placeholder="e.g. VG-9088"
                    className="flex-1 px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-base font-bold text-cyan-300 tracking-wider focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                  />
                  <button
                    onClick={() => setRoomCode(generateRoomCode())}
                    disabled={callerStatus === 'connected'}
                    className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                    title="Generate Random Code"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Voice Stream Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">
                  Select Outgoing Voice Stream:
                </label>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() => setCallerSource('cloned')}
                    disabled={callerStatus === 'connected'}
                    className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                      callerSource === 'cloned'
                        ? 'bg-red-950/40 border-red-500 text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-slate-200">AI-Cloned Deepfake Voice</div>
                        <div className="text-[10px] text-slate-400">Simulates synthetic vishing attack</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800">
                      DEEPFAKE
                    </span>
                  </button>

                  <button
                    onClick={() => setCallerSource('mic')}
                    disabled={callerStatus === 'connected'}
                    className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                      callerSource === 'mic'
                        ? 'bg-cyan-950/40 border-cyan-500 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Mic className="w-4 h-4 text-cyan-400 shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-slate-200">Live Phone Microphone</div>
                        <div className="text-[10px] text-slate-400">Streams your natural voice via WebRTC</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                      MIC
                    </span>
                  </button>

                  <button
                    onClick={() => setCallerSource('genuine')}
                    disabled={callerStatus === 'connected'}
                    className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                      callerSource === 'genuine'
                        ? 'bg-emerald-950/40 border-emerald-500 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-slate-200">Genuine Human Customer Call</div>
                        <div className="text-[10px] text-slate-400">Authentic biological speech sample</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      SAFE
                    </span>
                  </button>

                  <label className="cursor-pointer p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Upload className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">
                        {callerCustomName ? `File: ${callerCustomName}` : 'Upload custom test audio...'}
                      </span>
                    </div>
                    <input type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                      Choose File
                    </span>
                  </label>
                </div>
              </div>

              {/* Outgoing Audio Waveform */}
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span className="flex items-center gap-1.5">
                    <Radio className={`w-3.5 h-3.5 ${callerStatus === 'connected' ? 'text-cyan-400 animate-pulse' : 'text-slate-600'}`} />
                    Outgoing Audio
                  </span>
                  <span>{callerStatus === 'connected' ? `Duration: ${formatTime(callerDuration)}` : 'Idle'}</span>
                </div>

                <div className="h-12 flex items-center justify-center gap-1 px-2">
                  {callerWaveform.map((height, i) => (
                    <div
                      key={i}
                      className={`w-1.5 rounded-full transition-all duration-200 ${
                        callerStatus === 'connected'
                          ? callerSource === 'cloned'
                            ? 'bg-gradient-to-t from-red-600 to-red-400'
                            : 'bg-gradient-to-t from-cyan-600 to-cyan-400'
                          : 'bg-slate-800'
                      }`}
                      style={{
                        height: callerStatus === 'connected' ? `${height}%` : '15%',
                        opacity: callerStatus === 'connected' ? 0.9 : 0.3,
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="text-center text-xs font-mono text-slate-400 min-h-[20px]">
                {callerStatusMsg}
              </div>

              {/* Caller Call / Hangup CTA */}
              <div className="flex items-center gap-3">
                {callerStatus === 'connected' ? (
                  <>
                    <button
                      onClick={toggleCallerMute}
                      className={`p-4 rounded-2xl font-semibold text-xs border transition-all ${
                        callerMuted ? 'bg-amber-950 border-amber-800 text-amber-300' : 'bg-slate-800 border-slate-700 text-slate-300'
                      }`}
                      title={callerMuted ? 'Unmute' : 'Mute'}
                    >
                      {callerMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>

                    <button
                      onClick={() => void hangUpCaller()}
                      className="flex-1 py-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(239,68,68,0.4)] transition-all"
                    >
                      <PhoneOff className="w-5 h-5" />
                      <span>End Call</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => void startCallerCall()}
                    disabled={callerStatus === 'dialing' || callerStatus === 'initializing'}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-all transform hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    <Phone className="w-5 h-5 fill-current" />
                    <span>{callerStatus === 'dialing' ? 'Dialing Receiver...' : `Call Receiver (${roomCode})`}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mid-Stream Session Threat Alerts Log (ONLY renders when >= 1 alert has fired) */}
      {sessionAlerts.length > 0 && (
        <div className="max-w-4xl mx-auto p-5 bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl space-y-3">
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
              Triggered on threshold boundary crossing
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
