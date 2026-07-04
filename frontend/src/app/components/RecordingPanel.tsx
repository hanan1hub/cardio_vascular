// src/app/components/RecordingPanel.tsx
// Two buttons: Record Heart Sound (PCG) and Record Blood Pressure (PPG)
// Results are pushed from the backend via Socket.IO after recording completes.

import React, { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { Stethoscope, TrendingUp, Mic, Activity, Save, Check } from "lucide-react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { BACKEND_URL, backendPath } from "../utils/api";

// ── Types ─────────────────────────────────────────────────────────────────────
interface RecStatus {
  type: "pcg" | "ppg" | null;
  status: "idle" | "started" | "processing" | "done" | "error";
  message: string;
  duration: number;
}

interface RecProgress {
  type: "pcg" | "ppg";
  progress: number;
  elapsed: number;
  remaining: number;
  samples?: number;
}

interface PCGResult {
  type: "pcg";
  heart_sound_type: string;
  confidence: number;
  all_probabilities: Record<string, number>;
  timestamp: string;
  duration_sec: number;
}

interface PPGResult {
  type: "ppg";
  sbp: number;
  dbp: number;
  sbp_std: number;
  dbp_std: number;
  n_segments: number;
  duration_sec: number;
  model_name: string;
  timestamp: string;
}

// ── Lookup tables ─────────────────────────────────────────────────────────────
const HS_INFO: Record<string, { full: string; color: string; bg: string; border: string; severity: string }> = {
  N:   { full: "Normal",                color: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-200", severity: "Normal"   },
  AS:  { full: "Aortic Stenosis",       color: "text-red-700",     bg: "bg-red-50",      border: "border-red-200",     severity: "High"     },
  MR:  { full: "Mitral Regurgitation",  color: "text-orange-700",  bg: "bg-orange-50",   border: "border-orange-200",  severity: "Moderate" },
  MS:  { full: "Mitral Stenosis",       color: "text-amber-700",   bg: "bg-amber-50",    border: "border-amber-200",   severity: "Moderate" },
  MVP: { full: "Mitral Valve Prolapse", color: "text-purple-700",  bg: "bg-purple-50",   border: "border-purple-200",  severity: "Low"      },
};

function bpCategory(sbp: number, dbp: number) {
  if (sbp < 120 && dbp < 80)  return { label: "Normal",       color: "text-emerald-700", bg: "bg-emerald-100" };
  if (sbp < 130 && dbp < 80)  return { label: "Elevated",     color: "text-amber-700",   bg: "bg-amber-100"   };
  if (sbp < 140 || dbp < 90)  return { label: "High Stage 1", color: "text-orange-700",  bg: "bg-orange-100"  };
  return                              { label: "High Stage 2", color: "text-red-700",     bg: "bg-red-100"     };
}

// ── Component ─────────────────────────────────────────────────────────────────
interface RecordingPanelProps {
  onPcgResult?: (type: string, confidence: number) => void;
  onPpgResult?: (sbp: number, dbp: number) => void;
  currentHr?:   number | null;
  currentSpo2?: number | null;
}
export default function RecordingPanel({ onPcgResult, onPpgResult, currentHr, currentSpo2 }: RecordingPanelProps) {
  const [status,      setStatus]      = useState<RecStatus>({ type: null, status: "idle", message: "", duration: 0 });
  const [progress,    setProgress]    = useState<RecProgress | null>(null);
  const [pcgResult,   setPcgResult]   = useState<PCGResult | null>(null);
  const [ppgResult,   setPpgResult]   = useState<PPGResult | null>(null);
  const [pcgSaved,    setPcgSaved]    = useState(false);
  const [ppgSaved,    setPpgSaved]    = useState(false);
  const [pcgSaving,   setPcgSaving]   = useState(false);
  const [ppgSaving,   setPpgSaving]   = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const backendUrl = BACKEND_URL;

  // ── Socket.IO listener for recording events ───────────────────────────────
  useEffect(() => {
    const socket = io(backendUrl, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("recording_status", (d: any) => {
      setStatus({ type: d.type, status: d.status, message: d.message || "", duration: d.duration || 0 });
      if (d.status === "done" || d.status === "error") setProgress(null);
    });

    socket.on("recording_progress", (d: any) => {
      setProgress(d);
    });

    socket.on("recording_result", (d: any) => {
      if (d.type === "pcg") {
        setPcgResult(d as PCGResult);
        onPcgResult?.(d.heart_sound_type, d.confidence);
      }
      if (d.type === "ppg") {
        setPpgResult(d as PPGResult);
        onPpgResult?.(d.sbp, d.dbp);
      }
    });

    return () => { socket.disconnect(); };
  }, [backendUrl]);

  // ── Save results to Firestore history ────────────────────────────────────
  const savePcgToHistory = async () => {
    if (!pcgResult) return;
    const patientId = localStorage.getItem("userId");
    if (!patientId) return;
    setPcgSaving(true);
    try {
      await addDoc(collection(db, "savedReadings"), {
        patientId,
        type: "vitals",
        heart_sound_type:       pcgResult.heart_sound_type,
        heart_sound_confidence: pcgResult.confidence,
        hr:   currentHr   ?? null,
        spo2: currentSpo2 ?? null,
        timestamp: serverTimestamp(),
      });
      setPcgSaved(true);
      setTimeout(() => setPcgSaved(false), 3000);
    } catch (e) { console.error(e); }
    finally { setPcgSaving(false); }
  };

  const savePpgToHistory = async () => {
    if (!ppgResult) return;
    const patientId = localStorage.getItem("userId");
    if (!patientId) return;
    setPpgSaving(true);
    try {
      const map = Math.round(ppgResult.dbp + (ppgResult.sbp - ppgResult.dbp) / 3);
      await addDoc(collection(db, "savedReadings"), {
        patientId,
        type:    "vitals",
        sbp:     Math.round(ppgResult.sbp),
        dbp:     Math.round(ppgResult.dbp),
        mean_bp: map,
        hr:      currentHr   ?? null,
        spo2:    currentSpo2 ?? null,
        timestamp: serverTimestamp(),
      });
      setPpgSaved(true);
      setTimeout(() => setPpgSaved(false), 3000);
    } catch (e) { console.error(e); }
    finally { setPpgSaving(false); }
  };

  // ── Trigger recording via HTTP POST ──────────────────────────────────────
  const startRecording = async (type: "pcg" | "ppg") => {
    try {
      const res  = await fetch(backendPath(`/api/record/${type}`), { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setStatus({ type, status: "error", message: data.error, duration: 0 });
      }
    } catch {
      setStatus({ type, status: "error", message: "Cannot reach backend server.", duration: 0 });
    }
  };

  const isRecording = status.status === "started" || status.status === "processing";
  const activeType  = status.type;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-6 shadow-sm space-y-5">

      {/* Header */}
      <div className="text-center">
        <h2 className="text-base font-bold text-[var(--foreground)]">Manual Recording</h2>
        <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Tap a button to start — ESP32 via USB</p>
      </div>

      {/* Circular Buttons */}
      <div className="flex justify-center gap-12 py-2">

        {/* ── PCG — Heart Sound ────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={() => startRecording("pcg")}
            disabled={isRecording}
            className={`relative w-32 h-32 rounded-full flex flex-col items-center justify-center transition-all duration-200 shadow-xl focus:outline-none
              ${isRecording && activeType === "pcg"
                ? "bg-gradient-to-br from-violet-400 to-purple-500 scale-95 shadow-violet-300/60 cursor-not-allowed"
                : isRecording
                ? "bg-gradient-to-br from-slate-300 to-slate-400 opacity-40 cursor-not-allowed"
                : "bg-gradient-to-br from-violet-500 to-purple-600 hover:scale-110 hover:shadow-violet-400/70 cursor-pointer active:scale-95"
              }`}
          >
            {/* Heart + ECG waveform icon */}
            <svg viewBox="0 0 56 56" className="w-14 h-14" fill="none">
              {/* Heart */}
              <path d="M28 45C28 45 7 32 7 18.5C7 11.5 12.5 6.5 19 6.5C23 6.5 26.5 8.5 28 11.5C29.5 8.5 33 6.5 37 6.5C43.5 6.5 49 11.5 49 18.5C49 32 28 45 28 45Z"
                fill="white" opacity="0.92"/>
              {/* ECG / heartbeat line across heart */}
              <polyline
                points="10,26 16,26 19,19 22,33 25,22 28,26 31,26 34,22 37,30 40,26 46,26"
                stroke="#7c3aed" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {/* REC dot — pulses when recording */}
            <span className={`absolute top-2.5 right-2.5 w-3.5 h-3.5 rounded-full border-2 border-white
              ${isRecording && activeType === "pcg" ? "bg-red-400 animate-ping" : "bg-red-500"}`} />
            {isRecording && activeType === "pcg" && (
              <div className="absolute bottom-3 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
          </button>
          {/* Label */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
              <span className="text-[10px] font-extrabold text-red-500 uppercase tracking-widest">REC</span>
            </div>
            <p className="text-sm font-bold text-[var(--foreground)]">Heart Sound</p>
            <p className="text-xs text-violet-500 font-medium">PCG · 15 seconds</p>
            <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">Uses INMP441 mic</p>
          </div>
        </div>

        {/* ── PPG — Blood Pressure ─────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={() => startRecording("ppg")}
            disabled={isRecording}
            className={`relative w-32 h-32 rounded-full flex flex-col items-center justify-center transition-all duration-200 shadow-xl focus:outline-none
              ${isRecording && activeType === "ppg"
                ? "bg-gradient-to-br from-teal-400 to-cyan-500 scale-95 shadow-teal-300/60 cursor-not-allowed"
                : isRecording
                ? "bg-gradient-to-br from-slate-300 to-slate-400 opacity-40 cursor-not-allowed"
                : "bg-gradient-to-br from-teal-500 to-cyan-600 hover:scale-110 hover:shadow-teal-400/70 cursor-pointer active:scale-95"
              }`}
          >
            {/* Blood pressure cuff icon */}
            <svg viewBox="0 0 56 56" className="w-14 h-14" fill="none">
              {/* Gauge circle */}
              <circle cx="28" cy="13" r="8" fill="white" opacity="0.9"/>
              {/* Gauge arc (scale) */}
              <path d="M21.5 17 A7 7 0 0 1 34.5 17" stroke="#0d9488" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
              {/* Gauge needle */}
              <line x1="28" y1="13" x2="32" y2="9" stroke="#0d9488" strokeWidth="1.8" strokeLinecap="round"/>
              <circle cx="28" cy="13" r="1.5" fill="#0d9488"/>
              {/* Tube from gauge down to cuff */}
              <line x1="28" y1="21" x2="28" y2="27" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              {/* Cuff band */}
              <rect x="9" y="27" width="38" height="15" rx="7.5" fill="white" opacity="0.92"/>
              {/* Cuff bar chart (pressure reading) */}
              <rect x="16" y="31" width="4" height="7" rx="1.5" fill="#0d9488" opacity="0.45"/>
              <rect x="23" y="29" width="4" height="9" rx="1.5" fill="#0d9488" opacity="0.75"/>
              <rect x="30" y="31" width="4" height="7" rx="1.5" fill="#0d9488" opacity="0.55"/>
              <rect x="37" y="33" width="4" height="5" rx="1.5" fill="#0d9488" opacity="0.4"/>
            </svg>
            {/* REC dot */}
            <span className={`absolute top-2.5 right-2.5 w-3.5 h-3.5 rounded-full border-2 border-white
              ${isRecording && activeType === "ppg" ? "bg-red-400 animate-ping" : "bg-red-500"}`} />
            {isRecording && activeType === "ppg" && (
              <div className="absolute bottom-3 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
          </button>
          {/* Label */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
              <span className="text-[10px] font-extrabold text-red-500 uppercase tracking-widest">REC</span>
            </div>
            <p className="text-sm font-bold text-[var(--foreground)]">Blood Pressure</p>
            <p className="text-xs text-teal-500 font-medium">PPG · 45 seconds</p>
            <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">Uses MAX30102 sensor</p>
          </div>
        </div>

      </div>

      {/* Recording progress */}
      {isRecording && (
        <div className={`rounded-2xl border p-4 ${activeType === "pcg" ? "bg-violet-50 border-violet-200" : "bg-teal-50 border-teal-200"}`}>
          <div className="flex items-center gap-2 mb-3">
            <Mic className={`w-4 h-4 animate-pulse ${activeType === "pcg" ? "text-violet-600" : "text-teal-600"}`} />
            <p className={`text-sm font-semibold ${activeType === "pcg" ? "text-violet-700" : "text-teal-700"}`}>
              {status.status === "processing" ? "Analyzing with AI model…" : status.message}
            </p>
          </div>

          {progress && status.status !== "processing" && (
            <>
              <div className="w-full bg-white/60 rounded-full h-2 mb-2">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${activeType === "pcg" ? "bg-violet-500" : "bg-teal-500"}`}
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
              <div className="flex justify-between text-xs">
                <span className={activeType === "pcg" ? "text-violet-600" : "text-teal-600"}>
                  {progress.elapsed}s elapsed
                  {progress.samples !== undefined ? ` · ${progress.samples} samples` : ""}
                </span>
                <span className={activeType === "pcg" ? "text-violet-600" : "text-teal-600"}>
                  {progress.remaining}s remaining
                </span>
              </div>
            </>
          )}

          {status.status === "processing" && (
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 border-2 border-t-transparent rounded-full animate-spin ${activeType === "pcg" ? "border-violet-500" : "border-teal-500"}`} />
              <span className={`text-xs ${activeType === "pcg" ? "text-violet-600" : "text-teal-600"}`}>
                Please wait…
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {status.status === "error" && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700 mb-1">Recording failed</p>
          <p className="text-xs text-red-600">{status.message}</p>
          <p className="text-xs text-red-500 mt-2">
            Make sure: ① Arduino Serial Monitor is closed ② ESP32 is plugged in ③ COM port is correct in backend/.env
          </p>
        </div>
      )}

      {/* ── PCG Result ────────────────────────────────────────────────────── */}
      {pcgResult && (
        <div className={`rounded-2xl border p-5 ${HS_INFO[pcgResult.heart_sound_type]?.bg ?? "bg-slate-50"} ${HS_INFO[pcgResult.heart_sound_type]?.border ?? "border-slate-200"}`}>
          <div className="flex items-center gap-2 mb-4">
            <Stethoscope className={`w-5 h-5 ${HS_INFO[pcgResult.heart_sound_type]?.color ?? "text-slate-600"}`} />
            <p className="text-sm font-semibold text-[var(--foreground)]">Heart Sound Result</p>
            <span className="ml-auto text-xs text-[var(--muted-foreground)]">
              {new Date(pcgResult.timestamp).toLocaleTimeString()} · {pcgResult.duration_sec}s recorded
            </span>
          </div>

          {/* Main result */}
          <div className="flex items-start gap-4 mb-4">
            <div>
              <p className={`text-2xl font-bold ${HS_INFO[pcgResult.heart_sound_type]?.color ?? "text-slate-700"}`}>
                {HS_INFO[pcgResult.heart_sound_type]?.full ?? pcgResult.heart_sound_type}
              </p>
              <p className={`text-xs mt-1 ${HS_INFO[pcgResult.heart_sound_type]?.color ?? "text-slate-500"}`}>
                {HS_INFO[pcgResult.heart_sound_type]?.severity === "Normal"
                  ? "No abnormality detected."
                  : `${HS_INFO[pcgResult.heart_sound_type]?.full} detected — consult your doctor.`}
              </p>
            </div>
            <span className={`ml-auto px-3 py-1 rounded-full text-xs font-bold ${
              HS_INFO[pcgResult.heart_sound_type]?.severity === "Normal" ? "bg-emerald-100 text-emerald-700"
              : HS_INFO[pcgResult.heart_sound_type]?.severity === "High" ? "bg-red-100 text-red-700"
              : "bg-amber-100 text-amber-700"
            }`}>
              {HS_INFO[pcgResult.heart_sound_type]?.severity === "Normal" ? "✓ Normal" : `⚠ ${HS_INFO[pcgResult.heart_sound_type]?.severity} severity`}
            </span>
          </div>

          {/* Confidence bar */}
          <div className="mb-4">
            <div className="flex justify-between mb-1">
              <span className="text-xs text-[var(--muted-foreground)]">AI confidence</span>
              <span className={`text-xs font-bold ${HS_INFO[pcgResult.heart_sound_type]?.color ?? "text-slate-600"}`}>
                {(pcgResult.confidence * 100).toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-white/60 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-700 ${HS_INFO[pcgResult.heart_sound_type]?.color.replace("text-", "bg-") ?? "bg-slate-400"}`}
                style={{ width: `${(pcgResult.confidence * 100).toFixed(1)}%` }}
              />
            </div>
          </div>

          {/* Save button */}
          <button
            onClick={savePcgToHistory}
            disabled={pcgSaving || pcgSaved}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition mb-4 ${
              pcgSaved ? "bg-emerald-500 text-white" : "bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
            }`}
          >
            {pcgSaved ? <><Check className="w-4 h-4" />Saved to History</> : pcgSaving ? <>Saving…</> : <><Save className="w-4 h-4" />Save to History</>}
          </button>

          {/* All probabilities */}
          {Object.keys(pcgResult.all_probabilities).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-2">All Probabilities</p>
              {Object.entries(pcgResult.all_probabilities)
                .sort((a, b) => b[1] - a[1])
                .map(([cls, prob]) => {
                  const info  = HS_INFO[cls];
                  const pct   = (prob * 100).toFixed(1);
                  const isTop = cls === pcgResult.heart_sound_type;
                  return (
                    <div key={cls} className="flex items-center gap-3">
                      <span className={`w-8 text-xs font-bold ${isTop ? info?.color : "text-[var(--muted-foreground)]"}`}>{cls}</span>
                      <div className="flex-1 bg-white/50 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-500 ${isTop ? (info?.color.replace("text-", "bg-") ?? "bg-slate-400") : "bg-slate-300"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`w-12 text-right text-xs font-medium ${isTop ? info?.color : "text-[var(--muted-foreground)]"}`}>{pct}%</span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ── PPG / BP Result ───────────────────────────────────────────────── */}
      {ppgResult && (() => {
        const cat = bpCategory(ppgResult.sbp, ppgResult.dbp);
        return (
          <div className="rounded-2xl border border-teal-200 bg-teal-50 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-teal-600" />
              <p className="text-sm font-semibold text-[var(--foreground)]">Blood Pressure Result</p>
              <span className="ml-auto text-xs text-[var(--muted-foreground)]">
                {new Date(ppgResult.timestamp).toLocaleTimeString()} · {ppgResult.n_segments} segments
              </span>
            </div>

            {/* SBP / DBP */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white/70 rounded-xl p-4 border border-teal-100">
                <p className="text-xs text-[var(--muted-foreground)] mb-1">Systolic (SBP)</p>
                <p className="text-3xl font-bold text-teal-700">{ppgResult.sbp?.toFixed(0)}</p>
                <p className="text-xs text-teal-500 mt-1">mmHg ± {ppgResult.sbp_std?.toFixed(1)}</p>
              </div>
              <div className="bg-white/70 rounded-xl p-4 border border-teal-100">
                <p className="text-xs text-[var(--muted-foreground)] mb-1">Diastolic (DBP)</p>
                <p className="text-3xl font-bold text-teal-700">{ppgResult.dbp?.toFixed(0)}</p>
                <p className="text-xs text-teal-500 mt-1">mmHg ± {ppgResult.dbp_std?.toFixed(1)}</p>
              </div>
            </div>

            {/* BP category + Save */}
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl ${cat.bg} mb-3`}>
              <span className={`text-sm font-bold ${cat.color}`}>{cat.label}</span>
              <span className="ml-auto text-xs text-[var(--muted-foreground)]">
                {ppgResult.model_name ?? "GPR Model"} · {ppgResult.duration_sec?.toFixed(0)}s
              </span>
            </div>
            <button
              onClick={savePpgToHistory}
              disabled={ppgSaving || ppgSaved}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition w-full justify-center ${
                ppgSaved ? "bg-emerald-500 text-white" : "bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
              }`}
            >
              {ppgSaved ? <><Check className="w-4 h-4" />Saved to History</> : ppgSaving ? <>Saving…</> : <><Save className="w-4 h-4" />Save BP to History</>}
            </button>
          </div>
        );
      })()}

    </div>
  );
}
