'use client';

import React from 'react';
import { ShieldCheck, AlertTriangle, ShieldAlert, Activity } from 'lucide-react';

interface RiskGaugeProps {
  score: number;
  latencyMs?: number;
  subtext?: string;
  size?: 'sm' | 'md' | 'lg';
  highRiskThreshold?: number;
  suspiciousThreshold?: number;
}

export const RiskGauge: React.FC<RiskGaugeProps> = ({
  score,
  latencyMs = 2.4,
  subtext,
  size = 'md',
  highRiskThreshold = 80,
  suspiciousThreshold = 50,
}) => {
  const isHighRisk = score >= highRiskThreshold;
  const isSuspicious = score >= suspiciousThreshold && score < highRiskThreshold;

  const colorMeta = isHighRisk
    ? {
        text: 'text-red-400',
        bg: 'bg-red-950/40',
        border: 'border-red-500/40',
        badge: 'bg-red-500/15 text-red-300 border border-red-500/30 animate-pulse',
        hex: '#ef4444',
        label: 'HIGH-RISK DEEPFAKE',
        icon: <ShieldAlert className="w-5 h-5 text-red-400 animate-bounce" />,
      }
    : isSuspicious
    ? {
        text: 'text-amber-400',
        bg: 'bg-amber-950/40',
        border: 'border-amber-500/40',
        badge: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
        hex: '#f59e0b',
        label: 'SUSPICIOUS PATTERN',
        icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
      }
    : {
        text: 'text-cyan-400',
        bg: 'bg-cyan-950/40',
        border: 'border-cyan-500/40',
        badge: 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30',
        hex: '#06b6d4',
        label: 'LIKELY HUMAN (SAFE)',
        icon: <ShieldCheck className="w-5 h-5 text-cyan-400" />,
      };

  // SVG Arc calculation for 240 degree gauge
  const radius = size === 'lg' ? 110 : size === 'sm' ? 65 : 85;
  const strokeWidth = size === 'lg' ? 14 : size === 'sm' ? 10 : 12;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;
  const strokeDashoffset = arcLength - (arcLength * Math.min(100, Math.max(0, score))) / 100;
  const dimension = (radius + strokeWidth) * 2 + 10;

  return (
    <div className="relative flex flex-col items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl overflow-hidden group">
      {/* Ambient background glow */}
      <div
        className="absolute -top-16 -left-16 w-32 h-32 rounded-full blur-3xl opacity-25 pointer-events-none transition-all duration-700"
        style={{ backgroundColor: colorMeta.hex }}
      />
      <div
        className="absolute -bottom-16 -right-16 w-32 h-32 rounded-full blur-3xl opacity-20 pointer-events-none transition-all duration-700"
        style={{ backgroundColor: colorMeta.hex }}
      />

      {/* Header */}
      <div className="w-full flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-slate-400" />
          Smoothed Risk Index (EMA)
        </span>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700">
          {latencyMs.toFixed(1)}ms WASM
        </span>
      </div>

      {/* Circular Gauge SVG */}
      <div className="relative flex items-center justify-center my-2">
        <svg
          width={dimension}
          height={dimension}
          className="transform -rotate-225 transition-all duration-500"
        >
          {/* Background track */}
          <circle
            cx={dimension / 2}
            cy={dimension / 2}
            r={radius}
            fill="none"
            stroke="#1E293B"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />
          {/* Active Meter Arc */}
          <circle
            cx={dimension / 2}
            cy={dimension / 2}
            r={radius}
            fill="none"
            stroke={colorMeta.hex}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
            style={{
              filter: `drop-shadow(0 0 10px ${colorMeta.hex}88)`,
            }}
          />
        </svg>

        {/* Center Score Readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <div className="flex items-baseline">
            <span
              className={`font-mono font-bold tracking-tight transition-colors duration-500 ${
                size === 'lg' ? 'text-5xl' : size === 'sm' ? 'text-3xl' : 'text-4xl'
              } ${colorMeta.text}`}
            >
              {Math.round(score)}
            </span>
            <span className="text-xs font-mono text-slate-500 ml-1">/100</span>
          </div>
          <span className="text-[11px] uppercase tracking-widest text-slate-400 font-medium mt-0.5">
            Smoothed Risk
          </span>
        </div>
      </div>

      {/* Threat Status Badge */}
      <div className="mt-1 flex flex-col items-center gap-1.5 w-full">
        <div
          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider transition-all duration-500 ${colorMeta.badge}`}
        >
          {colorMeta.icon}
          <span>{colorMeta.label}</span>
        </div>

        {subtext && (
          <p className="text-xs text-slate-400 text-center line-clamp-2 px-2 mt-1">
            {subtext}
          </p>
        )}
      </div>

      {/* Configurable Threshold Markers */}
      <div className="w-full grid grid-cols-3 gap-1 mt-4 pt-3 border-t border-slate-800/80 text-[10px] text-center font-mono">
        <div className="flex flex-col items-center">
          <span className="text-cyan-400 font-semibold">&lt; {suspiciousThreshold}</span>
          <span className="text-slate-500 text-[9px] uppercase">Proceed</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-amber-400 font-semibold">{suspiciousThreshold} - {highRiskThreshold}</span>
          <span className="text-slate-500 text-[9px] uppercase">Verify</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-red-400 font-semibold">&gt; {highRiskThreshold}</span>
          <span className="text-slate-500 text-[9px] uppercase">Block/Escalate</span>
        </div>
      </div>
    </div>
  );
};
