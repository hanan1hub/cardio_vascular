"""
ecg_filter_server.py — FastAPI ECG signal cleaning + analysis service
Port 5004

Endpoints
─────────
POST /filter   { ecg, sample_rate }  →  { ecg_filtered, leads_off }
POST /analyze  { ecg, sample_rate }  →  { ecg_filtered, quality_score,
                                           hr_estimate, rr_cv, n_peaks,
                                           status, analysis, suggestion,
                                           leads_off }
GET  /health   → { ok: true }

Filter pipeline (applied by both endpoints)
───────────────────────────────────────────
  1. Lead-off detection   — >80 % zeros → skip filter, return zeros
  2. DC removal           — subtract batch mean
  3. Bandpass 0.5–40 Hz   — 4th-order Butterworth, sosfiltfilt (zero-phase)
  4. Notch 50 Hz          — IIR notch Q=30 (Pakistan/EU mains)
  5. Savitzky–Golay       — window=5, poly=3 (kills ADC quantisation spikes,
                            preserves QRS morphology)
  6. Z-score + clip ±3σ   — normalise so QRS peaks stand tall

Quality + analysis pipeline (only /analyze)
───────────────────────────────────────────
  • R-peak detection via scipy find_peaks (height > 0.5 × max,
    minimum distance 400 ms = 0.4 × fs)
  • SNR  = mean(peak heights) / std(sub-baseline samples)
  • R–R  = np.diff(peak positions) / fs × 1000  [ms]
  • CV   = std(R–R) / mean(R–R)   (coefficient of variation)
  • HR   = 60 000 / mean(R–R)     [BPM]
  • Quality score 0–100:
      +40 if ≥2 peaks found
      +30 if SNR > 2.5
      +30 if CV < 0.15  (regular rhythm)

Usage
─────
    pip install fastapi uvicorn scipy numpy
    python ecg_filter_server.py        # http://localhost:5004
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
from scipy import signal
from scipy.signal import find_peaks
import uvicorn

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="ECG Filter & Analysis Service", version="2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pre-computed filter coefficients ─────────────────────────────────────────
_CACHED_FS: Optional[int] = None
_BP_SOS:    Optional[np.ndarray] = None
_NOTCH_B:   Optional[np.ndarray] = None
_NOTCH_A:   Optional[np.ndarray] = None


def _build_filters(fs: int) -> None:
    global _CACHED_FS, _BP_SOS, _NOTCH_B, _NOTCH_A
    if fs == _CACHED_FS:
        return
    nyq = fs / 2.0
    _BP_SOS  = signal.butter(4, [0.5 / nyq, 40.0 / nyq], btype="band", output="sos")
    _NOTCH_B, _NOTCH_A = signal.iirnotch(50.0 / nyq, Q=30)
    _CACHED_FS = fs
    print(f"✅ Filter coefficients rebuilt for fs={fs} Hz")


_build_filters(250)   # pre-warm for the default sample rate


# ── Schemas ───────────────────────────────────────────────────────────────────
class FilterRequest(BaseModel):
    ecg:         List[float]
    sample_rate: int = 250


class FilterResponse(BaseModel):
    ecg_filtered: List[float]
    leads_off:    bool


class AnalyzeResponse(BaseModel):
    ecg_filtered:  List[float]
    leads_off:     bool
    quality_score: int            # 0–100
    hr_estimate:   Optional[float]
    rr_cv:         Optional[float]
    n_peaks:       int
    status:        str            # "normal" | "bradycardia" | "tachycardia" | "irregular" | "poor_signal"
    analysis:      str            # short label shown in the UI badge
    suggestion:    str            # full sentence shown to the user


# ── Core signal processing ────────────────────────────────────────────────────
def _filter(raw: np.ndarray, fs: int) -> tuple[np.ndarray, bool]:
    """Apply the full filter pipeline. Returns (filtered, leads_off)."""
    n = len(raw)
    if n < 15:
        return raw.astype(float), False

    # Lead-off: >80% zeros
    if np.sum(raw == 0) / n > 0.80:
        return np.zeros(n, dtype=float), True

    _build_filters(fs)
    x = raw.astype(float) - np.mean(raw)   # DC removal

    try:
        x = signal.sosfiltfilt(_BP_SOS, x)
    except ValueError:
        pass

    try:
        x = signal.filtfilt(_NOTCH_B, _NOTCH_A, x)
    except ValueError:
        pass

    if n >= 7:
        x = signal.savgol_filter(x, window_length=5, polyorder=3)

    std = np.std(x)
    if std > 1e-9:
        x = (x - np.mean(x)) / std
    x = np.clip(x, -3.0, 3.0)
    return x, False


def _analyze(filtered: np.ndarray, fs: int) -> dict:
    """
    Score the quality of the filtered ECG and produce a clinical suggestion.
    Returns a dict matching AnalyzeResponse (minus ecg_filtered / leads_off).
    """
    n = len(filtered)

    # ── R-peak detection ──────────────────────────────────────────────────────
    max_val = np.max(filtered)
    min_distance = max(int(0.4 * fs), 1)      # ≥400 ms between beats (≤150 BPM)
    height_thr   = max(0.5 * max_val, 0.3)    # at least 0.3 σ above baseline

    peaks, _ = find_peaks(filtered, height=height_thr, distance=min_distance)
    n_peaks  = len(peaks)

    # ── SNR ───────────────────────────────────────────────────────────────────
    if n_peaks >= 1:
        peak_heights = filtered[peaks]
        # Baseline = samples below the mean
        below_mean   = filtered[filtered < np.mean(filtered)]
        baseline_std = np.std(below_mean) if len(below_mean) > 5 else 1.0
        snr          = float(np.mean(peak_heights)) / (baseline_std + 1e-9)
    else:
        snr = 0.0

    # ── R–R interval analysis ─────────────────────────────────────────────────
    hr_estimate: Optional[float] = None
    rr_cv:       Optional[float] = None

    if n_peaks >= 2:
        rr_ms    = np.diff(peaks) / fs * 1000.0
        rr_mean  = float(np.mean(rr_ms))
        rr_std   = float(np.std(rr_ms))
        rr_cv    = rr_std / (rr_mean + 1e-9)
        hr_estimate = 60_000.0 / rr_mean

    # ── Quality score (0–100) ─────────────────────────────────────────────────
    quality = 0
    if n_peaks >= 2:        quality += 40
    if snr       > 2.5:     quality += 30
    if rr_cv is not None and rr_cv < 0.15:
                            quality += 30
    quality = min(quality, 100)

    # ── Clinical interpretation ───────────────────────────────────────────────
    if n_peaks < 2:
        status     = "poor_signal"
        analysis   = "Poor signal quality"
        suggestion = ("Not enough heartbeats detected in this segment. "
                      "Make sure the electrodes are firmly attached and the patient is still.")

    elif rr_cv is not None and rr_cv > 0.20:
        status     = "irregular"
        analysis   = "Irregular rhythm"
        suggestion = ("The R–R intervals vary significantly (CV = "
                      f"{rr_cv:.2f}), suggesting an irregular heart rhythm. "
                      "This may indicate arrhythmia — consult a cardiologist for a full evaluation.")

    elif hr_estimate is not None and hr_estimate < 50:
        status     = "bradycardia"
        analysis   = f"Bradycardia — {hr_estimate:.0f} BPM"
        suggestion = (f"Heart rate ({hr_estimate:.0f} BPM) is below the normal range (60–100 BPM). "
                      "Mild bradycardia can be normal in athletes, but values below 50 BPM "
                      "with symptoms (dizziness, fatigue) warrant medical review.")

    elif hr_estimate is not None and hr_estimate > 100:
        status     = "tachycardia"
        analysis   = f"Tachycardia — {hr_estimate:.0f} BPM"
        suggestion = (f"Heart rate ({hr_estimate:.0f} BPM) is above the normal range (60–100 BPM). "
                      "Occasional elevation after activity is normal. Persistent resting tachycardia "
                      "should be evaluated by a doctor.")

    else:
        hr_str   = f"{hr_estimate:.0f} BPM" if hr_estimate else "N/A"
        status   = "normal"
        analysis = f"Normal sinus rhythm — {hr_str}"
        suggestion = (f"Heart rate ({hr_str}) and rhythm appear normal for this segment. "
                      "Regular check-ups are still recommended for comprehensive cardiac assessment.")

    return {
        "quality_score": quality,
        "hr_estimate":   round(hr_estimate, 1) if hr_estimate else None,
        "rr_cv":         round(rr_cv, 3)        if rr_cv      else None,
        "n_peaks":       n_peaks,
        "status":        status,
        "analysis":      analysis,
        "suggestion":    suggestion,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"ok": True, "service": "ecg-filter-v2", "port": 5004}


@app.post("/filter", response_model=FilterResponse)
def filter_ecg(req: FilterRequest):
    raw = np.array(req.ecg, dtype=float)
    filtered, leads_off = _filter(raw, req.sample_rate)
    return FilterResponse(ecg_filtered=filtered.tolist(), leads_off=leads_off)


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze_ecg(req: FilterRequest):
    raw = np.array(req.ecg, dtype=float)
    filtered, leads_off = _filter(raw, req.sample_rate)

    if leads_off:
        return AnalyzeResponse(
            ecg_filtered   = filtered.tolist(),
            leads_off      = True,
            quality_score  = 0,
            hr_estimate    = None,
            rr_cv          = None,
            n_peaks        = 0,
            status         = "poor_signal",
            analysis       = "Leads disconnected",
            suggestion     = "ECG leads are not connected. Attach the electrodes properly.",
        )

    result = _analyze(filtered, req.sample_rate)
    return AnalyzeResponse(
        ecg_filtered = filtered.tolist(),
        leads_off    = False,
        **result,
    )


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("🫀 ECG Filter + Analysis Server  →  http://localhost:5004")
    print("   /filter  : bandpass 0.5–40 Hz · notch 50 Hz · SG smooth · z-norm")
    print("   /analyze : filter + R-peak detection + HR + rhythm classification")
    uvicorn.run(app, host="0.0.0.0", port=5004, log_level="info")
