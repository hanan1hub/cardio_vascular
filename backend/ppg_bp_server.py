#!/usr/bin/env python3
"""
PPG-Only Blood Pressure Prediction Server
Uses final_bp_models.pkl (GPyTorchGPR / sklearn) trained on 68 subjects.
Matches the exact preprocessing pipeline from PPG_Retrain_With_Custom_Data.ipynb.

Pipeline:
  1. Normalize raw IR to 0-1
  2. Resample to 100 Hz via cubic interpolation
  3. Segment into 30s windows (25s overlap)
  4. Chebyshev Type II bandpass filter (0.4–8 Hz)
  5. Normalize each segment to 0-1
  6. Compute VPG + APG (Savitzky-Golay derivatives)
  7. Extract 57 statistical features per segment
  8. Select 15 ReliefF features → StandardScaler → predict SBP + DBP
"""

import os
import pickle
import warnings
import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from scipy import signal as scipy_signal
from scipy.signal import savgol_filter
from scipy.interpolate import interp1d
from scipy.stats import skew, kurtosis

warnings.filterwarnings("ignore")

# ── GPyTorch classes (MUST be defined before unpickling) ─────────────────────
# These mirror the exact definitions in the training notebook (Cell 18).
# If gpytorch is unavailable, GPR models won't work but sklearn models will.
try:
    import torch
    import gpytorch
    from sklearn.base import BaseEstimator, RegressorMixin

    class ExactGPModel(gpytorch.models.ExactGP):
        def __init__(self, train_x, train_y, likelihood, kernel_type="rbf"):
            super().__init__(train_x, train_y, likelihood)
            self.mean_module = gpytorch.means.ConstantMean()
            if kernel_type == "rbf":
                self.covar_module = gpytorch.kernels.ScaleKernel(gpytorch.kernels.RBFKernel())
            elif kernel_type == "matern52":
                self.covar_module = gpytorch.kernels.ScaleKernel(gpytorch.kernels.MaternKernel(nu=2.5))
            elif kernel_type == "matern05":
                self.covar_module = gpytorch.kernels.ScaleKernel(gpytorch.kernels.MaternKernel(nu=0.5))
            elif kernel_type == "rq":
                self.covar_module = gpytorch.kernels.ScaleKernel(gpytorch.kernels.RQKernel())

        def forward(self, x):
            return gpytorch.distributions.MultivariateNormal(
                self.mean_module(x), self.covar_module(x)
            )

    class GPyTorchGPR(BaseEstimator, RegressorMixin):
        def __init__(self, kernel_type="rbf", n_iters=150, lr=0.1):
            self.kernel_type = kernel_type
            self.n_iters = n_iters
            self.lr = lr

        def fit(self, X, y):
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            self.train_x_ = torch.tensor(X, dtype=torch.float32).to(device)
            self.train_y_ = torch.tensor(y, dtype=torch.float32).to(device)
            self.likelihood_ = gpytorch.likelihoods.GaussianLikelihood().to(device)
            self.model_ = ExactGPModel(
                self.train_x_, self.train_y_, self.likelihood_, self.kernel_type
            ).to(device)
            self.model_.train()
            self.likelihood_.train()
            optimizer = torch.optim.Adam(self.model_.parameters(), lr=self.lr)
            mll = gpytorch.mlls.ExactMarginalLogLikelihood(self.likelihood_, self.model_)
            for _ in range(self.n_iters):
                optimizer.zero_grad()
                loss = -mll(self.model_(self.train_x_), self.train_y_)
                loss.backward()
                optimizer.step()
            return self

        def predict(self, X):
            device = next(self.model_.parameters()).device
            self.model_.eval()
            self.likelihood_.eval()
            test_x = torch.tensor(X, dtype=torch.float32).to(device)
            with torch.no_grad(), gpytorch.settings.fast_pred_var():
                return self.likelihood_(self.model_(test_x)).mean.cpu().numpy()

        def get_params(self, deep=True):
            return {"kernel_type": self.kernel_type, "n_iters": self.n_iters, "lr": self.lr}

        def set_params(self, **params):
            for k, v in params.items():
                setattr(self, k, v)
            return self

    GPYTORCH_AVAILABLE = True
    print("✅ GPyTorch loaded — GPR models supported")

