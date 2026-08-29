'use client';

import React from 'react';
import { RiskLevel } from '@/types';
import { ShieldCheck, AlertTriangle, ShieldAlert, Activity } from 'lucide-react';
import { getRiskColorClass } from '@/lib/utils';

interface RiskGaugeProps {
  score: number;
  level: RiskLevel;
  latencyMs?: number;
  subtext?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const RiskGauge: React.FC<RiskGaugeProps> = ({
  score,
  level,
  latencyMs = 2.4,
  subtext,
  size = 'md',
}) => {
  const colorMeta = getRiskColorClass(level);
  
  // SVG Arc calculation for 240 degree gauge
  const radius = size === 'lg' ? 110 : size === 'sm' ? 65 : 85;
  const strokeWidth = size === 'lg' ? 14 : size === 'sm' ? 10 : 12;
  const circumference = 2 * Math.PI * radius;
  // We use 75% of full circle (270 deg)
  const arcLength = circumference * 0.75;
  const strokeDashoffset = arcLength - (arcLength * Math.min(100, Math.max(0, score))) / 100;
  const dimension = (radius + strokeWidth) * 2 + 10;

  const getStatusIcon = () => {
    switch (level) {
      case 'VERIFIED':
        return <ShieldCheck className="w-5 h-5 text-cyan-400" />;
      case 'SUSPICIOUS':
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      case 'HIGH_RISK':
        return <ShieldAlert className="w-5 h-5 text-red-400 animate-bounce" />;
    }
  };

  const getStatusLabel = () => {
    switch (level) {
      case 'VERIFIED':
        return 'BIOMETRIC VERIFIED';
      case 'SUSPICIOUS':
        return 'SUSPICIOUS PATTERN';
      case 'HIGH_RISK':
        return 'DEEPFAKE FLAGGED';
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl overflow-hidden group">
      {/* Ambient background glow matching risk */}
      <div
        className="absolute -top-16 -left-16 w-32 h-32 rounded-full blur-3xl opacity-20 pointer-events-none transition-all duration-700"
        style={{ backgroundColor: colorMeta.hex }}
      />
      <div
        className="absolute -bottom-16 -right-16 w-32 h-32 rounded-full blur-3xl opacity-15 pointer-events-none transition-all duration-700"
        style={{ backgroundColor: colorMeta.hex }}
      />

      {/* Header with Title & Latency */}
      <div className="w-full flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-slate-400" />
          Composite Threat Index
        </span>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700">
          {latencyMs.toFixed(1)}ms
        </span>
      </div>

      {/* Radial Gauge SVG */}
      <div className="relative flex items-center justify-center my-2">
        <svg
          width={dimension}
          height={dimension}
          className="transform -rotate-225 transition-all duration-500"
        >
          {/* Track background */}
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
              filter: `drop-shadow(0 0 8px ${colorMeta.hex}88)`,
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
              {score}
            </span>
            <span className="text-xs font-mono text-slate-500 ml-1">/100</span>
          </div>
          <span className="text-[11px] uppercase tracking-widest text-slate-400 font-medium mt-0.5">
            Risk Score
          </span>
        </div>
      </div>

      {/* Threat Status Badge */}
      <div className="mt-1 flex flex-col items-center gap-1.5 w-full">
        <div
          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider transition-all duration-500 ${colorMeta.badge}`}
        >
          {getStatusIcon()}
          <span>{getStatusLabel()}</span>
        </div>

        {subtext && (
          <p className="text-xs text-slate-400 text-center line-clamp-2 px-2 mt-1">
            {subtext}
          </p>
        )}
      </div>

      {/* Risk Threshold Scale Markers */}
      <div className="w-full grid grid-cols-3 gap-1 mt-4 pt-3 border-t border-slate-800/80 text-[10px] text-center font-mono">
        <div className="flex flex-col items-center">
          <span className="text-cyan-400 font-semibold">0 - 34</span>
          <span className="text-slate-500 text-[9px] uppercase">Verified</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-amber-400 font-semibold">35 - 69</span>
          <span className="text-slate-500 text-[9px] uppercase">Suspicious</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-red-400 font-semibold">70 - 100</span>
          <span className="text-slate-500 text-[9px] uppercase">High Risk</span>
        </div>
      </div>
    </div>
  );
};
