# VoiceGuard SIH — Complete Android APK Build, Sideloading & Testing Guide

This guide provides step-by-step instructions for compiling the **VoiceGuard SIH** Android APK using Capacitor, sideloading it onto physical Android phones, and conducting live judging demonstrations.

---

## 📱 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│               Android Native App Wrapper                    │
│            (Capacitor 8.5 • Android WebView)                │
│                                                             │
│  • Points directly to LIVE Vercel Deployment:               │
│    https://voiceguard-sih.vercel.app                        │
│  • Native Android Permissions:                              │
│    - android.permission.RECORD_AUDIO (Hardware Mic)         │
│    - android.permission.INTERNET (WebRTC & Cloud Sync)      │
│  • Cache-First Service Worker:                              │
│    Pre-caches ONNX model, WASM binaries, and app shell      │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────▼──────────────────┐
            │   Client-Side Execution Engine      │
            │ • Standalone AudioWorklet (16kHz)   │
            │ • ONNX WASM Inference (~2.4ms)     │
            │ • Exponential Smoothing (α = 0.35)  │
            │ • Real-time Threat Gauge & Timeline │
            └─────────────────────────────────────┘
```

---

## ⚙️ 2. Prerequisites

To build the APK locally, ensure you have:
1. **Node.js** (v18 or v20+) and **npm** installed.
2. **Java Development Kit (JDK 17 or 21)** installed and `JAVA_HOME` configured.
3. **Android Studio** (Koala / Hedgehog or newer) OR **Android SDK Command-Line Tools**.
4. An **Android device** (Android 8.0+ / API 26+) with Developer Options enabled (for USB debugging or sideloading).

---

## 🔨 3. Step-by-Step APK Build Instructions

### Method A: One-Command CLI Build (Fastest)

Run the automated npm script from the project root:

```bash
# 1. Sync web assets and capacitor configuration
npx cap sync android

# 2. Build the Debug APK directly using Gradle
cd android
./gradlew assembleDebug
```

> **APK Output Path:**  
> `android/app/build/outputs/apk/debug/app-debug.apk`

---

### Method B: Build via Android Studio GUI

1. Open the native Android project in Android Studio:
   ```bash
   npx cap open android
   ```
2. Wait for Gradle sync to complete.
3. In the top menu bar, navigate to:
   $$\text{\textbf{Build}} \longrightarrow \text{\textbf{Build Bundle(s) / APK(s)}} \longrightarrow \text{\textbf{Build APK(s)}}$$
4. Once compilation finishes, click **"locate"** in the bottom-right notification popup to open the folder containing `app-debug.apk`.

---

## 📲 4. Sideloading the APK on Android Devices

### Option 1: Direct ADB Install over USB (Recommended for Developers)

1. Connect your Android phone to your computer via USB.
2. Enable **USB Debugging** on your phone (*Settings > Developer Options > USB Debugging*).
3. Run:
   ```bash
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```

---

### Option 2: Sideloading via WhatsApp, Google Drive, or File Transfer (For Judges)

1. Transfer `app-debug.apk` to your phone via:
   - Google Drive / OneDrive download link
   - Direct USB file transfer to the `Downloads/` folder
   - Messaging app (WhatsApp / Telegram)
2. On your phone, tap `app-debug.apk` to install.
3. If prompted with *"For your security, your phone is not allowed to install unknown apps from this source"*:
   - Tap **Settings**.
   - Toggle **"Allow from this source"** to **ON**.
   - Return and tap **Install**.
4. Tap **Open** to launch VoiceGuard SIH.

---

## 🎤 5. Granting Permissions on First Launch

1. When you first open the app, tap **"Live Voice Monitor"** (`/demo`).
2. When clicking **"Start Monitoring"** on **Live mic**, Android will display the native permission dialog:
   > *"Allow VoiceGuard SIH to record audio?"*
3. Select **"While using the app"**.
4. Hardware microphone stream is now routed through the `AudioWorklet` $\to$ linear 16kHz resampler $\to$ ONNX WASM neural engine.

---

## 🧪 6. Live Testing & Judging Scenarios

### Test 1: Real-Time Human Voice Baseline (Verified Safe)
1. Open the app on your phone and go to `/demo`.
2. Select **"Live mic (simulate incoming call)"**.
3. Tap **"Start Monitoring"** and speak naturally in English or Hindi.
4. **Expected Result:**
   - Real-time soundwave animates with organic vocal tract harmonics.
   - Live Threat Gauge remains in the **Cyan / Safe Zone (Score: 8–24)**.
   - Status badge displays: `Likely Human Voice — Authentic glottal dynamics verified`.

---

### Test 2: AI-Cloned Voice Deepfake Attack (High-Risk Trigger)
1. In the source picker, select **"Play a sample call"**.
2. Select **"AI-Cloned Voice (High-Risk Deepfake)"**.
3. Tap **"Start Monitoring"**.
4. **Expected Result:**
   - Within 1.5–3.0 seconds, the smoothed score climbs rapidly.
   - Gauge transitions into the **Red / High-Risk Zone (Score: 88–95)**.
   - **Immediate Mid-Stream Alert Banner** appears on screen:
     `🚨 CRITICAL FRAUD ALERT: Synthetic Voice & Vishing Attack (Score: 94/100)`.
   - Recharts timeline shows continuous smoothed threat ascent.

---

### Test 3: WebRTC Two-Device Live Call (Phone $\leftrightarrow$ Laptop)
1. **On Laptop:** Open `https://voiceguard-sih.vercel.app/demo/receiver`.
   - Note the hosted Room Code (e.g., `VG-9088`).
