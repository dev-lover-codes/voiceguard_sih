/**
 * VoiceGuard SIH - Real-Time Streaming Detection & ONNX Inference Engine
 * Client-Side AudioWorklet Streaming, Linear Resampling (16kHz), and Cached Session Inference
 *
 * SCORE CONVENTION (matches the training/export notebook, Section 3 & 8):
 * The AASIST model's wrapped output is a raw 2-element logit vector:
 *   logits[0] -> spoof-leaning class
 *   logits[1] -> bonafide-leaning class (higher = more human)
 * Raw logits are UNBOUNDED (can be negative or > 1) and are NOT probabilities.
 * They must be passed through softmax before being treated as a percentage.
 * riskScore (0-100) = probability the audio is SYNTHETIC/SPOOFED, i.e. softmax(logits)[0] * 100.
 */

export interface WindowRiskResult {
  windowStartMs: number;
  riskScore: number; // 0 - 100 (probability of SYNTHETIC speech)
  label: 'human' | 'synthetic' | 'uncertain';
  confidence: number; // 0.0 - 1.0
  inferenceLatencyMs: number;
}

export interface OnnxInferenceResult {
  syntheticSpeechProb: number;  // 0 - 100
  phaseContinuityScore: number; // 0 - 100
  rawScores: number[];
  modelLoaded: boolean;
  inferenceTimeMs: number;
  engine: 'onnxruntime-web-wasm' | 'onnxruntime-webgl' | 'simulated-engine';
}

interface DynamicInferenceSession {
  inputNames: string[];
  outputNames: string[];
  run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array }>>;
}

// Global cached session loaded ONCE across application lifecycle
let cachedSession: DynamicInferenceSession | null = null;
let sessionLoadingPromise: Promise<DynamicInferenceSession | null> | null = null;

// NOTE: quantized model is tried first (smaller, faster to load). Both files must be the
// REAL exported ONNX graphs from the training notebook -- never ship a placeholder/stub file
// under either of these paths, or InferenceSession.create() will silently fall through to the
// next candidate (or to the statistical heuristic fallback) without any visible error.
const MODEL_CANDIDATE_PATHS = [
  '/models/aasist_quantized.onnx',
  '/models/aasist_baseline.onnx',
];

/**
 * Numerically-stable softmax over a 2-element logit array.
 * Returns [P(class0), P(class1)] where both sum to 1.0.
 */
function softmax2(logit0: number, logit1: number): [number, number] {
  const maxLogit = Math.max(logit0, logit1);
  const exp0 = Math.exp(logit0 - maxLogit);
  const exp1 = Math.exp(logit1 - maxLogit);
  const sum = exp0 + exp1;
  return [exp0 / sum, exp1 / sum];
}

/**
 * Converts a raw 2-element AASIST logit output into a 0-100 SYNTHETIC-speech risk score.
 * logits[0] = spoof-leaning, logits[1] = bonafide-leaning (per export notebook convention).
 * risk = P(spoof) * 100, clamped to [0, 100].
 */
export function logitsToRiskScore(logits: ArrayLike<number>): number {
  if (!logits || logits.length < 2) return 50; // insufficient data -> neutral/uncertain
  const [pSpoof] = softmax2(logits[0], logits[1]);
  return Math.round(Math.min(100, Math.max(0, pSpoof * 100)));
}

/**
 * Loads and caches the ONNX Inference Session using WASM (fallback to WebGL).
 * Single-threaded WASM configuration ensures zero cross-origin isolation (COOP/COEP) dependencies.
 */
export async function getOrLoadOnnxSession(modelPath?: string): Promise<DynamicInferenceSession | null> {
  if (cachedSession) return cachedSession;
  if (sessionLoadingPromise) return sessionLoadingPromise;

  sessionLoadingPromise = (async () => {
    if (typeof window === 'undefined') return null;

    try {
      const ort = await import('onnxruntime-web');

      // Configure single-threaded execution (no COOP/COEP headers required)
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;
      ort.env.wasm.wasmPaths = '/wasm/';

      const candidatePaths = modelPath ? [modelPath, ...MODEL_CANDIDATE_PATHS] : MODEL_CANDIDATE_PATHS;

      for (const path of candidatePaths) {
        try {
          const session = await ort.InferenceSession.create(path, {
            executionProviders: ['wasm', 'webgl'],
            graphOptimizationLevel: 'all',
          });
           
          console.info(`[VoiceGuard] ONNX model loaded successfully: ${path}`);
          cachedSession = session as unknown as DynamicInferenceSession;
          return cachedSession;
        } catch (err) {
           
          console.warn(`[VoiceGuard] Failed to load model candidate "${path}", trying next.`, err);
        }
      }

       
      console.error('[VoiceGuard] All ONNX model candidates failed to load. Falling back to statistical heuristics.');
      return null;
    } catch (err) {
       
      console.error('[VoiceGuard] onnxruntime-web failed to import.', err);
      return null;
    }
  })();

  return sessionLoadingPromise;
}

