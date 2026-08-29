'use client';

import React, { useState, useEffect, useRef } from 'react';
import { RiskGauge } from '@/components/RiskGauge';
import { RiskTimeline } from '@/components/RiskTimeline';
import { ConfidenceBreakdown } from '@/components/ConfidenceBreakdown';
import { LiveCallMonitor } from '@/components/LiveCallMonitor';
import { AudioSampleScenario, RiskResult, TimelinePoint } from '@/types';
import { computeCompositeRisk } from '@/lib/risk-scoring';
import { onnxInferenceEngine } from '@/lib/onnx-inference';
import {
  Play,
  Pause,
  RotateCcw,
  Mic,
  MicOff,
  Sparkles,
  Cpu,
} from 'lucide-react';

const SCENARIOS: AudioSampleScenario[] = [
  {
    id: 's1-bank-manager',
    title: 'Bank Manager Voice Clone (ElevenLabs V2)',
    category: 'Deepfake Cloned',
    caller: 'State Bank Fraud Dept (+91 98200 11984)',
    target: 'Account Holder #4491',
    description: 'Neural voice synthesis mimicking regional branch manager requesting emergency OTP to unblock debit card.',
    initialRiskLevel: 'HIGH_RISK',
    initialScore: 92,
    transcripts: [
      {
        sec: 3,
        speaker: 'Caller',
        text: 'Good afternoon, this is Rajiv Sharma from State Bank central branch. We have detected suspicious login from Nigeria on your account.',
        flaggedKeywords: ['suspicious login'],
        riskScore: 35,
        spoofScore: 40,
        urgencyScore: 25,
      },
      {
        sec: 8,
        speaker: 'Victim',
        text: 'Oh no, really? I am at work right now, what should I do?',
        riskScore: 35,
        spoofScore: 40,
        urgencyScore: 25,
      },
      {
        sec: 14,
        speaker: 'Caller',
        text: 'I will help you reverse the charge. I just initiated an instant security token. Please share the 6-digit OTP received on your mobile.',
        flaggedKeywords: ['reverse the charge', 'OTP', 'instant'],
        riskScore: 78,
        spoofScore: 88,
        urgencyScore: 75,
      },
      {
        sec: 22,
        speaker: 'Caller',
        text: 'Please hurry, you only have 20 seconds before the bank account is blocked permanently and tax penalty is levied.',
        flaggedKeywords: ['hurry', 'account is blocked', 'tax penalty'],
        riskScore: 94,
        spoofScore: 96,
        urgencyScore: 95,
      },
    ],
  },
  {
    id: 's2-digital-arrest',
    title: 'Customs & Digital Arrest Extortion Scam',
    category: 'Social Engineering Vishing',
    caller: 'CBI / Customs Officer (+91 11 2309 2011)',
    target: 'Citizen Victim',
    description: 'High-urgency social engineering with simulated background radio static and synthesized authoritative voice tone.',
    initialRiskLevel: 'HIGH_RISK',
    initialScore: 89,
    transcripts: [
      {
        sec: 2,
        speaker: 'Caller',
        text: 'This is Sub-Inspector Verma from Mumbai Customs. A parcel containing prohibited substances in your name has been intercepted.',
        flaggedKeywords: ['Customs'],
        riskScore: 45,
        spoofScore: 50,
        urgencyScore: 40,
      },
      {
        sec: 9,
        speaker: 'Caller',
        text: 'Under narcotics act, you are under immediate digital arrest. You must transfer refundable security bond to verify innocence.',
        flaggedKeywords: ['digital arrest', 'immediate', 'transfer'],
        riskScore: 86,
        spoofScore: 82,
        urgencyScore: 90,
      },
      {
        sec: 18,
        speaker: 'Caller',
        text: 'Do not disconnect the call or legal warrant will be executed at your residence within 10 minutes.',
        flaggedKeywords: ['legal warrant', '10 minutes'],
        riskScore: 96,
        spoofScore: 92,
        urgencyScore: 98,
      },
    ],
  },
  {
    id: 's3-genuine-call',
    title: 'Legitimate Customer Support Interaction',
    category: 'Legitimate',
    caller: 'HDFC Priority Support (+91 22 6160 6161)',
    target: 'Verified Customer',
    description: 'Authentic human operator verifying credit card upgrade request without soliciting confidential credentials or passwords.',
    initialRiskLevel: 'VERIFIED',
    initialScore: 12,
    transcripts: [
      {
        sec: 3,
        speaker: 'Caller',
        text: 'Good morning Mr. Mehta, calling from HDFC Bank regarding your query on reward points redemption.',
        riskScore: 10,
        spoofScore: 12,
        urgencyScore: 5,
      },
      {
        sec: 10,
        speaker: 'Victim',
        text: 'Yes, I wanted to know if I can convert the points into air miles.',
        riskScore: 10,
        spoofScore: 12,
        urgencyScore: 5,
      },
      {
        sec: 17,
        speaker: 'Caller',
        text: 'Certainly! You can do that directly inside your official NetBanking portal under cards section. We will never ask for your password or OTP.',
        riskScore: 8,
        spoofScore: 9,
        urgencyScore: 0,
      },
    ],
  },
];

