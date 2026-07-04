#!/usr/bin/env python3
"""
PCG Heart Sound Classification Server
Model: best_model_fold_2.h5  (retrained Conv1D, includes ESP32 INMP441 data)
Classes: AS, MR, MS, MVP, N  (alphabetical — matches LabelEncoder)

Sensor correction pipeline (Cell 11 of Heart_Sound_Prediction.ipynb):
  Applied ONLY when source="esp32" — corrects INMP441 frequency response
  to match the reference dataset's recording device, then bandpass-filters
  (25–400 Hz) and normalises to [-1, 1].

MFCC pipeline (matches training exactly):
  librosa.load(file, sr=None, duration=3.0)
  librosa.feature.mfcc(y=signal, sr=sr, n_mfcc=13)  → (13, n_frames)
  np.expand_dims(…, axis=3)                           → (13, n_frames, 1)
  model input_shape = (None, 13, n_frames, 1)
"""

import os
import json
import numpy as np
import librosa
import librosa.feature
from scipy.signal import butter, sosfiltfilt
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn

app = FastAPI(title="PCG Heart Sound Classification API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Configuration ─────────────────────────────────────────────────────────────
MODEL_PATH   = os.path.join(os.path.dirname(__file__), "best_model_fold_2.h5")
CLASSES_PATH = os.path.join(os.path.dirname(__file__), "pcg_classes.json")
DATA_DIR     = os.path.join(os.path.dirname(__file__), "data")

DURATION_SEC = 3.0
N_MFCC       = 13
DEFAULT_CLASSES = ["AS", "MR", "MS", "MVP", "N"]   # alphabetical order

# ── Sensor correction constants (Heart_Sound_Prediction.ipynb Cell 11) ────────
# Pre-computed equalization curve: INMP441 → reference recording device
SENSOR_CORRECTION_FREQS = [
    0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120,
    140, 160, 180, 200, 250, 300, 350, 400
]
SENSOR_CORRECTION_GAINS = [
    4.6871, 2.4887, 0.7794, 0.4272, 0.3144, 0.4263,
    0.7918, 1.3655, 1.9014, 2.5745, 4.1475, 6.1216,
    4.8266, 2.9063, 3.3069, 2.7223, 1.3686, 1.2549,
    2.9471, 5.378
]

# ── Load label classes ────────────────────────────────────────────────────────
label_classes = DEFAULT_CLASSES
if os.path.exists(CLASSES_PATH):
    with open(CLASSES_PATH, "r") as f:
        data = json.load(f)
        label_classes = data.get("classes", DEFAULT_CLASSES)
    print(f"✅ Loaded {len(label_classes)} classes: {label_classes}")
else:
    print(f"⚠️  pcg_classes.json not found — using defaults: {label_classes}")

NUM_CLASSES = len(label_classes)

# ── Load model ────────────────────────────────────────────────────────────────
model = None

def _load_model():
    errors = []
    # Preferred: tf_keras (Keras 2 standalone) — avoids TFOpLambda issues
    try:
        from tf_keras.models import load_model
        m = load_model(MODEL_PATH)
        return m, "tf_keras"
    except ImportError:
        errors.append("tf_keras not installed (pip install tf-keras)")
    except Exception as e:
        errors.append(f"tf_keras: {e}")

    # Fallback: tensorflow.keras
    try:
        import tensorflow as tf
        m = tf.keras.models.load_model(MODEL_PATH, safe_mode=False)
        return m, "tensorflow.keras"
    except Exception as e:
        errors.append(f"tensorflow.keras: {e}")

    raise RuntimeError("Could not load model.\n" + "\n".join(errors))

if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(
        f"Model file not found: {MODEL_PATH}\n"
        f"Make sure 'best_model_fold_2.h5' is in the backend folder."
    )

model, loader_used = _load_model()
print(f"✅ PCG model loaded via [{loader_used}]")
print(f"   Model  : best_model_fold_2.h5 (retrained with ESP32 INMP441 data)")
print(f"   Input  : {model.input_shape}")
print(f"   Output : {model.output_shape}")

EXPECTED_FRAMES = model.input_shape[2]
print(f"   Expected MFCC frames: {EXPECTED_FRAMES}")

model_out_classes = model.output_shape[-1]
if model_out_classes != NUM_CLASSES:
    print(f"⚠️  Model outputs {model_out_classes} classes but labels list has {NUM_CLASSES}")

# ── Sensor correction (INMP441 → reference) ───────────────────────────────────
def apply_sensor_correction(signal: np.ndarray, sample_rate: int) -> np.ndarray:
    """
    Spectral equalization specifically for ESP32 INMP441 microphone data.
    Matches Heart_Sound_Prediction.ipynb Cell 11 exactly:
      1. FFT → apply gain curve → IFFT
      2. Bandpass filter 25–400 Hz (Butterworth order 4)
      3. Normalise to [-1, 1]
    """
    signal = np.array(signal, dtype=np.float64)
    n = len(signal)

    # 1. Spectral equalisation
    fft_data = np.fft.rfft(signal)
    freqs    = np.fft.rfftfreq(n, 1.0 / sample_rate)
    correction = np.interp(
        freqs,
        SENSOR_CORRECTION_FREQS,
        SENSOR_CORRECTION_GAINS,
        left=SENSOR_CORRECTION_GAINS[0],
        right=1.0,
    )
    corrected = np.fft.irfft(fft_data * correction, n=n)

    # 2. Bandpass filter 25–400 Hz
    nyq = 0.5 * sample_rate
    low  = 25.0  / nyq
    high = 400.0 / nyq
    # Clamp to valid range
    low  = min(max(low,  1e-6), 0.999)
    high = min(max(high, low + 1e-6), 0.999)
    sos = butter(4, [low, high], btype="band", output="sos")
    corrected = sosfiltfilt(sos, corrected)

    # 3. Normalise to [-1, 1]
    max_amp = np.max(np.abs(corrected))
    if max_amp > 0:
        corrected = corrected / max_amp

    return corrected.astype(np.float32)

# ── MFCC extraction ───────────────────────────────────────────────────────────
def extract_mfcc_for_model(signal: np.ndarray, sr: int) -> np.ndarray:
    """
    Extract MFCC features and reshape to model input.
    Matches training pipeline exactly:
      mfccs = librosa.feature.mfcc(y=signal, sr=sr, n_mfcc=13) → (13, n_frames)
      expand_dims at axis=3 → (1, 13, n_frames, 1)
    """
    signal = np.array(signal, dtype=np.float32)
    if signal.ndim > 1:
        signal = signal.flatten()

    # Pad/truncate to 3 seconds (matches training duration=3.0)
    target_len = int(sr * DURATION_SEC)
    if len(signal) < target_len:
        signal = np.pad(signal, (0, target_len - len(signal)), mode="edge")
    else:
        signal = signal[:target_len]

    mfccs = librosa.feature.mfcc(y=signal, sr=sr, n_mfcc=N_MFCC)   # (13, n_frames)

    # Pad or truncate time frames to match model's expected input
    if mfccs.shape[1] < EXPECTED_FRAMES:
        mfccs = np.pad(mfccs, ((0, 0), (0, EXPECTED_FRAMES - mfccs.shape[1])), mode="edge")
    else:
        mfccs = mfccs[:, :EXPECTED_FRAMES]

    # (13, EXPECTED_FRAMES) → (1, 13, EXPECTED_FRAMES, 1)
    x = mfccs[np.newaxis, :, :, np.newaxis]
    return x.astype(np.float32)

def run_prediction(signal: np.ndarray, sr: int) -> dict:
    """Run MFCC extraction + model prediction. Returns structured result."""
    x     = extract_mfcc_for_model(signal, sr)
    preds = model.predict(x, verbose=0)

    class_idx  = int(np.argmax(preds[0]))
    confidence = float(preds[0][class_idx])
    label      = label_classes[class_idx] if class_idx < len(label_classes) else f"Class_{class_idx}"

    return {
        "heart_sound_type": label,
        "class_index":      class_idx,
        "confidence":       round(confidence, 4),
        "all_probabilities": {
            label_classes[i]: round(float(preds[0][i]), 4)
            for i in range(len(preds[0]))
        },
        "sample_rate":   sr,
        "signal_length": len(signal),
    }

def load_wav_and_predict(wav_path: str) -> dict:
    """Load a WAV file and predict. Matches training: librosa.load(sr=None, duration=3.0)."""
    if not os.path.exists(wav_path):
        raise FileNotFoundError(f"WAV file not found: {wav_path}")
    signal, sr = librosa.load(wav_path, sr=None, duration=DURATION_SEC)
    signal = signal.astype(np.float32)
    print(f"   Loaded: {os.path.basename(wav_path)} | sr={sr} | samples={len(signal)}")
    return run_prediction(signal, sr)

# ── Pydantic models ───────────────────────────────────────────────────────────
class WavPredictRequest(BaseModel):
    filename: str

class SignalPredictRequest(BaseModel):
    """
    Raw PCG signal from sensor.
    Set source='esp32' to apply INMP441 → reference sensor correction
    before MFCC extraction (recommended for all ESP32 INMP441 recordings).
    """
    pcg:         List[float]
    sample_rate: Optional[int]  = 8000
    source:      Optional[str]  = "esp32"   # "esp32" | "reference"

class PredictionResponse(BaseModel):
    heart_sound_type: str
    class_index:      int
    confidence:       float
    status:           str
    details:          dict = {}

# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {
        "service": "PCG Heart Sound Classification API",
        "model":   "best_model_fold_2.h5 (retrained with ESP32 INMP441 data)",
        "status":  "running",
        "classes": label_classes,
        "input_shape": str(model.input_shape),
        "sensor_correction": "INMP441 → reference (applied when source='esp32')",
        "endpoints": {
            "predict_wav":    "POST /predict          { filename: '156_AS.wav' }",
            "predict_signal": "POST /predict-signal   { pcg: [...], sample_rate: 8000, source: 'esp32' }",
            "list_files":     "GET  /data-files",
            "test_accuracy":  "GET  /test-with-labels",
            "health":         "GET  /health",
        },
    }

