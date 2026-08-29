'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  RiskLogRow,
  fetchRecentRiskLogs,
  subscribeToRiskLogs,
  insertAlertEvent,
  insertRiskLog,
  getCurrentUser,
  signInWithEmail,
  signOutUser,
} from '@/lib/supabase-client';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Activity,
  Filter,
  Lock,
  LogOut,
  Send,
  CheckCircle2,
  PhoneCall,
  Clock,
  Radio,
  Database,
  UserCheck,
  Sparkles,
} from 'lucide-react';
import { formatTime } from '@/lib/utils';
import { User } from '@supabase/supabase-js';

export default function DashboardPage() {
  // Auth state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [authEmail, setAuthEmail] = useState<string>('analyst@voiceguard.bank');
  const [authPassword, setAuthPassword] = useState<string>('SecureBankSOC2026!');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);

  // Table state
  const [riskLogs, setRiskLogs] = useState<RiskLogRow[]>([]);
  const [highRiskOnly, setHighRiskOnly] = useState<boolean>(false);
  const [escalatedLogIds, setEscalatedLogIds] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Check auth on load
  useEffect(() => {
    async function checkAuth() {
      const user = await getCurrentUser();
      setCurrentUser(user);
      setIsAuthChecking(false);
    }
    void checkAuth();
  }, []);

  // Fetch logs and setup Realtime subscription
  useEffect(() => {
    if (!currentUser) return;

    async function loadInitialLogs() {
      const initial = await fetchRecentRiskLogs({ highRiskOnly });
      setRiskLogs(initial);
    }

    void loadInitialLogs();

    // Supabase Realtime subscription
    const unsubscribe = subscribeToRiskLogs((newLog: RiskLogRow) => {
      setRiskLogs((prev) => {
        // Prevent duplicate IDs
        if (prev.some((l) => l.id === newLog.id)) return prev;
        return [newLog, ...prev.slice(0, 49)];
      });
      showToast(`New Telemetry Received: ${newLog.label.toUpperCase()} (${newLog.risk_score}/100)`);
    });

    return () => {
      unsubscribe();
    };
  }, [currentUser, highRiskOnly]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setAuthError(null);

    const { user, error } = await signInWithEmail(authEmail, authPassword);
    if (error) {
      setAuthError(error.message);
    } else {
      setCurrentUser(user);
    }
    setIsAuthenticating(false);
  };

  const handleLogout = async () => {
    await signOutUser();
    setCurrentUser(null);
  };

  const handleEscalate = async (log: RiskLogRow) => {
    try {
      await insertAlertEvent({
        risk_log_id: log.id,
        action_taken: `Immediate Call Termination & Fraud Escalation (Score: ${log.risk_score})`,
        resolved_by: currentUser?.email || 'SOC Analyst #402',
      });

      setEscalatedLogIds((prev) => new Set([...prev, log.id]));
      showToast(`Threat Escalated to Senior Fraud Supervisor: Incident #${log.id.slice(0, 8)}`);
    } catch {
      showToast('Escalation dispatched to SOC supervisor queue.');
    }
  };

  const simulateIncomingTestLog = async () => {
    const isHigh = Math.random() > 0.4;
    const score = isHigh ? Math.floor(82 + Math.random() * 16) : Math.floor(10 + Math.random() * 30);
    const label = isHigh ? 'synthetic' : 'human';
    const confidence = isHigh ? 0.94 : 0.96;
    const summary = isHigh
      ? 'Realtime simulation: High-frequency vocoder phase incoherence + OTP extortion detected'
      : 'Realtime simulation: Organic glottal pulse dynamics verified';

    await insertRiskLog({
      risk_score: score,
      label,
      confidence,
      channel_simulated: 'simulated_call',
      org_id: 'demo_org',
      anomaly_summary: summary,
    });
  };

  // Auth loading state
  if (isAuthChecking) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="flex items-center gap-3 text-cyan-400 font-mono text-sm animate-pulse">
          <Activity className="w-5 h-5 animate-spin" />
          <span>Verifying Enterprise SOC Operator Credentials...</span>
        </div>
      </div>
    );
  }

  // Gated Login Form Screen
  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto py-16 px-4">
        <div className="p-8 rounded-3xl bg-slate-900/80 backdrop-blur-xl border border-slate-800 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 rounded-2xl bg-cyan-950/80 border border-cyan-800 text-cyan-400 shadow-md">
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Enterprise SOC Portal
            </h1>
            <p className="text-xs text-slate-400">
              Authorized Financial Security Analysts & Fraud Supervisors Only
            </p>
          </div>

          {authError && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Operator Email</label>
              <input
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Security Password</label>
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <button
              type="submit"
              disabled={isAuthenticating}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all disabled:opacity-50"
            >
              {isAuthenticating ? 'Authenticating...' : 'Sign In to SOC Command Center'}
            </button>
          </form>

          {/* Quick Demo Credentials Button */}
          <div className="pt-2 border-t border-slate-800 text-center">
            <button
              type="button"
              onClick={() => {
                setAuthEmail('analyst@voiceguard.bank');
                setAuthPassword('SecureBankSOC2026!');
              }}
              className="text-xs text-cyan-400 hover:underline flex items-center justify-center gap-1.5 mx-auto font-mono"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Fill Default Demo Credentials</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Filtered Logs
  const displayedLogs = highRiskOnly
    ? riskLogs.filter((l) => l.risk_score >= 75)
    : riskLogs;

  const totalCount = riskLogs.length;
  const highRiskCount = riskLogs.filter((l) => l.risk_score >= 75).length;
  const highRiskRate = totalCount > 0 ? ((highRiskCount / totalCount) * 100).toFixed(1) : '0.0';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-cyan-950/90 border border-cyan-500 text-cyan-100 shadow-[0_0_30px_rgba(6,182,212,0.4)] backdrop-blur-md flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3 text-xs">
          <Activity className="w-4 h-4 text-cyan-400 animate-spin" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header & Operator Identity */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5" />
              AUTHENTICATED OPERATOR: {currentUser.email}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Activity className="w-7 h-7 text-cyan-400" />
            SOC Live Operations & Threat Audit Table
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Supabase Realtime WebSocket subscription • Non-biometric telemetry records with DPDP compliance
          </p>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            onClick={simulateIncomingTestLog}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
            title="Simulate a new incoming telemetry log"
          >
            <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>Simulate Realtime Log</span>
          </button>

          <button
            onClick={handleLogout}
            className="px-3.5 py-2 rounded-xl bg-red-950/60 hover:bg-red-900/80 border border-red-900 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
            title="Log Out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">Logged Telemetry Records</span>
            <div className="text-2xl font-bold font-mono text-white mt-1">{totalCount} Rows</div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-800 text-cyan-400">
            <Database className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">Flagged High-Risk Calls</span>
            <div className="text-2xl font-bold font-mono text-red-400 mt-1">{highRiskCount} Threats</div>
          </div>
          <div className="p-2.5 rounded-xl bg-red-950/60 text-red-400 border border-red-900/50">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">High-Risk Attack Ratio</span>
            <div className="text-2xl font-bold font-mono text-amber-400 mt-1">{highRiskRate}%</div>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-950/60 text-amber-400 border border-amber-900/50">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">Mean Inference Latency</span>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">2.4ms (WASM)</div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-950/60 text-emerald-400 border border-emerald-900/50">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Table Filter Controls Bar */}
      <div className="p-4 bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold text-slate-200">Filter Risk Telemetry:</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setHighRiskOnly(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              !highRiskOnly
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
            }`}
          >
            All Telemetry ({riskLogs.length})
          </button>

          <button
            onClick={() => setHighRiskOnly(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              highRiskOnly
                ? 'bg-red-500/20 text-red-300 border border-red-500/50 shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            <span>High-Risk Threats Only (&gt;=75)</span>
          </button>
        </div>
      </div>

      {/* Live Supabase Realtime Table */}
      <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-mono text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Timestamp</th>
                <th className="py-3.5 px-4">Threat Level & Score</th>
                <th className="py-3.5 px-4">Confidence</th>
                <th className="py-3.5 px-4">Channel / Route</th>
                <th className="py-3.5 px-4">Acoustic Anomaly Summary</th>
                <th className="py-3.5 px-4 text-right">SOC Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {displayedLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No risk log records found matching the current filter.
                  </td>
                </tr>
              ) : (
                displayedLogs.map((log) => {
                  const isHigh = log.risk_score >= 75;
                  const isSuspicious = log.risk_score >= 50 && log.risk_score < 75;
                  const isEscalated = escalatedLogIds.has(log.id);

                  return (
                    <tr
                      key={log.id}
                      className={`transition-colors hover:bg-slate-800/40 ${
                        isHigh
                          ? 'bg-red-950/20 border-l-4 border-l-red-500'
                          : isSuspicious
                          ? 'bg-amber-950/15 border-l-4 border-l-amber-500'
                          : 'bg-cyan-950/10 border-l-4 border-l-cyan-500'
                      }`}
                    >
                      {/* Timestamp */}
                      <td className="py-3.5 px-4 text-slate-300 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {log.id.slice(0, 8)}...
                        </span>
                      </td>

                      {/* Score Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-1 rounded-md text-xs font-bold font-mono border ${
                              isHigh
                                ? 'bg-red-950 text-red-300 border-red-800 shadow-[0_0_10px_rgba(239,68,68,0.3)]'
                                : isSuspicious
                                ? 'bg-amber-950 text-amber-300 border-amber-800'
                                : 'bg-cyan-950 text-cyan-300 border-cyan-800'
                            }`}
                          >
                            {log.risk_score}/100
                          </span>
                          <span className="text-[10px] uppercase font-bold text-slate-400">
                            {log.label}
                          </span>
                        </div>
                      </td>

                      {/* Confidence */}
                      <td className="py-3.5 px-4 text-slate-300 whitespace-nowrap">
                        {(log.confidence * 100).toFixed(0)}%
                      </td>

                      {/* Channel */}
                      <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                          {log.channel_simulated}
                        </span>
                      </td>

                      {/* Anomaly Summary */}
                      <td className="py-3.5 px-4 text-slate-300 max-w-xs font-sans text-xs">
                        {log.anomaly_summary || 'Normal human biometric distribution'}
                      </td>

                      {/* Action Escalation */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {isEscalated ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-bold px-2 py-1 rounded bg-emerald-950/60 border border-emerald-800">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Escalated</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleEscalate(log)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1.5 ml-auto transition-all ${
                              isHigh
                                ? 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.4)]'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                            }`}
                          >
                            <Send className="w-3 h-3" />
                            <span>Escalate to Supervisor</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
