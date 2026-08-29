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
import { TimelinePoint } from '@/types';
import { TrendingUp, Clock } from 'lucide-react';

interface RiskTimelineProps {
  data: TimelinePoint[];
  currentScore: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/95 backdrop-blur-md p-3 rounded-lg border border-slate-700 shadow-2xl text-xs space-y-1">
        <div className="flex items-center gap-1.5 text-slate-400 font-mono border-b border-slate-800 pb-1">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>Timeline: {label}</span>
        </div>
        <div className="flex justify-between items-center gap-4 text-red-400 font-medium">
          <span>Composite Risk:</span>
          <span className="font-mono font-bold">{payload[0]?.value ?? 0}/100</span>
        </div>
        <div className="flex justify-between items-center gap-4 text-amber-400">
          <span>Acoustic Spoof:</span>
          <span className="font-mono">{payload[1]?.value ?? 0}%</span>
        </div>
        <div className="flex justify-between items-center gap-4 text-cyan-400">
          <span>Urgency Score:</span>
          <span className="font-mono">{payload[2]?.value ?? 0}%</span>
        </div>
      </div>
    );
  }
  return null;
};

export const RiskTimeline: React.FC<RiskTimelineProps> = ({ data, currentScore }) => {
  const chartData = data.length > 0 ? data : [
    { time: '00:00', second: 0, riskScore: 10, acousticSpoof: 12, urgency: 5, threshold: 70 },
  ];

  return (
    <div className="flex flex-col p-5 bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl w-full h-full">
      {/* Card Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-cyan-400">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Live Risk Progression</h3>
            <p className="text-xs text-slate-400">Real-time multi-factor trajectory during active stream</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
            <span>Risk Score</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
            <span>Acoustic Spoof</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />
            <span>Urgency</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="w-full h-56 min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="spoofGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="urgencyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
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
              ticks={[0, 35, 70, 100]}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Threshold Lines */}
            <ReferenceLine
              y={70}
              stroke="#ef4444"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
              label={{ value: 'CRITICAL (70)', fill: '#f87171', fontSize: 10, position: 'insideTopRight' }}
            />
            <ReferenceLine
              y={35}
              stroke="#f59e0b"
              strokeDasharray="3 3"
              strokeOpacity={0.4}
              label={{ value: 'SUSPICIOUS (35)', fill: '#fbbf24', fontSize: 10, position: 'insideTopRight' }}
            />

            {/* Data Areas */}
            <Area
              type="monotone"
              dataKey="riskScore"
              stroke="#ef4444"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#riskGrad)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="acousticSpoof"
              stroke="#f59e0b"
              strokeWidth={1.5}
              fillOpacity={1}
              fill="url(#spoofGrad)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="urgency"
              stroke="#06b6d4"
              strokeWidth={1.5}
              fillOpacity={1}
              fill="url(#urgencyGrad)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Footer status summary */}
      <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
          Streaming sample rate: 16 kHz / 100ms inference frames
        </span>
        <span className="font-mono text-slate-300">
          Peak Risk in Window: <strong className="text-white">{Math.max(...chartData.map(d => d.riskScore), currentScore)}</strong>
        </span>
      </div>
    </div>
  );
};