@app.get("/health")
async def health():
    return {
        "status":        "healthy",
        "model":         "best_model_fold_2.h5",
        "model_loaded":  model is not None,
        "classes":       label_classes,
        "num_classes":   NUM_CLASSES,
        "expected_frames": EXPECTED_FRAMES,
        "sensor_correction_available": True,
    }

@app.get("/data-files")
async def list_data_files():
    if not os.path.exists(DATA_DIR):
        return {"files": [], "count": 0, "error": "data/ folder not found"}
    files = sorted([f for f in os.listdir(DATA_DIR) if f.lower().endswith(".wav")])
    return {"files": files, "count": len(files)}

@app.post("/predict", response_model=PredictionResponse)
async def predict_from_wav(request: WavPredictRequest):
    """Predict heart sound from a WAV file in the data/ folder."""
    try:
        filename = os.path.basename(request.filename)
        wav_path = os.path.join(DATA_DIR, filename)
        print(f"\n📥 /predict: {filename}")
        result = load_wav_and_predict(wav_path)
        print(f"✅ {result['heart_sound_type']} (conf={result['confidence']:.3f})")
        return PredictionResponse(
            heart_sound_type=result["heart_sound_type"],
            class_index=result["class_index"],
            confidence=result["confidence"],
            status="success",
            details={
                "filename":        filename,
                "sample_rate":     result["sample_rate"],
                "signal_length":   result["signal_length"],
                "all_probabilities": result["all_probabilities"],
                "sensor_correction": False,
                "model": "best_model_fold_2.h5",
            },
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predict-signal", response_model=PredictionResponse)
async def predict_from_signal(request: SignalPredictRequest):
    """
    Predict from raw PCG signal array (live INMP441 microphone).

    For ESP32 INMP441 data, set source='esp32' (default) — the server will
    apply the pre-computed spectral correction curve before MFCC extraction.
    This corrects the INMP441 frequency response to match the reference dataset.

    Minimum: 500 samples. Recommended: ≥8000 samples at 8000 Hz (1 second).
    """
    try:
        if len(request.pcg) < 500:
            raise HTTPException(
                status_code=400,
                detail=f"Need at least 500 PCG samples. Got {len(request.pcg)}."
            )

        signal = np.array(request.pcg, dtype=np.float32)
        sr     = request.source_sr if hasattr(request, "source_sr") else (request.sample_rate or 8000)
        is_esp32 = (request.source or "esp32").lower() == "esp32"

        print(f"\n📥 /predict-signal: {len(signal)} samples @ {sr} Hz | source={request.source}")

        # Apply INMP441 sensor correction for ESP32 data
        if is_esp32:
            print("   Applying INMP441 → reference sensor correction…")
            signal = apply_sensor_correction(signal, sr)
            print(f"   Corrected range: [{signal.min():.4f}, {signal.max():.4f}]")

        result = run_prediction(signal, sr)
        print(f"✅ {result['heart_sound_type']} (conf={result['confidence']:.3f})")

        return PredictionResponse(
            heart_sound_type=result["heart_sound_type"],
            class_index=result["class_index"],
            confidence=result["confidence"],
            status="success",
            details={
                "input_samples":     len(request.pcg),
                "sample_rate":       sr,
                "source":            request.source,
                "sensor_correction": is_esp32,
                "model":             "best_model_fold_2.h5",
                "all_probabilities": result["all_probabilities"],
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/test-with-labels")
async def test_with_labels():
    """Run model on all WAV files in data/ and check against filename labels."""
    if not os.path.exists(DATA_DIR):
        raise HTTPException(status_code=404, detail="data/ folder not found")

    wav_files = sorted([f for f in os.listdir(DATA_DIR) if f.lower().endswith(".wav")])
    if not wav_files:
        return {"status": "no_data", "results": [], "summary": {"total": 0, "correct": 0, "accuracy": 0}}

    results = []
    for fname in wav_files:
        actual_label = None
        parts = os.path.splitext(fname)[0].split("_")
        if len(parts) >= 2:
            actual_label = parts[-1].upper()
        try:
            result     = load_wav_and_predict(os.path.join(DATA_DIR, fname))
            pred_label = result["heart_sound_type"]
            match      = (pred_label.upper() == actual_label) if actual_label else None
            results.append({
                "filename": fname, "actual_label": actual_label,
                "predicted_label": pred_label, "confidence": result["confidence"],
                "match": match, "all_probs": result["all_probabilities"], "error": None,
            })
        except Exception as e:
            results.append({
                "filename": fname, "actual_label": actual_label,
                "predicted_label": None, "confidence": None,
                "match": None, "all_probs": None, "error": str(e),
            })

    correct  = sum(1 for r in results if r["match"] is True)
    total    = sum(1 for r in results if r["error"] is None)
    accuracy = round(correct / total * 100, 2) if total > 0 else 0

    class_stats = {}
    for cls in label_classes:
        cls_results = [r for r in results if r["actual_label"] == cls and r["error"] is None]
        cls_correct = sum(1 for r in cls_results if r["match"])
        class_stats[cls] = {
            "total": len(cls_results), "correct": cls_correct,
            "accuracy": round(cls_correct / len(cls_results) * 100, 2) if cls_results else 0,
        }

    return {
        "status": "success", "model": "best_model_fold_2.h5",
        "results": results, "class_breakdown": class_stats,
        "summary": {"total": total, "correct": correct, "accuracy": accuracy},
    }

if __name__ == "__main__":
    print("\n" + "=" * 70)
    print("PCG Heart Sound Classification Server")
    print("=" * 70)
    print(f"  Port    : 5002")
    print(f"  Model   : best_model_fold_2.h5")
    print(f"  Classes : {label_classes}")
    print(f"  Frames  : {EXPECTED_FRAMES}")
    print(f"  Correction: INMP441 → reference (ESP32 sources)")
    print("=" * 70 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=5002, log_level="info")
