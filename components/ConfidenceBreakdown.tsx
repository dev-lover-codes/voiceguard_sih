'use client';

import React from 'react';
import { ConfidenceScores } from '@/types';
import { Fingerprint, Cpu, Waves, MessageSquareWarning, Radio } from 'lucide-react';

interface ConfidenceBreakdownProps {
  scores: ConfidenceScores;
  anomalyDetails?: string[];
}

export const ConfidenceBreakdown: React.FC<ConfidenceBreakdownProps> = ({
  scores,
  anomalyDetails = [],
}) => {
  const vectors = [
    {
      id: 'biometric',
      title: 'Biometric Liveness',
      desc: 'Biological vocal tract resonance & human glottal pulse integrity',
      value: scores.biometricLiveness,
      icon: <Fingerprint className="w-4 h-4 text-cyan-400" />,
      colorClass: scores.biometricLiveness > 60 ? 'bg-cyan-500' : 'bg-red-500',
      textColor: scores.biometricLiveness > 60 ? 'text-cyan-400' : 'text-red-400',
      inverted: true, // Higher is better
    },
    {
      id: 'synthetic',
      title: 'Synthetic Voice Probability',
      desc: 'Neural vocoder (HiFi-GAN / VITS / ElevenLabs) acoustic fingerprints',
      value: scores.syntheticSpeechScore,
      icon: <Cpu className="w-4 h-4 text-amber-400" />,
      colorClass: scores.syntheticSpeechScore > 65 ? 'bg-red-500' : scores.syntheticSpeechScore > 35 ? 'bg-amber-500' : 'bg-cyan-500',
      textColor: scores.syntheticSpeechScore > 65 ? 'text-red-400' : scores.syntheticSpeechScore > 35 ? 'text-amber-400' : 'text-cyan-400',
    },
    {
      id: 'phase',
      title: 'Acoustic Phase Incoherence',
      desc: 'High-frequency spectral discontinuity and phase mismatches (>4kHz)',
      value: scores.phaseArtifacts,
      icon: <Waves className="w-4 h-4 text-indigo-400" />,
      colorClass: scores.phaseArtifacts > 60 ? 'bg-red-500' : scores.phaseArtifacts > 35 ? 'bg-amber-500' : 'bg-cyan-500',
      textColor: scores.phaseArtifacts > 60 ? 'text-red-400' : scores.phaseArtifacts > 35 ? 'text-amber-400' : 'text-cyan-400',
    },
    {
      id: 'urgency',
      title: 'Linguistic Urgency & NLP',
      desc: 'Vishing pressure tactics, OTP solicitation, and panic induction phrases',
      value: scores.urgencyPromptScore,
      icon: <MessageSquareWarning className="w-4 h-4 text-red-400" />,
      colorClass: scores.urgencyPromptScore > 60 ? 'bg-red-500' : scores.urgencyPromptScore > 30 ? 'bg-amber-500' : 'bg-cyan-500',
      textColor: scores.urgencyPromptScore > 60 ? 'text-red-400' : scores.urgencyPromptScore > 30 ? 'text-amber-400' : 'text-cyan-400',
    },
    {
      id: 'signaling',
      title: 'Signaling & Carrier Anomaly',
      desc: 'VoIP gateway routing mismatch, SIP packet jitter, and caller ID spoofing',
      value: scores.signalingAnomaly,
      icon: <Radio className="w-4 h-4 text-purple-400" />,
      colorClass: scores.signalingAnomaly > 60 ? 'bg-red-500' : scores.signalingAnomaly > 30 ? 'bg-amber-500' : 'bg-cyan-500',
      textColor: scores.signalingAnomaly > 60 ? 'text-red-400' : scores.signalingAnomaly > 30 ? 'text-amber-400' : 'text-cyan-400',
    },
  ];

  return (
    <div className="flex flex-col p-5 bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Multi-Factor AI Indicators</h3>
          <p className="text-xs text-slate-400">Granular breakdown across acoustic, NLP, and telecom vectors</p>
        </div>
        <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
          5 Deep Layers
        </span>
      </div>

      {/* Vector Bars */}
      <div className="space-y-3.5">
        {vectors.map((vec) => (
          <div key={vec.id} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                {vec.icon}
                <span className="font-medium text-slate-300">{vec.title}</span>
              </div>
              <span className={`font-mono font-bold ${vec.textColor}`}>
                {vec.value}%
              </span>
            </div>
            
            {/* Progress Track */}
            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${vec.colorClass}`}
                style={{ width: `${Math.min(100, Math.max(2, vec.value))}%` }}
              />
            </div>
            
            <p className="text-[11px] text-slate-500 leading-tight">
              {vec.desc}
            </p>
          </div>
        ))}
      </div>

      {/* Anomaly Details Chips */}
      {anomalyDetails.length > 0 && (
        <div className="pt-3 border-t border-slate-800 space-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Detected Threat Signatures ({anomalyDetails.length})
          </span>
          <div className="space-y-1.5">
            {anomalyDetails.map((anomaly, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 p-2 rounded-lg bg-red-950/30 border border-red-900/40 text-[11px] text-red-300 font-mono"
              >
                <span className="text-red-500 font-bold mt-0.5">•</span>
                <span>{anomaly}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
