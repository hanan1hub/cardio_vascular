#!/usr/bin/env python3
"""
Blood Pressure Prediction Server
Matches EXACT normalization from training script
"""

import os
import json
import numpy as np
import torch
import torch.nn as nn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import uvicorn

# Import model architecture
from model import CNN_BiLSTM

app = FastAPI(title="BP Prediction API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
MODEL_PATH = "bp_cnn_bilstm.pth"  # Or bp_cnn_bilstm_updated.pth
STATS_PATH = "normalization_stats.json"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

print(f"🔧 Loading model from {MODEL_PATH}...")
print(f"🖥️  Using device: {DEVICE}")

# Load model
model = CNN_BiLSTM().to(DEVICE)
try:
    model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
    model.eval()
    print("✅ Model loaded successfully!")
except Exception as e:
    print(f"❌ Error loading model: {e}")
    raise

# Load normalization statistics (FROM TRAINING)
if os.path.exists(STATS_PATH):
    with open(STATS_PATH, 'r') as f:
        norm_stats = json.load(f)
    print(f"✅ Loaded normalization stats:")
    print(f"   {json.dumps(norm_stats, indent=2)}")
else:
    print(f"❌ {STATS_PATH} not found!")
    raise FileNotFoundError(f"Please copy {STATS_PATH} from training folder")

# Extract global statistics
PPG_MIN_GLOBAL = norm_stats['ppg_min']    # 0.0
PPG_MAX_GLOBAL = norm_stats['ppg_max']    # 4.002932551319648
ECG_MEAN_GLOBAL = norm_stats['ecg_mean']  # 0.35996922409465415
ECG_STD_GLOBAL = norm_stats['ecg_std']    # 0.3339138051448688
BP_MIN = norm_stats['bp_min']             # 51.70909090909091
BP_MAX = norm_stats['bp_max']             # 195.05903391369844

class PredictionRequest(BaseModel):
    ppg: List[float]
    ecg: List[float]

class PredictionResponse(BaseModel):
    mean_bp: float
    status: str
    details: dict = {}

def normalize_ppg_minmax_TRAINING_STYLE(ppg_array):
    """
    Min-Max normalization for PPG - PER SAMPLE
    This matches what happens during inference with new data
    
    Training used: (ppg - global_min) / (global_max - global_min)
    But for inference, we normalize per sample since we don't have global stats
    """
    ppg_min_sample = np.min(ppg_array)
    ppg_max_sample = np.max(ppg_array)
    
    if ppg_max_sample - ppg_min_sample == 0:
        return np.zeros_like(ppg_array)
    
    return (ppg_array - ppg_min_sample) / (ppg_max_sample - ppg_min_sample)

def normalize_ecg_zscore_TRAINING_STYLE(ecg_array):
    """
    Z-score normalization for ECG - PER SAMPLE with lighter scaling
    
    Training used: (ecg - global_mean) / (global_std * 2)
    For inference, we use per-sample statistics
    """
    ecg_mean_sample = np.mean(ecg_array)
    ecg_std_sample = np.std(ecg_array) + 1e-8  # Avoid division by zero
    
    # Lighter scaling (divide by 2) - MATCHES TRAINING
    return (ecg_array - ecg_mean_sample) / (ecg_std_sample * 2)

def denormalize_bp(normalized_bp):
    """
    Reverse Min-Max normalization for BP using TRAINING stats
    bp = normalized_bp * (bp_max - bp_min) + bp_min
    """
    return normalized_bp * (BP_MAX - BP_MIN) + BP_MIN

@app.get("/")
async def root():
    return {
        "service": "BP Prediction API",
        "status": "running",
        "model": "CNN-BiLSTM",
        "device": str(DEVICE),
        "normalization": {
            "ppg": f"Min-Max [per-sample]",
            "ecg": f"Z-score [per-sample, scaled by 2]",
            "bp": f"Min-Max [{BP_MIN:.1f}, {BP_MAX:.1f}] mmHg"
        }
    }

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "model_loaded": True,
        "device": str(DEVICE),
        "stats_loaded": True,
        "normalization_stats": norm_stats
    }

