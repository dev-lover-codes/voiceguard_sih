'use client';

import React, { useState } from 'react';
import { AlertEvent } from '@/types';
import {
  Bell,
  ShieldAlert,
  AlertTriangle,
  Info,
  CheckCircle2,
  ExternalLink,
  Filter,
  Download,
} from 'lucide-react';
import { updateAlertStatus } from '@/lib/supabase-client';

interface AlertFeedProps {
  initialAlerts?: AlertEvent[];
  onSelectAlert?: (alert: AlertEvent) => void;
}

export const AlertFeed: React.FC<AlertFeedProps> = ({
  initialAlerts = [],
  onSelectAlert,
}) => {
  const [alerts, setAlerts] = useState<AlertEvent[]>(initialAlerts);
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const handleStatusChange = async (id: string, status: 'dismissed' | 'escalated' | 'active') => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status } : a))
    );
    await updateAlertStatus(id, status);
  };

  const getSeverityMeta = (sev: AlertEvent['severity']) => {
    switch (sev) {
      case 'critical':
        return {
          icon: <ShieldAlert className="w-4 h-4 text-red-400" />,
          badge: 'bg-red-950/60 text-red-300 border-red-800',
          dot: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]',
        };
      case 'high':
        return {
          icon: <AlertTriangle className="w-4 h-4 text-red-400" />,
          badge: 'bg-red-950/40 text-red-300 border-red-900',
          dot: 'bg-red-400',
        };
      case 'medium':
        return {
          icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
          badge: 'bg-amber-950/40 text-amber-300 border-amber-900',
          dot: 'bg-amber-400',
        };
      case 'low':
        return {
          icon: <Info className="w-4 h-4 text-cyan-400" />,
          badge: 'bg-cyan-950/40 text-cyan-300 border-cyan-900',
          dot: 'bg-cyan-400',
        };
    }
  };

  const filteredAlerts = alerts.filter((a) => {
    if (filterSeverity !== 'all' && a.severity !== filterSeverity) return false;
    if (
      searchTerm &&
      !a.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !a.description.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !a.callId.toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const exportAlerts = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredAlerts, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', dataStr);
    dlAnchorElem.setAttribute('download', `voiceguard_threat_alerts_${Date.now()}.json`);
    dlAnchorElem.click();
  };

  return (
    <div className="flex flex-col bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl overflow-hidden h-full">
      {/* Header */}
      <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-red-950/50 border border-red-800/60 text-red-400">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Threat Intelligence & Alert Stream</h3>
            <p className="text-xs text-slate-400">Active flagged call incidents and telemetry anomalies</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportAlerts}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export JSON
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          {['all', 'critical', 'high', 'medium', 'low'].map((sev) => (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              className={`px-2.5 py-1 rounded-md capitalize font-medium transition-all ${
                filterSeverity === sev
                  ? 'bg-slate-700 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Filter by keyword or Call ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500 w-48"
        />
      </div>

      {/* Alert List Items */}
      <div className="p-3 space-y-2.5 overflow-y-auto max-h-[460px] custom-scrollbar">
        {filteredAlerts.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
            <CheckCircle2 className="w-8 h-8 text-slate-600" />
            <p className="text-sm font-medium">No alerts matching current filters</p>
            <p className="text-xs text-slate-600">All inbound voice channels normal</p>
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const meta = getSeverityMeta(alert.severity);
            return (
              <div
                key={alert.id}
                onClick={() => onSelectAlert && onSelectAlert(alert)}
                className={`p-3.5 rounded-xl border transition-all hover:border-slate-700 cursor-pointer ${
                  alert.status === 'dismissed'
                    ? 'bg-slate-950/40 border-slate-900 opacity-60'
                    : alert.status === 'escalated'
                    ? 'bg-red-950/25 border-red-800/60'
                    : 'bg-slate-900/90 border-slate-800'
                }`}
              >
                {/* Header line */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                    <span className="font-mono font-bold text-xs text-slate-300">
                      {alert.callId}
                    </span>
                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${meta.badge}`}
                    >
                      {alert.severity}
                    </span>
                    <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      {alert.category}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
                    <span>{new Date(alert.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>

                {/* Title & Description */}
                <h4 className="text-xs font-semibold text-slate-200 mb-1">
                  {alert.title}
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {alert.description}
                </p>

                {/* Footer Action buttons */}
                <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs">
                  <span className="font-mono text-[11px] text-red-400 font-semibold">
                    Risk Score: {alert.riskScore}/100
                  </span>

                  <div className="flex items-center gap-2">
                    {alert.status !== 'dismissed' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStatusChange(alert.id, 'dismissed');
                        }}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-[11px] transition-colors"
                      >
                        Dismiss
                      </button>
                    )}

                    {alert.status !== 'escalated' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStatusChange(alert.id, 'escalated');
                        }}
                        className="px-2.5 py-1 rounded bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 font-semibold text-[11px] flex items-center gap-1 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Escalate
                      </button>
                    )}

                    {alert.status === 'escalated' && (
                      <span className="text-[11px] font-bold text-red-400 px-2 py-0.5 rounded bg-red-950/80 border border-red-800">
                        ESCALATED TO SOC
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
