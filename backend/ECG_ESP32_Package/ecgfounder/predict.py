"""
predict.py -- run the fine-tuned ECGFounder binary classifier on a CSV ECG recording.

Expects a CSV with at least one numeric column (voltage samples). Recording must be
at least 10 seconds. Sampling rate defaults to 500 Hz; pass --fs if different.

Usage:
    python predict.py recordings/R0001.csv
    python predict.py recordings/R0001.csv --fs 250
    python predict.py recordings/R0001.csv --plot
    python predict.py recordings/R0001.csv --step 5    # 5s sliding step instead of non-overlapping

The model outputs P(abnormal) per 10-second window and an aggregate decision.
Threshold comes from the fine-tuned checkpoint (0.40 for 1_lead_binary_finetuned.pth).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from scipy.interpolate import interp1d

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from net1d import Net1D

CKPT_PATH = HERE / "checkpoint" / "1_lead_binary_finetuned.pth"
TARGET_FS = 500
WINDOW_SAMPLES = 5000  # 10 s at 500 Hz

NET1D_CONFIG = dict(
    base_filters=64,
    ratio=1,
    filter_list=[64, 160, 160, 400, 400, 1024, 1024],
    m_blocks_list=[2, 2, 2, 3, 3, 4, 4],
    kernel_size=16,
    stride=2,
    groups_width=16,
    verbose=False,
    use_bn=False,
    use_do=False,
    n_classes=150,
)


def load_signal(path: Path) -> tuple[np.ndarray, str]:
    """Return (signal, column_name). Handles header / no-header / multi-col CSVs."""
    df = pd.read_csv(path, comment="#")
    numeric = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    if not numeric:
        # maybe no header row -- re-read with header=None
        df = pd.read_csv(path, comment="#", header=None)
        numeric = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    if not numeric:
        raise ValueError(f"no numeric column found in {path}")
    # last numeric col = voltage (first might be a timestamp)
    col = numeric[-1]
    return df[col].to_numpy(dtype=np.float32), str(col)


def debias_and_label_units(x: np.ndarray) -> tuple[np.ndarray, str]:
    rng = float(x.max() - x.min())
    if rng > 100 or np.allclose(x, x.astype(int), atol=0.001):
        units = f"raw ADC (range {x.min():.0f} to {x.max():.0f}) -- subtracting DC bias"
    else:
        units = f"mV-like (range {x.min():.2f} to {x.max():.2f}) -- subtracting DC bias"
    return (x - x.mean()).astype(np.float32), units


def resample_linear(x: np.ndarray, fs_in: int, fs_out: int) -> np.ndarray:
    if fs_in == fs_out:
        return x
    n_in = len(x)
    t_in = np.arange(n_in) / fs_in
    n_out = int(round(n_in * fs_out / fs_in))
    t_out = np.arange(n_out) / fs_out
    f = interp1d(t_in, x, kind="linear", fill_value="extrapolate")
    return f(t_out).astype(np.float32)


def zscore(x: np.ndarray) -> np.ndarray:
    return ((x - x.mean()) / (x.std() + 1e-8)).astype(np.float32)


def windows(x: np.ndarray, n: int, step: int):
    for start in range(0, len(x) - n + 1, step):
        yield start, x[start : start + n]


def build_model(device: torch.device) -> tuple[nn.Module, float]:
    if not CKPT_PATH.exists():
        sys.exit(f"ERROR: checkpoint not found at {CKPT_PATH}")
    model = Net1D(in_channels=1, **NET1D_CONFIG).to(device)
    model.dense = nn.Linear(1024, 1).to(device)
    ckpt = torch.load(CKPT_PATH, map_location=device, weights_only=False)
    log = model.load_state_dict(ckpt["state_dict"], strict=False)
    if log.missing_keys or log.unexpected_keys:
        print(
            f"  weight load: missing={len(log.missing_keys)}  unexpected={len(log.unexpected_keys)}"
        )
    model.eval()
    threshold = float(ckpt.get("optimal_threshold", 0.5))
    return model, threshold


def predict_windows(model, x_500hz: np.ndarray, device, step_samples: int):
    probs, starts = [], []
    for start, w in windows(x_500hz, WINDOW_SAMPLES, step_samples):
        w = zscore(w)
        t = torch.from_numpy(w).view(1, 1, -1).to(device)
        with torch.no_grad():
            p = torch.sigmoid(model(t)).item()
        probs.append(p)
        starts.append(start / TARGET_FS)
    return probs, starts


def main():
    ap = argparse.ArgumentParser(
        description=__doc__.splitlines()[1], formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("csv", type=Path, help="CSV file with the ECG recording")
    ap.add_argument("--fs", type=int, default=TARGET_FS, help="sampling rate in Hz (default 500)")
    ap.add_argument(
        "--step", type=float, default=10.0,
        help="seconds between window starts; 10 = non-overlapping (default); <10 gives overlap",
    )
    ap.add_argument("--plot", action="store_true", help="show signal + per-window decisions")
    args = ap.parse_args()

    if not args.csv.exists():
        sys.exit(f"ERROR: {args.csv} not found")

    print(f"== predict.py ==")
    print(f"input:   {args.csv}")

    raw, col = load_signal(args.csv)
    duration_s = len(raw) / args.fs
    print(f"column:  {col}")
    print(f"samples: {len(raw)}  ({duration_s:.1f}s at {args.fs} Hz)")
    if duration_s < 10:
        sys.exit(f"ERROR: need >=10s of data, got {duration_s:.1f}s")

    if np.isnan(raw).any():
        nans = int(np.isnan(raw).sum())
        print(f"WARNING: {nans} NaN samples -- interpolating")
        raw = pd.Series(raw).interpolate(limit_direction="both").to_numpy(dtype=np.float32)

    sig, units_note = debias_and_label_units(raw)
    print(f"units:   {units_note}")

    if args.fs != TARGET_FS:
        sig = resample_linear(sig, args.fs, TARGET_FS)
        print(f"resamp:  {args.fs} Hz -> {TARGET_FS} Hz  ({len(sig)} samples)")

    step_samples = max(1, int(round(args.step * TARGET_FS)))

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, threshold = build_model(device)
    print(f"model:   1_lead_binary_finetuned.pth  threshold={threshold:.3f}  device={device}")
    print()

    probs, starts = predict_windows(model, sig, device, step_samples)
    if not probs:
        sys.exit("ERROR: no windows (input too short?)")

    print(f"{'window':>6}  {'t_start(s)':>10}  {'P(abnormal)':>11}  decision")
    for i, (p, s) in enumerate(zip(probs, starts)):
        decision = "ABNORMAL" if p > threshold else "NORMAL"
        print(f"{i+1:>6}  {s:>10.1f}  {p:>11.3f}  {decision}")

    mean_p = float(np.mean(probs))
    frac_abn = sum(1 for p in probs if p > threshold) / len(probs)
    decision = "ABNORMAL" if mean_p > threshold else "NORMAL"
    print()
    print(f"== overall ({len(probs)} window(s)) ==")
    print(f"  mean P(abnormal):   {mean_p:.3f}")
    print(f"  fraction above thr: {frac_abn:.2f}")
    print(f"  DECISION:           {decision}")

    if args.plot:
        import matplotlib.pyplot as plt
        fig, (ax1, ax2) = plt.subplots(
            2, 1, figsize=(12, 5), gridspec_kw={"height_ratios": [2, 1]}
        )
        t = np.arange(len(sig)) / TARGET_FS
        ax1.plot(t, sig, linewidth=0.5)
        for p, s in zip(probs, starts):
            color = "red" if p > threshold else "green"
            ax1.axvspan(s, s + 10, alpha=0.10, color=color)
        ax1.set_xlabel("time (s)"); ax1.set_ylabel("amp")
        ax1.set_title(f"{args.csv.name}  (mean P_abn = {mean_p:.3f}  -> {decision})")

        colors = ["red" if p > threshold else "green" for p in probs]
        ax2.bar([f"{s:.0f}-{s+10:.0f}s" for s in starts], probs, color=colors)
        ax2.axhline(threshold, color="black", linestyle="--", label=f"thresh {threshold:.2f}")
        ax2.set_ylim(0, 1); ax2.set_ylabel("P(abnormal)"); ax2.legend()
        plt.tight_layout(); plt.show()


if __name__ == "__main__":
    main()
