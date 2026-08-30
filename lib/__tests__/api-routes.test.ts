import { GET as alertsGET, POST as alertsPOST } from '@/app/api/alerts/route';
import { POST as riskAnalysisPOST } from '@/app/api/risk-analysis/route';
import { NextRequest } from 'next/server';

describe('API Routes: app/api/alerts and app/api/risk-analysis', () => {
  describe('GET /api/alerts', () => {
    test('returns alert list with count', async () => {
      const response = await alertsGET();
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('alerts');
      expect(data).toHaveProperty('count');
      expect(Array.isArray(data.alerts)).toBe(true);
      expect(data.count).toBe(data.alerts.length);
    });
  });

  describe('POST /api/alerts', () => {
    test('returns 400 for missing alertId or status', async () => {
      const req = new NextRequest('http://localhost:3000/api/alerts', {
        method: 'POST',
        body: JSON.stringify({ alertId: 'ALT-1001' }),
      });
      const response = await alertsPOST(req);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Missing alertId or status');
    });

    test('updates alert status successfully', async () => {
      const req = new NextRequest('http://localhost:3000/api/alerts', {
        method: 'POST',
        body: JSON.stringify({ alertId: 'ALT-1001', status: 'escalated' }),
      });
      const response = await alertsPOST(req);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.alertId).toBe('ALT-1001');
      expect(data.status).toBe('escalated');
    });
  });

  describe('POST /api/risk-analysis', () => {
    test('computes composite multi-factor risk from audioFeatures and transcript', async () => {
      const req = new NextRequest('http://localhost:3000/api/risk-analysis', {
        method: 'POST',
        body: JSON.stringify({
          audioFeatures: {
            syntheticSpeechScore: 80,
            biometricMismatchScore: 20,
          },
          transcript: 'Your bank account blocked, please share OTP urgently for KYC update',
          metadata: {
            callId: 'VG-API-TEST',
            signalingAnomalyScore: 30,
          },
        }),
      });

      const response = await riskAnalysisPOST(req);
      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toHaveProperty('riskScore');
      expect(data).toHaveProperty('riskLevel');
      expect(data).toHaveProperty('confidenceScores');
      expect(data).toHaveProperty('flaggedKeywords');
      expect(data.flaggedKeywords).toContain('OTP');
      expect(data.flaggedKeywords).toContain('bank account blocked');
      expect(data.confidenceScores.urgencyPromptScore).toBeGreaterThanOrEqual(50);
      expect(data.riskScore).toBeGreaterThanOrEqual(50);
    });
  });
});
