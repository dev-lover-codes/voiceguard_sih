import {
  evaluateKeywords,
  computeCompositeRisk,
  StreamingRiskScorer,
  HIGH_RISK_KEYWORDS,
  SUSPICIOUS_KEYWORDS,
} from '../risk-scoring';
import { AlertEvent } from '@/types';

describe('lib/risk-scoring.ts - evaluateKeywords()', () => {
  test('returns 0 urgency and empty array for benign conversational text', () => {
    const result = evaluateKeywords('Good morning! I was calling to check the weather forecast.');
    expect(result.flagged).toEqual([]);
    expect(result.urgencyScore).toBe(0);
  });

  test('detects high-risk keywords with 25 points each', () => {
    const result = evaluateKeywords('Please provide your OTP to prevent bank account blocked immediately.');
    expect(result.flagged).toContain('OTP');
    expect(result.flagged).toContain('bank account blocked');
    expect(result.urgencyScore).toBeGreaterThanOrEqual(50);
  });

  test('detects suspicious keywords with 12 points each', () => {
    const result = evaluateKeywords('This is a confidential message requiring urgent action.');
    expect(result.flagged).toContain('urgent');
    expect(result.flagged).toContain('confidential');
    expect(result.urgencyScore).toBe(24);
  });

  test('clamps urgency score to 100 max even with multiple keywords', () => {
    const heavyScam = HIGH_RISK_KEYWORDS.join(' ') + ' ' + SUSPICIOUS_KEYWORDS.join(' ');
    const result = evaluateKeywords(heavyScam);
    expect(result.urgencyScore).toBe(100);
    expect(result.flagged.length).toBeGreaterThanOrEqual(5);
  });

  test('case-insensitive matching', () => {
    const result = evaluateKeywords('PLEASE VERIFY YOUR AADHAAR VERIFICATION AND KYC UPDATE');
    expect(result.flagged).toContain('aadhaar verification');
    expect(result.flagged).toContain('KYC update');
    expect(result.urgencyScore).toBe(50);
  });
});

describe('lib/risk-scoring.ts - computeCompositeRisk()', () => {
  test('computes correct 45/25/15/15 weighted score', () => {
    // 80 * 0.45 + 60 * 0.25 + 40 * 0.15 + 20 * 0.15 = 36 + 15 + 6 + 3 = 60
    const result = computeCompositeRisk(80, 60, 20, 40);
    expect(result.riskScore).toBe(60);
    expect(result.riskLevel).toBe('SUSPICIOUS');
  });

  test('classifies riskLevel accurately based on thresholds', () => {
    // Verified (<35)
    const low = computeCompositeRisk(10, 0, 0, 0);
    expect(low.riskScore).toBeLessThan(35);
    expect(low.riskLevel).toBe('VERIFIED');
    expect(low.recommendation).toContain('Voice biometric markers align with verified natural human speech');

    // Suspicious (35 - 69)
    const mid = computeCompositeRisk(80, 40, 20, 0); // 36 + 10 + 3 + 0 = 49
    expect(mid.riskScore).toBe(49);
    expect(mid.riskLevel).toBe('SUSPICIOUS');
    expect(mid.recommendation).toContain('ATTENTION');

    // High Risk (>=70)
    const high = computeCompositeRisk(90, 80, 60, 60); // 40.5 + 20 + 9 + 9 = 78.5 -> 79
    expect(high.riskScore).toBe(79);
    expect(high.riskLevel).toBe('HIGH_RISK');
    expect(high.recommendation).toContain('CRITICAL');
  });

  test('generates relevant anomaly details when thresholds are exceeded', () => {
    const result = computeCompositeRisk(75, 50, 60, 0);
    expect(result.anomalyDetails).toContainEqual(expect.stringContaining('Spectral vocoder phase discontinuity'));
    expect(result.anomalyDetails).toContainEqual(expect.stringContaining('Linguistic urgency pattern'));
    expect(result.anomalyDetails).toContainEqual(expect.stringContaining('Signaling mismatch'));
  });

  test('includes prosodyPhaseArtifacts in confidence breakdown when provided', () => {
    const withProsody = computeCompositeRisk(60, 20, 10, 10, 75);
    expect(withProsody.confidenceScores.phaseArtifacts).toBe(75);

    const defaultProsody = computeCompositeRisk(60, 20, 10, 10, -1);
    expect(defaultProsody.confidenceScores.phaseArtifacts).toBe(Math.round(60 * 0.85));
  });
});

describe('lib/risk-scoring.ts - StreamingRiskScorer', () => {
  test('initializes with first score and applies EMA smoothing', () => {
    const scorer = new StreamingRiskScorer('TEST-CALL', { alpha: 0.5 });
    
    // First evaluation: smoothedScore = rawScore
    const eval1 = scorer.evaluate(80, 0);
    expect(eval1.smoothedScore).toBe(80);

    // Second evaluation with alpha 0.5: 0.5 * 40 + 0.5 * 80 = 60
    const eval2 = scorer.evaluate(40, 1500);
    expect(eval2.smoothedScore).toBe(60);
  });

  test('fires alert listener on upward threshold crossings', () => {
    const scorer = new StreamingRiskScorer('TEST-ALERT', {
      alpha: 1.0,
      highRiskThreshold: 80,
      suspiciousThreshold: 50,
    });

    const alerts: AlertEvent[] = [];
    scorer.onAlert((alert) => alerts.push(alert));

    // Low score -> no alert
    const eval1 = scorer.evaluate(20, 0);
    expect(eval1.isAlertTriggered).toBe(false);
    expect(alerts.length).toBe(0);

    // Jump to Suspicious -> alert triggered
    const eval2 = scorer.evaluate(60, 1500);
    expect(eval2.isAlertTriggered).toBe(true);
    expect(alerts.length).toBe(1);
    expect(alerts[0].severity).toBe('medium');

    // Staying in Suspicious -> no duplicate alert
    const eval3 = scorer.evaluate(62, 3000);
    expect(eval3.isAlertTriggered).toBe(false);
    expect(alerts.length).toBe(1);

    // Jump to High Risk -> new critical alert triggered
    const eval4 = scorer.evaluate(95, 4500);
    expect(eval4.isAlertTriggered).toBe(true);
    expect(alerts.length).toBe(2);
    expect(alerts[1].severity).toBe('critical');

    // Downward transition -> no alert
    const eval5 = scorer.evaluate(30, 6000);
    expect(eval5.isAlertTriggered).toBe(false);
    expect(alerts.length).toBe(2);
  });

  test('reset clears internal state', () => {
    const scorer = new StreamingRiskScorer('TEST-RESET');
    scorer.evaluate(90, 0);
    expect(scorer.getSmoothedScore()).toBe(90);

    scorer.reset();
    expect(scorer.getSmoothedScore()).toBe(0);
  });
});