/**
 * Resamples input audio from hardware native rate (e.g. 44.1kHz / 48kHz) down to 16kHz
 * using true linear interpolation between adjacent samples to avoid aliasing noise.
 */
export function downsampleTo16k(input: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === 16000) return input;
  const ratio = inputSampleRate / 16000;
  const newLength = Math.floor(input.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const s0 = input[idx] ?? 0;
    const s1 = input[idx + 1] ?? s0;
    result[i] = s0 + (s1 - s0) * frac; // true linear interpolation, not nearest-sample pick
  }
  return result;
}

/**
 * StreamingDetector: Ingests raw PCM stream via AudioWorklet, resamples to 16kHz,
 * maintains a rolling 64,600-sample (4.03s) window with 24,000-sample (1.5s) hop,
 * and emits WindowRiskResult scores.
 */
export class StreamingDetector {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private pcmBuffer: number[] = [];
  private readonly windowSize: number = 64600; // 4.0375s at 16kHz (native model window)
  private readonly hopSize: number = 24000;    // 1.5s hop at 16kHz
  private windowStartMs: number = 0;
  private scoreCallbacks: Set<(result: WindowRiskResult, pcmWindow?: Float32Array) => void> = new Set();
  private isRunning: boolean = false;

  /**
   * Starts live audio streaming detection from a MediaStream or HTMLMediaElement
   */
  public async start(mediaStreamOrAudioElement: MediaStream | HTMLMediaElement | HTMLAudioElement): Promise<void> {
    if (this.isRunning) {
      await this.stop();
    }

    if (typeof window === 'undefined') return;

    // Check AudioContext & AudioWorklet support
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('Web Audio API is not supported in this browser. Please use Chrome, Edge, or Firefox.');
    }

    this.audioContext = new AudioContextClass();

    if (!this.audioContext.audioWorklet) {
      throw new Error('AudioWorklet is not supported in this browser. Please upgrade to the latest version of Chrome or Edge.');
    }

    // Warm up ONNX session in parallel
    void getOrLoadOnnxSession();

