# 🫀 Cardiotrix — Cardiovascular Health Monitoring System

[![Node.js](https://img.shields.io/badge/Node.js-20-green)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.12-blue)](https://www.python.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB)](https://reactjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-async-009688)](https://fastapi.tiangolo.com/)
[![ESP32](https://img.shields.io/badge/ESP32-IoT-00979D)](https://www.espressif.com/)
[![TensorFlow](https://img.shields.io/badge/TensorFlow-2.x-FF6F00)](https://www.tensorflow.org/)
[![PyTorch](https://img.shields.io/badge/PyTorch-CPU-EE4C2C)](https://pytorch.org/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFCA28)](https://firebase.google.com/)
[![License](https://img.shields.io/badge/License-ISC-green.svg)](LICENSE)

> **A real-time, multi-modal cardiovascular monitoring platform** that streams ECG, PPG,
> and PCG signals from ESP32-based hardware, runs four machine-learning models for
> disease detection and blood-pressure estimation, and presents everything on a live
> React dashboard — with an AI health assistant (CardioBot) built in.

---

## 📋 Table of Contents

- [Overview](#-overview)
- [System Architecture](#-system-architecture)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Hardware](#-hardware)
- [Machine Learning Models](#-machine-learning-models)
- [Project Structure](#-project-structure)
- [Getting Started (Local)](#-getting-started-local)
- [Environment Variables](#-environment-variables)
- [API Reference](#-api-reference)
- [Deployment](#-deployment)
- [Team](#-team)
- [License](#-license)

---

## 🎯 Overview

Cardiovascular disease is a leading cause of mortality worldwide, and early, continuous
monitoring saves lives. **Cardiotrix** is an end-to-end system that captures heart signals
from low-cost sensors, analyses them with AI, and surfaces actionable insights in real
time:

- **Multi-modal sensing** — ECG (electrical), PPG (optical/pulse), PCG (heart sound)
- **On-server AI inference** — 4 ML models for disease classification & BP estimation
- **Live web dashboard** — real-time waveforms, vitals gauges, trends, patient/doctor roles
- **AI assistant** — CardioBot answers heart-health questions (Google Gemini)
- **Cloud + local persistence** — Firebase Firestore and an on-disk JSON store
- **IoT ingestion** — ESP32 streams readings over WiFi (HTTP) or USB serial

---

## 🏗 System Architecture

```
 ┌────────────┐    WiFi / HTTP POST     ┌──────────────────────── EC2 / nginx :80 ───────────────────────┐
 │   ESP32    │ ───/api/readings──────▶ │   /            → React SPA (static build)                       │
 │  + sensors │                         │   /api,/socket → Node API (Express + Socket.IO) :5000           │
 └────────────┘                         │   /ppg         → PPG blood-pressure server        :5003         │
                                        │   /ecg         → ECG disease server (TFLite)       :5005         │
 ┌────────────┐   WebSocket (live)      │            │                                                     │
 │  Browser   │ ◀──────────────────────▶│   Node API ─┼─▶ BP model (PyTorch)        :5001                  │
 │ (dashboard)│                         │            ├─▶ PCG heart-sound (TensorFlow):5002                 │
 └────────────┘                         │            └─▶ ECG filter (scipy)          :5004                 │
        │  reads Firestore directly     └─────────────────────────────────────────────────────────────────┘
        ▼                                        │  writes
  ┌───────────────┐                              ▼
  │  Firebase     │ ◀──── firebase-admin ──── Node API   +   local JSON store (lowdb: db/vitals.json)
  │  Firestore    │
  └───────────────┘
```

**7 processes** run on one server, managed by **pm2**; only ports **22/80/443** are public.
The Node API is the hub: it ingests ESP32 readings, orchestrates the ML servers, persists
data, and pushes live updates to the browser over Socket.IO.

---

## ⭐ Features

| Feature | Description |
|---|---|
| **Real-time streaming** | Live ECG/PPG/PCG data from ESP32 via Socket.IO |
| **ECG disease detection** | TFLite model flags abnormal windows over a 30 s ECG |
| **Heart-sound classification** | Classifies PCG into AS / MR / MS / MVP / Normal |
| **Blood-pressure estimation** | Two independent BP paths (PPG-GPR and PyTorch CNN-BiLSTM) |
| **Interactive dashboard** | Waveform charts, health gauges, trends (Recharts) |
| **Patient & doctor roles** | Patient dashboard, doctor dashboard, in-app chat |
| **CardioBot AI assistant** | Google Gemini-powered heart-health Q&A |
| **Reports** | Generate JSON/text vitals reports, e-mail to a doctor |
| **Dual persistence** | Firebase Firestore (cloud) + lowdb (local JSON) |

---

## 🛠 Tech Stack

**Frontend**
- React 19 + TypeScript, **Vite** (rolldown), Tailwind CSS
- Socket.IO client, Recharts, Firebase Web SDK, shadcn-style UI components
- Google Gemini (CardioBot chat)

**Backend — Node**
- Node.js 20, Express 5, Socket.IO
- `firebase-admin` (Firestore), `lowdb` (local JSON), `serialport` (USB ingestion)

**Backend — Python (ML inference, FastAPI)**
- FastAPI + Uvicorn
- PyTorch (CPU), TensorFlow / tf-keras, TensorFlow Lite
- scikit-learn, GPyTorch, librosa, scipy, numpy

**Infrastructure**
- AWS EC2 (Ubuntu), **nginx** (reverse proxy + static host), **pm2** (process manager)
- `uv` for Python environment management

---

## 🔌 Hardware

| Component | Sensor | Signal |
|---|---|---|
| **ECG** | AD8232 | Electrocardiogram (heart electrical activity) |
| **PPG / SpO₂** | MAX30102 | Photoplethysmogram (pulse, oxygen saturation) |
| **PCG** | INMP441 (I²S mic) | Phonocardiogram (heart sounds) |
| **MCU** | ESP32 | WiFi + I²S/ADC, streams readings to the server |
| **Display** | 16×2 LCD | On-device status (optional) |

Firmware lives in [`esp32/`](esp32/). The ESP32 connects to WiFi and **POSTs readings to
`/api/readings`** (it can also stream over USB serial for local development).

---

## 🤖 Machine Learning Models

| Model | Task | Framework | Artifact | Output |
|---|---|---|---|---|
| **ECG disease** | Abnormal-beat detection over 30 s ECG | TensorFlow **Lite** | `student_int8.tflite` | per-window abnormality probability |
| **PCG heart-sound** | 5-class valve-condition classifier | TensorFlow / Keras | `best_model_fold_2.h5` | `AS / MR / MS / MVP / N` + confidence |
| **PPG blood pressure** | SBP / DBP from PPG waveform | scikit-learn + **GPyTorch** | `final_bp_models.pkl` | SBP, DBP, std, #segments |
| **BP (CNN-BiLSTM)** | Blood pressure from sensor stream | **PyTorch** | `bp_cnn_bilstm.pth` | mean BP → SBP/DBP |

**PCG classes:** `AS` = Aortic Stenosis, `MR` = Mitral Regurgitation, `MS` = Mitral
Stenosis, `MVP` = Mitral Valve Prolapse, `N` = Normal.

Training notebooks are in [`backend/`](backend/) (`Heart_Sound_Prediction.ipynb`,
`PPG_Retrain_With_Custom_Data.ipynb`, `RetrainModel (1).ipynb`), and the ECG
knowledge-distillation package is in `backend/ECG_ESP32_Package/`.

> Model weights (`.h5`, `.pth`) are **not** committed to git (size/licensing); they are
> provided separately and placed in `backend/` at deploy time.

---

## 📂 Project Structure

```
Cardiovascular-Health-Monitoring-System/
├── backend/                          # Node API + Python ML servers
│   ├── server.js                     # Express + Socket.IO hub (port 5000)
│   ├── main.py                       # BP CNN-BiLSTM server      (PyTorch,  5001)
│   ├── pcg_server.py                 # Heart-sound classifier    (TF/Keras, 5002)
│   ├── ppg_bp_server.py              # PPG blood-pressure server (GPyTorch, 5003)
│   ├── ecg_filter_server.py          # ECG signal filtering      (scipy,    5004)
│   ├── ecg_disease_server.py         # ECG disease detection     (TFLite,   5005)
│   ├── model.py  ml_utils.py         # shared model/util code
│   ├── requirements.txt              # Python dependencies
│   ├── package.json                  # Node dependencies
│   ├── ecosystem.config.js           # pm2 process definitions (created at deploy)
│   ├── db/
│   │   ├── database.js               # lowdb (local JSON store)
│   │   ├── firebaseAdmin.js          # Firestore (cloud) integration
│   │   └── vitals.json               # local readings store
│   ├── middleware/validation.js      # sensor-payload validation
│   ├── services/
│   │   ├── mlService.js              # calls the Python ML servers
│   │   ├── reportService.js          # JSON/text report + e-mail
│   │   └── serialService.js          # ESP32 USB serial ingestion
│   ├── ECG_ESP32_Package/artifacts/  # student_fp32.tflite, student_int8.tflite
│   ├── pcg_classes.json  normalization_stats.json  deploy_config.pkl
│   └── *.ipynb                        # training notebooks
│
├── frontend/                         # React + Vite dashboard
│   └── src/
│       ├── firebase.js               # Firebase web config
│       ├── main.tsx
│       └── app/
│           ├── App.tsx
│           ├── pages/                # Dashboard, DoctorDashboard, DoctorChat, ContactDoctor
│           ├── components/           # LiveSensor, TrendCharts, HealthGauge,
│           │   │                     #   RecordingPanel, PCGTestResults, ChatBot, Sidebar…
│           │   ├── forms/            # BloodSugarForm, QuestionnaireForm
│           │   └── ui/               # shadcn-style primitives
│           └── utils/api.ts          # same-origin/localhost API URL helper
│
├── esp32/                            # ESP32 firmware (.ino sketches)
│   ├── ESP32_Cardiotrix_Dashboard.ino
│   ├── ESP32_Auto_Forward.ino
│   ├── ESP32_MAX30102_INMP441_LCD/
│   └── ESP32_AD8232_ECG_Dashboard/
│
├── hardware_pics/                    # photos of the assembled hardware
├── DEPLOYMENT.md                     # full AWS EC2 deployment runbook (local only)
└── README.md
```

---

## 🚀 Getting Started (Local)

### Prerequisites
- Node.js 20+
- Python 3.12 (TensorFlow/PyTorch have no 3.13+ wheels yet)
- A Firebase project (for Firestore) + service-account key
- (Optional) ESP32 + sensors for live hardware data

### 1. Clone
```bash
git clone https://github.com/hanan1hub/cardio_vascular.git
cd cardio_vascular
```

### 2. Backend — Python ML servers
```bash
cd backend
python3.12 -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install fastapi "uvicorn[standard]" scipy scikit-learn soundfile \
            "numba>=0.60" librosa tensorflow-cpu tf-keras gpytorch python-multipart
# place model files (best_model_fold_2.h5, bp_cnn_bilstm.pth) in backend/
python main.py            # :5001   (repeat for each server, or use pm2)
```

### 3. Backend — Node API
```bash
cd backend
npm install
# add serviceAccountKey.json and .env (see below)
npm start                 # :5000
```

### 4. Frontend
```bash
cd frontend
npm install
# add frontend/.env with VITE_GEMINI_API_KEY
npm run dev               # Vite dev server (uses localhost API URLs)
```

Open the Vite URL; the dashboard connects to the Node API on `:5000`.

---

## 🔐 Environment Variables

**`backend/.env`**
```
PORT=5000
ML_MODEL_URL=http://localhost:5001/predict
PCG_MODEL_URL=http://localhost:5002
ECG_FILTER_URL=http://localhost:5004
# ESP32_COM_PORT=COM3        # only for USB/serial ingestion (local dev)
```

**`frontend/.env`**
```
VITE_GEMINI_API_KEY="your-gemini-api-key"    # from https://aistudio.google.com/app/apikey
# VITE_BACKEND_URL=""        # leave empty in production (same-origin via nginx)
```

> Secrets (`serviceAccountKey.json`, `.env` files) and model weights are **gitignored**.
> Get a Firebase service-account key from *Firebase Console → Project Settings → Service Accounts*.

---

## 📡 API Reference

### Node API (`:5000`, public via nginx under `/api`)
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/readings` | Ingest a sensor reading from the ESP32 |
| GET  | `/api/patient-readings/:patientId` | Patient history (Firestore) |
| GET  | `/api/patient-readings/:patientId/latest` | Latest reading for a patient |
| POST | `/api/ecg` | Filter + analyse an ECG segment |
| POST | `/api/pcg/predict-wav` | Predict heart-sound from a WAV upload |
| GET  | `/api/pcg/files` · `/api/pcg/test-accuracy` | PCG dataset + accuracy |
| GET  | `/api/vitals/recent` · `/api/vitals/stats` | Recent vitals / statistics |
| POST | `/api/vitals/send-to-doctor` | E-mail a vitals report |
| GET  | `/api/health` | Service + DB health check |

### ML servers (internal; PPG/ECG exposed via nginx `/ppg`, `/ecg`)
| Server | Port | Endpoint | Body |
|---|---|---|---|
| BP (PyTorch) | 5001 | `POST /predict` | sensor features |
| PCG (TF) | 5002 | `POST /predict` | `{ filename }` or `/predict-signal` `{ pcg, sample_rate }` |
| PPG BP (GPyTorch) | 5003 | `POST /predict` | `{ ppg:[...], sample_rate }` |
| ECG filter (scipy) | 5004 | `POST /analyze` | `{ samples:[...], sample_rate }` |
| ECG disease (TFLite) | 5005 | `POST /analyze` | `{ samples:[...], sample_rate }` |

**Socket.IO events:** `register_patient`, `new_reading` / `newReading` (live vitals),
`patient_registered`, `connect` / `disconnect`.

---

## ☁️ Deployment

The system is deployed on **AWS EC2** with nginx (reverse proxy + static host) and pm2
(runs all 7 processes, auto-restart on reboot). The full, reproducible runbook — every
command, every error and fix — is in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

**High level:**
1. Launch an EC2 instance (≥4 GB RAM), open ports 22/80/443.
2. Install Node 20, nginx, and **Python 3.12 via `uv`** (system Python may be too new for TF/PyTorch).
3. `git clone`, create a venv, install ML deps (install torch from its CPU index; pin `numba>=0.60`; add `tf-keras` for the Keras-2 `.h5`).
4. `scp` the model weights and secrets (they're gitignored).
5. Start everything with pm2; serve the built frontend from `/var/www` behind nginx.
6. Assign an **Elastic IP**, then point the ESP32 firmware at `http://<EIP>/api/readings`.

---

## 👥 Team

Developed as a **Design Project** — hardware, firmware, ML, backend, and frontend by the
project team.

## 📜 License

Licensed under the **ISC License** — see [LICENSE](LICENSE).

## 📧 Contact

- **Email:** akhan.bee22seecs@seecs.edu.pk · mahmad24504@gmail.com
- Issues and contributions welcome via GitHub.

---

<p align="center"><b>Cardiotrix</b> — bringing continuous, AI-assisted heart monitoring to low-cost hardware. ⭐ Star the repo if you find it useful!</p>
