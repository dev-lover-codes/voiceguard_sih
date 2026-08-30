import {
  estimateF0,
  extractProsodyFeatures,
  computeProsodyScore,
  computePhaseArtifactsScore,
} from '../prosody-analysis';

describe('lib/prosody-analysis.ts - Prosody & Behavioral Speech Extractor', () => {
  const SAMPLE_RATE = 16000;

  describe('estimateF0() - Fundamental Frequency Pitch Tracker', () => {
    test('returns 0 on silent frames', () => {
      const silence = new Float32Array(512);
      expect(estimateF0(silence)).toBe(0);
    });

    test('returns 0 on very low energy noise below threshold', () => {
      const noise = new Float32Array(512);
      for (let i = 0; i < noise.length; i++) {
        noise[i] = (Math.random() - 0.5) * 0.005; // RMS < 0.015
      }
      expect(estimateF0(noise)).toBe(0);
    });

    test('accurately estimates human voice pitches (120 Hz, 200 Hz, 300 Hz)', () => {
      const testPitches = [120, 200, 300];
      for (const pitch of testPitches) {
        const frame = new Float32Array(512);
        for (let i = 0; i < frame.length; i++) {
          frame[i] = 0.5 * Math.sin((2 * Math.PI * pitch * i) / SAMPLE_RATE);
        }
        const estimated = estimateF0(frame);
        expect(estimated).toBeGreaterThanOrEqual(pitch * 0.90);
        expect(estimated).toBeLessThanOrEqual(pitch * 1.10);
      }
    });
  });

  describe('extractProsodyFeatures() - Behavioral Prosody & Rhythm Modeling', () => {
    test('handles completely silent PCM buffer gracefully', () => {
      const silenceWindow = new Float32Array(16000);
      const features = extractProsodyFeatures(silenceWindow);

      expect(features.meanF0).toBe(0);
      expect(features.f0Cv).toBe(0);
      expect(features.silenceRatio).toBe(1);
      expect(features.prosodyNaturalnessScore).toBe(50); // neutral
      expect(features.phaseArtifactsScore).toBe(50);
      expect(features.isTTSLikely).toBe(false);
    });

    test('detects flat monotone synthetic TTS audio (low pitch CV)', () => {
      // 2-second audio of perfectly flat 160 Hz sine wave with 0 jitter
      const ttsWindow = new Float32Array(32000);
      for (let i = 0; i < ttsWindow.length; i++) {
        ttsWindow[i] = 0.4 * Math.sin((2 * Math.PI * 160 * i) / SAMPLE_RATE);
      }

      const features = extractProsodyFeatures(ttsWindow);

      expect(features.meanF0).toBeGreaterThan(150);
      expect(features.f0StdDev).toBeLessThan(5); // virtually no pitch jitter
      expect(features.f0Cv).toBeLessThan(0.04);  // flat monotone
      expect(features.isTTSLikely).toBe(true);
      // Flat TTS should have lower naturalness (< 40) and high phase artifact spoof score (> 60)
      expect(features.prosodyNaturalnessScore).toBeLessThanOrEqual(40);
      expect(features.phaseArtifactsScore).toBeGreaterThanOrEqual(60);
    });

    test('identifies natural human speech variation (expressive pitch inflection & pauses)', () => {
      // 3-second audio with pitch contour varying from 120 Hz to 240 Hz and conversational pauses
      const humanWindow = new Float32Array(48000);
      const totalSamples = humanWindow.length;

      for (let i = 0; i < totalSamples; i++) {
        const timeSec = i / SAMPLE_RATE;
        // Introduce natural conversational pauses (e.g. at 1.0s-1.4s and 2.2s-2.5s)
        const isPause = (timeSec >= 1.0 && timeSec <= 1.35) || (timeSec >= 2.2 && timeSec <= 2.45);
        if (isPause) {
          humanWindow[i] = 0.001 * (Math.random() - 0.5); // background room silence
        } else {
          // Dynamic pitch contour with micro-jitter
          const basePitch = 160 + 50 * Math.sin(2 * Math.PI * 1.5 * timeSec);
          const jitter = 5 * Math.sin(2 * Math.PI * 25 * timeSec);
          const currentF0 = basePitch + jitter;
          humanWindow[i] = 0.4 * Math.sin((2 * Math.PI * currentF0 * i) / SAMPLE_RATE);
        }
      }

      const features = extractProsodyFeatures(humanWindow);

      expect(features.f0Cv).toBeGreaterThan(0.08); // high natural intonation
      expect(features.silenceRatio).toBeGreaterThan(0.10); // natural pause cadence
      expect(features.pauseCount).toBeGreaterThanOrEqual(2);
      expect(features.isTTSLikely).toBe(false);
      expect(features.prosodyNaturalnessScore).toBeGreaterThanOrEqual(70);
      expect(features.phaseArtifactsScore).toBeLessThanOrEqual(30);
    });

    test('incorporates AnalyserNode spectral frequency data', () => {
      const window = new Float32Array(16000);
      for (let i = 0; i < window.length; i++) {
        window[i] = 0.3 * Math.sin((2 * Math.PI * 180 * i) / SAMPLE_RATE);
      }

      // Synthetic vocoder spectrum with unnaturally high high-frequency phase energy
      const vocoderFreqData = new Uint8Array(64);
      for (let i = 0; i < 32; i++) vocoderFreqData[i] = 40;
      for (let i = 32; i < 64; i++) vocoderFreqData[i] = 180; // heavy >4kHz energy

      const scoreWithVocoder = computeProsodyScore(window, vocoderFreqData);
      const scoreNormal = computeProsodyScore(window);

      expect(scoreWithVocoder).toBeLessThanOrEqual(scoreNormal);
    });
  });

  describe('computeProsodyScore() and computePhaseArtifactsScore()', () => {
    test('phaseArtifactsScore is always exact complement of prosodyNaturalnessScore', () => {
      const window = new Float32Array(16000);
      for (let i = 0; i < window.length; i++) {
        window[i] = 0.35 * Math.sin((2 * Math.PI * 190 * i) / SAMPLE_RATE);
      }

      const naturalness = computeProsodyScore(window);
      const phaseSpoof = computePhaseArtifactsScore(window);

      expect(naturalness + phaseSpoof).toBe(100);
      expect(naturalness).toBeGreaterThanOrEqual(0);
      expect(naturalness).toBeLessThanOrEqual(100);
    });
  });
});