export default function DemoPage() {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(SCENARIOS[0].id);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentSec, setCurrentSec] = useState<number>(0);
  const [isMicActive, setIsMicActive] = useState<boolean>(false);
  const [micSpoofProb, setMicSpoofProb] = useState<number>(14);
  const [timelineData, setTimelineData] = useState<TimelinePoint[]>([
    {
      time: '00:00',
      second: 0,
      riskScore: SCENARIOS[0].transcripts[0].riskScore,
      acousticSpoof: SCENARIOS[0].transcripts[0].spoofScore,
      urgency: SCENARIOS[0].transcripts[0].urgencyScore,
      threshold: 70,
    },
  ]);

  const activeScenario = SCENARIOS.find((s) => s.id === selectedScenarioId) || SCENARIOS[0];
  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const handleSelectScenario = (id: string) => {
    const nextScenario = SCENARIOS.find((s) => s.id === id) || SCENARIOS[0];
    setSelectedScenarioId(id);
    setCurrentSec(0);
    setIsPlaying(false);
    setIsMicActive(false);
    const initialT = nextScenario.transcripts[0];
    setTimelineData([
      {
        time: '00:00',
        second: 0,
        riskScore: initialT.riskScore,
        acousticSpoof: initialT.spoofScore,
        urgency: initialT.urgencyScore,
        threshold: 70,
      },
    ]);
  };

  // Filter visible transcripts up to current elapsed simulation time
  const visibleTranscripts = isMicActive
    ? [
        {
          sec: 2,
          speaker: 'Caller' as const,
          text: 'Listening to live microphone input... Performing real-time ONNX acoustic feature analysis.',
          riskScore: micSpoofProb,
          spoofScore: micSpoofProb,
          urgencyScore: 5,
        },
      ]
    : activeScenario.transcripts.filter((t) => t.sec <= currentSec);

  const latestTranscript = visibleTranscripts[visibleTranscripts.length - 1] || activeScenario.transcripts[0];

  const currentRisk: RiskResult = isMicActive
    ? computeCompositeRisk(micSpoofProb, 8, 10, 5)
    : computeCompositeRisk(
        latestTranscript.spoofScore,
        latestTranscript.urgencyScore,
        activeScenario.category === 'Legitimate' ? 10 : 75,
        activeScenario.category === 'Legitimate' ? 5 : 60
      );

  // Playback timer ticker
  useEffect(() => {
    if (!isPlaying) return;

    const timer = setInterval(() => {
      setCurrentSec((prev) => {
        const next = prev + 1;
        const currentT = activeScenario.transcripts.find((t) => t.sec === next) || latestTranscript;
        
        // Append to timeline
        setTimelineData((old) => [
          ...old,
          {
            time: `00:${next.toString().padStart(2, '0')}`,
            second: next,
            riskScore: currentT.riskScore,
            acousticSpoof: currentT.spoofScore,
            urgency: currentT.urgencyScore,
            threshold: 70,
          },
        ]);

        if (next >= 26) {
          setIsPlaying(false);
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlaying, activeScenario, latestTranscript]);

  // Microphone real-time testing
  const toggleMicrophone = async () => {
    if (isMicActive) {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      setIsMicActive(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      setIsMicActive(true);
      setIsPlaying(false);

      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtxClass();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      const buffer = new Float32Array(analyser.fftSize);

      const micInterval = setInterval(async () => {
        if (!micStreamRef.current?.active) {
          clearInterval(micInterval);
          return;
        }
        analyser.getFloatTimeDomainData(buffer);
        const res = await onnxInferenceEngine.analyzeAudioFrame(buffer);
        setMicSpoofProb(res.syntheticSpeechProb);
      }, 500);
    } catch {
      alert('Microphone access could not be acquired or is not supported in this browser.');
    }
  };

  const handleReset = () => {
    setCurrentSec(0);
    setIsPlaying(false);
    setTimelineData([
      {
        time: '00:00',
        second: 0,
        riskScore: activeScenario.transcripts[0].riskScore,
        acousticSpoof: activeScenario.transcripts[0].spoofScore,
        urgency: activeScenario.transcripts[0].urgencyScore,
        threshold: 70,
      },
    ]);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Sparkles className="w-7 h-7 text-cyan-400" />
            Live Deepfake & Vishing Call Simulator
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Test pre-recorded synthetic voice attacks or test your own microphone against the ONNX acoustic engine
          </p>
        </div>

        {/* Engine mode pill */}
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-300 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>MODEL: ONNX-WASM FP32</span>
          </div>
        </div>
      </div>

      {/* Scenario Preset Selector Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => handleSelectScenario(s.id)}
            className={`p-4 rounded-2xl border text-left transition-all ${
              selectedScenarioId === s.id && !isMicActive
                ? s.category === 'Legitimate'
                  ? 'bg-cyan-950/40 border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.2)]'
                  : 'bg-red-950/40 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                  s.category === 'Legitimate'
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    : 'bg-red-500/20 text-red-300 border-red-500/40'
                }`}
              >
                {s.category}
              </span>
              <span className="font-mono text-xs text-slate-400">
                {s.initialScore}/100 Risk
              </span>
            </div>
            <h3 className="text-sm font-bold text-slate-100">{s.title}</h3>
            <p className="text-xs text-slate-400 mt-1 line-clamp-2">{s.description}</p>
          </button>
        ))}
      </div>

      {/* Simulation Playback & Mic Control Bar */}
      <div className="p-4 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            disabled={isMicActive}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
              isPlaying
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.35)]'
            } ${isMicActive ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4" />
                <span>Pause Scenario</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Play Live Simulation</span>
              </>
            )}
          </button>

          <button
            onClick={handleReset}
            disabled={isMicActive}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="Reset Simulation"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Live Microphone Analysis Toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleMicrophone}
            className={`px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 border transition-all ${
              isMicActive
                ? 'bg-red-600 text-white border-red-500 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            {isMicActive ? (
              <>
                <MicOff className="w-4 h-4" />
                <span>Stop Mic Analyzer</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 text-cyan-400" />
                <span>Test Live Microphone</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Simulator Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Waveform, Live Call Monitor & Timeline (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <LiveCallMonitor
            metadata={{
              callId: isMicActive ? 'MIC-LIVE-01' : activeScenario.id,
              callerNumber: isMicActive ? 'Local Microphone Stream' : activeScenario.caller,
              callerLocation: isMicActive ? 'Client Browser WASM' : 'Inbound Route',
              telecomCarrier: isMicActive ? 'Web Audio API' : 'SIP Trunk',
              channelType: isMicActive ? 'WebRTC' : 'VoIP',
              startTime: new Date().toISOString(),
              durationSec: currentSec,
              status: currentRisk.riskLevel === 'HIGH_RISK' ? 'flagged' : currentRisk.riskLevel === 'SUSPICIOUS' ? 'analyzing' : 'verified',
            }}
            riskLevel={currentRisk.riskLevel}
            transcriptEntries={visibleTranscripts}
            isPlaying={isPlaying || isMicActive}
            onTogglePlay={() => setIsPlaying(!isPlaying)}
          />

          <RiskTimeline data={timelineData} currentScore={currentRisk.riskScore} />
        </div>

        {/* Right: Gauge & Detailed Indicators (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <RiskGauge
            score={currentRisk.riskScore}
            level={currentRisk.riskLevel}
            latencyMs={currentRisk.latencyMs}
            subtext={currentRisk.recommendation}
            size="lg"
          />

          <ConfidenceBreakdown
            scores={currentRisk.confidenceScores}
            anomalyDetails={currentRisk.anomalyDetails}
          />
        </div>
      </div>
    </div>
  );
}
