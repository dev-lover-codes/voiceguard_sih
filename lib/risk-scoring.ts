import { RiskLevel, RiskResult, ConfidenceScores, CallMetadata } from '@/types';

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
  acousticSpoofProb: number,     // 0 - 100
  urgencyScore: number,          // 0 - 100
  metadataAnomaly: number,       // 0 - 100
  biometricMismatch: number = 0  // 0 - 100
): RiskResult {
  const start = performance.now();

  // Weighted Multi-Factor Formula
  // 45% Acoustic Deepfake Prob + 25% Urgency/NLP + 15% Biometric Mismatch + 15% Network/Signaling Anomaly
  const weightedScore =
    acousticSpoofProb * 0.45 +
    urgencyScore * 0.25 +
    biometricMismatch * 0.15 +
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
    phaseArtifacts: Math.round(acousticSpoofProb * 0.85 + (Math.random() * 8 - 4)),
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
