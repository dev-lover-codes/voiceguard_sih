export type RiskLevel = 'VERIFIED' | 'SUSPICIOUS' | 'HIGH_RISK';

export interface ConfidenceScores {
  biometricLiveness: number;     // 0-100: Higher means authentic human vocal tract dynamics
  syntheticSpeechScore: number;  // 0-100: Probability of neural speech synthesis / vocoder artifact
  phaseArtifacts: number;        // 0-100: Incoherence in phase spectrum / spectrogram continuity
  urgencyPromptScore: number;    // 0-100: NLP detection of pressure tactics, OTP requests, banking keywords
  signalingAnomaly: number;      // 0-100: Telecom routing / VoIP jitter / Caller ID spoof markers
}

export interface RiskResult {
  riskScore: number;             // 0-100 composite score
  riskLevel: RiskLevel;
  timestamp: string;
  confidenceScores: ConfidenceScores;
  flaggedKeywords: string[];
  anomalyDetails: string[];
  recommendation: string;
  latencyMs: number;
}

export interface CallMetadata {
  callId: string;
  callerNumber: string;
  callerName?: string;
  callerLocation: string;
  telecomCarrier: string;
  channelType: 'VoIP' | 'Cellular' | 'PSTN' | 'WebRTC';
  startTime: string;
  durationSec: number;
  status: 'active' | 'analyzing' | 'flagged' | 'terminated' | 'verified';
  isSimulated?: boolean;
}

export interface AlertEvent {
  id: string;
  callId: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  riskScore: number;
  category: 'Synthetic Voice' | 'Acoustic Spoof' | 'Urgency Prompt' | 'Identity Cloning' | 'Caller ID Spoof';
  snippetTime: string;
  status: 'active' | 'dismissed' | 'escalated';
  audioSnippetUrl?: string;
}

export interface TimelinePoint {
  time: string;
  second: number;
  riskScore: number;
  acousticSpoof: number;
  urgency: number;
  threshold: number;
}

export interface AudioSampleScenario {
  id: string;
  title: string;
  category: 'Legitimate' | 'Deepfake Cloned' | 'Social Engineering Vishing' | 'AI Voice Agent';
  caller: string;
  target: string;
  description: string;
  sampleAudioUrl?: string;
  initialRiskLevel: RiskLevel;
  initialScore: number;
  transcripts: Array<{
    sec: number;
    speaker: 'Caller' | 'Victim' | 'System';
    text: string;
    flaggedKeywords?: string[];
    riskScore: number;
    spoofScore: number;
    urgencyScore: number;
  }>;
}
