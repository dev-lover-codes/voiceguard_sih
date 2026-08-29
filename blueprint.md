# VoiceGuard SIH - Project Blueprint & Architecture Specification

## 1. Overview & Purpose
**VoiceGuard SIH** is a real-time, client-and-edge powered deepfake voice call fraud detection system built for Smart India Hackathon (SIH) and financial security operations. It continuously monitors live voice call streams to detect synthetic/cloned speech, AI voice conversions, acoustic phase anomalies, and high-urgency conversational social engineering prompts.

### Key Capabilities
- **Real-Time Acoustic Inference**: Browser and edge-based ONNX model execution (`onnxruntime-web`) to evaluate synthetic speech indicators and spectral phase continuity without sending sensitive raw voice streams to third parties.
- **Multi-Factor Risk Scoring Engine**: Computes dynamic 0-100 risk index by fusing ONNX acoustic liveness score, conversational NLP urgency indicators, and caller signaling anomaly heuristics.
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
- **Acoustic Inference Engine**: `onnxruntime-web`
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
│   │   └── page.tsx             # Interactive Live Voice & Deepfake Simulator
│   ├── globals.css              # Dark theme design system & glow utilities
│   ├── layout.tsx               # Root layout with Header, Navigation, PWA meta
│   ├── page.tsx                 # High-impact Landing Page & Feature Architecture
│   └── manifest.json / pwa      # PWA Configuration
├── components/
│   ├── Navbar.tsx               # Global top navigation with status indicators
│   ├── LiveCallMonitor.tsx      # Real-time audio waveform, call status & live transcript
│   ├── RiskGauge.tsx            # Animated circular radial risk score meter (Cyan/Amber/Red)
│   ├── RiskTimeline.tsx         # Live Recharts time-series tracking risk over time
│   ├── ConfidenceBreakdown.tsx  # Multi-factor score bar breakdown
│   ├── AlertFeed.tsx            # Real-time alert list with quick-actions & filtering
│   └── PwaInstallPrompt.tsx     # Mobile install banner / prompt
├── lib/
│   ├── onnx-inference.ts        # ONNX Runtime Web session loader & inference runner
│   ├── supabase-client.ts       # Supabase client with offline fallback mock
│   ├── risk-scoring.ts          # Composite multi-factor scoring algorithm
│   └── utils.ts                 # Styling & formatting helpers
├── public/
│   ├── manifest.json            # PWA Web App Manifest
│   ├── icons/                   # PWA icons (192x192, 512x512, maskable)
│   └── models/
│       ├── voiceguard_acoustic.onnx  # ONNX Acoustic Inference Model
│       └── README.md                 # Model weights specification
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

1. **Environment & Dependency Setup**:
   - Install `onnxruntime-web`, `@supabase/supabase-js`, `recharts`, `lucide-react`, `clsx`, `tailwind-merge`, and CLI tools (`vercel`, `supabase`).
   - Configure MCP server registry in `~/.gemini/config/mcp_config.json` and `.idx/mcp.json`.

2. **Core Types & Data Models (`types/index.ts`)**:
   - Define `RiskLevel` ('VERIFIED' | 'SUSPICIOUS' | 'HIGH_RISK'), `RiskResult`, `CallMetadata`, `AlertEvent`, `ConfidenceScores`, `AudioFrameData`.

3. **Core Libraries (`lib/`)**:
   - `lib/onnx-inference.ts`: Load `/models/voiceguard_acoustic.onnx` using `onnxruntime-web`, extract acoustic features, compute tensor outputs, with resilient browser fallback.
   - `lib/risk-scoring.ts`: Implement multi-factor weighted scoring combining acoustic liveness, conversational urgency analysis, and metadata signaling.
   - `lib/supabase-client.ts`: Supabase client integration with mock store fallback for offline/demo reliability.

4. **PWA & Model Assets (`public/`)**:
   - Create `public/manifest.json` with standalone display, navy/slate theme, and proper icon mappings.
   - Generate SVG / Web icons in `public/icons/`.
   - Place `public/models/voiceguard_acoustic.onnx` placeholder/graph and model documentation.

5. **Design System & Tailwind Configuration**:
   - Configure custom colors:
     - `navy-dark`: `#070B14`, `navy-surface`: `#0B1120`, `navy-card`: `#0F172A`, `slate-border`: `#1E293B`
     - `accent-verified`: `#06B6D4` / `#22D3EE` (Cyan)
     - `accent-suspicious`: `#F59E0B` / `#FBBF24` (Amber)
     - `accent-flagged`: `#EF4444` / `#F87171` (Red)
   - Add glow animations, glassmorphism card styles, and pulse effects in `globals.css`.

6. **Interactive UI Components (`components/`)**:
   - `LiveCallMonitor`: Live simulated waveform with Web Audio API support / synthetic audio playback, call controls, active caller ID, and live scam transcript analyzer.
   - `RiskGauge`: Radial arc meter with dynamic color transition, percentage ticker, and threat badge.
   - `RiskTimeline`: Recharts live streaming area chart displaying composite risk, acoustic spoof probability, and urgency score over duration.
   - `ConfidenceBreakdown`: Visual bar breakdown of Voice Biometrics, Artifact Analysis, NLP Scam Prompting, and Network Signaling.
   - `AlertFeed`: Interactive feed of high-severity alerts with dismiss/escalate actions, audio badge triggers, and export option.
   - `Navbar`: Header with real-time status pill, active route navigation, and PWA install trigger.

7. **Pages & Routes (`app/`)**:
   - `app/layout.tsx`: Root layout with metadata, dark theme container, and top navigation.
   - `app/page.tsx`: Landing page with hero banner, live architecture overview, threat metrics counter, and quick-action cards.
   - `app/dashboard/page.tsx`: Full SOC monitoring center with live metrics grid, call table, active risk feeds, and filters.
   - `app/demo/page.tsx`: Interactive hands-on simulator with pre-recorded deepfake samples (e.g., Bank Manager Voice Clone, CEO Wire Transfer Scam, Legitimate Customer Service), microphone input testing, and live model toggle.
   - `app/api/risk-analysis/route.ts` & `app/api/alerts/route.ts`: API endpoints for headless and edge integrations.

8. **Git Repository Setup**:
   - Initialize/confirm git repository, set remote `voiceguard-sih` under `dev-lover-codes`, commit changes, and attempt push.
