'use client';

import React, { useState, useEffect } from 'react';
import { RiskGauge } from '@/components/RiskGauge';
import { RiskTimeline } from '@/components/RiskTimeline';
import { ConfidenceBreakdown } from '@/components/ConfidenceBreakdown';
import { LiveCallMonitor } from '@/components/LiveCallMonitor';
import { AlertFeed } from '@/components/AlertFeed';
import { CallMetadata, RiskResult, TimelinePoint, AlertEvent } from '@/types';
import { computeCompositeRisk } from '@/lib/risk-scoring';
import { getSecurityAlerts } from '@/lib/supabase-client';
import {
  ShieldAlert,
  PhoneCall,
  Activity,
  CheckCircle2,
  SlidersHorizontal,
} from 'lucide-react';

const mockActiveCalls: CallMetadata[] = [
  {
    callId: 'VG-98421',
    callerNumber: '+91 98201 55904',
    callerName: 'SBI Verification Hub (Deepfake)',
    callerLocation: 'Delhi, DL (VoIP Proxy)',
    telecomCarrier: 'VoIP Trunk Route 9',
    channelType: 'VoIP',
    startTime: new Date(Date.now() - 48000).toISOString(),
    durationSec: 48,
    status: 'flagged',
  },
  {
    callId: 'VG-98422',
    callerNumber: '+91 94112 00381',
    callerName: 'Priya Sharma (Genuine)',
    callerLocation: 'Bengaluru, KA',
    telecomCarrier: 'Jio 5G Voice',
    channelType: 'Cellular',
    startTime: new Date(Date.now() - 120000).toISOString(),
    durationSec: 120,
    status: 'verified',
  },
  {
    callId: 'VG-98423',
    callerNumber: '+1 (800) 555-0199',
    callerName: 'Tax Audit Dept (Suspect)',
    callerLocation: 'International Inbound',
    telecomCarrier: 'SIP Gateway UK',
    channelType: 'VoIP',
    startTime: new Date(Date.now() - 32000).toISOString(),
    durationSec: 32,
    status: 'analyzing',
  },
];

const mockTranscripts = [
  {
    sec: 5,
    speaker: 'Caller' as const,
    text: 'Hello, this is officer Vikram from State Bank Head Office. Your savings account has been placed under emergency freeze due to an unauthorized overseas transaction.',
    flaggedKeywords: ['emergency freeze', 'unauthorized'],
  },
  {
    sec: 14,
    speaker: 'Victim' as const,
    text: 'What? I did not initiate any overseas transaction. How do I unfreeze it?',
  },
  {
    sec: 22,
    speaker: 'Caller' as const,
    text: 'Do not panic. I have sent an urgent 6-digit OTP to your registered mobile number for KYC update. Read it to me immediately to cancel the penalty.',
    flaggedKeywords: ['urgent', 'OTP', 'KYC update', 'penalty'],
  },
  {
    sec: 35,
    speaker: 'Victim' as const,
    text: 'Let me check my SMS... but my bank told me never to share OTP over the phone.',
  },
  {
    sec: 44,
    speaker: 'Caller' as const,
    text: 'Maam, this is an automated police verification protocol. If you fail to disclose the OTP in next 30 seconds, digital arrest will be issued.',
    flaggedKeywords: ['police verification', 'disclose the OTP', 'digital arrest'],
  },
];

const initialTimelineData: TimelinePoint[] = [
  { time: '00:05', second: 5, riskScore: 28, acousticSpoof: 35, urgency: 20, threshold: 70 },
  { time: '00:15', second: 15, riskScore: 48, acousticSpoof: 60, urgency: 35, threshold: 70 },
  { time: '00:25', second: 25, riskScore: 78, acousticSpoof: 86, urgency: 72, threshold: 70 },
  { time: '00:35', second: 35, riskScore: 88, acousticSpoof: 91, urgency: 85, threshold: 70 },
  { time: '00:48', second: 48, riskScore: 94, acousticSpoof: 96, urgency: 92, threshold: 70 },
];

