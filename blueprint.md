# VoiceGuard SIH - Project Blueprint & Architecture Specification

## 1. Overview & Purpose
**VoiceGuard SIH** is a real-time, client-and-edge powered deepfake voice call fraud detection system built for Smart India Hackathon (SIH) and financial security operations. It continuously monitors live voice call streams to detect synthetic/cloned speech, AI voice conversions, acoustic phase anomalies, and high-urgency conversational social engineering prompts.

### Key Capabilities
- **Real-Time Acoustic Inference**: Browser and edge-based ONNX model execution (`onnxruntime-web`) to evaluate synthetic speech indicators and spectral phase continuity without sending sensitive raw voice streams to third parties.
- **AudioWorklet PCM Ingestion & Linear Resampler**: Standalone zero-latency worklet (`public/worklets/pcm-processor.js`) streaming native hardware audio (44.1k/48k) resampled to 16kHz via true linear interpolation.
- **Rolling Window Streaming Detector**: 64,600-sample (4.03s) window with 24,000-sample (1.5s) hop ring buffer feeding model's native training length.
- **Exponential Moving Average (EMA) Scoring & Mid-Stream Alerts**: Smoothed score engine (`alpha = 0.35`) with configurable threshold boundaries (>80 High-Risk, 50-80 Suspicious, <50 Likely Human) that fires alerts the first moment a threshold is crossed mid-stream.
- **WebRTC Two-Device Call Demonstration (PeerJS)**:
  - **Caller App (`/demo/caller`)**: Runs on mobile phone or secondary device. Streams live microphone or pre-loaded AI deepfake audio over WebRTC to a shared room code.
  - **Receiver App (`/demo/receiver`)**: Runs on judge's laptop. Receives inbound WebRTC audio stream, feeds directly into `StreamingDetector` / `StreamingRiskScorer`, and plots risk scores live as audio plays from the phone.
- **Multi-Factor Risk Scoring Engine**: Computes dynamic 0-100 risk index fusing ONNX acoustic score, NLP urgency indicators, and signaling metadata heuristics.
- **Three-Tier Visual Threat Classification**:
  - **Verified (0–30)**: Highlighted with electric cyan (`#06B6D4` / `#22D3EE`). Normal human biometric consistency.
  - **Suspicious (31–70)**: Highlighted with warm amber (`#F59E0B` / `#FBBF24`). High synthetic probability or sudden acoustic jitter.
  - **High-Risk Flagged (71–100)**: Highlighted with crimson red (`#EF4444` / `#F87171`). Deepfake clone identified + scam keyword patterns detected.
- **PWA Ready**: Web App Manifest and offline icons for seamless mobile "Add to Home Screen" installation for on-the-go security analysts.
- **Developer Tooling & MCP Integration**: Pre-configured Vercel and Supabase CLIs and Model Context Protocol (MCP) server definitions for AI agent operations.

---

## 2. Technical Stack & Dependencies
- **Framework**: Next.js 14+ (App Router, React 19/18 Server & Client Components)
- **Language**: TypeScript (Strict Mode)
- **Styling**: Tailwind CSS (Navy / Slate Deep Dark Palette, Custom Glows & Borders)
- **Acoustic Inference Engine**: `onnxruntime-web` (single-threaded WASM / WebGL fallback)
- **WebRTC Signaling**: `peerjs` (zero backend, public cloud broker)
- **Audio Processing**: Standalone `AudioWorkletProcessor` (`/worklets/pcm-processor.js`)
- **Database & Auth Client**: `@supabase/supabase-js`
- **Data Visualization**: `recharts` (Live Risk Timeline, Confidence Breakdown)
- **Icons**: `lucide-react`
- **Class Utilities**: `clsx`, `tailwind-merge`

---

