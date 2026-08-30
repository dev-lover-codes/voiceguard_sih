import {
  isSpeechRecognitionSupported,
  createSpeechRecognizer,
} from '../speech-recognition';

describe('lib/speech-recognition.ts - Web Speech API Transcript Ingestion', () => {
  const originalWindow = global.window;

  afterEach(() => {
    // Restore window
    global.window = originalWindow;
  });

  test('isSpeechRecognitionSupported returns false in Node/SSR environment', () => {
    // In Node test environment, window.SpeechRecognition is undefined
    expect(isSpeechRecognitionSupported()).toBe(false);
  });

  test('createSpeechRecognizer gracefully handles unsupported browsers', () => {
    const errorCalls: string[] = [];
    const recognizer = createSpeechRecognizer({
      onError: (err) => {
        errorCalls.push(err);
      },
    });

    expect(recognizer.isSupported).toBe(false);
    expect(recognizer.isListening()).toBe(false);

    // Calling start does not throw error and triggers informative message
    recognizer.start();
    expect(errorCalls.length).toBe(1);
    expect(errorCalls[0]).toContain('not supported');

    // Calling stop does not throw
    expect(() => recognizer.stop()).not.toThrow();
  });

  test('isSpeechRecognitionSupported returns true when SpeechRecognition exists', () => {
    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      start = jest.fn();
      stop = jest.fn();
      abort = jest.fn();
      onresult = null;
      onerror = null;
      onend = null;
    }

    // Mock window with SpeechRecognition
    (global as unknown as { window: unknown }).window = {
      SpeechRecognition: MockSpeechRecognition,
    };

    expect(isSpeechRecognitionSupported()).toBe(true);

    const transcripts: string[] = [];
    const recognizer = createSpeechRecognizer({
      onTranscript: (t) => {
        transcripts.push(t);
      },
    });

    expect(recognizer.isSupported).toBe(true);
    recognizer.start();
    expect(recognizer.isListening()).toBe(true);

    recognizer.stop();
    expect(recognizer.isListening()).toBe(false);
  });
});