except ImportError as e:
    GPYTORCH_AVAILABLE = False
    print(f"⚠️  GPyTorch not available ({e}). Only sklearn models will work.")
    # Provide dummy classes so pickle doesn't fail on sklearn-only models
    try:
        from sklearn.base import BaseEstimator, RegressorMixin
        class ExactGPModel:
            pass
        class GPyTorchGPR(BaseEstimator, RegressorMixin):
            def predict(self, X):
                raise RuntimeError("GPyTorch not installed")
    except Exception:
        pass

# ── Load models ───────────────────────────────────────────────────────────────
MODELS_PATH = os.path.join(os.path.dirname(__file__), "final_bp_models.pkl")
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "deploy_config.pkl")

if not os.path.exists(MODELS_PATH):
    raise FileNotFoundError(f"Model file not found: {MODELS_PATH}")
if not os.path.exists(CONFIG_PATH):
    raise FileNotFoundError(f"Config file not found: {CONFIG_PATH}")

# Patch torch.load so any CUDA tensors inside the pickle are remapped to CPU.
# This is needed when the model was trained/saved on a GPU machine but we
# are running inference on a CPU-only machine.
import torch as _torch
_original_torch_load = _torch.load
def _cpu_torch_load(f, *args, **kwargs):
    kwargs.setdefault("map_location", _torch.device("cpu"))
    kwargs.setdefault("weights_only", False)
    return _original_torch_load(f, *args, **kwargs)
_torch.load = _cpu_torch_load

with open(MODELS_PATH, "rb") as f:
    final_models = pickle.load(f)
with open(CONFIG_PATH, "rb") as f:
    deploy_config = pickle.load(f)

_torch.load = _original_torch_load   # restore original after loading

print(f"✅ Models loaded: {list(final_models.keys())}")
for target, info in final_models.items():
    print(f"   {target}: {info['model_name']} | features: {info['feature_names']}")

FS         = deploy_config["target_fs"]        # 100 Hz
WINDOW_SEC = deploy_config["window_sec"]       # 30s
OVERLAP_SEC = deploy_config["overlap_sec"]     # 25s
WIN_SAMPLES = WINDOW_SEC * FS                  # 3000
STEP_SAMPLES = (WINDOW_SEC - OVERLAP_SEC) * FS # 500
ESP_FS     = deploy_config["esp_native_fs"]    # ~8.3 Hz

# ── Feature extraction (mirrors notebook Cell 6 exactly) ─────────────────────
def kaiser_teager_energy(x):
    return x[1:-1] ** 2 - x[:-2] * x[2:]

def shannon_entropy(x, n_bins=50):
    hist, _ = np.histogram(x, bins=n_bins, density=True)
    hist = hist[hist > 0]
    p = hist / hist.sum()
    return -np.sum(p * np.log2(p + 1e-12))

def zero_crossing_rate(x):
    x_c = x - np.mean(x)
    return np.sum(np.abs(np.diff(np.sign(x_c))) > 0) / max(len(x), 1)

def extract_features_from_signal(sig, prefix):
    f = {}
    f[f"mu({prefix})"]      = np.mean(sig)
    f[f"eta({prefix})"]     = np.median(sig)
    f[f"sigma({prefix})"]   = np.std(sig)
    f[f"sigma2({prefix})"]  = np.var(sig)
    f[f"IQR({prefix})"]     = np.percentile(sig, 75) - np.percentile(sig, 25)
    f[f"skew({prefix})"]    = float(skew(sig))
    f[f"kurt({prefix})"]    = float(kurtosis(sig))
    f[f"ZCR({prefix})"]     = zero_crossing_rate(sig)
    f[f"H({prefix})"]       = shannon_entropy(sig)
    energy = sig ** 2
    f[f"E_mu({prefix})"]    = np.mean(energy)
    f[f"E_sigma2({prefix})"]= np.var(energy)
    f[f"E_skew({prefix})"]  = float(skew(energy))
    f[f"E_kurt({prefix})"]  = float(kurtosis(energy))
    f[f"E_IQR({prefix})"]   = np.percentile(energy, 75) - np.percentile(energy, 25)
    kte = kaiser_teager_energy(sig)
    f[f"KTE_mu({prefix})"]      = np.mean(kte)
    f[f"KTE_sigma2({prefix})"]  = np.var(kte)
    f[f"KTE_skew({prefix})"]    = float(skew(kte))
    f[f"KTE_kurt({prefix})"]    = float(kurtosis(kte))
    f[f"KTE_IQR({prefix})"]     = np.percentile(kte, 75) - np.percentile(kte, 25)
    return f

