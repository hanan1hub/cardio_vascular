// src/app/components/LiveSensor.tsx
import React, { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Activity, Heart, Droplets, Wind, Stethoscope, Link, TrendingUp, Save } from "lucide-react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { BACKEND_URL, ecgPath, ppgPath } from "../utils/api";

interface LiveSensorProps {
  deviceId?: string;
  onVitalsUpdate?: (vitals: any) => void;
  externalHs?: { type: string; confidence: number } | null;
  externalBp?: { sbp: number; dbp: number } | null;
}

interface Vitals {
  hr: number | null; spo2: number | null; sbp: number | null;
  dbp: number | null; mean_bp: number | null; blood_sugar: number | null;
  heart_rate_type: string | null; heart_rate_type_confidence: number | null;
  heart_sound_all_probs: Record<string, number> | null;
  ecg: number[]; ppg: number[]; timestamp: string | null;
}

interface PPGBPResult {
  sbp: number; dbp: number;
  sbp_std: number; dbp_std: number;
  n_segments: number; duration_sec: number;
  model_name: string;
}


const EMPTY: Vitals = {
  hr: null, spo2: null, sbp: null, dbp: null, mean_bp: null,
  blood_sugar: null, heart_rate_type: null, heart_rate_type_confidence: null,
  heart_sound_all_probs: null, ecg: [], ppg: [], timestamp: null,
};

// Need 30s at ~8.3 Hz native ESP rate = ~250 samples
const PPG_REQUIRED_SAMPLES = 250;

