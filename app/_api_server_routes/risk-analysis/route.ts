import { NextRequest, NextResponse } from 'next/server';
import { computeCompositeRisk, evaluateKeywords } from '@/lib/risk-scoring';
import { logCallRiskTelemetry } from '@/lib/supabase-client';
import { CallMetadata } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      audioFeatures = {},
      transcript = '',
      metadata = {},
    } = body;

    const acousticSpoof = audioFeatures.syntheticSpeechScore ?? 15;
    const { flagged, urgencyScore } = evaluateKeywords(transcript);
    const metadataAnomaly = metadata.signalingAnomalyScore ?? 10;
    const biometricMismatch = audioFeatures.biometricMismatchScore ?? 5;

    const result = computeCompositeRisk(
      acousticSpoof,
      urgencyScore,
      metadataAnomaly,
      biometricMismatch
    );

    result.flaggedKeywords = flagged;

    // Optional async logging to Supabase
    if (metadata.callId) {
      const callMeta: CallMetadata = {
        callId: metadata.callId,
        callerNumber: metadata.callerNumber || 'Unknown',
        callerLocation: metadata.callerLocation || 'Unknown Gateway',
        telecomCarrier: metadata.telecomCarrier || 'SIP Trunk',
        channelType: metadata.channelType || 'VoIP',
        startTime: metadata.startTime || new Date().toISOString(),
        durationSec: metadata.durationSec || 0,
        status: result.riskLevel === 'HIGH_RISK' ? 'flagged' : 'active',
      };
      await logCallRiskTelemetry(callMeta, result);
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to process risk analysis', details: message },
      { status: 500 }
    );
  }
}
