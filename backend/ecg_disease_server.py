"""
ECG Disease Detection Server — Port 5005
Uses student_int8.tflite from ECG_ESP32_Package.
Accepts 30s raw ECG from ESP32 (250 Hz), filters, resamples to 500 Hz,
runs inference on 10s windows, returns NORMAL/ABNORMAL + probability.
"""

import os
import numpy as np
from scipy import signal as sp_signal
from scipy.interpolate import interp1d
from scipy.ndimage import median_filter
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

# TFLite interpreter — ai-edge-litert > tflite-runtime > full tensorflow
try:
    from ai_edge_litert.interpreter import Interpreter  # Google's new package
except ImportError:
    try:
        from tflite_runtime.interpreter import Interpreter
    except ImportError:
        import tensorflow as tf
        Interpreter = tf.lite.Interpreter

app = FastAPI(title="ECG Disease Detection")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

# ── Model paths ────────────────────────────────────────────────────────────────
_DIR        = os.path.dirname(__file__)
MODEL_PATH  = os.path.join(_DIR, "ECG_ESP32_Package", "artifacts", "student_int8.tflite")

# ── Constants ──────────────────────────────────────────────────────────────────
TARGET_FS      = 500      # Hz — model input rate
WINDOW_SAMPLES = 5000     # 10 s × 500 Hz
THRESHOLD      = 0.545    # decision boundary for student INT8
IN_SCALE       = 0.0672
IN_ZP          = 2
OUT_SCALE      = 0.0227
OUT_ZP         = -14

# ── Load TFLite interpreter once ───────────────────────────────────────────────
print(f"[ECG] Loading model from {MODEL_PATH}")
interpreter = Interpreter(model_path=MODEL_PATH)
interpreter.allocate_tensors()
_inp = interpreter.get_input_details()
_out = interpreter.get_output_details()
print("[ECG] Model loaded OK")


# ── Signal processing ──────────────────────────────────────────────────────────

def _resample(x: np.ndarray, fs_in: float, fs_out: float) -> np.ndarray:
    if fs_in == fs_out:
        return x
    n_out = int(len(x) * fs_out / fs_in)
    t_old = np.linspace(0, len(x) / fs_in, len(x))
    t_new = np.linspace(0, len(x) / fs_in, n_out)
    return interp1d(t_old, x, kind="linear", bounds_error=False,
                    fill_value="extrapolate")(t_new).astype(np.float32)


def _filter(x: np.ndarray, fs: float) -> np.ndarray:
    """DC removal → notch 50 Hz → bandpass 0.67–40 Hz → baseline removal."""
    x = x - np.mean(x)

    # Notch 50 Hz
    b_n, a_n = sp_signal.iirnotch(50.0, Q=30, fs=fs)
    x = sp_signal.filtfilt(b_n, a_n, x)

    # Bandpass 0.67–40 Hz (Butterworth 4th order)
    nyq  = fs / 2.0
    low  = 0.67 / nyq
    high = min(40.0 / nyq, 0.999)
    b_bp, a_bp = sp_signal.butter(4, [low, high], btype="band")
    x = sp_signal.filtfilt(b_bp, a_bp, x)

    # Baseline wander removal via median filter
    k = int(0.4 * fs) | 1   # ensure odd
    x = x - median_filter(x, size=k)

    return x.astype(np.float32)


def _zscore(x: np.ndarray) -> np.ndarray:
    return ((x - x.mean()) / (x.std() + 1e-8)).astype(np.float32)


def _quantize(x: np.ndarray) -> np.ndarray:
    q = np.round(x / IN_SCALE + IN_ZP).clip(-128, 127).astype(np.int8)
    return q


def _sigmoid(v: float) -> float:
    return 1.0 / (1.0 + float(np.exp(-v)))


def _infer_window(seg: np.ndarray) -> float:
    """Return P(abnormal) for one 5000-sample window."""
    # Pad / crop
    if len(seg) < WINDOW_SAMPLES:
        seg = np.concatenate([seg, np.zeros(WINDOW_SAMPLES - len(seg), dtype=np.float32)])
    else:
        seg = seg[:WINDOW_SAMPLES]

    seg = _zscore(seg)
    x_q = _quantize(seg).reshape(1, WINDOW_SAMPLES, 1)

    interpreter.set_tensor(_inp[0]["index"], x_q)
    interpreter.invoke()
    out_q = int(interpreter.get_tensor(_out[0]["index"])[0][0])
    logit = (out_q - OUT_ZP) * OUT_SCALE
    return _sigmoid(logit)


# ── API schemas ────────────────────────────────────────────────────────────────

class ECGRequest(BaseModel):
    samples: List[float]
    sample_rate: float = 250.0


class WindowResult(BaseModel):
    window: int
    t_start: float
    p_abnormal: float
    decision: str


class ECGResponse(BaseModel):
    windows: List[WindowResult]
    mean_p_abnormal: float
    decision: str
    filtered_samples: List[float]   # filtered signal at original FS for display


# ── Endpoint ───────────────────────────────────────────────────────────────────

@app.post("/analyze", response_model=ECGResponse)
async def analyze(req: ECGRequest):
    x   = np.array(req.samples, dtype=np.float32)
    fs  = float(req.sample_rate)

    # Filter at native rate (preserves display resolution)
    x_filt = _filter(x, fs)

    # Resample filtered signal to 500 Hz for model
    x_500 = _resample(x_filt, fs, TARGET_FS)

    # Sliding 10-second windows (non-overlapping)
    n_win = max(1, len(x_500) // WINDOW_SAMPLES)
    windows: List[WindowResult] = []
    for i in range(n_win):
        seg  = x_500[i * WINDOW_SAMPLES : (i + 1) * WINDOW_SAMPLES]
        prob = _infer_window(seg)
        windows.append(WindowResult(
            window    = i + 1,
            t_start   = float(i * 10),
            p_abnormal= round(prob, 4),
            decision  = "ABNORMAL" if prob > THRESHOLD else "NORMAL",
        ))

    mean_prob = float(np.mean([w.p_abnormal for w in windows]))
    decision  = "ABNORMAL" if mean_prob > THRESHOLD else "NORMAL"

    # Return filtered signal at original FS (for scrollable waveform display)
    display = [round(float(v), 6) for v in x_filt.tolist()]

    return ECGResponse(
        windows           = windows,
        mean_p_abnormal   = round(mean_prob, 4),
        decision          = decision,
        filtered_samples  = display,
    )


@app.get("/health")
async def health():
    return {"ok": True, "model": os.path.basename(MODEL_PATH)}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5005, log_level="info")