## 3. Project File & Directory Structure
```
/home/user/project-5/
├── app/
│   ├── api/
│   │   ├── risk-analysis/
│   │   │   └── route.ts         # Edge/Server risk computation API
│   │   └── alerts/
│   │       └── route.ts         # Threat alerts retrieval & dispatch
│   ├── dashboard/
│   │   └── page.tsx             # SOC Analyst Command Center
│   ├── demo/
│   │   ├── caller/
│   │   │   └── page.tsx         # WebRTC Caller Interface (Phone / Secondary Device)
│   │   ├── receiver/
│   │   │   └── page.tsx         # WebRTC Receiver & Judge Live Scoring Screen
│   │   └── page.tsx             # Single-Device Live Voice & Deepfake Simulator
│   ├── globals.css              # Dark theme design system & glow utilities
│   ├── layout.tsx               # Root layout with Header, Navigation, PWA meta
│   └── page.tsx                 # High-impact Landing Page & Feature Architecture
├── components/
│   ├── Navbar.tsx               # Global top navigation with status indicators
│   ├── LiveCallMonitor.tsx      # Real-time audio waveform, call status & live transcript
│   ├── RiskGauge.tsx            # Animated circular radial risk score meter (Cyan/Amber/Red)
│   ├── RiskTimeline.tsx         # Live Recharts time-series tracking risk over time
│   ├── ConfidenceBreakdown.tsx  # Multi-factor score bar breakdown
│   ├── AlertFeed.tsx            # Real-time alert list with quick-actions & filtering
│   └── PwaInstallPrompt.tsx     # Mobile install banner / prompt
├── lib/
│   ├── onnx-inference.ts        # Cached ONNX session, Linear Resampler, & StreamingDetector
│   ├── supabase-client.ts       # Supabase client with offline fallback mock
│   ├── risk-scoring.ts          # EMA Smoother, Configurable Thresholds, & Mid-Stream Alert Engine
│   └── utils.ts                 # Styling & formatting helpers
├── public/
│   ├── manifest.json            # PWA Web App Manifest
│   ├── icons/                   # PWA icons (192x192, 512x512, maskable, SVG)
│   ├── models/
│   │   ├── aasist_baseline.onnx      # Quantized anti-spoofing model
│   │   ├── voiceguard_acoustic.onnx  # ONNX Acoustic Inference Model
│   │   └── README.md                 # Model weights specification
│   ├── samples/
│   │   ├── genuine_voice.wav    # Pre-bundled genuine voice sample
│   │   └── cloned_voice.wav     # Pre-bundled AI-cloned voice sample
│   └── worklets/
│       └── pcm-processor.js          # Standalone AudioWorkletProcessor module
├── types/
│   └── index.ts                 # Shared TypeScript interfaces (RiskResult, CallMetadata, AlertEvent, etc.)
├── .idx/
│   ├── dev.nix                  # Nix environment definition
│   └── mcp.json                 # MCP server definitions (Firebase, Supabase, Vercel)
├── blueprint.md                 # Project architecture & change history (This file)
├── package.json                 # Project dependencies & scripts
└── tsconfig.json                # TypeScript aliases and compiler flags
```

---

## 4. Current Implementation Plan & Milestones

1. **WebRTC Caller Screen (`app/demo/caller/page.tsx`)**:
   - Create mobile-friendly dialer interface connecting over PeerJS.
   - Allow choosing source: Live Mic or pre-loaded AI deepfake sample (`/samples/cloned_voice.wav`) or custom audio upload.
   - Bridge sample audio to WebRTC via `AudioContext.createMediaStreamDestination()`.
   - Provide dial/hangup controls, room code sharing, and outgoing audio waveform.

2. **WebRTC Receiver Screen (`app/demo/receiver/page.tsx`)**:
   - Host the PeerJS room (`VG-9088` default or custom).
   - On inbound call, receive remote WebRTC `MediaStream`.
   - Route stream into `StreamingDetector` & `StreamingRiskScorer`.
   - Display real-time `RiskGauge`, `RiskTimeline`, `ConfidenceBreakdown`, and mid-stream alert banner on judge's laptop.

3. **Navigation & Mode Selector**:
   - Add clear tabs on `/demo` allowing users to toggle between Single-Device Simulator, WebRTC Caller, and WebRTC Receiver.
   - Verify TypeScript compilation and ESLint across all routes.
