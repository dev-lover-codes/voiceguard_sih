# VoiceGuard SIH - Real-Time AI Deepfake Voice Fraud Defense

> **Next.js 14 (App Router) • ONNX Runtime Web (WASM) • Web Audio API / AudioWorklet • WebRTC PeerJS • Supabase Realtime • PWA / Offline Service Worker**

VoiceGuard SIH is an enterprise-grade, client-side, real-time voice anti-spoofing and deepfake fraud prevention system built for financial institutions, telecom call centers, and security operations centers (SOC).

---

## 🚀 Key Features

1. **Standalone AudioWorklet Ingestion (`/worklets/pcm-processor.js`)**:
   - Captures raw PCM audio at the device's native hardware sample rate with zero main-thread blocking.
   - High-precision linear interpolation resampler (`downsampleTo16k`) dynamically standardizes input to 16,000 Hz.
2. **On-Device ONNX Acoustic Inference (`lib/onnx-inference.ts`)**:
   - Single-threaded WebAssembly (`onnxruntime-web`) execution requiring no COOP/COEP headers.
   - Continuous 64,600-sample sliding windows (~4.0s) with 24,000-sample hops (~1.5s).
   - Singleton cached session with sub-3ms inference latency.
3. **Exponential Moving Average (EMA) Risk Scorer (`lib/risk-scoring.ts`)**:
   - Exponential smoothing ($\alpha = 0.35$) suppresses transient acoustic anomalies and room noise spikes.
   - Mid-stream threshold crossing alert trigger fires immediately upon crossing the Suspicious ($\ge 50$) or High-Risk ($\ge 80$) boundary.
4. **WebRTC Two-Device Call Pipeline (`peerjs`)**:
   - **Caller Phone (`/demo/caller`)**: Streams live phone microphone or bundled AI deepfake audio sample into WebRTC room.
   - **Receiver Screen (`/demo/receiver`)**: Ingests remote inbound audio directly into the `StreamingDetector` engine, outputting live gauge, scrolling timeline, and speaker audio.
5. **Supabase Realtime SOC Audit Dashboard (`/dashboard`)**:
   - Realtime table listening to `risk_logs` inserts via WebSocket broadcast.
   - Color-coded threat rows, high-risk filter, and supervisor escalation queue (`alert_events`).
   - Gated operator authentication (`analyst@voiceguard.bank`).
6. **Privacy-by-Design Compliance (DPDP Act 2023 & RBI Guidelines)**:
   - Zero raw audio upload or voice biometric persistence. Only mathematical risk indices and acoustic anomaly tags are persisted.
   - Throttled database logging: writes strictly on state-boundary transitions, 15-second heartbeats, or session termination.

---

## ⚡ Offline-First Architecture & Service Worker

VoiceGuard SIH is equipped with a custom **Cache-First** Service Worker (`public/sw.js`) and PWA manifest:

- **Precached Assets**:
  - HTML App Shell (`/`, `/demo`, `/dashboard`, `/demo/caller`, `/demo/receiver`)
  - Acoustic ONNX models (`/models/aasist_baseline.onnx`, `/models/voiceguard_acoustic.onnx`)
  - WebAssembly runtime binaries (`/wasm/ort-wasm-simd-threaded.wasm`, `/wasm/*.mjs`)
  - AudioWorklet processor (`/worklets/pcm-processor.js`)
  - Synthetic and authentic audio scenario files (`/samples/*.wav`)
  - Next.js compiled JS/CSS static bundles

### Graceful Offline Degradation
- **Local Detection Pipeline**: Microphone capture $\to$ 16kHz linear resampling $\to$ 64.6k windowing $\to$ ONNX WASM inference $\to$ EMA smoothing $\to$ UI gauge/timeline is **100% self-contained and local**. It continues running uninterrupted with **zero internet connection**.
- **Telemetry & Cloud Services**: Database writes to Supabase and optional AI explanation endpoints catch network exceptions and **fail gracefully / skip silently** without throwing unhandled rejections or freezing the UI animations.

---

## 🧪 Offline Verification Guide (Judging Demonstration)

Follow these steps to demonstrate 100% offline capability on a mobile phone or laptop:

1. **Initial Cache Load (Online)**:
   - Connect your phone or laptop to Wi-Fi or mobile hotspot.
   - Open the web application at `/demo`.
   - Allow the browser to load once. The Service Worker installs automatically and caches the ONNX model, WASM binaries, AudioWorklet, and app bundle into persistent CacheStorage.
2. **Disconnect Network Completely**:
   - Turn **ON Airplane Mode** (or fully disable Wi-Fi and Cellular Data).
   - Observe the yellow floating status badge: `Offline Mode Active • Local WASM Acoustic Inference Running`.
3. **Trigger Live Voice Detection**:
   - Click **"Start Monitoring"** under "Live mic" or select "Play a sample call (AI-Cloned Deepfake)".
   - Speak into the phone/laptop microphone or let the sample audio play.
4. **Observe Offline Results**:
   - The **Real-Time Soundwave** animates.
   - The **Live Risk Gauge** moves dynamically (0–100).
   - The **Live Threat Timeline** scrolls and updates every ~1.5s.
   - The **Indicative Factors** breakdown updates continuously.
   - The entire pipeline executes locally with **0 bytes transmitted over the network**.

---

## 🛠 Local Development Setup

```bash
# 1. Install dependencies
npm install

# 2. Run local development server
npm run dev

# 3. Type check & ESLint
npx tsc --noEmit
npm run lint

# 4. Production Build
npm run build
```

---

## 📱 Android Native APK (Capacitor)

VoiceGuard SIH includes a native Android wrapper using Capacitor that points to the live Vercel deployment (`https://voiceguard-sih.vercel.app`), granting full hardware microphone access for on-device AudioWorklet inference and WebRTC two-device calling.

### Build Android APK

```bash
# 1. Sync Capacitor configuration
npm run cap:sync

# 2. Build Debug APK using Gradle
npm run cap:build:android
# Or open in Android Studio:
npm run cap:open:android
```

> **APK Output Location:** `android/app/build/outputs/apk/debug/app-debug.apk`

### Sideloading Instructions for Judges
1. Transfer `app-debug.apk` to an Android device (via WhatsApp, Google Drive, USB, or ADB).
2. Tap the APK file to install.
3. When prompted, toggle **"Allow from this source"** (enable unknown sources in Settings).
4. Launch the app and grant microphone permissions when prompted.
5. For full testing walkthroughs, consult [**`GUIDE.md`**](GUIDE.md).

---

## 🔒 Supabase Database Schema

```bash
# Push schema to Supabase Cloud using Supabase CLI
supabase db push
```

Schema file located at [`supabase/migrations/20260829000000_voiceguard_schema.sql`](supabase/migrations/20260829000000_voiceguard_schema.sql).

