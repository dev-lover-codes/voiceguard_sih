/**
 * lib/prosody-analysis.ts
 *
 * Lightweight real prosody analysis for VoiceGuard SIH.
 *
 * Replaces the fabricated Math.random()-based phaseArtifacts value in
 * computeCompositeRisk() with a signal derived from actual PCM samples:
 *
 *   1. Autocorrelation-based fundamental frequency (F0) estimation per
 *      sub-frame (128-sample frames with a 64-sample hop).
 *   2. Pitch variance (coefficient of variation) across the window —
 *      neural TTS tends to produce unnaturally smooth, low-jitter F0.
 *   3. Silence/pause ratio — TTS often has artificially regular pauses
 *      compared to natural conversational speech.
 *
 * All computation is pure CPU (Float32Array arithmetic), no Web APIs
 * required, so it runs in both browser and Node test environments.
 *
 * Exported surface:
 *   computeProsodyScore(pcmWindow: Float32Array): number   → 0-100
 *     0  = maximally "TTS-like" (unnaturally smooth, suspect)
 *     100 = maximally "natural human" (high F0 jitter, irregular pauses)
 */

/** Minimum RMS energy below which a frame is considered silence. */
const SILENCE_THRESHOLD_RMS = 0.015;

/** F0 search range at 16 kHz: 70 Hz → 450 Hz (human speech range). */
const F0_MIN_LAG = Math.round(16000 / 450); // ~35 samples (~450 Hz)
const F0_MAX_LAG = Math.round(16000 / 70);  // ~228 samples (~70 Hz)

/**
 * Estimates the fundamental frequency (F0) of a single audio frame using
 * difference function autocorrelation.
 *
 * Returns the estimated F0 in Hz, or 0 if the frame is silent or no clear
 * pitch period is found within the human speech F0 range.
 */
export function estimateF0(frame: Float32Array): number {
  const N = frame.length;
  if (N < F0_MIN_LAG * 2) return 0;

  // RMS check — skip silent frames
  let sumSq = 0;
  for (let i = 0; i < N; i++) sumSq += frame[i] * frame[i];
  const energy = sumSq / N;
  if (Math.sqrt(energy) < SILENCE_THRESHOLD_RMS) return 0;

  const maxTau = Math.min(F0_MAX_LAG, Math.floor(N / 2));
  const diffs: number[] = new Array(maxTau + 1).fill(0);

  for (let tau = F0_MIN_LAG; tau <= maxTau; tau++) {
    let d = 0;
    const limit = N - tau;
    for (let i = 0; i < limit; i++) {
      const diff = frame[i] - frame[i + tau];
      d += diff * diff;
    }
    diffs[tau] = d / limit;
  }

  // Find the first local minimum below threshold (0.25 * energy)
  // to avoid octave halving (picking 2*period instead of fundamental period)
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

  // If no minimum was below threshold, pick the global minimum
  if (bestLag === 0) {
    let minVal = Infinity;
    for (let tau = F0_MIN_LAG; tau <= maxTau; tau++) {
      if (diffs[tau] < minVal) {
        minVal = diffs[tau];
        bestLag = tau;
      }
    }
    if (minVal > energy * 0.8) return 0; // reject flat noise
  }

  return bestLag > 0 ? 16000 / bestLag : 0;
}

/**
 * Computes a prosody naturalness score from a 16 kHz PCM window.
 *
 * Algorithm:
 *   • Split window into 512-sample frames (32 ms) with 256-sample hop.
 *   • Estimate F0 per voiced frame (silent frames excluded).
 *   • Compute pitch coefficient of variation (CV = σ / μ) over the voiced frames.
 *     - Human CV is typically 0.08–0.25 for conversational speech.
 *     - Neural TTS CV is typically 0.02–0.06 (unnaturally smooth).
 *   • Compute silence ratio (fraction of silent frames).
 *     - Human ratio is typically 0.20–0.45.
 *     - Neural TTS ratio is often ≈ 0.10–0.15 (too uniformly voiced).
 *   • Blend into a 0-100 naturalness score where higher = more human-like.
 *
 * @param pcmWindow - Float32Array of 16 kHz mono PCM samples (ideally 64,600 samples)
 * @returns number in [0, 100]:  0 = TTS-like,  100 = naturally variable human speech
 */
export function computeProsodyScore(pcmWindow: Float32Array): number {
  const FRAME_SIZE = 512;
  const HOP_SIZE   = 256;

  const f0Values: number[] = [];
  let totalFrames = 0;
  let silentFrames = 0;

  for (let offset = 0; offset + FRAME_SIZE <= pcmWindow.length; offset += HOP_SIZE) {
    const frame = pcmWindow.subarray(offset, offset + FRAME_SIZE);
    totalFrames++;

    const f0 = estimateF0(frame);
    if (f0 === 0) {
      silentFrames++;
    } else {
      f0Values.push(f0);
    }
  }

  // Edge case: no voiced frames at all → completely silent / DC offset
  if (f0Values.length < 3) return 50; // neutral — not enough data to judge

  // 1. Pitch CV (coefficient of variation)
  const n = f0Values.length;
  const mean = f0Values.reduce((a, b) => a + b, 0) / n;
  const variance = f0Values.reduce((a, v) => a + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 0;

  // Map CV to a 0-100 naturalness sub-score.
  // CV < 0.04 → very TTS-like → score near 0
  // CV 0.04-0.08 → boundary → score 25-50
  // CV 0.08-0.20 → natural human → score 50-90
  // CV > 0.20 → highly expressive → score 90-100
  const pitchScore = Math.min(100, Math.max(0,
    cv < 0.04 ? cv / 0.04 * 25 :
    cv < 0.08 ? 25 + (cv - 0.04) / 0.04 * 25 :
    cv < 0.20 ? 50 + (cv - 0.08) / 0.12 * 40 :
    90 + Math.min(10, (cv - 0.20) / 0.10 * 10)
  ));

  // 2. Silence ratio sub-score
  const silenceRatio = totalFrames > 0 ? silentFrames / totalFrames : 0;
  // Map pause ratio to naturalness sub-score.
  // ratio < 0.10 → too uniformly voiced (TTS-like) → score near 20
  // ratio 0.15-0.40 → normal human conversation → score 70-90
  // ratio > 0.60 → mostly silence → score 40 (uncertain)
  const silenceScore = Math.min(100, Math.max(0,
    silenceRatio < 0.10 ? silenceRatio / 0.10 * 20 :
    silenceRatio < 0.15 ? 20 + (silenceRatio - 0.10) / 0.05 * 50 :
    silenceRatio < 0.40 ? 70 + (silenceRatio - 0.15) / 0.25 * 20 :
    silenceRatio < 0.60 ? 90 - (silenceRatio - 0.40) / 0.20 * 50 :
    40
  ));

  // 3. Blend: pitch variation is the stronger signal (70%), silence ratio (30%)
  const blended = pitchScore * 0.70 + silenceScore * 0.30;

  return Math.round(Math.min(100, Math.max(0, blended)));
}

/**
 * Returns a ConfidenceBreakdown-compatible phaseArtifacts score (0-100).
 *
 * phaseArtifacts is defined as the SPOOF probability inferred from prosody.
 * A naturally variable (human) prosody → high naturalness → LOW spoof prob.
 * An unnaturally smooth (TTS) prosody → low naturalness → HIGH spoof prob.
 *
 * phaseArtifacts = 100 - computeProsodyScore(pcmWindow)
 */
export function computePhaseArtifactsScore(pcmWindow: Float32Array): number {
  return Math.round(100 - computeProsodyScore(pcmWindow));
}
