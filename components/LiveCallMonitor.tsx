'use client';

import React, { useEffect, useState } from 'react';
import { CallMetadata, RiskLevel } from '@/types';
import {
  PhoneCall,
  PhoneOff,
  ShieldAlert,
  Mic,
  Volume2,
  VolumeX,
  Radio,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertOctagon,
} from 'lucide-react';
import { formatTime, getRiskColorClass } from '@/lib/utils';

interface LiveCallMonitorProps {
  metadata: CallMetadata;
  riskLevel: RiskLevel;
  transcriptEntries: Array<{
    sec: number;
    speaker: 'Caller' | 'Victim' | 'System';
    text: string;
    flaggedKeywords?: string[];
  }>;
  isPlaying: boolean;
  onTogglePlay?: () => void;
  onTerminateCall?: () => void;
  onChallengeCaller?: () => void;
}

export const LiveCallMonitor: React.FC<LiveCallMonitorProps> = ({
  metadata,
  riskLevel,
  transcriptEntries,
  isPlaying,
  onTogglePlay,
  onTerminateCall,
  onChallengeCaller,
}) => {
  const [duration, setDuration] = useState(metadata.durationSec);
  const [isMuted, setIsMuted] = useState(false);
  const [waveformBars, setWaveformBars] = useState<number[]>(() =>
    Array.from({ length: 32 }, () => Math.floor(Math.random() * 80) + 15)
  );

  // Soundwave animation generator
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setWaveformBars(Array.from({ length: 32 }, () => Math.floor(Math.random() * 85) + 10));
      setDuration((prev) => prev + 1);
    }, 400);

    return () => clearInterval(interval);
  }, [isPlaying]);

  const colorMeta = getRiskColorClass(riskLevel);

  return (
    <div className="flex flex-col bg-slate-900/70 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl overflow-hidden">
      {/* Top Banner with Caller Telemetry */}
      <div className="p-5 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div
            className={`p-3 rounded-xl border flex items-center justify-center ${
              isPlaying ? 'bg-cyan-950/60 border-cyan-500/50 text-cyan-400' : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <PhoneCall className={`w-5 h-5 ${isPlaying ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-100 font-mono tracking-tight">
                {metadata.callerNumber}
              </h2>
              {metadata.callerName && (
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {metadata.callerName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
              <span className="flex items-center gap-1 font-mono">
                <Radio className="w-3.5 h-3.5 text-cyan-400" />
                {metadata.channelType} • {metadata.telecomCarrier}
              </span>
              <span>•</span>
              <span className="text-slate-400">{metadata.callerLocation}</span>
            </div>
          </div>
        </div>

        {/* Call Timer & Threat Pill */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-slate-300">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{formatTime(duration)}</span>
          </div>

          <div
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${colorMeta.badge}`}
          >
            {riskLevel === 'HIGH_RISK' ? (
              <>
                <AlertOctagon className="w-4 h-4 text-red-400 animate-spin" />
                <span>THREAT ACTIVE</span>
              </>
            ) : riskLevel === 'SUSPICIOUS' ? (
              <>
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>ANALYZING</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                <span>AUTHENTIC</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Audio Waveform Stream Canvas */}
      <div className="p-5 bg-gradient-to-b from-slate-950/40 to-slate-900/60 border-b border-slate-800/80">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2 font-mono">
          <span className="flex items-center gap-1.5">
            <Mic className={`w-3.5 h-3.5 ${isPlaying ? 'text-cyan-400 animate-pulse' : 'text-slate-500'}`} />
            Live Inbound Acoustic Stream (16kHz PCM)
          </span>
          <span className="text-slate-500">Fast Fourier Transform Spectrogram</span>
        </div>

        {/* Dynamic Waveform Visualizer */}
        <div className="h-20 flex items-center justify-center gap-1 px-4 py-2 bg-slate-950/70 rounded-xl border border-slate-800/80 overflow-hidden">
          {waveformBars.map((height, i) => (
            <div
              key={i}
              className={`w-2 rounded-full transition-all duration-300 ${
                riskLevel === 'HIGH_RISK'
                  ? 'bg-gradient-to-t from-red-600 to-red-400 shadow-[0_0_6px_rgba(239,68,68,0.5)]'
                  : riskLevel === 'SUSPICIOUS'
                  ? 'bg-gradient-to-t from-amber-600 to-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.5)]'
                  : 'bg-gradient-to-t from-cyan-600 to-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.5)]'
              }`}
              style={{
                height: isPlaying ? `${height}%` : '8%',
                opacity: isPlaying ? (i % 2 === 0 ? 0.9 : 0.7) : 0.3,
              }}
            />
          ))}
        </div>
      </div>

      {/* Live AI Transcription Feed */}
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            Live Voice Transcription & Scam Keyword Detection
          </h3>
          <span className="text-[11px] font-mono text-slate-500">
            {transcriptEntries.length} dialog turns
          </span>
        </div>

        <div className="max-h-56 overflow-y-auto space-y-2.5 pr-2 custom-scrollbar">
          {transcriptEntries.map((item, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-xl border text-xs leading-relaxed transition-all ${
                item.speaker === 'Caller'
                  ? item.flaggedKeywords && item.flaggedKeywords.length > 0
                    ? 'bg-red-950/30 border-red-900/50 text-red-200'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-200'
                  : 'bg-slate-900/80 border-slate-800 text-slate-300 ml-4'
              }`}
            >
              <div className="flex items-center justify-between mb-1 font-mono text-[11px]">
                <span
                  className={`font-semibold ${
                    item.speaker === 'Caller' ? 'text-amber-300' : 'text-cyan-400'
                  }`}
                >
                  {item.speaker} [{formatTime(item.sec)}]
                </span>
                {item.flaggedKeywords && item.flaggedKeywords.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-red-900/80 text-red-300 text-[10px] font-bold tracking-wide">
                    FLAGGED: {item.flaggedKeywords.join(', ')}
                  </span>
                )}
              </div>
              <p className="text-slate-300">{item.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Call Action Bar */}
      <div className="p-4 bg-slate-950/90 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title={isMuted ? 'Unmute Stream' : 'Mute Stream'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          
          {onTogglePlay && (
            <button
              onClick={onTogglePlay}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                isPlaying
                  ? 'bg-amber-600/80 hover:bg-amber-600 text-white'
                  : 'bg-cyan-600/80 hover:bg-cyan-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)]'
              }`}
            >
              {isPlaying ? 'Pause Simulation' : 'Resume Live Stream'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onChallengeCaller && (
            <button
              onClick={onChallengeCaller}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-400 hover:text-cyan-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Biometric Challenge
            </button>
          )}

          {onTerminateCall && (
            <button
              onClick={onTerminateCall}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-[0_0_15px_rgba(239,68,68,0.4)] transition-all"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              Terminate Call (SOC)
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
