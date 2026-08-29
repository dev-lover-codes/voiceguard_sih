# VoiceGuard Acoustic ONNX Model Specification

## Model Architecture
- **Name**: `voiceguard_acoustic.onnx`
- **Framework**: PyTorch -> ONNX (Opset 14, INT8 / FP32 Quantized)
- **Target Task**: Real-time acoustic deepfake detection & synthetic speech vocoder artifact identification.
- **Input Tensor**:
  - Name: `input_audio`
  - Shape: `[1, 1600]` (100ms chunk at 16kHz audio sample rate) or `[1, 80, 100]` (Log-Mel Spectrogram)
  - Type: `FLOAT32`
- **Output Tensor**:
  - Name: `output_probabilities`
  - Shape: `[1, 2]` (`[P(Synthetic), P(Authentic)]`)
  - Type: `FLOAT32`

## Execution Providers
- `onnxruntime-web` with `wasm` execution provider
- WebAssembly SIMD multi-threaded client-side inference
- Fallback to statistical spectral centroid & zero-crossing heuristic analyzer if WASM is unavailable.
