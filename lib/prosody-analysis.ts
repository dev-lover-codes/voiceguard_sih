/**
 * lib/prosody-analysis.ts
 *
 * Lightweight client-side prosody and behavioral speech extractor for VoiceGuard SIH.
 * Models speech rhythm, pitch contours (F0), pitch variance (jitter/intonation),
 * pause/silence cadence, and spectral microvariations to differentiate natural human
 * speech from neural TTS (Text-to-Speech) / voice conversion outputs.
 *
 * Key Signals Analyzed:
 *   1. Autocorrelation-based fundamental frequency (F0) tracking (70 Hz – 450 Hz).
 *   2. Pitch Coefficient of Variation (CV = σ / μ):
 *      - Natural human speech has rich intonation & micro-jitter: CV ≈ 0.08–0.25+
 *      - Neural TTS / vocoders produce unnaturally flat/monotone pitch: CV < 0.04
 *   3. Conversational pause & silence ratio:
 *      - Human dialogue has natural 15%–45% pauses between breath/phrases.
 *      - Synthesizer output often streams continuous, uniformly voiced audio.
 *   4. AnalyserNode frequency bin spectral balance (when available).
 *
 * All algorithms are pure TypeScript / Float32Array arithmetic — zero external models,
 * zero network dependencies, runs smoothly in browser and Node test environments.
 */

/** Minimum RMS energy below which a frame is classified as silence. */
export const SILENCE_THRESHOLD_RMS = 0.015;

/** F0 search range at 16 kHz: 70 Hz → 450 Hz (human vocal tract range). */
export const F0_MIN_LAG = Math.round(16000 / 450); // ~35 samples (~450 Hz)
export const F0_MAX_LAG = Math.round(16000 / 70);  // ~228 samples (~70 Hz)

export interface ProsodyFeatures {
  meanF0: number;                  // Average fundamental frequency (Hz)
  f0StdDev: number;                // F0 standard deviation (Hz)
  f0Cv: number;                    // Pitch coefficient of variation (σ / μ)
  voicedRatio: number;             // Ratio of voiced speech frames (0 - 1)
  silenceRatio: number;            // Ratio of silent/pause frames (0 - 1)
  pauseCount: number;              // Distinct pause segments in window
  prosodyNaturalnessScore: number; // 0 - 100 (100 = highly natural human, 0 = TTS clone)
  phaseArtifactsScore: number;     // 0 - 100 (100 = high TTS spoof signal, 0 = natural)
  isTTSLikely: boolean;            // True if pitch variance is unnaturally low (<0.045)
}

/**
 * Estimates fundamental frequency (F0) of a single audio frame via
 * difference-function autocorrelation (YIN-style pitch estimator).
 *
 * @param frame - 16 kHz Float32Array sub-frame
 * @returns Estimated pitch in Hz (70-450 Hz), or 0 if unvoiced/silent
 */
export function estimateF0(frame: Float32Array): number {
  const N = frame.length;
  if (N < F0_MIN_LAG * 2) return 0;

  // Energy check (RMS)
  let sumSq = 0;
  for (let i = 0; i < N; i++) sumSq += frame[i] * frame[i];
  const energy = sumSq / N;
  if (Math.sqrt(energy) < SILENCE_THRESHOLD_RMS) return 0;

  const maxTau = Math.min(F0_MAX_LAG, Math.floor(N / 2));
  const diffs = new Float32Array(maxTau + 1);

  for (let tau = F0_MIN_LAG; tau <= maxTau; tau++) {
    let d = 0;
    const limit = N - tau;
    for (let i = 0; i < limit; i++) {
      const diff = frame[i] - frame[i + tau];
      d += diff * diff;
    }
    diffs[tau] = d / limit;
  }

  // Find first local minimum below threshold (0.25 * energy) to avoid octave halving
  const threshold = energy * 0.25;
  let bestLag = 0;

  for (let tau = F0_MIN_LAG + 1; tau < maxTau; tau++) {
    if (diffs[tau] < diffs[tau - 1] && diffs[tau] <= diffs[tau + 1]) {
      if (diffs[tau] < threshold) {
        bestLag = tau;
        break;
      }
    }
  }

  // Fallback to global minimum if no local minimum was below strict threshold
  if (bestLag === 0) {
    let minVal = Infinity;
    for (let tau = F0_MIN_LAG; tau <= maxTau; tau++) {
      if (diffs[tau] < minVal) {
        minVal = diffs[tau];
        bestLag = tau;
      }
    }
    if (minVal > energy * 0.8) return 0; // reject unvoiced noise
  }

  return bestLag > 0 ? 16000 / bestLag : 0;
}

/**
 * Extracts comprehensive prosody and behavioral features from a 16 kHz PCM audio window.
 *
 * @param pcmWindow - Float32Array of 16 kHz audio samples (recommended: 64,600 samples)
 * @param freqData - Optional Uint8Array from AnalyserNode.getByteFrequencyData()
 * @returns ProsodyFeatures object with metrics and 0-100 naturalness scores
 */
