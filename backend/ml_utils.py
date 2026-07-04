import numpy as np
import torch

def normalize(signal):
    signal = np.array(signal)
    return (signal - signal.mean()) / (signal.std() + 1e-8)

def predict_bp(model, ecg, ppg):
    ecg = normalize(ecg)
    ppg = normalize(ppg)

    x = np.stack([ppg, ecg], axis=0)   # (2,125)
    x = torch.tensor(x, dtype=torch.float32).unsqueeze(0)

    with torch.no_grad():
        bp = model(x).item()

    sbp = round(bp, 1)
    dbp = round(bp * 0.65, 1)  # physiological approximation

    return sbp, dbp
