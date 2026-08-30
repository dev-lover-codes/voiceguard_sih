import { RiskLevel, RiskResult, ConfidenceScores, CallMetadata, AlertEvent } from '@/types';

// High-risk scam keywords and social engineering patterns
export const HIGH_RISK_KEYWORDS = [
  'OTP', 'one-time password', 'bank account blocked', 'urgent transfer',
  'police verification', 'customs clearance', 'wire money immediately',
  'credit card expiry', 'tax penalty', 'digital arrest', 'aadhaar verification',
  'KYC update', 'emergency fund', 'remote desktop', 'AnyDesk', 'TeamViewer'
];

export const SUSPICIOUS_KEYWORDS = [
  'urgent', 'immediate action', 'verify identity', 'confidential',
  'security alert', 'manager approval', 'gift card', 'refund processed',
  'unauthorized transaction', 'suspicious login'
];

export interface RiskScoringConfig {
  alpha?: number;                // EMA smoothing factor (default: 0.35)
  highRiskThreshold?: number;    // High-risk boundary (default: 80)
  suspiciousThreshold?: number;  // Suspicious boundary (default: 50)
}

export type RiskAction = 'block_and_escalate' | 'secondary_verification' | 'proceed';

export interface SmoothedRiskEvaluation {
  rawScore: number;
  smoothedScore: number;
  riskLevel: RiskLevel;
  action: RiskAction;
  actionLabel: string;
  isAlertTriggered: boolean;
  alertEvent?: AlertEvent;
}

/**
 * StreamingRiskScorer: Manages Exponential Moving Average (EMA) smoothing across consecutive
 * audio window scores and fires mid-stream alerts the FIRST moment a threshold boundary is crossed.
 */
export class StreamingRiskScorer {
  private config: Required<RiskScoringConfig>;
  private smoothedScore: number | null = null;
  private currentTier: 'NONE' | 'LOW' | 'SUSPICIOUS' | 'HIGH_RISK' = 'NONE';
  private alertListeners: Set<(alert: AlertEvent) => void> = new Set();
  private callId: string;

  constructor(callId: string = 'LIVE-STREAM-01', config?: RiskScoringConfig) {
    this.callId = callId;
    this.config = {
      alpha: config?.alpha ?? 0.35,
      highRiskThreshold: config?.highRiskThreshold ?? 80,
      suspiciousThreshold: config?.suspiciousThreshold ?? 50,
    };
  }

  public reset(callId?: string): void {
    if (callId) this.callId = callId;
    this.smoothedScore = null;
    this.currentTier = 'NONE';
  }

  public updateConfig(config: Partial<RiskScoringConfig>): void {
    if (config.alpha !== undefined) this.config.alpha = config.alpha;
    if (config.highRiskThreshold !== undefined) this.config.highRiskThreshold = config.highRiskThreshold;
    if (config.suspiciousThreshold !== undefined) this.config.suspiciousThreshold = config.suspiciousThreshold;
  }

  public onAlert(callback: (alert: AlertEvent) => void): () => void {
    this.alertListeners.add(callback);
    return () => {
      this.alertListeners.delete(callback);
    };
  }

  public getSmoothedScore(): number {
    return this.smoothedScore !== null ? Math.round(this.smoothedScore * 10) / 10 : 0;
  }

  /**
   * Evaluates a new raw score from a window, updates EMA, checks thresholds,
   * and triggers an alert the FIRST moment a threshold is crossed mid-stream.
   */
  public evaluate(newScore: number, windowStartMs: number = 0): SmoothedRiskEvaluation {
    const alpha = this.config.alpha;
    if (this.smoothedScore === null) {
      this.smoothedScore = newScore;
    } else {
      // Exponential Moving Average (EMA)
      this.smoothedScore = alpha * newScore + (1 - alpha) * this.smoothedScore;
    }

    const roundedSmoothed = Math.round(this.smoothedScore * 10) / 10;

    let riskLevel: RiskLevel = 'VERIFIED';
    let action: RiskAction = 'proceed';
    let actionLabel = 'likely human, proceed';
    let newTier: 'LOW' | 'SUSPICIOUS' | 'HIGH_RISK' = 'LOW';

    if (roundedSmoothed >= this.config.highRiskThreshold) {
      riskLevel = 'HIGH_RISK';
      action = 'block_and_escalate';
      actionLabel = 'high-risk, block and escalate';
      newTier = 'HIGH_RISK';
    } else if (roundedSmoothed >= this.config.suspiciousThreshold) {
      riskLevel = 'SUSPICIOUS';
      action = 'secondary_verification';
      actionLabel = 'suspicious, request secondary verification';
      newTier = 'SUSPICIOUS';
    }

    // Mid-stream alert trigger: fires FIRST moment a higher threshold is crossed
    let isAlertTriggered = false;
    let alertEvent: AlertEvent | undefined;

    const isCrossingUpward =
      (newTier === 'HIGH_RISK' && this.currentTier !== 'HIGH_RISK') ||
      (newTier === 'SUSPICIOUS' && this.currentTier === 'LOW') ||
      (newTier === 'SUSPICIOUS' && this.currentTier === 'NONE');

    if (isCrossingUpward) {
      isAlertTriggered = true;
      const snippetSec = Math.floor(windowStartMs / 1000);
      const mins = Math.floor(snippetSec / 60).toString().padStart(2, '0');
      const secs = (snippetSec % 60).toString().padStart(2, '0');

      alertEvent = {
        id: `alt-${Date.now().toString().slice(-5)}`,
        callId: this.callId,
        timestamp: new Date().toISOString(),
        severity: newTier === 'HIGH_RISK' ? 'critical' : 'medium',
        title:
          newTier === 'HIGH_RISK'
            ? 'Critical: Synthetic Deepfake Threshold Crossed'
            : 'Warning: Suspicious Acoustic Activity Detected',
        description: `Smoothed risk score reached ${roundedSmoothed}/100. Recommended action: ${actionLabel}.`,
        riskScore: Math.round(roundedSmoothed),
        category: 'Synthetic Voice',
        snippetTime: `${mins}:${secs}`,
        status: 'active',
      };

      // Notify alert listeners immediately
      this.alertListeners.forEach((cb) => cb(alertEvent!));
    }

    this.currentTier = newTier;

    return {
      rawScore: newScore,
      smoothedScore: roundedSmoothed,
      riskLevel,
      action,
      actionLabel,
      isAlertTriggered,
      alertEvent,
    };
  }
}