export function extractProsodyFeatures(
  pcmWindow: Float32Array,
  freqData?: Uint8Array | null
): ProsodyFeatures {
  const FRAME_SIZE = 512; // 32 ms at 16 kHz
  const HOP_SIZE = 256;   // 16 ms hop (50% overlap)

  const f0Values: number[] = [];
  let totalFrames = 0;
  let silentFrames = 0;
  let pauseCount = 0;
  let inPause = false;

  for (let offset = 0; offset + FRAME_SIZE <= pcmWindow.length; offset += HOP_SIZE) {
    const frame = pcmWindow.subarray(offset, offset + FRAME_SIZE);
    totalFrames++;

    const f0 = estimateF0(frame);
    if (f0 === 0) {
      silentFrames++;
      if (!inPause) {
        pauseCount++;
        inPause = true;
      }
    } else {
      f0Values.push(f0);
      inPause = false;
    }
  }

  // Fallback for silent or unvoiced buffer
  if (f0Values.length < 3 || totalFrames === 0) {
    return {
      meanF0: 0,
      f0StdDev: 0,
      f0Cv: 0,
      voicedRatio: 0,
      silenceRatio: 1,
      pauseCount,
      prosodyNaturalnessScore: 50, // neutral default
      phaseArtifactsScore: 50,
      isTTSLikely: false,
    };
  }

  // 1. Pitch Mean, Variance, & Coefficient of Variation
  const n = f0Values.length;
  const meanF0 = f0Values.reduce((a, b) => a + b, 0) / n;
  const variance = f0Values.reduce((a, v) => a + (v - meanF0) ** 2, 0) / n;
  const f0StdDev = Math.sqrt(variance);
  const f0Cv = meanF0 > 0 ? f0StdDev / meanF0 : 0;

  // Map CV to naturalness:
  // CV < 0.04  → Flat monotone (TTS characteristic) → Score: 0 - 25
  // CV 0.04-0.08 → Low variation boundary → Score: 25 - 50
  // CV 0.08-0.20 → Typical human conversational speech → Score: 50 - 90
  // CV > 0.20  → Rich expressive intonation → Score: 90 - 100
  let pitchScore: number;
  if (f0Cv < 0.04) {
    pitchScore = (f0Cv / 0.04) * 25;
  } else if (f0Cv < 0.08) {
    pitchScore = 25 + ((f0Cv - 0.04) / 0.04) * 25;
  } else if (f0Cv < 0.20) {
    pitchScore = 50 + ((f0Cv - 0.08) / 0.12) * 40;
  } else {
    pitchScore = 90 + Math.min(10, ((f0Cv - 0.20) / 0.10) * 10);
  }

  // 2. Pause & Silence Ratio
  const silenceRatio = silentFrames / totalFrames;
  const voicedRatio = 1 - silenceRatio;

  // Normal human conversation has 15% - 45% pauses
  let silenceScore: number;
  if (silenceRatio < 0.08) {
    silenceScore = (silenceRatio / 0.08) * 25; // too uniform / robotic
  } else if (silenceRatio < 0.15) {
    silenceScore = 25 + ((silenceRatio - 0.08) / 0.07) * 45;
  } else if (silenceRatio <= 0.45) {
    silenceScore = 70 + ((silenceRatio - 0.15) / 0.30) * 25;
  } else if (silenceRatio <= 0.70) {
    silenceScore = 95 - ((silenceRatio - 0.45) / 0.25) * 45;
  } else {
    silenceScore = 40; // predominantly silent
  }

  // 3. Spectral Frequency Energy Balance (if AnalyserNode data available)
  let spectralBonus = 0;
  if (freqData && freqData.length > 0) {
    // Analyze upper vs lower harmonic ratio
    const mid = Math.floor(freqData.length / 2);
    let lowEnergy = 0;
    let highEnergy = 0;
    for (let i = 0; i < mid; i++) lowEnergy += freqData[i];
    for (let i = mid; i < freqData.length; i++) highEnergy += freqData[i];
    const total = lowEnergy + highEnergy;
    if (total > 0) {
      const highRatio = highEnergy / total;
      // Natural voice has gradual roll-off; vocoders often have elevated >4kHz phase energy
      if (highRatio > 0.45) {
        spectralBonus = -10; // penalty for unnatural high-frequency energy
      } else if (highRatio > 0.10 && highRatio < 0.35) {
        spectralBonus = 5;
      }
    }
  }

  // 4. Combined Naturalness Score (65% Pitch Variation + 35% Pause Rhythm + Spectral Adjustment)
  const blendedNaturalness = Math.round(
    Math.min(100, Math.max(0, pitchScore * 0.65 + silenceScore * 0.35 + spectralBonus))
  );

  const phaseArtifactsScore = 100 - blendedNaturalness;
  const isTTSLikely = f0Cv < 0.045 || (silenceRatio < 0.08 && f0Cv < 0.06);

  return {
    meanF0: Math.round(meanF0 * 10) / 10,
    f0StdDev: Math.round(f0StdDev * 10) / 10,
    f0Cv: Math.round(f0Cv * 1000) / 1000,
    voicedRatio: Math.round(voicedRatio * 100) / 100,
    silenceRatio: Math.round(silenceRatio * 100) / 100,
    pauseCount,
    prosodyNaturalnessScore: blendedNaturalness,
    phaseArtifactsScore,
    isTTSLikely,
  };
}

/**
 * Computes a 0-100 prosody naturalness score (100 = natural human speech, 0 = TTS clone).
 */
export function computeProsodyScore(
  pcmWindow: Float32Array,
  freqData?: Uint8Array | null
): number {
  return extractProsodyFeatures(pcmWindow, freqData).prosodyNaturalnessScore;
}

/**
 * Returns a 0-100 prosody spoof / phase artifacts score (100 = high spoof probability).
 * phaseArtifactsScore = 100 - computeProsodyScore()
 */
export function computePhaseArtifactsScore(
  pcmWindow: Float32Array,
  freqData?: Uint8Array | null
): number {
  return extractProsodyFeatures(pcmWindow, freqData).phaseArtifactsScore;
}