def extract_all_features(ppg, vpg, apg):
    features = {}
    features.update(extract_features_from_signal(ppg, "PPG"))
    features.update(extract_features_from_signal(vpg, "VPG"))
    features.update(extract_features_from_signal(apg, "APG"))
    return features

# ── Full inference pipeline (mirrors notebook Cell 30 exactly) ───────────────
def ppg_predict_bp(timestamps, raw_ir_values):
    """
    Run full SBP/DBP inference on raw PPG from ESP module.

    Args:
        timestamps:     list of float — time in seconds since start (or epoch)
        raw_ir_values:  list of float — raw IR ADC readings

    Returns:
        dict with SBP, DBP predictions and metadata
    """
    ts  = np.array(timestamps, dtype=np.float64)
    raw = np.array(raw_ir_values, dtype=np.float64)

    if len(ts) < 2 or len(raw) < 2:
        return {"error": "Need at least 2 samples"}

    # Step 1 — Normalize raw IR to 0-1
    raw_min, raw_max = raw.min(), raw.max()
    if raw_max - raw_min > 0:
        raw = (raw - raw_min) / (raw_max - raw_min)

    # Step 2 — Remove duplicate timestamps, resample to 100 Hz
    _, unique_idx = np.unique(ts, return_index=True)
    if len(unique_idx) < len(ts) * 0.5:
        # Too many duplicates — generate synthetic timestamps
        ts = np.linspace(ts[0], ts[-1], len(raw))
    else:
        ts  = ts[unique_idx]
        raw = raw[unique_idx]

    duration = ts[-1] - ts[0]
    n_target = max(int(duration * FS), 1)
    t_uniform = np.linspace(ts[0], ts[-1], n_target)
    signal_100hz = interp1d(ts, raw, kind="cubic", fill_value="extrapolate")(t_uniform)

    # Step 3 — Check minimum length
    if len(signal_100hz) < WIN_SAMPLES:
        secs_have = len(signal_100hz) / FS
        return {
            "error": f"Signal too short: {secs_have:.1f}s captured, need {WINDOW_SEC}s minimum. "
                     f"Keep collecting PPG data."
        }

    # Step 4 — Segment + filter + feature extraction
    nyq = FS / 2.0
    b, a = scipy_signal.cheby2(
        deploy_config["filter_order"],
        deploy_config["filter_rs"],
        [deploy_config["filter_low"] / nyq, deploy_config["filter_high"] / nyq],
        btype="band",
    )

    all_feats = []
    start = 0
    while start + WIN_SAMPLES <= len(signal_100hz):
        seg = signal_100hz[start: start + WIN_SAMPLES]
        start += STEP_SAMPLES

        filtered = scipy_signal.filtfilt(b, a, seg)
        fmin, fmax = filtered.min(), filtered.max()
        normed = (filtered - fmin) / (fmax - fmin) if fmax > fmin else np.zeros_like(filtered)

        vpg = savgol_filter(
            np.diff(normed),
            deploy_config["savgol_window"],
            deploy_config["savgol_polyorder"]
        )
        apg = savgol_filter(
            np.diff(vpg),
            deploy_config["savgol_window"],
            deploy_config["savgol_polyorder"]
        )

        feat = extract_all_features(normed, vpg, apg)
        vals = list(feat.values())
        if any(np.isnan(v) or np.isinf(v) for v in vals):
            continue
        all_feats.append(vals)

    if not all_feats:
        return {"error": "Feature extraction failed — check PPG signal quality"}

    X_new = np.array(all_feats, dtype=np.float64)

    # Step 5 — Predict SBP and DBP
    results = {}
    for target in ["SBP", "DBP"]:
        info    = final_models[target]
        X_sel   = X_new[:, info["feature_indices"]]
        X_scaled = info["scaler"].transform(X_sel)
        preds   = info["model"].predict(X_scaled)
        preds   = np.clip(preds, 50 if target == "DBP" else 70, 200)
        results[target] = {
            "value": float(np.mean(preds)),
            "std":   float(np.std(preds)),
            "n_segments": int(len(preds)),
        }

    return {
        "SBP": results["SBP"],
        "DBP": results["DBP"],
        "duration_sec": round(duration, 1),
        "n_segments": results["SBP"]["n_segments"],
    }

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="PPG-Only BP Prediction API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PPGRequest(BaseModel):
    ppg: List[float]                      # raw IR values
    timestamps: Optional[List[float]] = None  # seconds from start; auto-generated if omitted
    sample_rate: Optional[float] = None   # Hz; used only when timestamps are omitted