2. **On Android Phone (APK):** Open the app and navigate to **"Caller Phone"** (`/demo/caller`).
   - Enter room code `VG-9088`.
   - Choose **"Live Phone Microphone"** or **"AI-Cloned Voice"**.
   - Tap **"Call Receiver"**.
3. **Observation:**
   - Inbound audio streams across devices in real time.
   - Laptop speaker plays caller audio while the judge observes the live threat score move.

---

### Test 4: 100% Offline Resilience (Airplane Mode)
1. Turn **ON Airplane Mode** on your phone (Wi-Fi and mobile data OFF).
2. The amber status pill will activate:
   `🟡 Offline Mode Active • Local WASM Acoustic Inference Running`.
3. Tap **"Start Monitoring"** and speak into the mic.
4. The detector evaluates all 64,600-sample sliding windows locally with **0 bytes transmitted over the network**.

---

### Test 5: SOC Command Center Audit (`/dashboard`)
1. On your laptop or phone, navigate to `/dashboard`.
2. Tap **"Fill Default Demo Credentials"** (`analyst@voiceguard.bank` / `SecureBankSOC2026!`) and sign in.
3. Observe live incoming risk telemetry rows streaming in via Supabase Realtime WebSocket.
4. Tap **"Escalate to Supervisor"** on any flagged call to log the threat event.

---

## 🔍 7. Troubleshooting & FAQ

| Issue | Resolution |
| :--- | :--- |
| **Microphone not capturing audio in APK** | Ensure `android.permission.RECORD_AUDIO` is in `AndroidManifest.xml` (already configured) and granted in Android app settings (*Settings > Apps > VoiceGuard SIH > Permissions*). |
| **WebRTC call fails to connect between phone and laptop** | Ensure both devices have internet access during signaling, or verify that corporate Wi-Fi is not blocking UDP WebRTC ports. |
| **App shows white screen on launch** | Verify that the Vercel deployment URL (`https://voiceguard-sih.vercel.app`) is online and `androidScheme: "https"` is present in `capacitor.config.ts`. |
| **Service worker cache update** | Sideloading a new APK or refreshing while online automatically downloads the latest models and WASM binaries into `CacheStorage`. |

---

## 📜 8. Compliance & Privacy Summary

VoiceGuard SIH operates on strict **Privacy-by-Design** principles:
- **Zero Audio Storage**: Customer voice audio is never recorded, saved to disk, or transmitted to any server.
- **DPDP Act 2023 & RBI Aligned**: Only non-biometric mathematical threat metrics (`risk_score`, acoustic anomaly labels) are logged.
