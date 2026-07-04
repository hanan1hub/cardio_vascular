// src/app/pages/AboutUs.tsx
// About Us page - accessed from sidebar

import React, { useState } from "react";
import { Heart, Mic, Activity, ChevronRight, X, Wind, TrendingUp, Droplet } from "lucide-react";
import SidebarLayout from "../components/Sidebar";
import cardiotrixLogo from "../assets/cardiotrix-logo.png";

// ── Electrode type ───────────────────────────────────────────────────────────
interface Electrode {
  label: string;
  position: string;
  description: string;
}

// ── Sensor info type ─────────────────────────────────────────────────────────
interface SensorInfo {
  name: string;
  subtitle: string;
  icon: React.ReactNode;
  textColor: string;
  gradient: string;
  bgLight: string;
  borderColor: string;
  measures: string[];
  howToUse: string[];
  description: string;
  tips: string;
  electrodes?: Electrode[];
}

// ── Sensor info data ─────────────────────────────────────────────────────────
const SENSORS: Record<string, SensorInfo> = {
  ppg: {
    name: "PPG Sensor",
    subtitle: "MAX30102 Photoplethysmography",
    icon: <Droplet className="w-6 h-6" />,
    textColor: "text-rose-400",
    gradient: "from-rose-500 to-rose-600",
    bgLight: "bg-rose-50 dark:bg-rose-950/30",
    borderColor: "border-rose-200 dark:border-rose-800",
    measures: ["Heart Rate (BPM)", "Blood Oxygen (SpO₂)", "Blood Pressure Estimation"],
    howToUse: [
      "Place your fingertip gently on the PPG sensor window",
      "Keep your finger still and relaxed - avoid pressing too hard",
      "Wait 10-15 seconds for accurate readings",
      "Ensure your finger covers the sensor completely",
      "Avoid bright lights shining directly on the sensor"
    ],
    description: "The PPG sensor uses red and infrared LEDs to measure blood volume changes in your finger. By analyzing how light is absorbed by your blood, it calculates your heart rate, oxygen saturation (SpO₂), and estimates blood pressure.",
    tips: "For best results, keep your hand at heart level and stay still during measurement."
  },
  pcg: {
    name: "PCG Sensor",
    subtitle: "INMP441 Digital Microphone",
    icon: <Mic className="w-6 h-6" />,
    textColor: "text-indigo-400",
    gradient: "from-indigo-500 to-indigo-600",
    bgLight: "bg-indigo-50 dark:bg-indigo-950/30",
    borderColor: "border-indigo-200 dark:border-indigo-800",
    measures: ["Heart Sound Recording", "Murmur Detection", "Cardiac Rhythm Analysis"],
    howToUse: [
      "Remove the wristband and hold the PCG sensor",
      "Place the sensor directly on your chest, over your heart",
      "Position it slightly left of center, between the 4th-5th ribs",
      "Hold still and breathe normally during recording",
      "Recording takes approximately 10-15 seconds"
    ],
    description: "The INMP441 is a high-sensitivity digital microphone that captures your heart sounds (phonocardiogram). The audio is processed by our AI model to detect abnormalities like murmurs, irregular rhythms, and other cardiac conditions.",
    tips: "Record in a quiet environment. The AI model analyzes S1 and S2 heart sounds to detect potential abnormalities."
  },
  ecg: {
    name: "ECG Sensor",
    subtitle: "AD8232 Single Lead Monitor",
    icon: <Activity className="w-6 h-6" />,
    textColor: "text-emerald-400",
    gradient: "from-emerald-500 to-emerald-600",
    bgLight: "bg-emerald-50 dark:bg-emerald-950/30",
    borderColor: "border-emerald-200 dark:border-emerald-800",
    measures: ["Heart Electrical Activity", "Arrhythmia Detection", "HRV Analysis"],
    howToUse: [
      "Attach the 3 electrode pads to your skin as shown below:",
      "RA (Right Arm): Between right shoulder and right elbow",
      "LA (Left Arm): Between left shoulder and left elbow",
      "RL (Right Leg): Below right torso and above right ankle",
      "Ensure skin is clean and dry before attaching electrodes"
    ],
    description: "The AD8232 is a medical-grade ECG front-end that captures your heart's electrical signals through 3 electrodes. This provides detailed information about your cardiac rhythm, detecting arrhythmias and other electrical abnormalities.",
    electrodes: [
      { label: "RA", position: "Right Arm", description: "Place anywhere between right shoulder and right elbow" },
      { label: "LA", position: "Left Arm", description: "Place anywhere between left shoulder and left elbow" },
      { label: "RL", position: "Right Leg", description: "Reference electrode - place below right torso, above right ankle" }
    ],
    tips: "Electrodes should adhere firmly. Replace if they lose stickiness. Stay relaxed during measurement."
  }
};

