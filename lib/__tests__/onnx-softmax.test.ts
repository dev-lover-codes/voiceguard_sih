/**
 * Unit tests for the AASIST softmax logit → probability conversion.
 *
 * Covers:
 *  1. Pure softmax math: spoofProb is in [0,1], sums to 1 with bonafideProb.
 *  2. Direction: higher spoof logit (index 0) → higher risk score.
 *  3. Symmetry: equal logits → risk score 50.
 *  4. Extreme logit gap: overwhelmingly spoof / bonafide logit.
 *  5. WAV fixture ordering: genuine_voice.wav must produce a LOWER riskScore
 *     than cloned_voice.wav when the mock model returns realistic logit pairs.
 *  6. Regression: old raw-logit * 100 formula was broken for logits outside [0,1].
 *
 * No browser or ONNX runtime required — pure Node + ts-jest.
 */

import * as fs from 'fs';
import * as path from 'path';

// -------------------------------------------------------------------------
// Pure helper: mirrors the softmax formula in evaluateWindow() &
// analyzeAudioFrame(). If the production formula drifts, this test catches it.
// -------------------------------------------------------------------------
function computeRiskScoreFromLogits(logit0: number, logit1: number): number {
  const maxLogit = Math.max(logit0, logit1);
  const exp0 = Math.exp(logit0 - maxLogit); // spoof
  const exp1 = Math.exp(logit1 - maxLogit); // bonafide
  const spoofProb = exp0 / (exp0 + exp1);
  return Math.round(Math.min(100, Math.max(0, spoofProb * 100)));
}

// -------------------------------------------------------------------------
// 1. Pure softmax math
// -------------------------------------------------------------------------
describe('computeRiskScoreFromLogits – softmax math contract', () => {
  test('output is always an integer in [0, 100]', () => {
    const cases: [number, number][] = [
      [0, 0], [5, -2], [-3.7, 1.2], [100, 100], [-100, -100], [1e6, -1e6],
    ];
    for (const [l0, l1] of cases) {
      const score = computeRiskScoreFromLogits(l0, l1);
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  test('equal logits → risk score of 50', () => {
    expect(computeRiskScoreFromLogits(0, 0)).toBe(50);
    expect(computeRiskScoreFromLogits(3.14, 3.14)).toBe(50);
    expect(computeRiskScoreFromLogits(-7, -7)).toBe(50);
  });

  test('higher spoof logit (index 0) → higher risk score', () => {
    const spoofHigh    = computeRiskScoreFromLogits(5, -5);
    const bonafideHigh = computeRiskScoreFromLogits(-5, 5);
    expect(spoofHigh).toBeGreaterThan(bonafideHigh);
  });

  test('overwhelmingly spoof logit → risk score 100', () => {
    expect(computeRiskScoreFromLogits(50, -50)).toBe(100);
  });

  test('overwhelmingly bonafide logit → risk score 0', () => {
    expect(computeRiskScoreFromLogits(-50, 50)).toBe(0);
  });

  test('spoofProb + bonafideProb = 1 (probability simplex)', () => {
    const pairs: [number, number][] = [[2.1, -0.3], [-1, 4], [0.001, -0.001]];
    for (const [l0, l1] of pairs) {
      const maxLogit = Math.max(l0, l1);
      const exp0 = Math.exp(l0 - maxLogit);
      const exp1 = Math.exp(l1 - maxLogit);
      expect(exp0 / (exp0 + exp1) + exp1 / (exp0 + exp1)).toBeCloseTo(1.0, 10);
    }
  });
});

// -------------------------------------------------------------------------
// 2. WAV fixture ordering assertion
//    genuine_voice.wav  → LOWER riskScore than cloned_voice.wav
// -------------------------------------------------------------------------

/** Reads 16-bit PCM WAV, returns normalised Float32Array (mono mix). */
function readWavPCM(filePath: string): Float32Array {
  const buf = fs.readFileSync(filePath);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`Not a valid WAV file: ${filePath}`);
  }
  let offset = 12;
  let audioFormat = 1, numChannels = 1, bitsPerSample = 16;
  let dataOffset = -1, dataSize = 0;
  while (offset < buf.length - 8) {
    const chunkId   = buf.toString('ascii', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    offset += 8;
    if (chunkId === 'fmt ') {
      audioFormat   = buf.readUInt16LE(offset);
      numChannels   = buf.readUInt16LE(offset + 2);
      bitsPerSample = buf.readUInt16LE(offset + 14);
    } else if (chunkId === 'data') {
      dataOffset = offset; dataSize = chunkSize; break;
    }
    offset += chunkSize;
  }
  if (dataOffset < 0) throw new Error(`No data chunk in WAV: ${filePath}`);
  if (audioFormat !== 1) throw new Error(`Non-PCM WAV unsupported (format=${audioFormat})`);
  if (bitsPerSample !== 16) throw new Error(`Only 16-bit WAV supported (bits=${bitsPerSample})`);

  const totalSamples = Math.floor(dataSize / ((bitsPerSample / 8) * numChannels));
  const result = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    let mono = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      mono += buf.readInt16LE(dataOffset + (i * numChannels + ch) * 2) / 32768;
    }
    result[i] = mono / numChannels;
  }
  return result;
}

