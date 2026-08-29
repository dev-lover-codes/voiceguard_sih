import { createClient } from '@supabase/supabase-js';
import { AlertEvent, CallMetadata, RiskResult } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://voiceguard-demo.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'public-anon-key-placeholder';

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// In-Memory Mock Store for Offline / Preview Modes
let mockAlerts: AlertEvent[] = [
  {
    id: 'alt-001',
    callId: 'VG-90812',
    timestamp: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    severity: 'critical',
    title: 'Synthetic Voice Cloned Caller Detected',
    description: 'Acoustic vocoder artifacts detected with 94% synthetic probability claiming to be ICICI Fraud Desk.',
    riskScore: 92,
    category: 'Synthetic Voice',
    snippetTime: '00:24',
    status: 'active',
  },
  {
    id: 'alt-002',
    callId: 'VG-90809',
    timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    severity: 'high',
    title: 'High Urgency OTP Extortion Pattern',
    description: 'Caller requesting instant one-time password with threat of immediate bank account suspension.',
    riskScore: 84,
    category: 'Urgency Prompt',
    snippetTime: '01:12',
    status: 'active',
  },
  {
    id: 'alt-003',
    callId: 'VG-90795',
    timestamp: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    severity: 'medium',
    title: 'VoIP Trunk Carrier Spoofing Anomaly',
    description: 'Originating IP routed via international proxy pool while displaying domestic mobile caller ID.',
    riskScore: 61,
    category: 'Caller ID Spoof',
    snippetTime: '00:08',
    status: 'active',
  },
  {
    id: 'alt-004',
    callId: 'VG-90780',
    timestamp: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
    severity: 'critical',
    title: 'Identity Cloning - Executive Voice Match Mismatch',
    description: 'Voice clone attempted authorization of urgent corporate vendor payment transfer.',
    riskScore: 96,
    category: 'Identity Cloning',
    snippetTime: '00:45',
    status: 'escalated',
  },
  {
    id: 'alt-005',
    callId: 'VG-90772',
    timestamp: new Date(Date.now() - 1000 * 60 * 150).toISOString(),
    severity: 'low',
    title: 'Acoustic Phase Incoherence Warning',
    description: 'Minor jitter in vocal formant tracking, cleared upon secondary biometric challenge.',
    riskScore: 38,
    category: 'Acoustic Spoof',
    snippetTime: '00:15',
    status: 'dismissed',
  },
];

/**
 * Persist live call analysis telemetry
 */
export async function logCallRiskTelemetry(metadata: CallMetadata, riskResult: RiskResult) {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('call_sessions').insert([
        {
          call_id: metadata.callId,
          caller_number: metadata.callerNumber,
          channel_type: metadata.channelType,
          risk_score: riskResult.riskScore,
          risk_level: riskResult.riskLevel,
          confidence_scores: riskResult.confidenceScores,
          flagged_keywords: riskResult.flaggedKeywords,
          created_at: new Date().toISOString(),
        },
      ]);
      if (error) throw error;
      return data;
    } catch {
      // Fall through to mock store
    }
  }

  // If high risk, also auto-add an alert to mock store
  if (riskResult.riskScore >= 70) {
    const newAlert: AlertEvent = {
      id: `alt-${Date.now().toString().slice(-4)}`,
      callId: metadata.callId,
      timestamp: new Date().toISOString(),
      severity: riskResult.riskScore >= 85 ? 'critical' : 'high',
      title: 'Live Threat: Synthetic Voice Detected',
      description: riskResult.recommendation,
      riskScore: riskResult.riskScore,
      category: 'Synthetic Voice',
      snippetTime: '00:10',
      status: 'active',
    };
    mockAlerts = [newAlert, ...mockAlerts];
  }

  return { success: true, mode: 'local-store' };
}

/**
 * Fetch latest security alerts
 */
export async function getSecurityAlerts(): Promise<AlertEvent[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (!error && data) return data as AlertEvent[];
    } catch {
      // Fall through to mock store
    }
  }
  return mockAlerts;
}

/**
 * Update alert state (dismiss / escalate)
 */
export async function updateAlertStatus(alertId: string, status: 'dismissed' | 'escalated' | 'active') {
  mockAlerts = mockAlerts.map(a => a.id === alertId ? { ...a, status } : a);
  return { success: true };
}