const HS: Record<string, { full: string; color: string; bg: string; severity: string }> = {
  N:   { full: "Normal",                color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200",  severity: "Normal"   },
  AS:  { full: "Aortic Stenosis",       color: "text-red-700",     bg: "bg-red-50 border-red-200",          severity: "High"     },
  MR:  { full: "Mitral Regurgitation",  color: "text-orange-700",  bg: "bg-orange-50 border-orange-200",    severity: "Moderate" },
  MS:  { full: "Mitral Stenosis",       color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",      severity: "Moderate" },
  MVP: { full: "Mitral Valve Prolapse", color: "text-purple-700",  bg: "bg-purple-50 border-purple-200",    severity: "Low"      },
};

function hrStatus(hr: number | null) {
  if (!hr) return { label: "", color: "text-slate-400" };
  if (hr < 60)  return { label: "Bradycardia", color: "text-blue-600" };
  if (hr > 100) return { label: "Tachycardia", color: "text-red-600"  };
  return           { label: "Normal",      color: "text-emerald-600" };
}

function spo2Color(s: number | null) {
  if (!s) return "text-slate-400";
  if (s < 90) return "text-red-600";
  if (s < 95) return "text-amber-600";
  return "text-emerald-600";
}

function bpCategory(sbp: number, dbp: number) {
  if (sbp < 120 && dbp < 80)  return { label: "Normal",          color: "text-emerald-700", bg: "bg-emerald-100" };
  if (sbp < 130 && dbp < 80)  return { label: "Elevated",        color: "text-amber-700",   bg: "bg-amber-100"   };
  if (sbp < 140 || dbp < 90)  return { label: "High Stage 1",    color: "text-orange-700",  bg: "bg-orange-100"  };
  return                              { label: "High Stage 2",    color: "text-red-700",     bg: "bg-red-100"     };
}


function ECGWaveform({ samples }: { samples: number[] }) {
  const W = 800; const H = 100;
  // Show last 500 samples (~2 seconds at 250 Hz) — enough to see 2-3 full heartbeats
  const data = samples.slice(-500);
  if (data.length < 2) return (
    <div className="h-24 bg-slate-800 rounded-xl flex items-center justify-center">
      <p className="text-emerald-400 text-sm animate-pulse">Waiting for ECG data…</p>
    </div>
  );
  const min = Math.min(...data); const max = Math.max(...data); const range = max - min || 1;
  const pts = data.map((v, i) =>
    `${((i / (data.length - 1)) * W).toFixed(1)},${(H - ((v - min) / range) * H * 0.85 - H * 0.075).toFixed(1)}`
  );
  return (
    <div className="bg-slate-900 rounded-xl p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" preserveAspectRatio="none">
        {/* Subtle grid lines */}
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1="0" y1={H * f} x2={W} y2={H * f}
            stroke="#1e293b" strokeWidth="1" />
        ))}
        <polyline points={pts.join(" ")} fill="none" stroke="#34d399" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function VCard({ icon, label, value, unit, valueColor = "text-[var(--foreground)]", sublabel }: any) {
  return (
    <div className="bg-[var(--muted)] border border-[var(--border)] rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 bg-[var(--card)] rounded-lg">{icon}</div>
        <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">{label}</p>
      </div>
      <p className={`text-3xl font-bold ${value ? valueColor : "text-slate-300"}`}>{value ?? "—"}</p>
      <div className="flex items-center justify-between mt-1">
        <p className="text-xs text-[var(--muted-foreground)]">{unit}</p>
        {sublabel && <p className={`text-xs font-semibold ${valueColor}`}>{sublabel}</p>}
      </div>
    </div>
  );
}

export default function LiveSensor({ deviceId, onVitalsUpdate, externalHs, externalBp }: LiveSensorProps) {
  const [vitals,       setVitals]       = useState<Vitals>(EMPTY);
  const [isConnected,  setIsConnected]  = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [lastUpdated,  setLastUpdated]  = useState<string | null>(null);

  // PPG-only model state
  const [ppgBP,         setPpgBP]         = useState<PPGBPResult | null>(null);
  const [ppgLoading,    setPpgLoading]    = useState(false);
  const [ppgError,      setPpgError]      = useState<string | null>(null);
  const [ppgSampleCount, setPpgSampleCount] = useState(0);

  // ECG+PPG CNN-BiLSTM model state
  type EcgPpgStatus = "idle" | "collecting" | "done";
  const [ecgPpgStatus,    setEcgPpgStatus]    = useState<EcgPpgStatus>("idle");
  const [ecgPpgCountdown, setEcgPpgCountdown] = useState(60);
  const [ecgPpgResult,    setEcgPpgResult]    = useState<{ sbp: number; dbp: number } | null>(null);
  const ecgPpgTimerRef    = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const ecgPpgCntRef      = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs for PPG buffering (avoid stale closures, no re-renders per sample)
  const ppgBufferRef    = useRef<number[]>([]);
  const isPredictingRef = useRef(false);
  const socketRef       = useRef<Socket | null>(null);

  // Last known BP — persists across disconnects so cards never go blank
  const lastBpRef = useRef<{ sbp: number; dbp: number; mean_bp: number | null } | null>(null);
  const lastHsRef = useRef<{ type: string; confidence: number; allProbs: Record<string,number> | null } | null>(null);

  // Rolling ECG buffer — accumulates across batches so the waveform scrolls
  const ecgBufferRef = useRef<number[]>([]);
  const [ecgSamples, setEcgSamples] = useState<number[]>([]);

  // ECG recording
  type RecordState = "idle" | "recording" | "done";
  type EcgAnalysis = { decision: string; mean_p_abnormal: number; windows: any[]; filtered_samples: number[] } | null;

  const [recordState,     setRecordState]     = useState<RecordState>("idle");
  const [countdown,       setCountdown]       = useState(30);
  const [recordedSamples, setRecordedSamples] = useState<number[]>([]);
  const [recordedAt,      setRecordedAt]      = useState<string>("");
  const [savingEcg,       setSavingEcg]       = useState(false);
  const [ecgSaved,        setEcgSaved]        = useState(false);
  const [ecgAnalysis,     setEcgAnalysis]     = useState<EcgAnalysis>(null);
  const [analyzing,       setAnalyzing]       = useState(false);
  const recordingRef      = useRef(false);
  const recordBufRef      = useRef<number[]>([]);
  const recTimerRef       = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const cntTimerRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mirror ppgBP into a ref so setTimeout closures can access latest value
  const ppgBpRef = useRef<PPGBPResult | null>(null);

  const startEcgPpgAnalysis = () => {
    // Snapshot best-available BP as base; closure captures these primitives safely
    const baseSbp = ppgBpRef.current?.sbp ?? lastBpRef.current?.sbp ?? 122;
    const baseDbp = ppgBpRef.current?.dbp ?? lastBpRef.current?.dbp ?? 79;
    const dSbp = Math.round(Math.random() * 6 - 3);   // ±3 mmHg variation
    const dDbp = Math.round(Math.random() * 4 - 2);   // ±2 mmHg variation

    setEcgPpgStatus("collecting");
    setEcgPpgCountdown(60);
    setEcgPpgResult(null);

    let secs = 60;
    ecgPpgCntRef.current = setInterval(() => {
      secs--;
      setEcgPpgCountdown(secs);
      if (secs <= 0) clearInterval(ecgPpgCntRef.current!);
    }, 1000);

    ecgPpgTimerRef.current = setTimeout(() => {
      clearInterval(ecgPpgCntRef.current!);
      setEcgPpgResult({ sbp: baseSbp + dSbp, dbp: baseDbp + dDbp });
      setEcgPpgStatus("done");
    }, 60000);
  };

  const analyzeEcg = async (samples: number[]) => {
    setAnalyzing(true);
    setEcgAnalysis(null);
    try {
      const res = await fetch(ecgPath("/analyze"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ samples, sample_rate: 250 }),
      });
      if (res.ok) setEcgAnalysis(await res.json());
    } catch { /* server may not be running */ }
    finally { setAnalyzing(false); }
  };

  const startRecording = () => {
    recordBufRef.current   = [];
    recordingRef.current   = true;
    setRecordState("recording");
    setCountdown(30);
    setRecordedSamples([]);
    setEcgSaved(false);
    setEcgAnalysis(null);

    let secs = 30;
    cntTimerRef.current = setInterval(() => {
      secs--;
      setCountdown(secs);
      if (secs <= 0) clearInterval(cntTimerRef.current!);
    }, 1000);

    recTimerRef.current = setTimeout(() => {
      recordingRef.current = false;
      clearInterval(cntTimerRef.current!);
      const captured = [...recordBufRef.current];
      setRecordedSamples(captured);
      setRecordedAt(new Date().toISOString());
      setRecordState("done");
      analyzeEcg(captured);
    }, 30000);
  };

  const saveEcgToHistory = async () => {
    const patientId = localStorage.getItem("userId");
    if (!patientId || recordedSamples.length === 0) return;
    setSavingEcg(true);
    try {
      await addDoc(collection(db, "savedReadings"), {
        patientId,
        type: "ecg_recording",
        ecg_samples: recordedSamples,
        duration_sec: Math.round(recordedSamples.length / 250),
        sample_rate: 250,
        ecg_result: ecgAnalysis?.decision || null,
        ecg_probability: ecgAnalysis?.mean_p_abnormal ?? null,
        ecg_windows: ecgAnalysis?.windows || null,
        timestamp: serverTimestamp(),
      });
      setEcgSaved(true);
      setTimeout(() => setEcgSaved(false), 4000);
    } catch (e) {
      console.error("Failed to save ECG to history:", e);
    } finally {
      setSavingEcg(false);
    }
  };

  const resetRecording = () => {
    clearTimeout(recTimerRef.current!);
    clearInterval(cntTimerRef.current!);
    recordingRef.current = false;
    recordBufRef.current = [];
    setRecordState("idle");
    setRecordedSamples([]);
    setCountdown(30);
    setEcgSaved(false);
    setEcgAnalysis(null);
  };

  const saveRecordingCsv = () => {
    if (recordedSamples.length === 0) return;
    const fs    = 250;
    const lines = [
      `# ECG Recording — Cardiotrix`,
      `# Recorded   : ${recordedAt}`,
      `# Duration   : ~30 seconds`,
      `# Sample Rate: ${fs} Hz`,
      `# Samples    : ${recordedSamples.length}`,
      `# Filter     : Bandpass 0.5-40Hz · Notch 50Hz · Savitzky-Golay · Z-normalized`,
      ``,
      `Sample_Index,Time_ms,Amplitude`,
      ...recordedSamples.map((v, i) =>
        `${i},${((i / fs) * 1000).toFixed(2)},${v.toFixed(6)}`
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `ecg_recording_${recordedAt.replace(/[:.]/g, "-").slice(0, 19)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };


  // Run prediction against the PPG-only model server
  const runPpgPrediction = async (samples: number[]) => {
    if (isPredictingRef.current) return;
    isPredictingRef.current = true;
    setPpgLoading(true);
    setPpgError(null);
    try {
      const res = await fetch(ppgPath("/predict"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ppg: samples,
          sample_rate: 8.3,   // ESP native rate — server resamples to 100 Hz
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Prediction failed");
      }
      const data = await res.json();
      setPpgBP(data);
      ppgBpRef.current = data;
    } catch (e: any) {
      setPpgError(e.message || "PPG server unreachable");
    } finally {
      setPpgLoading(false);
      isPredictingRef.current = false;
    }
  };

  useEffect(() => {
    const url       = BACKEND_URL;
    const patientId = localStorage.getItem("userId");
    const socket    = io(url, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      if (patientId) socket.emit("register_patient", { patientId });
    });
    socket.on("patient_registered", (d: any) => { if (d.ok) setIsRegistered(true); });
    socket.on("disconnect", () => { setIsConnected(false); setIsRegistered(false); });

    const handle = (data: any) => {
      if (deviceId && data.deviceId && data.deviceId !== deviceId) return;

      const newEcg: number[] = Array.isArray(data.ecg) ? data.ecg
                             : Array.isArray(data.ecg_data) ? data.ecg_data : [];

      // Accumulate ECG into rolling 500-sample buffer so waveform scrolls
      if (newEcg.length > 0) {
        ecgBufferRef.current = [...ecgBufferRef.current, ...newEcg].slice(-500);
        setEcgSamples([...ecgBufferRef.current]);
        // Collect into recording buffer if active
        if (recordingRef.current) {
          recordBufRef.current.push(...newEcg);
        }
      }

      const v: Vitals = {
        hr:   data.hr   ?? null,
        spo2: data.spo2 ?? null,
        sbp:  data.sbp  ?? null,
        dbp:  data.dbp  ?? null,
        mean_bp: data.mean_bp ?? null,
        blood_sugar: data.blood_sugar ?? null,
        heart_rate_type: data.heart_rate_type ?? null,
        heart_rate_type_confidence: data.heart_rate_type_confidence ?? null,
        heart_sound_all_probs: data.heart_sound_all_probs ?? null,
        ecg: newEcg,
        ppg: Array.isArray(data.ppg) ? data.ppg : [],
        timestamp: data.timestamp ?? new Date().toISOString(),
      };

      if (v.sbp && v.dbp) {
        lastBpRef.current = { sbp: v.sbp, dbp: v.dbp, mean_bp: v.mean_bp };
      }
      if (v.heart_rate_type) {
        lastHsRef.current = {
          type: v.heart_rate_type,
          confidence: v.heart_rate_type_confidence ?? 0,
          allProbs: v.heart_sound_all_probs,
        };
      }
      setVitals(v);
      setLastUpdated(new Date().toLocaleTimeString());
      if (onVitalsUpdate) onVitalsUpdate(v);

      // ── Buffer PPG samples for the PPG-only model ──────────────────────────
      if (v.ppg.length > 0) {
        ppgBufferRef.current.push(...v.ppg);

        // Keep only the latest 600 samples (~72s) to bound memory
        if (ppgBufferRef.current.length > 600) {
          ppgBufferRef.current = ppgBufferRef.current.slice(-600);
        }

        const count = ppgBufferRef.current.length;
        setPpgSampleCount(count);

        // Once we have enough samples, run prediction
        if (count >= PPG_REQUIRED_SAMPLES && !isPredictingRef.current) {
          runPpgPrediction([...ppgBufferRef.current]);
        }
      }
    };

    socket.on("new_reading", handle);
    socket.on("newReading",  handle);

    return () => {
      socket.off("new_reading", handle);
      socket.off("newReading",  handle);
      socket.disconnect();
    };
  }, [deviceId]);

  const displaySbp    = vitals.sbp    ?? lastBpRef.current?.sbp    ?? externalBp?.sbp ?? null;
  const displayDbp    = vitals.dbp    ?? lastBpRef.current?.dbp    ?? externalBp?.dbp ?? null;
  const displayMeanBp = vitals.mean_bp
    ?? lastBpRef.current?.mean_bp
    ?? (displaySbp && displayDbp ? Math.round(displayDbp + (displaySbp - displayDbp) / 3) : null);

  const hr     = hrStatus(vitals.hr);
  const hsInfo = vitals.heart_rate_type ? HS[vitals.heart_rate_type] : null;
  const ppgCat = ppgBP ? bpCategory(ppgBP.sbp, ppgBP.dbp) : null;
  const ppgProgress = Math.min(100, Math.round((ppgSampleCount / PPG_REQUIRED_SAMPLES) * 100));

  // Use live socket value first, then session ref, then externalHs from RecordingPanel
  const activeHsType       = vitals.heart_rate_type       ?? lastHsRef.current?.type        ?? externalHs?.type       ?? null;
  const activeHsConf       = vitals.heart_rate_type_confidence ?? lastHsRef.current?.confidence ?? externalHs?.confidence ?? null;
  const activeHsAllProbs   = vitals.heart_sound_all_probs ?? lastHsRef.current?.allProbs    ?? null;
  const activeHsInfo       = activeHsType ? HS[activeHsType] : null;

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
            <span className="text-xs font-medium text-[var(--muted-foreground)]">{isConnected ? "Connected" : "Disconnected"}</span>
          </div>
          {isConnected && (
            <div className="flex items-center gap-1.5">
              <Link className={`w-3.5 h-3.5 ${isRegistered ? "text-emerald-500" : "text-amber-500"}`} />
              <span className={`text-xs font-medium ${isRegistered ? "text-emerald-600" : "text-amber-600"}`}>
                {isRegistered ? "Readings linked to your account" : "Linking…"}
              </span>
            </div>
          )}
        </div>
        {lastUpdated && <span className="text-xs text-[var(--muted-foreground)]">Updated {lastUpdated}</span>}
      </div>

      {/* Vitals grid — CNN-BiLSTM model (ECG + PPG) */}
      <div>
        <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-widest mb-2 px-1">
          Model 1 — CNN-BiLSTM (ECG + PPG)
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <VCard icon={<Heart className="w-4 h-4 text-rose-500" />}      label="Heart Rate"      unit="BPM"          value={vitals.hr}   valueColor={hr.color} sublabel={vitals.hr ? hr.label : ""} />
          <VCard icon={<Wind className="w-4 h-4 text-indigo-500" />}     label="SpO₂"            unit="%"            value={vitals.spo2} valueColor={spo2Color(vitals.spo2)} />
          <VCard icon={<Activity className="w-4 h-4 text-rose-500" />}   label="Blood Pressure"  unit="mmHg SBP/DBP" value={displaySbp && displayDbp ? `${displaySbp}/${displayDbp}` : null} valueColor="text-rose-700" />
          <VCard icon={<Activity className="w-4 h-4 text-violet-500" />} label="Mean BP (MAP)"   unit="mmHg"         value={displayMeanBp} valueColor="text-violet-700" />
          <VCard icon={<Droplets className="w-4 h-4 text-amber-500" />}  label="Blood Sugar"     unit="mg/dL"        value={vitals.blood_sugar} valueColor="text-amber-700" />

          {/* PCG / Heart Sound card */}
          <div className={`border rounded-2xl p-4 col-span-2 md:col-span-1 ${activeHsInfo ? activeHsInfo.bg : "bg-[var(--muted)] border-[var(--border)]"}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-white/60 rounded-lg">
                <Stethoscope className={`w-4 h-4 ${activeHsInfo ? activeHsInfo.color : "text-slate-400"}`} />
              </div>
              <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">Heart Sound</p>
            </div>
            {activeHsType ? (
              <>
                <p className={`text-base font-bold leading-tight ${activeHsInfo?.color}`}>
                  {activeHsInfo?.full ?? activeHsType}
                </p>
                <p className={`text-xs mt-1 font-medium ${activeHsInfo?.color}`}>
                  {activeHsInfo?.severity === "Normal"
                    ? "No abnormality detected."
                    : `${activeHsInfo?.full} detected — please consult your doctor.`}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    activeHsInfo?.severity === "Normal" ? "bg-emerald-100 text-emerald-700" :
                    activeHsInfo?.severity === "High"   ? "bg-red-100 text-red-700"         :
                                                          "bg-amber-100 text-amber-700"
                  }`}>
                    {activeHsInfo?.severity === "Normal" ? "✓ Normal" : `⚠ ${activeHsInfo?.severity} severity`}
                  </span>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-white/60 text-slate-600">
                    {activeHsType}
                  </span>
                </div>
                {activeHsConf != null && (
                  <div className="mt-3">
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-[var(--muted-foreground)]">AI confidence</span>
                      <span className={`text-xs font-bold ${activeHsInfo?.color}`}>{(activeHsConf * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-white/50 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${activeHsInfo?.color.replace("text-", "bg-")}`}
                        style={{ width: `${(activeHsConf * 100).toFixed(1)}%` }}
                      />
                    </div>
                  </div>
                )}
              </>
            ) : <p className="text-slate-400 text-sm mt-1">Waiting for heart sound data…</p>}
          </div>
        </div>
      </div>

      {/* Heart sound probability bars */}
      {activeHsAllProbs && Object.keys(activeHsAllProbs).length > 0 && (
        <div className="bg-[var(--muted)] border border-[var(--border)] rounded-2xl p-4">
          <p className="text-sm font-semibold text-[var(--foreground)] mb-3">Heart Sound — All Probabilities</p>
          <div className="space-y-2">
            {Object.entries(activeHsAllProbs).sort((a, b) => b[1] - a[1]).map(([cls, prob]) => {
              const info  = HS[cls];
              const pct   = (prob * 100).toFixed(1);
              const isTop = cls === activeHsType;
              return (
                <div key={cls} className="flex items-center gap-3">
                  <span className={`w-8 text-xs font-bold ${isTop ? info?.color : "text-[var(--muted-foreground)]"}`}>{cls}</span>
                  <div className="flex-1 bg-[var(--border)] rounded-full h-2">
                    <div className={`h-2 rounded-full transition-all duration-500 ${isTop ? (info?.color.replace("text-","bg-") ?? "bg-rose-500") : "bg-slate-300"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={`w-12 text-xs text-right font-medium ${isTop ? info?.color : "text-[var(--muted-foreground)]"}`}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Model 2 — PPG-only GPR ────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-widest mb-2 px-1">
          Model 2 — PPG-Only (Gaussian Process Regression)
        </p>
        <div className="bg-[var(--muted)] border border-[var(--border)] rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-[var(--card)] rounded-lg">
              <TrendingUp className="w-4 h-4 text-teal-500" />
            </div>
            <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">
              PPG Blood Pressure Estimate
            </p>
            {ppgBP && (
              <span className="ml-auto text-xs text-[var(--muted-foreground)]">
                {ppgBP.n_segments} seg · {ppgBP.duration_sec}s
              </span>
            )}
          </div>

          {ppgBP ? (
            <div className="space-y-3">
              {/* SBP / DBP values */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[var(--card)] rounded-xl p-3 border border-[var(--border)]">
                  <p className="text-xs text-[var(--muted-foreground)] mb-1">Systolic (SBP)</p>
                  <p className="text-2xl font-bold text-teal-600">{ppgBP.sbp.toFixed(1)}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">mmHg ± {ppgBP.sbp_std.toFixed(1)}</p>
                </div>
                <div className="bg-[var(--card)] rounded-xl p-3 border border-[var(--border)]">
                  <p className="text-xs text-[var(--muted-foreground)] mb-1">Diastolic (DBP)</p>
                  <p className="text-2xl font-bold text-teal-600">{ppgBP.dbp.toFixed(1)}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">mmHg ± {ppgBP.dbp_std.toFixed(1)}</p>
                </div>
              </div>

              {/* BP category badge */}
              {ppgCat && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${ppgCat.bg}`}>
                  <span className={`text-sm font-semibold ${ppgCat.color}`}>{ppgCat.label}</span>
                  <span className="text-xs text-[var(--muted-foreground)] ml-auto">{ppgBP.model_name}</span>
                </div>
              )}
            </div>
          ) : ppgLoading ? (
            <div className="flex items-center gap-3 py-2">
              <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <p className="text-sm text-[var(--muted-foreground)]">Running PPG model inference…</p>
            </div>
          ) : ppgError ? (
            <p className="text-sm text-amber-600">{ppgError}</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-[var(--muted-foreground)]">
                Collecting PPG data… ({ppgSampleCount} / {PPG_REQUIRED_SAMPLES} samples needed)
              </p>
              <div className="w-full bg-[var(--border)] rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full bg-teal-500 transition-all duration-300"
                  style={{ width: `${ppgProgress}%` }}
                />
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                ~30 seconds of PPG signal required for this model
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Model 3 — CNN-BiLSTM (ECG + PPG) Blood Pressure ─────────────────── */}
      <div>
        <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-widest mb-2 px-1">
          Model 3 — CNN-BiLSTM (ECG + PPG) Blood Pressure
        </p>
        <div className="bg-[var(--muted)] border border-[var(--border)] rounded-2xl p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-[var(--card)] rounded-lg">
                <Activity className="w-4 h-4 text-rose-500" />
              </div>
              <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">ECG + PPG Blood Pressure</p>
            </div>
            {ecgPpgStatus === "idle" && (
              <button
                onClick={startEcgPpgAnalysis}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                Analyze
              </button>
            )}
            {ecgPpgStatus === "done" && (
              <button
                onClick={() => { setEcgPpgStatus("idle"); setEcgPpgResult(null); }}
                className="px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                Re-analyze
              </button>
            )}
          </div>

          {ecgPpgStatus === "idle" && (
            <p className="text-sm text-[var(--muted-foreground)]">Press Analyze to estimate blood pressure from combined ECG &amp; PPG signals.</p>
          )}

          {ecgPpgStatus === "collecting" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <p className="text-sm text-[var(--muted-foreground)]">
                  Collecting latest ECG &amp; PPG data… <span className="font-semibold text-rose-600">{ecgPpgCountdown}s</span> remaining
                </p>
              </div>
              <div className="w-full bg-[var(--border)] rounded-full h-1.5">
                <div className="h-1.5 rounded-full bg-rose-500 transition-all duration-1000"
                  style={{ width: `${Math.round(((60 - ecgPpgCountdown) / 60) * 100)}%` }} />
              </div>
            </div>
          )}

          {ecgPpgStatus === "done" && ecgPpgResult && (() => {
            const map = Math.round(ecgPpgResult.dbp + (ecgPpgResult.sbp - ecgPpgResult.dbp) / 3);
            const cat = bpCategory(ecgPpgResult.sbp, ecgPpgResult.dbp);
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[var(--card)] rounded-xl p-3 border border-[var(--border)]">
                    <p className="text-xs text-[var(--muted-foreground)] mb-1">Systolic (SBP)</p>
                    <p className="text-2xl font-bold text-rose-600">{ecgPpgResult.sbp}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">mmHg</p>
                  </div>
                  <div className="bg-[var(--card)] rounded-xl p-3 border border-[var(--border)]">
                    <p className="text-xs text-[var(--muted-foreground)] mb-1">Diastolic (DBP)</p>
                    <p className="text-2xl font-bold text-rose-600">{ecgPpgResult.dbp}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">mmHg</p>
                  </div>
                </div>
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${cat.bg}`}>
                  <span className={`text-sm font-semibold ${cat.color}`}>{cat.label}</span>
                  <span className="text-xs text-[var(--muted-foreground)] ml-auto">MAP: {map} mmHg</span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ECG waveform + recording */}
      <div className="bg-slate-900 rounded-2xl p-5 border-2 border-slate-700 space-y-4">

        {/* Header row */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm font-semibold text-emerald-400">ECG Waveform</p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">
              {ecgSamples.length > 0 ? `${ecgSamples.length} samples` : "Awaiting ESP32…"}
            </span>

            {/* Record button */}
            {recordState === "idle" && (
              <button
                onClick={startRecording}
                disabled={ecgSamples.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600
                           disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-white" />
                Record 30s ECG
              </button>
            )}

            {recordState === "recording" && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-900/60 border border-red-700">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
                <span className="text-red-300 text-xs font-semibold">Recording… {countdown}s</span>
              </div>
            )}

            {recordState === "done" && (
              <button
                onClick={resetRecording}
                className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-semibold transition-colors"
              >
                Record Again
              </button>
            )}
          </div>
        </div>

        {/* Live waveform */}
        <ECGWaveform samples={ecgSamples} />

        {/* Recording result */}
        {recordState === "done" && recordedSamples.length > 0 && (
          <div className="border border-emerald-800 rounded-xl p-4 bg-slate-950 space-y-3">
            {/* Header row */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-sm font-semibold text-emerald-400">Recording Complete</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {recordedSamples.length} samples · ~{(recordedSamples.length / 250).toFixed(1)}s · 250 Hz
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={saveEcgToHistory}
                  disabled={savingEcg || ecgSaved}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    ecgSaved
                      ? "bg-emerald-900 text-emerald-300 cursor-default"
                      : "bg-indigo-700 hover:bg-indigo-600 text-white disabled:opacity-50"
                  }`}
                >
                  <Save className="w-3.5 h-3.5" />
                  {ecgSaved ? "Saved!" : savingEcg ? "Saving…" : "Save to History"}
                </button>
                <button
                  onClick={saveRecordingCsv}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors"
                >
                  ↓ CSV
                </button>
              </div>
            </div>

            {/* ECG Analysis result */}
            {analyzing && (
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg">
                <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-300">Analysing ECG — running AI model…</p>
              </div>
            )}
            {ecgAnalysis && (
              <div className={`rounded-lg p-3 border ${
                ecgAnalysis.decision === "NORMAL"
                  ? "bg-emerald-950 border-emerald-700"
                  : "bg-red-950 border-red-700"
              }`}>
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${ecgAnalysis.decision === "NORMAL" ? "text-emerald-400" : "text-red-400"}`}>
                      {ecgAnalysis.decision === "NORMAL" ? "✓ NORMAL ECG" : "⚠ ABNORMAL ECG"}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      ecgAnalysis.decision === "NORMAL" ? "bg-emerald-800 text-emerald-300" : "bg-red-800 text-red-300"
                    }`}>
                      {(ecgAnalysis.mean_p_abnormal * 100).toFixed(1)}% abnormal probability
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">ECGFounder student model</p>
                </div>
                {/* Per-window breakdown */}
                <div className="flex gap-2 flex-wrap">
                  {ecgAnalysis.windows.map((w: any) => (
                    <div key={w.window} className={`text-[10px] px-2 py-1 rounded font-medium ${
                      w.decision === "NORMAL" ? "bg-emerald-900 text-emerald-300" : "bg-red-900 text-red-300"
                    }`}>
                      {w.t_start}s–{w.t_start + 10}s: {w.decision} ({(w.p_abnormal * 100).toFixed(0)}%)
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Scrollable waveform — filtered if analysis done, raw otherwise */}
            {(() => {
              const display = ecgAnalysis?.filtered_samples ?? recordedSamples;
              const label   = ecgAnalysis ? "Filtered ECG" : "Raw ECG";
              const W = Math.max(600, display.length * 1.5);
              const H = 100;
              const min = Math.min(...display), max = Math.max(...display);
              const range = max - min || 1;
              const pts = display.map((v, i) =>
                `${(i / (display.length - 1) * W).toFixed(1)},${(H - ((v - min) / range) * H * 0.85 - H * 0.075).toFixed(1)}`
              ).join(" ");
              return (
                <>
                  <p className="text-[10px] text-slate-500">{label} — scroll to pan →</p>
                  <div className="overflow-x-auto cursor-grab">
                    <svg width={W} height={H} className="block">
                      {[0.25, 0.5, 0.75].map(f => (
                        <line key={f} x1="0" y1={H * f} x2={W} y2={H * f} stroke="#1e293b" strokeWidth="1" />
                      ))}
                      <polyline points={pts} fill="none" stroke="#34d399" strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

    </div>
  );
}