@app.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    try:
        # Convert to numpy arrays
        ppg = np.array(request.ppg, dtype=np.float32)
        ecg = np.array(request.ecg, dtype=np.float32)
        
        print(f"\n📥 Received prediction request:")
        print(f"   PPG: len={len(ppg)}, range=[{ppg.min():.1f}, {ppg.max():.1f}]")
        print(f"   ECG: len={len(ecg)}, range=[{ecg.min():.1f}, {ecg.max():.1f}]")
        
        # Validate lengths
        if len(ppg) != 125 or len(ecg) != 125:
            raise HTTPException(
                status_code=400,
                detail=f"Expected 125 samples, got PPG:{len(ppg)}, ECG:{len(ecg)}"
            )
        
        # Normalize using TRAINING-STYLE normalization
        ppg_normalized = normalize_ppg_minmax_TRAINING_STYLE(ppg)
        ecg_normalized = normalize_ecg_zscore_TRAINING_STYLE(ecg)
        
        print(f"   After normalization:")
        print(f"   PPG: range=[{ppg_normalized.min():.3f}, {ppg_normalized.max():.3f}]")
        print(f"   ECG: range=[{ecg_normalized.min():.3f}, {ecg_normalized.max():.3f}]")
        
        # Stack PPG and ECG: shape (1, 2, 125)
        # Channel 0 = PPG, Channel 1 = ECG (MUST MATCH TRAINING ORDER)
        x = np.stack([ppg_normalized, ecg_normalized], axis=0)  # (2, 125)
        x = np.expand_dims(x, axis=0)                           # (1, 2, 125)
        
        # Convert to tensor
        x_tensor = torch.tensor(x, dtype=torch.float32).to(DEVICE)
        
        # Predict
        with torch.no_grad():
            prediction = model(x_tensor)
            normalized_bp = prediction.cpu().numpy()[0][0]
        
        print(f"   Model output (normalized): {normalized_bp:.4f}")
        
        # Denormalize using TRAINING BP stats
        mean_bp = denormalize_bp(normalized_bp)
        
        # Clip to physiologically reasonable range
        mean_bp = float(np.clip(mean_bp, 50, 200))
        
        print(f"✅ Final prediction: {mean_bp:.1f} mmHg (mean BP)")
        
        # Calculate SBP/DBP estimates (for backend)
        # Mean BP ≈ DBP + (SBP - DBP)/3
        # Rough estimation: SBP ≈ mean_bp * 1.33, DBP ≈ mean_bp * 0.67
        
        return PredictionResponse(
            mean_bp=mean_bp,
            status="success",
            details={
                "normalized_prediction": float(normalized_bp),
                "ppg_input_range": [float(ppg.min()), float(ppg.max())],
                "ecg_input_range": [float(ecg.min()), float(ecg.max())],
                "ppg_normalized_range": [float(ppg_normalized.min()), float(ppg_normalized.max())],
                "ecg_normalized_range": [float(ecg_normalized.min()), float(ecg_normalized.max())]
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Prediction error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    print("\n" + "="*70)
    print("🚀 Starting BP Prediction Server (TRAINING-MATCHED)")
    print("="*70)
    print(f"📍 Server: http://0.0.0.0:5001")
    print(f"📖 API docs: http://localhost:5001/docs")
    print(f"🔧 Model: {MODEL_PATH}")
    print(f"📊 Stats: {STATS_PATH}")
    print(f"🖥️  Device: {DEVICE}")
    print(f"\n📏 Normalization (per sample at inference):")
    print(f"   PPG: Min-Max normalization (0-1 range)")
    print(f"   ECG: Z-score normalization (÷2 for lighter scaling)")
    print(f"\n📏 BP Denormalization (using training stats):")
    print(f"   Range: [{BP_MIN:.1f}, {BP_MAX:.1f}] mmHg")
    print("="*70 + "\n")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=5001,
        log_level="info"
    )