export function evaluateKeywords(transcript: string): { flagged: string[]; urgencyScore: number } {
  const lower = transcript.toLowerCase();
  const flagged: string[] = [];
  let score = 0;

  for (const kw of HIGH_RISK_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      flagged.push(kw);
      score += 25;
    }
  }

  for (const kw of SUSPICIOUS_KEYWORDS) {
    if (lower.includes(kw.toLowerCase()) && !flagged.includes(kw)) {
      flagged.push(kw);
      score += 12;
    }
  }

  return {
    flagged,
    urgencyScore: Math.min(100, score),
  };
}

export function computeCompositeRisk(
  acousticSpoofProb: number,       // 0 - 100
  urgencyScore: number,            // 0 - 100
  metadataAnomaly: number,         // 0 - 100
  biometricMismatch: number = 0,   // 0 - 100
  prosodyPhaseArtifacts: number = -1 // 0 - 100 from computePhaseArtifactsScore(); -1 = not provided
): RiskResult {
  const start = performance.now();

  // If prosodyPhaseArtifacts is provided (>= 0) and biometricMismatch is 0,
  // fold the prosody artifact score into the biometric/prosodic anomaly factor (15% weight)
  const effectiveBiometricAnomaly = biometricMismatch > 0
    ? biometricMismatch
    : prosodyPhaseArtifacts >= 0
    ? prosodyPhaseArtifacts
    : 0;

  // Weighted Multi-Factor Formula
  // 45% Acoustic Deepfake Prob + 25% Urgency/NLP + 15% Biometric/Prosodic Mismatch + 15% Network/Signaling Anomaly
  const weightedScore =
    acousticSpoofProb * 0.45 +
    urgencyScore * 0.25 +
    effectiveBiometricAnomaly * 0.15 +
    metadataAnomaly * 0.15;

  const finalScore = Math.round(Math.min(100, Math.max(0, weightedScore)));

  let riskLevel: RiskLevel = 'VERIFIED';
  if (finalScore >= 70) {
    riskLevel = 'HIGH_RISK';
  } else if (finalScore >= 35) {
    riskLevel = 'SUSPICIOUS';
  }

  const confidenceScores: ConfidenceScores = {
    biometricLiveness: Math.max(0, 100 - Math.round((acousticSpoofProb * 0.7 + biometricMismatch * 0.3))),
    syntheticSpeechScore: Math.round(acousticSpoofProb),
    // phaseArtifacts: real prosody-derived spoof signal from computePhaseArtifactsScore().
    // Falls back to a pure acoustic proxy (no random noise) when prosody data is unavailable.
    phaseArtifacts: prosodyPhaseArtifacts >= 0
      ? Math.round(Math.min(100, Math.max(0, prosodyPhaseArtifacts)))
      : Math.round(Math.min(100, Math.max(0, acousticSpoofProb * 0.85))),
    urgencyPromptScore: Math.round(urgencyScore),
    signalingAnomaly: Math.round(metadataAnomaly),
  };

  const anomalyDetails: string[] = [];
  if (acousticSpoofProb > 65) {
    anomalyDetails.push('Spectral vocoder phase discontinuity detected in higher frequencies (>4kHz)');
  }
  if (confidenceScores.biometricLiveness < 40) {
    anomalyDetails.push('Sub-harmonic pitch jitter indicates non-biological vocal tract synthesis');
  }
  if (urgencyScore > 40) {
    anomalyDetails.push('Linguistic urgency pattern: Pressure for immediate credential/OTP disclosure');
  }
  if (metadataAnomaly > 50) {
    anomalyDetails.push('Signaling mismatch: Caller ID does not match originating VoIP gateway IP pool');
  }

  let recommendation = 'Voice biometric markers align with verified natural human speech patterns. Call is safe to proceed.';
  if (riskLevel === 'HIGH_RISK') {
    recommendation = 'CRITICAL: Synthetic AI Voice & Vishing scam markers detected. Advise immediate call termination and biometric challenge.';
  } else if (riskLevel === 'SUSPICIOUS') {
    recommendation = 'ATTENTION: Acoustic anomalies or urgency triggers identified. Request secondary out-of-band identity verification.';
  }

  const latencyMs = Math.round((performance.now() - start) * 10) / 10 + 1.2;

  return {
    riskScore: finalScore,
    riskLevel,
    timestamp: new Date().toISOString(),
    confidenceScores,
    flaggedKeywords: [],
    anomalyDetails,
    recommendation,
    latencyMs,
  };
}

export function generateMockCallMetadata(callId: string = 'VG-88219'): CallMetadata {
  return {
    callId,
    callerNumber: '+91 98230 44102',
    callerName: 'State Bank Verification Desk (Spoofed)',
    callerLocation: 'Mumbai, MH (VoIP Gateway)',
    telecomCarrier: 'Airtel VoIP Trunk',
    channelType: 'VoIP',
    startTime: new Date(Date.now() - 45000).toISOString(),
    durationSec: 45,
    status: 'analyzing',
    isSimulated: true,
  };
}
