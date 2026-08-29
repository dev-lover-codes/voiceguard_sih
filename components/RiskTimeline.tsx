'use client';

import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, Clock } from 'lucide-react';

export interface TimelineDataPoint {
  time: string;
  second: number;
  smoothedScore: number;
  rawScore?: number;
}

interface RiskTimelineProps {
  data: TimelineDataPoint[];
  currentScore: number;
  highRiskThreshold?: number;
  suspiciousThreshold?: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    const smoothed = payload.find(p => p.dataKey === 'smoothedScore')?.value ?? payload[0]?.value ?? 0;
    const raw = payload.find(p => p.dataKey === 'rawScore')?.value;

    return (
      <div className="bg-slate-900/95 backdrop-blur-md p-3 rounded-lg border border-slate-700 shadow-2xl text-xs space-y-1.5 min-w-[160px]">
        <div className="flex items-center gap-1.5 text-slate-400 font-mono border-b border-slate-800 pb-1">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>Elapsed: {label}</span>
        </div>
        <div className="flex justify-between items-center gap-4 font-semibold">
          <span className="text-slate-300">Smoothed Risk:</span>
          <span
            className={`font-mono font-bold ${
              smoothed >= 80 ? 'text-red-400' : smoothed >= 50 ? 'text-amber-400' : 'text-cyan-400'
            }`}
          >
            {smoothed}/100
          </span>
        </div>
        {raw !== undefined && (
          <div className="flex justify-between items-center gap-4 text-slate-400 font-mono text-[11px]">
            <span>Raw Window:</span>
            <span>{raw}/100</span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

export const RiskTimeline: React.FC<RiskTimelineProps> = ({
  data,
  currentScore,
  highRiskThreshold = 80,
  suspiciousThreshold = 50,
}) => {
  // Cap at 30 points (~45 seconds of rolling 1.5s hops) to prevent unbounded memory growth
  const rollingData = (data.length > 0 ? data : [
    { time: '00:00', second: 0, smoothedScore: currentScore || 12, rawScore: currentScore || 12 },
  ]).slice(-30);

  const isHighRisk = currentScore >= highRiskThreshold;
  const isSuspicious = currentScore >= suspiciousThreshold && currentScore < highRiskThreshold;

  return (
    <div className="flex flex-col p-5 bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl w-full h-full">
      {/* Card Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-cyan-400">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Smoothed Risk Trajectory</h3>
            <p className="text-xs text-slate-400">Live sliding window EMA progression (~1.5s interval)</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-slate-300">
            <span
              className={`w-2.5 h-2.5 rounded-full inline-block ${
                isHighRisk
                  ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'
                  : isSuspicious
                  ? 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]'
                  : 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]'
              }`}
            />
            <span>Smoothed EMA (α=0.35)</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" />
            <span>Raw Window</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="w-full h-52 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rollingData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="smoothedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={isHighRisk ? '#ef4444' : isSuspicious ? '#f59e0b' : '#06b6d4'}
                  stopOpacity={0.4}
                />
                <stop
                  offset="95%"
                  stopColor={isHighRisk ? '#ef4444' : isSuspicious ? '#f59e0b' : '#06b6d4'}
                  stopOpacity={0.0}
                />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="time"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
            />
            <YAxis
              domain={[0, 100]}
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
              ticks={[0, suspiciousThreshold, highRiskThreshold, 100]}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Threshold Reference Lines */}
            <ReferenceLine
              y={highRiskThreshold}
              stroke="#ef4444"
              strokeDasharray="4 4"
              strokeOpacity={0.65}
              label={{
                value: `HIGH-RISK (${highRiskThreshold})`,
                fill: '#f87171',
                fontSize: 10,
                position: 'insideTopRight',
              }}
            />
            <ReferenceLine
              y={suspiciousThreshold}
              stroke="#f59e0b"
              strokeDasharray="3 3"
              strokeOpacity={0.5}
              label={{
                value: `SUSPICIOUS (${suspiciousThreshold})`,
                fill: '#fbbf24',
                fontSize: 10,
                position: 'insideTopRight',
              }}
            />

            {/* Raw Window Line */}
            <Area
              type="monotone"
              dataKey="rawScore"
              stroke="#64748b"
              strokeWidth={1.5}
              strokeDasharray="2 2"
              fill="none"
              isAnimationActive={false}
            />

            {/* Smoothed EMA Score Area */}
            <Area
              type="monotone"
              dataKey="smoothedScore"
              stroke={isHighRisk ? '#ef4444' : isSuspicious ? '#f59e0b' : '#06b6d4'}
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#smoothedGrad)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Footer status & Memory cap note */}
      <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
        <span className="flex items-center gap-1.5 font-mono text-[11px]">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
          Rolling window: {rollingData.length}/30 points (~45s active ring)
        </span>
        <span className="font-mono text-slate-300">
          Current Smoothed: <strong className={isHighRisk ? 'text-red-400' : isSuspicious ? 'text-amber-400' : 'text-cyan-400'}>{currentScore}</strong>
        </span>
      </div>
    </div>
  );
};
