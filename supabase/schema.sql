-- ============================================================================
-- VoiceGuard SIH - Enterprise Voice Fraud & Deepfake Threat Database Schema
-- Run this in the Supabase SQL Editor to initialize tables and Realtime
-- ============================================================================

-- 1. Risk Telemetry Logs Table
-- PRIVACY-BY-DESIGN: Only mathematical scores and acoustic anomaly metadata are stored.
-- Raw audio streams and biometric voiceprints are NEVER persisted, complying with DPDP / RBI norms.
CREATE TABLE IF NOT EXISTS risk_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    risk_score INT NOT NULL,
    label TEXT NOT NULL,
    confidence NUMERIC(5,2) NOT NULL,
    channel_simulated TEXT DEFAULT 'simulated_call',
    org_id TEXT DEFAULT 'demo_org',
    anomaly_summary TEXT
);

-- Performance and Threat Query Indexes
CREATE INDEX IF NOT EXISTS idx_risk_logs_created_at ON risk_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_logs_high_risk ON risk_logs (risk_score) WHERE risk_score >= 75;
CREATE INDEX IF NOT EXISTS idx_risk_logs_org_id ON risk_logs (org_id);

-- Enable Supabase Realtime Broadcasting
ALTER PUBLICATION supabase_realtime ADD TABLE risk_logs;

-- 2. Organization Threat Threshold Alert Rules
CREATE TABLE IF NOT EXISTS alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    org_id TEXT NOT NULL DEFAULT 'demo_org',
    threshold_high INT DEFAULT 80,
    threshold_medium INT DEFAULT 50,
    escalation_action TEXT DEFAULT 'block_and_escalate'
);

-- Default Organization Alert Rule
INSERT INTO alert_rules (org_id, threshold_high, threshold_medium, escalation_action)
VALUES ('demo_org', 80, 50, 'block_and_escalate')
ON CONFLICT DO NOTHING;

-- 3. Security Analyst Escalation Events
CREATE TABLE IF NOT EXISTS alert_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    risk_log_id UUID REFERENCES risk_logs(id) ON DELETE SET NULL,
    action_taken TEXT NOT NULL,
    resolved_by TEXT,
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alert_events_created_at ON alert_events (created_at DESC);
ALTER PUBLICATION supabase_realtime ADD TABLE alert_events;

-- Row Level Security (RLS) Policies
ALTER TABLE risk_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_events ENABLE ROW LEVEL SECURITY;

-- Anonymous and Authenticated Demo Policies
CREATE POLICY "Allow public read on risk_logs" ON risk_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert on risk_logs" ON risk_logs FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read on alert_rules" ON alert_rules FOR SELECT USING (true);
CREATE POLICY "Allow public insert on alert_rules" ON alert_rules FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read on alert_events" ON alert_events FOR SELECT USING (true);
CREATE POLICY "Allow public insert on alert_events" ON alert_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on alert_events" ON alert_events FOR UPDATE USING (true);