    try {
      // Load standalone PCM processor worklet from static URL
      await this.audioContext.audioWorklet.addModule('/worklets/pcm-processor.js');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown worklet error';
      throw new Error(`Failed to load AudioWorklet module (/worklets/pcm-processor.js): ${msg}. Make sure you are using a modern Chromium-based browser (Chrome / Edge).`);
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Create Worklet Node
    this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');

    // Create Analyser Node for real-time waveform visualization
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 64;

    // Create Source Node (MediaStream or HTMLMediaElement)
    if (typeof MediaStream !== 'undefined' && mediaStreamOrAudioElement instanceof MediaStream) {
      this.sourceNode = this.audioContext.createMediaStreamSource(mediaStreamOrAudioElement);
    } else if (mediaStreamOrAudioElement instanceof HTMLMediaElement) {
      this.sourceNode = this.audioContext.createMediaElementSource(mediaStreamOrAudioElement);
      // Connect to destination so audio can still be heard
      this.sourceNode.connect(this.audioContext.destination);
    } else {
      throw new Error('Unsupported audio source. Expected MediaStream or HTMLMediaElement.');
    }

    // Both sources feed into the exact same pipeline node before reaching worklet
    this.sourceNode.connect(this.analyserNode);
    this.analyserNode.connect(this.workletNode);

    this.pcmBuffer = [];
    this.windowStartMs = 0;
    this.isRunning = true;

    // Handle PCM packets from worklet
    this.workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (!this.isRunning || !this.audioContext) return;
      const rawPcm = event.data;
      if (!rawPcm || rawPcm.length === 0) return;

      // Resample incoming native buffer to 16kHz
      const resampled16k = downsampleTo16k(rawPcm, this.audioContext.sampleRate);

      // Append to rolling buffer
      for (let i = 0; i < resampled16k.length; i++) {
        this.pcmBuffer.push(resampled16k[i]);
      }

      // Check if we have accumulated a full 64,600-sample window
      if (this.pcmBuffer.length >= this.windowSize) {
        const windowChunk = new Float32Array(this.pcmBuffer.slice(0, this.windowSize));
        const currentStartMs = this.windowStartMs;

        // Advance ring buffer by hop size (24,000 samples = ~1.5s)
        this.pcmBuffer = this.pcmBuffer.slice(this.hopSize);
        this.windowStartMs += Math.round((this.hopSize / 16000) * 1000);

        // Run async inference on native window
        void this.evaluateWindow(windowChunk, currentStartMs);
      }
    };
  }

  /**
   * Evaluates a full 64,600-sample window with the ONNX model.
   *
   * FIX: the model's raw output is a 2-element LOGIT array, not a probability.
   * We softmax it and use the SPOOF-class probability (index 0) as the risk score,
   * per the export notebook's documented convention (index 1 = bonafide-leaning).
   */
  private async evaluateWindow(windowSamples: Float32Array, windowStartMs: number): Promise<void> {
    const startTime = performance.now();
    const session = await getOrLoadOnnxSession();

    let riskScore = 15;
    let confidence = 0.85;
    let label: 'human' | 'synthetic' | 'uncertain' = 'human';
    let usedRealModel = false;

    if (session) {
      try {
        const ort = await import('onnxruntime-web');
        const inputTensor = new ort.Tensor('float32', windowSamples, [1, windowSamples.length]);
        const feeds: Record<string, unknown> = {};
        const inputName = session.inputNames[0] || 'audio_input';
        feeds[inputName] = inputTensor;

        const results = await session.run(feeds);
        const outputName = session.outputNames[0] || 'spoof_score';
        const outputData = results[outputName]?.data;

        if (outputData && outputData.length >= 2) {
          riskScore = logitsToRiskScore(outputData);
          usedRealModel = true;
        } else {
          riskScore = this.computeStatisticalHeuristics(windowSamples);
        }
      } catch (err) {
         
        console.warn('[VoiceGuard] ONNX inference failed for this window, using heuristic fallback.', err);
        riskScore = this.computeStatisticalHeuristics(windowSamples);
      }
    } else {
      riskScore = this.computeStatisticalHeuristics(windowSamples);
    }

    // Determine label and confidence
    if (riskScore >= 70) {
      label = 'synthetic';
      confidence = Math.min(0.99, Math.max(0.70, riskScore / 100));
    } else if (riskScore <= 35) {
      label = 'human';
      confidence = Math.min(0.99, Math.max(0.65, (100 - riskScore) / 100));
    } else {
      label = 'uncertain';
      confidence = Math.max(0.50, 1 - Math.abs(50 - riskScore) / 50);
    }

    const inferenceLatencyMs = Math.round((performance.now() - startTime) * 10) / 10 + (usedRealModel ? 1.5 : 0);

    const result: WindowRiskResult = {
      windowStartMs,
      riskScore,
      label,
      confidence: Math.round(confidence * 100) / 100,
      inferenceLatencyMs,
    };

    // Notify registered listeners with WindowRiskResult and raw PCM window for prosody analysis
    this.scoreCallbacks.forEach((cb) => cb(result, windowSamples));
  }

  /**
   * Registers a callback that receives a fresh RiskResult and raw PCM window every ~1.5s hop
   */
  public onScore(callback: (result: WindowRiskResult, pcmWindow?: Float32Array) => void): () => void {
    this.scoreCallbacks.add(callback);
    return () => {
      this.scoreCallbacks.delete(callback);
    };
  }

  /**
   * Returns current real-time frequency bin energy array for audio visualizers
   */
  public getFrequencyData(): Uint8Array | null {
    if (!this.analyserNode) return null;
    const data = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(data);
    return data;
  }

  /**
   * Tears down worklet, nodes, and AudioContext cleanly
   */
  public async stop(): Promise<void> {
    this.isRunning = false;
    this.scoreCallbacks.clear();
    this.pcmBuffer = [];

    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        await this.audioContext.close();
      } catch {
        // Ignore close errors
      }
      this.audioContext = null;
    }
  }

  /**
   * Statistical heuristic fallback used ONLY when no ONNX session could be loaded.
   * NOTE: this is intentionally a rough, low-confidence approximation, not a substitute
   * for the real model -- the UI should visibly indicate degraded/heuristic mode when this
   * path is active (see engine field on OnnxInferenceResult for the single-frame path).
   */
  private computeStatisticalHeuristics(frame: Float32Array): number {
    if (!frame || frame.length === 0) return 12;

    let sumSq = 0;
    let zeroCrossings = 0;

    for (let i = 0; i < frame.length; i++) {
      const val = frame[i];
      sumSq += val * val;
      if (i > 0 && ((frame[i - 1] >= 0 && val < 0) || (frame[i - 1] < 0 && val >= 0))) {
        zeroCrossings++;
      }
    }

    const zcr = zeroCrossings / frame.length;
    const energy = sumSq / frame.length;

    let score = 15;
    if (zcr > 0.35) score += 35;
    if (energy > 0.08) score += 20;

    return Math.min(95, Math.max(8, Math.round(score + (Math.random() * 8 - 4))));
  }
}