class BPValue(BaseModel):
    value: float
    std: float
    n_segments: int

class PPGResponse(BaseModel):
    sbp: float
    dbp: float
    sbp_std: float
    dbp_std: float
    n_segments: int
    duration_sec: float
    status: str
    model_name: str

@app.get("/")
async def root():
    return {
        "service": "PPG-Only BP Prediction API",
        "status": "running",
        "models": {t: info["model_name"] for t, info in final_models.items()},
        "pipeline": {
            "input": "Raw PPG IR values from ESP (~8.3 Hz native)",
            "resample": f"Cubic interpolation → {FS} Hz",
            "filter": f"Chebyshev II bandpass {deploy_config['filter_low']}–{deploy_config['filter_high']} Hz",
            "window": f"{WINDOW_SEC}s windows, {OVERLAP_SEC}s overlap",
            "features": "57 statistical features (PPG + VPG + APG)",
            "selection": f"ReliefF top {deploy_config['n_features_select']} features",
        },
    }

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "models_loaded": list(final_models.keys()),
        "gpytorch_available": GPYTORCH_AVAILABLE,
        "min_samples_needed": int(WINDOW_SEC * ESP_FS),
        "esp_native_fs": ESP_FS,
    }

@app.post("/predict", response_model=PPGResponse)
async def predict(request: PPGRequest):
    ppg = request.ppg

    if len(ppg) < int(WINDOW_SEC * ESP_FS):
        needed = int(WINDOW_SEC * ESP_FS)
        raise HTTPException(
            status_code=400,
            detail=f"Need at least {needed} samples ({WINDOW_SEC}s at ~{ESP_FS} Hz). "
                   f"Got {len(ppg)}. Keep collecting PPG data."
        )

    # Build timestamps
    if request.timestamps and len(request.timestamps) == len(ppg):
        timestamps = request.timestamps
    else:
        fs_in = request.sample_rate or ESP_FS
        timestamps = [i / fs_in for i in range(len(ppg))]

    result = ppg_predict_bp(timestamps, ppg)

    if "error" in result:
        raise HTTPException(status_code=422, detail=result["error"])

    sbp_info = result["SBP"]
    dbp_info = result["DBP"]

    print(
        f"✅ PPG BP prediction: SBP={sbp_info['value']:.1f}±{sbp_info['std']:.1f}  "
        f"DBP={dbp_info['value']:.1f}±{dbp_info['std']:.1f}  "
        f"({result['n_segments']} segments, {result['duration_sec']}s)"
    )

    sbp_model = final_models["SBP"]["model_name"]
    dbp_model = final_models["DBP"]["model_name"]
    model_label = sbp_model if sbp_model == dbp_model else f"SBP:{sbp_model} / DBP:{dbp_model}"

    return PPGResponse(
        sbp=round(sbp_info["value"], 1),
        dbp=round(dbp_info["value"], 1),
        sbp_std=round(sbp_info["std"], 1),
        dbp_std=round(dbp_info["std"], 1),
        n_segments=result["n_segments"],
        duration_sec=result["duration_sec"],
        status="success",
        model_name=model_label,
    )

if __name__ == "__main__":
    print("\n" + "=" * 70)
    print("PPG-Only Blood Pressure Server")
    print("=" * 70)
    print(f"  Port   : 5003")
    print(f"  Docs   : http://localhost:5003/docs")
    for t, info in final_models.items():
        print(f"  {t} model : {info['model_name']}")
    print(f"  Min input: {int(WINDOW_SEC * ESP_FS)} PPG samples (~{WINDOW_SEC}s at {ESP_FS} Hz)")
    print("=" * 70 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=5003, log_level="info")
