# VoiceGuard SIH - Project Blueprint & Architecture Specification

## 1. Overview & Purpose
**VoiceGuard SIH** is a real-time, client-and-edge powered deepfake voice call fraud detection system built for Smart India Hackathon (SIH) and financial security operations. It continuously monitors live voice call streams to detect synthetic/cloned speech, AI voice conversions, acoustic phase anomalies, and high-urgency conversational social engineering prompts.

### Key Capabilities
- **Lean, Judge-Focused Landing Page (`/`)**:
  - Direct value proposition tailored for hackathon judges & security evaluators.
  - Verifiable real-world metrics (latency, 1.1MB quantized model, 4.03s rolling window, 100% on-device privacy).
  - 3 core feature highlights for verified functionality: Real-Time Acoustic Detection (ONNX WASM), Zero-Latency Offline PWA, and Privacy-First On-Device Processing.
  - Direct CTAs to Live Monitor (`/demo`) and SOC Dashboard (`/dashboard`).
- **Single Unified Live Demo & Call Guard Route (`/demo`) with Focused Visual Hierarchy**:
  - **Single Dominant Focal Point**: The live threat verdict (`REAL HUMAN (SAFE)` / `SUSPICIOUS ANOMALY` / `AI DEEPFAKE CLONE`) paired with the large centered `RiskGauge` is the primary visual center of attention.
  - **Collapsible Technical Analysis**: `RiskTimeline` (rolling 30-window time-series) and `ConfidenceBreakdown` (spectral factors & confidence spectrum) are housed in an expandable "Technical Analysis & Breakdown" section, collapsed by default to prevent visual competition.
  - **Conditional Alert Feed**: Mid-stream threshold breach alerts log is only rendered once at least one alert has actually triggered mid-stream, taking up zero space during normal operation.
  - **`[ 🎙️ Live Microphone ]`**: Instant local microphone ingestion via AudioWorklet and 16kHz linear resampler.
  - **`[ 🎵 Play Sample Call ]`**: Pre-loaded audio fixtures (Genuine Human Voice vs AI-Cloned Deepfake) & custom file upload testing.
  - **`[ 📱 Two-Device Call Test ]`**: Full WebRTC call simulation between two devices with embedded sub-tabs:
    - **Caller Sub-Tab**: Target room code dialer, outgoing stream selector (Mic, Cloned, Genuine, Custom File), outgoing waveform visualizer, mute toggle, and dialer.
    - **Receiver / Call Guard Sub-Tab**: Room code listener, **Auto-Answer Incoming Calls toggle**, real-time ONNX acoustic scoring, pitch variance/prosody analysis, live browser Web Speech STT transcript, scam keyword urgency matching, and caller threat verdicts.
- **Lightweight Client-Side Prosody Extractor (`lib/prosody-analysis.ts`)**:
  - Autocorrelation / difference function fundamental frequency (F0) tracking (70 Hz – 450 Hz human vocal range).
  - Pitch variance analysis (coefficient of variation $CV = \sigma / \mu$) capturing micro-variations and pitch jitter.
  - Conversational pause and silence ratio tracking over rolling windows.
- **Browser-Native Web Speech API Integration (`lib/speech-recognition.ts`)**:
  - Zero-cost browser-native `SpeechRecognition` live transcript transcription.
  - Automatically feeds recognized speech into `evaluateKeywords()`.
- **Multi-Factor Composite Risk Scoring Engine**: Computes dynamic 0-100 composite risk index fusing 45% Acoustic + 25% NLP Urgency + 15% Biometric/Prosody + 15% Network/Signaling Anomaly.
- **Exponential Moving Average (EMA) Scoring & Mid-Stream Alerts**: Smoothed score engine (`alpha = 0.35`) with configurable threshold boundaries (>80 High-Risk, 50-80 Suspicious, <50 Likely Human).
- **Routable Next.js API Routes (`app/api/`)**: Standard edge/server API endpoints for alert retrieval/status updates (`/api/alerts`) and multi-factor risk analysis (`/api/risk-analysis`).

---

## 2. Technical Stack & Dependencies
- **Framework**: Next.js 14+ (App Router, React 19/18 Server & Client Components)
- **Language**: TypeScript (Strict Mode)
- **Styling**: Tailwind CSS (Navy / Slate Deep Dark Palette, Custom Glows & Borders)
- **Acoustic Inference Engine**: `onnxruntime-web` (single-threaded WASM / WebGL fallback)
- **Prosody & Speech Analysis**: Autocorrelation pitch tracking & Web Speech API (`webkitSpeechRecognition`)
- **WebRTC Signaling**: `peerjs` (zero backend, public cloud broker)
- **Audio Processing**: Standalone `AudioWorkletProcessor` (`/worklets/pcm-processor.js`)
- **Database & Auth Client**: `@supabase/supabase-js`
- **Data Visualization**: `recharts` (Live Risk Timeline, Confidence Breakdown)
- **Icons**: `lucide-react`
- **Class Utilities**: `clsx`, `tailwind-merge`

---

## 3. Simplified 3-Route Architecture
```
/home/user/project-5/
├── app/
│   ├── api/
│   │   ├── alerts/
│   │   │   └── route.ts         # GET/POST threat alerts retrieval & dispatch
│   │   └── risk-analysis/
│   │       └── route.ts         # POST edge/server composite risk computation API
│   ├── dashboard/
│   │   └── page.tsx             # SOC Analyst Command Center
│   ├── demo/
│   │   └── page.tsx             # Unified Live Monitor: Focused Focal Point, Collapsible Charts
│   ├── globals.css              # Dark theme design system & glow utilities
│   ├── layout.tsx               # Root layout with Header, Navigation, PWA meta
│   └── page.tsx                 # Lean, judge-focused Landing Page
├── components/
│   ├── Navbar.tsx               # 3-Link Header (Overview, Live Monitor, SOC Dashboard)
│   ├── LiveCallMonitor.tsx      # Real-time audio waveform, call status & live transcript
│   ├── RiskGauge.tsx            # Animated circular radial risk score meter (Cyan/Amber/Red)
│   ├── RiskTimeline.tsx         # Live Recharts time-series tracking risk over time
│   ├── ConfidenceBreakdown.tsx  # Multi-factor score bar breakdown
│   ├── AlertFeed.tsx            # Real-time alert list with quick-actions & filtering
│   └── PwaInstallPrompt.tsx     # Mobile install banner / prompt
```
