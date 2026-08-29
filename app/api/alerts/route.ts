import { NextRequest, NextResponse } from 'next/server';
import { getSecurityAlerts, updateAlertStatus } from '@/lib/supabase-client';

export async function GET() {
  try {
    const alerts = await getSecurityAlerts();
    return NextResponse.json({ alerts, count: alerts.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to retrieve alerts', details: message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { alertId, status } = body;

    if (!alertId || !status) {
      return NextResponse.json(
        { error: 'Missing alertId or status' },
        { status: 400 }
      );
    }

    await updateAlertStatus(alertId, status);
    return NextResponse.json({ success: true, alertId, status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to update alert', details: message },
      { status: 500 }
    );
  }
}