type SensorKey = keyof typeof SENSORS;

// ── CardioTrix Logo Component ────────────────────────────────────────────────
function CardioTrixLogo() {
  return (
    <div className="flex items-center justify-center mb-8">
      <img
        src={cardiotrixLogo}
        alt="CardioTrix"
        className="h-40 w-auto object-contain"
      />
    </div>
  );
}

// ── Animated Wristband Component ─────────────────────────────────────────────
function AnimatedWristband({ onSensorClick, activeSensor }: { onSensorClick: (s: SensorKey) => void; activeSensor: SensorKey | null }) {
  return (
    <div className="relative w-full max-w-lg mx-auto">
      {/* Wristband body */}
      <div className="relative bg-gradient-to-br from-slate-800 via-slate-700 to-slate-800 rounded-3xl p-6 shadow-2xl border border-slate-600">
        {/* Strap texture */}
        <div className="absolute inset-0 rounded-3xl opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImEiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHBhdGggZD0iTTAgMGgyMHYyMEgweiIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik0wIDBoMjB2MjBIMHoiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48cGF0aCBkPSJNMTAgMHYyME0wIDEwaDIwIiBzdHJva2U9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCBmaWxsPSJ1cmwoI2EpIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIi8+PC9zdmc+')]" />

        {/* Top strap */}
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-32 h-10 bg-gradient-to-b from-slate-700 to-slate-800 rounded-t-xl border-x border-t border-slate-600" />

        {/* Bottom strap */}
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-32 h-10 bg-gradient-to-t from-slate-700 to-slate-800 rounded-b-xl border-x border-b border-slate-600" />

        {/* Main display area */}
        <div className="bg-slate-900 rounded-2xl p-4 border border-slate-700 shadow-inner mb-4">
          {/* OLED Display simulation */}
          <div className="bg-black rounded-xl p-3 border border-slate-800">
            {/* Display content */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-rose-500 animate-pulse" fill="currentColor" />
                <span className="text-rose-500 text-xs font-mono">LIVE</span>
              </div>
              <span className="text-emerald-400 text-xs font-mono">Connected</span>
            </div>

            {/* ECG waveform animation */}
            <svg viewBox="0 0 200 40" className="w-full h-10 mb-2">
              <defs>
                <linearGradient id="ecgGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0" />
                  <stop offset="50%" stopColor="#10b981" stopOpacity="1" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 20 L20 20 L30 20 L35 20 L40 5 L45 35 L50 15 L55 20 L80 20 L90 20 L95 20 L100 5 L105 35 L110 15 L115 20 L140 20 L150 20 L155 20 L160 5 L165 35 L170 15 L175 20 L200 20"
                fill="none"
                stroke="#10b981"
                strokeWidth="1.5"
                className="animate-pulse"
              />
            </svg>

            {/* Vital readings */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-rose-500 text-lg font-mono font-bold">72</p>
                <p className="text-slate-500 text-[10px]">BPM</p>
              </div>
              <div>
                <p className="text-indigo-400 text-lg font-mono font-bold">98</p>
                <p className="text-slate-500 text-[10px]">SpO₂%</p>
              </div>
              <div>
                <p className="text-violet-400 text-lg font-mono font-bold">120/80</p>
                <p className="text-slate-500 text-[10px]">BP</p>
              </div>
            </div>
          </div>
        </div>

        {/* Circuit board visualization */}
        <div className="relative bg-emerald-950/50 rounded-xl p-4 border border-emerald-900/50">
          <p className="text-emerald-400 text-xs font-mono mb-3 text-center">ESP32 Circuit Board</p>

          {/* Circuit traces SVG */}
          <svg viewBox="0 0 300 80" className="w-full h-16 mb-3 opacity-30">
            <path d="M0 40 Q75 20, 150 40 T300 40" fill="none" stroke="#10b981" strokeWidth="1" />
            <path d="M0 30 L100 30 L100 50 L200 50 L200 30 L300 30" fill="none" stroke="#10b981" strokeWidth="1" />
            <circle cx="50" cy="40" r="4" fill="#10b981" />
            <circle cx="150" cy="40" r="4" fill="#10b981" />
            <circle cx="250" cy="40" r="4" fill="#10b981" />
          </svg>

          {/* Sensor buttons */}
          <div className="grid grid-cols-3 gap-3">
            {(Object.keys(SENSORS) as SensorKey[]).map((key) => {
              const sensor = SENSORS[key];
              const isActive = activeSensor === key;
              return (
                <button
                  key={key}
                  onClick={() => onSensorClick(key)}
                  className={`relative p-3 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                    isActive
                      ? `bg-gradient-to-br ${sensor.gradient} shadow-lg scale-105`
                      : "bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600"
                  }`}
                >
                  {/* Pulse effect when active */}
                  {isActive && (
                    <div className={`absolute inset-0 rounded-xl bg-gradient-to-br ${sensor.gradient} animate-ping opacity-30`} />
                  )}

                  <div className="relative flex flex-col items-center gap-1">
                    <div className={isActive ? "text-white" : sensor.textColor}>
                      {sensor.icon}
                    </div>
                    <span className={`text-xs font-semibold ${isActive ? "text-white" : "text-slate-300"}`}>
                      {key.toUpperCase()}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* LED indicators */}
        <div className="absolute top-4 right-4 flex flex-col gap-1">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50" />
          <div className="w-2 h-2 rounded-full bg-amber-500 shadow-lg shadow-amber-500/30" />
        </div>
      </div>

      {/* Instruction text */}
      <p className="text-center text-sm text-[var(--muted-foreground)] mt-6">
        <TrendingUp className="w-4 h-4 inline mr-1 text-amber-500" />
        Click on any sensor to learn how to use it
      </p>
    </div>
  );
}

// ── Sensor Detail Modal/Panel ────────────────────────────────────────────────
function SensorDetailPanel({ sensor, onClose }: { sensor: SensorKey; onClose: () => void }) {
  const data = SENSORS[sensor];

  return (
    <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className={`bg-gradient-to-r ${data.gradient} p-5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-white">
              {data.icon}
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">{data.name}</h3>
              <p className="text-white/80 text-sm">{data.subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* What it measures */}
        <div>
          <h4 className="text-sm font-semibold text-[var(--foreground)] uppercase tracking-wide mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-rose-500" />
            What It Measures
          </h4>
          <div className="flex flex-wrap gap-2">
            {data.measures.map((measure, i) => (
              <span
                key={i}
                className={`px-3 py-1.5 rounded-full text-sm font-medium ${data.bgLight} ${data.borderColor} border`}
              >
                {measure}
              </span>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <h4 className="text-sm font-semibold text-[var(--foreground)] uppercase tracking-wide mb-3 flex items-center gap-2">
            <Wind className="w-4 h-4 text-indigo-500" />
            How It Works
          </h4>
          <p className="text-[var(--muted-foreground)] text-sm leading-relaxed">
            {data.description}
          </p>
        </div>

        {/* How to use steps */}
        <div>
          <h4 className="text-sm font-semibold text-[var(--foreground)] uppercase tracking-wide mb-3 flex items-center gap-2">
            <ChevronRight className="w-4 h-4 text-emerald-500" />
            Step-by-Step Instructions
          </h4>
          <ol className="space-y-3">
            {data.howToUse.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className={`flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br ${data.gradient} text-white text-xs font-bold flex items-center justify-center`}>
                  {i + 1}
                </span>
                <span className="text-sm text-[var(--foreground)] pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* ECG electrode diagram */}
        {sensor === "ecg" && data.electrodes && (
          <div>
            <h4 className="text-sm font-semibold text-[var(--foreground)] uppercase tracking-wide mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-500" />
              Electrode Placement Guide
            </h4>
            <div className="relative bg-slate-50 dark:bg-slate-900 rounded-xl p-4 border border-[var(--border)]">
              {/* Body diagram */}
              <svg viewBox="0 0 200 280" className="w-full max-w-[200px] mx-auto">
                {/* Simple body outline */}
                <ellipse cx="100" cy="30" rx="25" ry="28" fill="none" stroke="#94a3b8" strokeWidth="2" />
                <path d="M75 55 L65 130 L40 130 L55 75 Q60 55, 75 55" fill="none" stroke="#94a3b8" strokeWidth="2" />
                <path d="M125 55 L135 130 L160 130 L145 75 Q140 55, 125 55" fill="none" stroke="#94a3b8" strokeWidth="2" />
                <path d="M75 55 L75 180 L65 260" fill="none" stroke="#94a3b8" strokeWidth="2" />
                <path d="M125 55 L125 180 L135 260" fill="none" stroke="#94a3b8" strokeWidth="2" />
                <path d="M75 55 Q100 70, 125 55" fill="none" stroke="#94a3b8" strokeWidth="2" />
                <path d="M75 180 Q100 190, 125 180" fill="none" stroke="#94a3b8" strokeWidth="2" />

                {/* RA electrode */}
                <circle cx="45" cy="100" r="12" fill="#10b981" className="animate-pulse" />
                <text x="45" y="104" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">RA</text>

                {/* LA electrode */}
                <circle cx="155" cy="100" r="12" fill="#3b82f6" className="animate-pulse" />
                <text x="155" y="104" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">LA</text>

                {/* RL electrode */}
                <circle cx="130" cy="220" r="12" fill="#f59e0b" className="animate-pulse" />
                <text x="130" y="224" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">RL</text>
              </svg>

              {/* Electrode legend */}
              <div className="mt-4 space-y-2">
                {data.electrodes.map((electrode) => (
                  <div key={electrode.label} className="flex items-start gap-3 text-sm">
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                      electrode.label === "RA" ? "bg-emerald-500" :
                      electrode.label === "LA" ? "bg-blue-500" : "bg-amber-500"
                    }`}>
                      {electrode.label}
                    </span>
                    <div>
                      <p className="font-medium text-[var(--foreground)]">{electrode.position}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">{electrode.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tips */}
        <div className={`${data.bgLight} rounded-xl p-4 border ${data.borderColor}`}>
          <p className="text-sm">
            <span className="font-semibold">Pro Tip:</span> {data.tips}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main HowToUse Page Component ─────────────────────────────────────────────
export default function AboutUs() {
  const [activeSensor, setActiveSensor] = useState<SensorKey | null>(null);

  const handleSensorClick = (sensor: SensorKey) => {
    setActiveSensor(activeSensor === sensor ? null : sensor);
  };

  return (
    <SidebarLayout role="patient">
      <div className="p-6 max-w-7xl mx-auto">
        {/* Hero section with logo */}
        <div className="text-center py-8 border-b border-[var(--border)] mb-8">
          <CardioTrixLogo />
          <p className="text-[var(--muted-foreground)] max-w-xl mx-auto">
            Learn how to use your CardioTrix wristband to monitor your cardiovascular health.
            Click on each sensor below to see detailed instructions.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 items-start">
          {/* Left: Wristband simulation */}
          <div className="lg:sticky lg:top-6">
            <AnimatedWristband
              onSensorClick={handleSensorClick}
              activeSensor={activeSensor}
            />
          </div>

          {/* Right: Sensor details */}
          <div className="space-y-4">
            {activeSensor ? (
              <SensorDetailPanel
                sensor={activeSensor}
                onClose={() => setActiveSensor(null)}
              />
            ) : (
              /* Quick overview cards when no sensor selected */
              <div className="space-y-4">
                <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">
                    Your Wristband Sensors
                  </h3>
                  <p className="text-sm text-[var(--muted-foreground)] mb-6">
                    The CardioTrix wristband is equipped with three advanced sensors to comprehensively monitor your cardiovascular health:
                  </p>

                  <div className="space-y-4">
                    {(Object.keys(SENSORS) as SensorKey[]).map((key) => {
                      const sensor = SENSORS[key];
                      return (
                        <button
                          key={key}
                          onClick={() => setActiveSensor(key)}
                          className={`w-full flex items-center gap-4 p-4 rounded-xl border ${sensor.borderColor} ${sensor.bgLight} hover:shadow-md transition-all group`}
                        >
                          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${sensor.gradient} flex items-center justify-center text-white shadow-lg`}>
                            {sensor.icon}
                          </div>
                          <div className="flex-1 text-left">
                            <h4 className="font-semibold text-[var(--foreground)]">{sensor.name}</h4>
                            <p className="text-xs text-[var(--muted-foreground)]">{sensor.subtitle}</p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-[var(--muted-foreground)] group-hover:translate-x-1 transition-transform" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Quick start guide */}
                <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-2xl p-6 text-white shadow-lg">
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Heart className="w-5 h-5" fill="currentColor" />
                    Quick Start Guide
                  </h3>
                  <ol className="space-y-2 text-sm text-rose-100">
                    <li className="flex gap-2">
                      <span className="font-bold">1.</span>
                      Wear the wristband snugly on your wrist
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold">2.</span>
                      Connect to the app via Bluetooth
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold">3.</span>
                      Use PPG for instant vitals (finger on sensor)
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold">4.</span>
                      Use PCG for heart sound analysis (sensor on chest)
                    </li>
                    <li className="flex gap-2">
                      <span className="font-bold">5.</span>
                      Use ECG for detailed cardiac readings (attach electrodes)
                    </li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