export default function DashboardPage() {
  const [selectedCallId, setSelectedCallId] = useState<string>('VG-98421');
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);

  const activeCall = mockActiveCalls.find((c) => c.callId === selectedCallId) || mockActiveCalls[0];

  // Dynamic risk calculation based on selected call
  const isHighRiskScenario = selectedCallId === 'VG-98421';
  const isSuspiciousScenario = selectedCallId === 'VG-98423';

  const currentRisk: RiskResult = isHighRiskScenario
    ? computeCompositeRisk(94, 90, 75, 80)
    : isSuspiciousScenario
    ? computeCompositeRisk(52, 45, 60, 30)
    : computeCompositeRisk(12, 5, 8, 4);

  useEffect(() => {
    async function loadAlerts() {
      const data = await getSecurityAlerts();
      setAlerts(data);
    }
    loadAlerts();
  }, []);

  const handleTerminateCall = () => {
    alert(`Call ${activeCall.callId} terminated by SOC analyst. Audio stream blocked.`);
    setIsPlaying(false);
  };

  const handleChallengeCaller = () => {
    alert(`Biometric voice challenge injection sent to channel ${activeCall.callId}. Requesting dynamic phoneme phrase verification.`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Banner & Telemetry KPIs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Activity className="w-7 h-7 text-cyan-400" />
            SOC Live Operations Center
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real-time biometric liveness tracking and acoustic anomaly telemetry
          </p>
        </div>

        {/* Live Status indicator */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-300">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            <span>SOC STATUS: MONITORING</span>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">Active Channels</span>
            <div className="text-2xl font-bold font-mono text-white mt-1">3 Calls</div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-800 text-cyan-400">
            <PhoneCall className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">Flagged Threats</span>
            <div className="text-2xl font-bold font-mono text-red-400 mt-1">1 Critical</div>
          </div>
          <div className="p-2.5 rounded-xl bg-red-950/60 text-red-400 border border-red-900/50">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">WASM Latency</span>
            <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">{currentRisk.latencyMs}ms</div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-800 text-cyan-400">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">Verified Identity Rate</span>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">98.2%</div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-950/60 text-emerald-400 border border-emerald-900/50">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Active Call Selector Tabs */}
      <div className="p-3 bg-slate-900/80 backdrop-blur-md rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-300">Monitored Call Streams:</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {mockActiveCalls.map((call) => (
            <button
              key={call.callId}
              onClick={() => setSelectedCallId(call.callId)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-2 ${
                selectedCallId === call.callId
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-md'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  call.status === 'flagged'
                    ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]'
                    : call.status === 'analyzing'
                    ? 'bg-amber-400'
                    : 'bg-cyan-400'
                }`}
              />
              <span>{call.callId} ({call.callerNumber})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Monitoring Section Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Call Stream & Transcript (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <LiveCallMonitor
            metadata={activeCall}
            riskLevel={currentRisk.riskLevel}
            transcriptEntries={mockTranscripts}
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying(!isPlaying)}
            onTerminateCall={handleTerminateCall}
            onChallengeCaller={handleChallengeCaller}
          />

          {/* Risk Progression Timeline */}
          <RiskTimeline
            data={initialTimelineData}
            currentScore={currentRisk.riskScore}
          />
        </div>

        {/* Right Column: Risk Gauge, Multi-Factor Breakdown & Live Alert Feed (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <RiskGauge
            score={currentRisk.riskScore}
            level={currentRisk.riskLevel}
            latencyMs={currentRisk.latencyMs}
            subtext={currentRisk.recommendation}
            size="md"
          />

          <ConfidenceBreakdown
            scores={currentRisk.confidenceScores}
            anomalyDetails={currentRisk.anomalyDetails}
          />
        </div>
      </div>

      {/* Full-width Alert Feed */}
      <div className="mt-6">
        <AlertFeed initialAlerts={alerts} />
      </div>
    </div>
  );
}
