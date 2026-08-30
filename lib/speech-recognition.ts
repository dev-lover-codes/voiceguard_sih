/**
 * lib/speech-recognition.ts
 *
 * Browser-native Web Speech API (SpeechRecognition / webkitSpeechRecognition) wrapper.
 * Provides continuous real-time speech-to-text (STT) for live call transcript ingestion
 * without any external cloud API keys or latency overhead.
 *
 * Gracefully degrades in unsupported environments (e.g. Safari / Firefox without flags, SSR)
 * by reporting `isSupported: false` and cleanly defaulting to manual text entry.
 */

// Define Web Speech API types for TypeScript
export interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

export interface SpeechRecognizerOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onError?: (errorMessage: string) => void;
  onStateChange?: (isListening: boolean) => void;
}

export interface SpeechRecognizerController {
  start: () => void;
  stop: () => void;
  isListening: () => boolean;
  isSupported: boolean;
}

/**
 * Checks if the Web Speech API is supported in the current environment.
 */
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    'SpeechRecognition' in window ||
    'webkitSpeechRecognition' in window
  );
}

/**
 * Creates and initializes a managed SpeechRecognition listener.
 */
export function createSpeechRecognizer(
  options: SpeechRecognizerOptions = {}
): SpeechRecognizerController {
  const isSupported = isSpeechRecognitionSupported();

  if (!isSupported || typeof window === 'undefined') {
    return {
      start: () => {
        options.onError?.('Web Speech API is not supported in this browser. Please use Google Chrome or Microsoft Edge, or type manually into Call Notes.');
      },
      stop: () => {},
      isListening: () => false,
      isSupported: false,
    };
  }

  type SpeechRecognitionConstructor = new () => {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start: () => void;
    stop: () => void;
    abort: () => void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
  };

  const SpeechRecognitionAPI =
    (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;

  if (!SpeechRecognitionAPI) {
    return {
      start: () => {},
      stop: () => {},
      isListening: () => false,
      isSupported: false,
    };
  }

  let recognition: InstanceType<SpeechRecognitionConstructor> | null = null;
  let activeListening = false;
  let accumulatedFinalText = '';

  const initRecognition = () => {
    if (recognition) return recognition;

    try {
      const rec = new SpeechRecognitionAPI();
      rec.continuous = options.continuous ?? true;
      rec.interimResults = options.interimResults ?? true;
      rec.lang = options.lang ?? 'en-US';

      rec.onresult = (event: SpeechRecognitionEvent) => {
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcriptSegment = result[0]?.transcript || '';
          if (result.isFinal) {
            accumulatedFinalText += (accumulatedFinalText ? ' ' : '') + transcriptSegment.trim();
            options.onTranscript?.(accumulatedFinalText, true);
          } else {
            interimText += transcriptSegment;
          }
        }

        if (interimText) {
          const fullInterim = accumulatedFinalText
            ? `${accumulatedFinalText} ${interimText.trim()}`
            : interimText.trim();
          options.onTranscript?.(fullInterim, false);
        }
      };

      rec.onerror = (event: SpeechRecognitionErrorEvent) => {
        // 'no-speech' is normal when user pauses speaking, ignore it
        if (event.error === 'no-speech') return;
        if (event.error === 'aborted') return;

        const errorMsg = `STT Error: ${event.error}`;
        options.onError?.(errorMsg);
      };

      rec.onend = () => {
        // Web Speech API automatically halts on prolonged silence; restart if intended to be active
        if (activeListening) {
          try {
            rec.start();
          } catch {
            // Ignore start collisions
          }
        } else {
          options.onStateChange?.(false);
        }
      };

      recognition = rec;
      return rec;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create SpeechRecognition';
      options.onError?.(msg);
      return null;
    }
  };

  return {
    start: () => {
      const rec = initRecognition();
      if (!rec) return;
      activeListening = true;
      try {
        rec.start();
        options.onStateChange?.(true);
      } catch {
        // Recognition might already be running
      }
    },
    stop: () => {
      activeListening = false;
      if (recognition) {
        try {
          recognition.stop();
        } catch {
          // Ignore
        }
      }
      options.onStateChange?.(false);
    },
    isListening: () => activeListening,
    isSupported: true,
  };
}