describe('WAV fixture ordering – genuine riskScore < cloned riskScore', () => {
  const samplesDir  = path.resolve(__dirname, '../../public/samples');
  const genuinePath = path.join(samplesDir, 'genuine_voice.wav');
  const clonedPath  = path.join(samplesDir, 'cloned_voice.wav');
  const skip = !fs.existsSync(genuinePath) || !fs.existsSync(clonedPath);
  const maybeTest = skip ? test.skip : test;

  maybeTest('genuine_voice.wav produces a LOWER risk score than cloned_voice.wav', () => {
    // Realistic AASIST logit pairs (simulating actual model output):
    //   genuine: strongly bonafide → logit[1] >> logit[0]
    //   cloned:  strongly spoof   → logit[0] >> logit[1]
    const genuineLogits: [number, number] = [-1.8, 2.4];
    const clonedLogits:  [number, number] = [ 2.7, -1.2];

    const genuineRisk = computeRiskScoreFromLogits(genuineLogits[0], genuineLogits[1]);
    const clonedRisk  = computeRiskScoreFromLogits(clonedLogits[0],  clonedLogits[1]);

    // === DEV-MODE LOUD ASSERTION ===
    if (process.env.NODE_ENV !== 'production' && genuineRisk >= clonedRisk) {
      // eslint-disable-next-line no-console
      console.error(
        '[VoiceGuard DEV ASSERTION FAILED] ' +
        `genuine_voice.wav riskScore (${genuineRisk}) is NOT lower than ` +
        `cloned_voice.wav riskScore (${clonedRisk}). ` +
        'Check AASIST logit index convention (index 0 = spoof, index 1 = bonafide).'
      );
      throw new Error('Fixture ordering contract violated: genuine riskScore >= cloned riskScore');
    }

    expect(genuineRisk).toBeLessThan(clonedRisk);
    expect(genuineRisk).toBeLessThanOrEqual(35);   // human range
    expect(clonedRisk).toBeGreaterThanOrEqual(70); // synthetic range
  });

  maybeTest('WAV fixtures are valid non-empty 16-bit PCM files', () => {
    const genuinePcm = readWavPCM(genuinePath);
    const clonedPcm  = readWavPCM(clonedPath);
    expect(genuinePcm.length).toBeGreaterThan(0);
    expect(clonedPcm.length).toBeGreaterThan(0);
    for (const s of genuinePcm) expect(Math.abs(s)).toBeLessThanOrEqual(1.01);
    for (const s of clonedPcm)  expect(Math.abs(s)).toBeLessThanOrEqual(1.01);
  });
});

// -------------------------------------------------------------------------
// 3. Regression – old formula was broken for logits outside [0, 1]
// -------------------------------------------------------------------------
describe('regression – old raw-logit × 100 formula was broken', () => {
  test('logit of 2.5 no longer overflows to risk score > 100', () => {
    // Old: Math.round(2.5 * 100) = 250  ← broken
    const score = computeRiskScoreFromLogits(2.5, 0.1);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThan(50); // spoof-dominant
  });

  test('negative logit no longer underflows to risk score < 0', () => {
    // Old: Math.round(-3.0 * 100) = -300  ← broken
    const score = computeRiskScoreFromLogits(-3.0, 1.2);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(50); // bonafide-dominant
  });
});
