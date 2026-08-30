import { estimateF0, computeProsodyScore, computePhaseArtifactsScore } from '../prosody-analysis';

describe('lib/prosody-analysis.ts', () => {
  test('estimateF0 returns 0 on silent frame', () => {
    const silence = new Float32Array(512);
    expect(estimateF0(silence)).toBe(0);
  });

  test('estimateF0 accurately detects pure sine tone in human range', () => {
    // 200 Hz tone at 16 kHz sample rate (period = 80 samples)
    const frame = new Float32Array(512);
    const sampleRate = 16000;
    const freq = 200;
    for (let i = 0; i < frame.length; i++) {
      frame[i] = 0.5 * Math.sin((2 * Math.PI * freq * i) / sampleRate);
    }
    const f0 = estimateF0(frame);
    expect(f0).toBeGreaterThanOrEqual(190);
    expect(f0).toBeLessThanOrEqual(210);
  });

  test('computeProsodyScore returns score in [0, 100]', () => {
    const window = new Float32Array(64600);
    // Flat tone (monotone synthetic)
    for (let i = 0; i < window.length; i++) {
      window[i] = 0.3 * Math.sin((2 * Math.PI * 180 * i) / 16000);
    }
    const score = computeProsodyScore(window);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('computePhaseArtifactsScore = 100 - computeProsodyScore', () => {
    const window = new Float32Array(64600);
    for (let i = 0; i < window.length; i++) {
      window[i] = 0.3 * Math.sin((2 * Math.PI * 180 * i) / 16000);
    }
    const prosody = computeProsodyScore(window);
    const phase = computePhaseArtifactsScore(window);
    expect(phase).toBe(100 - prosody);
  });
});