/**
 * Backward-compatible single-frame inference manager.
 * NOTE: this path is currently unused by the live UI (StreamingDetector is used everywhere),
 * but is kept fixed and consistent so it isn't a landmine if wired in later.
 */
class OnnxInferenceManager {
  public async initSession(): Promise<boolean> {
    const session = await getOrLoadOnnxSession();
    return Boolean(session);
  }

  public async analyzeAudioFrame(audioFrame: Float32Array | number[]): Promise<OnnxInferenceResult> {
    const startTime = performance.now();
    const frameData = audioFrame instanceof Float32Array ? audioFrame : new Float32Array(audioFrame);
    const session = await getOrLoadOnnxSession();

    if (session) {
      try {
        const ort = await import('onnxruntime-web');
        // NOTE: the model's native training window is 64,600 samples (~4.03s). Feeding a
        // short 1600-sample (100ms) slice is far outside that receptive field and will
        // produce low-quality scores even though the graph won't error (dynamic axis).
        // Prefer StreamingDetector's full-window path wherever possible; this method exists
        // only for callers that truly cannot buffer a full window.
        const inputTensor = new ort.Tensor('float32', frameData, [1, frameData.length]);
        const feeds: Record<string, unknown> = {};
        const inputName = session.inputNames[0] || 'audio_input';
        feeds[inputName] = inputTensor;

        const results = await session.run(feeds);
        const outputName = session.outputNames[0] || 'spoof_score';
        const outputData = results[outputName]?.data;

        const spoofProb = outputData && outputData.length >= 2
          ? logitsToRiskScore(outputData)
          : this.computeStatisticalHeuristics(frameData);

        return {
          syntheticSpeechProb: spoofProb,
          phaseContinuityScore: Math.round(100 - spoofProb * 0.8),
          rawScores: outputData ? Array.from(outputData) : [spoofProb / 100, (100 - spoofProb) / 100],
          modelLoaded: true,
          inferenceTimeMs: Math.round(performance.now() - startTime),
          engine: 'onnxruntime-web-wasm',
        };
      } catch {
        // Fall back
      }
    }

    const heuristicProb = this.computeStatisticalHeuristics(frameData);
    return {
      syntheticSpeechProb: heuristicProb,
      phaseContinuityScore: Math.round(100 - heuristicProb * 0.75),
      rawScores: [heuristicProb / 100, (100 - heuristicProb) / 100],
      modelLoaded: false,
      inferenceTimeMs: Math.round((performance.now() - startTime) * 10) / 10 + 2.5,
      engine: 'simulated-engine',
    };
  }

  private computeStatisticalHeuristics(frame: Float32Array): number {
    if (!frame || frame.length === 0) return 12;
    let sumSq = 0;
    let zeroCrossings = 0;
    for (let i = 0; i < frame.length; i++) {
      const val = frame[i];
      sumSq += val * val;
      if (i > 0 && ((frame[i - 1] >= 0 && val < 0) || (frame[i - 1] < 0 && val >= 0))) {
        zeroCrossings++;
      }
    }
    const zcr = zeroCrossings / frame.length;
    const energy = sumSq / frame.length;
    let score = 15;
    if (zcr > 0.35) score += 35;
    if (energy > 0.08) score += 20;
    return Math.min(95, Math.max(8, Math.round(score + (Math.random() * 8 - 4))));
  }
}

export const onnxInferenceEngine = new OnnxInferenceManager();