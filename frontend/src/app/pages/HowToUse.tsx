// src/app/pages/HowToUse.tsx
// Animated "How to Use" guide with step-by-step visual simulation

import React, { useState, useEffect } from "react";
import { Heart, Activity, ChevronDown } from "lucide-react";
import SidebarLayout from "../components/Sidebar";

// ── Animated Step Component ──────────────────────────────────────────────────
function AnimatedStep({
  step,
  title,
  description,
  isActive,
  children
}: {
  step: number;
  title: string;
  description: string;
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`relative transition-all duration-700 ${isActive ? 'opacity-100 scale-100' : 'opacity-40 scale-95'}`}>
      <div className="flex items-start gap-6">
        {/* Step number */}
        <div className={`flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold transition-all duration-500 ${
          isActive
            ? 'bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-lg shadow-rose-500/30 scale-110'
            : 'bg-slate-800 text-slate-500'
        }`}>
          {step}
        </div>

        {/* Content */}
        <div className="flex-1">
          <h3 className={`text-xl font-bold mb-2 transition-colors duration-500 ${isActive ? 'text-white' : 'text-slate-500'}`}>
            {title}
          </h3>
          <p className={`text-sm mb-6 transition-colors duration-500 ${isActive ? 'text-slate-300' : 'text-slate-600'}`}>
            {description}
          </p>

          {/* Animation container */}
          <div className={`relative rounded-2xl overflow-hidden transition-all duration-500 ${
            isActive ? 'opacity-100' : 'opacity-30'
          }`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Person Silhouette with Wristband ─────────────────────────────────────────
function PersonWithWristband({ showPulse = false }: { showPulse?: boolean }) {
  return (
    <svg viewBox="0 0 200 300" className="w-full h-full">
      <defs>
        <linearGradient id="silhouetteGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#334155" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>
        <linearGradient id="watchGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      {/* Head */}
      <ellipse cx="100" cy="45" rx="30" ry="35" fill="url(#silhouetteGrad)" />

      {/* Neck */}
      <rect x="85" y="75" width="30" height="20" fill="url(#silhouetteGrad)" />

      {/* Body */}
      <path d="M60 95 L140 95 L150 200 L50 200 Z" fill="url(#silhouetteGrad)" />

      {/* Left arm (raised showing wristband) */}
      <path d="M60 95 L20 140 L15 180 L25 185 L35 150 L55 115" fill="url(#silhouetteGrad)" />

      {/* Wristband on left wrist */}
      <rect x="10" y="165" width="30" height="25" rx="5" fill="url(#watchGrad)" stroke="#64748b" strokeWidth="1" />

      {/* Watch screen */}
      <rect x="13" y="168" width="24" height="19" rx="3" fill="#0f172a" />

      {/* Pulse indicator on watch */}
      {showPulse && (
        <g filter="url(#glow)">
          <circle cx="25" cy="177" r="3" fill="#f43f5e" className="animate-ping" />
          <path d="M15 177 L20 177 L22 172 L25 182 L28 175 L30 177 L35 177"
            stroke="#10b981" strokeWidth="1.5" fill="none" className="animate-pulse" />
        </g>
      )}

      {/* Right arm */}
      <path d="M140 95 L170 130 L175 180 L165 185 L155 140 L145 110" fill="url(#silhouetteGrad)" />

      {/* Legs hint */}
      <path d="M70 200 L65 280 L85 280 L90 210 L110 210 L115 280 L135 280 L130 200" fill="url(#silhouetteGrad)" />
    </svg>
  );
}

// ── Step 1: Power On Animation ───────────────────────────────────────────────
function PowerOnAnimation({ isActive }: { isActive: boolean }) {
  const [powered, setPowered] = useState(false);

  useEffect(() => {
    if (isActive) {
      const timer = setTimeout(() => setPowered(true), 500);
      return () => clearTimeout(timer);
    } else {
      setPowered(false);
    }
  }, [isActive]);

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 h-64 flex items-center justify-center">
      <div className="relative">
        {/* Wristband */}
        <div className={`relative w-48 h-32 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 border-2 transition-all duration-500 ${
          powered ? 'border-emerald-500 shadow-lg shadow-emerald-500/30' : 'border-slate-600'
        }`}>
          {/* Screen */}
          <div className={`absolute inset-3 rounded-xl transition-all duration-700 ${
            powered ? 'bg-black' : 'bg-slate-900'
          }`}>
            {powered && (
              <div className="h-full flex flex-col items-center justify-center animate-in fade-in duration-500">
                <Heart className="w-8 h-8 text-rose-500 animate-pulse" fill="currentColor" />
                <span className="text-emerald-400 text-xs mt-2 font-mono">CONNECTED</span>
              </div>
            )}
          </div>

          {/* Power button */}
          <div className={`absolute -right-2 top-1/2 -translate-y-1/2 w-3 h-8 rounded-r-full transition-colors duration-300 ${
            powered ? 'bg-emerald-500' : 'bg-slate-600'
          }`} />

          {/* LED */}
          <div className={`absolute top-2 right-2 w-2 h-2 rounded-full transition-all duration-300 ${
            powered ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50 animate-pulse' : 'bg-slate-700'
          }`} />
        </div>

        {/* Strap */}
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-20 h-8 bg-slate-700 rounded-t-lg" />
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-20 h-8 bg-slate-700 rounded-b-lg" />
      </div>
    </div>
  );
}

// ── Step 2: PPG Measurement Animation ────────────────────────────────────────
function PPGAnimation({ isActive }: { isActive: boolean }) {
  const [measuring, setMeasuring] = useState(false);
  const [values, setValues] = useState({ hr: 0, spo2: 0, bp: '---/---' });

  useEffect(() => {
    if (isActive) {
      const timer1 = setTimeout(() => setMeasuring(true), 300);
      const timer2 = setTimeout(() => setValues({ hr: 72, spo2: 98, bp: '120/80' }), 1500);
      return () => { clearTimeout(timer1); clearTimeout(timer2); };
    } else {
      setMeasuring(false);
      setValues({ hr: 0, spo2: 0, bp: '---/---' });
    }
  }, [isActive]);

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 h-72">
      <div className="flex items-center gap-8 h-full">
        {/* Finger on sensor visualization */}
        <div className="relative flex-shrink-0">
          <div className="w-32 h-32 rounded-2xl bg-slate-800 border-2 border-slate-700 flex items-center justify-center overflow-hidden">
            {/* PPG Sensor */}
            <div className={`w-16 h-16 rounded-xl transition-all duration-500 ${
              measuring
                ? 'bg-gradient-to-br from-rose-500 to-red-600 shadow-lg shadow-rose-500/50'
                : 'bg-slate-700'
            }`}>
              {measuring && (
                <>
                  <div className="absolute inset-0 bg-rose-500 rounded-xl animate-ping opacity-30" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-rose-300/30 animate-pulse" />
                  </div>
                </>
              )}
            </div>

            {/* Finger silhouette */}
            {measuring && (
              <div className="absolute inset-0 flex items-center justify-center animate-in slide-in-from-top duration-500">
                <div className="w-14 h-20 bg-gradient-to-b from-slate-600 to-slate-700 rounded-t-full opacity-80" />
              </div>
            )}
          </div>
          <p className="text-center text-xs text-slate-500 mt-3">PPG Sensor</p>
        </div>

        {/* Results */}
        <div className="flex-1 grid grid-cols-3 gap-3">
          {[
            { label: 'Heart Rate', value: values.hr, unit: 'BPM', color: 'rose' },
            { label: 'SpO₂', value: values.spo2, unit: '%', color: 'indigo' },
            { label: 'Blood Pressure', value: values.bp, unit: 'mmHg', color: 'violet' },
          ].map((item, i) => (
            <div key={i} className={`p-4 rounded-xl bg-slate-800/50 border border-slate-700 transition-all duration-500 ${
              values.hr > 0 ? 'border-' + item.color + '-500/50' : ''
            }`}>
              <p className="text-xs text-slate-500 mb-1">{item.label}</p>
              <p className={`text-2xl font-mono font-bold transition-all duration-500 ${
                values.hr > 0 ? `text-${item.color}-400` : 'text-slate-600'
              }`}>
                {typeof item.value === 'number' && item.value === 0 ? '--' : item.value}
              </p>
              <p className="text-xs text-slate-600">{item.unit}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Step 3: PCG Heart Sound Animation ────────────────────────────────────────
function PCGAnimation({ isActive }: { isActive: boolean }) {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (isActive) {
      const timer = setTimeout(() => setRecording(true), 500);
      return () => clearTimeout(timer);
    } else {
      setRecording(false);
    }
  }, [isActive]);

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 h-72">
      <div className="flex items-center gap-8 h-full">
        {/* Person with sensor on chest */}
        <div className="relative flex-shrink-0 w-40 h-full">
          <svg viewBox="0 0 150 200" className="w-full h-full">
            <defs>
              <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#334155" />
                <stop offset="100%" stopColor="#1e293b" />
              </linearGradient>
            </defs>

            {/* Upper body silhouette */}
            <ellipse cx="75" cy="30" rx="25" ry="28" fill="url(#bodyGrad)" />
            <rect x="60" y="55" width="30" height="15" fill="url(#bodyGrad)" />
            <path d="M40 70 L110 70 L120 180 L30 180 Z" fill="url(#bodyGrad)" />

            {/* Heart location indicator */}
            {recording && (
              <g>
                <circle cx="65" cy="100" r="15" fill="#f43f5e" opacity="0.3" className="animate-ping" />
                <circle cx="65" cy="100" r="10" fill="#f43f5e" opacity="0.5" className="animate-pulse" />
                <Heart x="57" y="92" className="w-4 h-4 text-rose-500 animate-pulse" fill="currentColor" />
              </g>
            )}

            {/* Microphone/sensor on chest */}
            {recording && (
              <g className="animate-in slide-in-from-right duration-500">
                <circle cx="65" cy="100" r="12" fill="#6366f1" stroke="#818cf8" strokeWidth="2" />
                <circle cx="65" cy="100" r="4" fill="#c7d2fe" />
              </g>
            )}
          </svg>
        </div>

        {/* Heart sound waveform */}
        <div className="flex-1">
          <div className="bg-slate-800 rounded-xl p-4 h-48 relative overflow-hidden">
            <p className="text-xs text-slate-500 mb-2">Heart Sound (PCG)</p>

            {recording ? (
              <svg viewBox="0 0 400 100" className="w-full h-32" preserveAspectRatio="none">
                {/* S1 and S2 heart sounds pattern */}
                <path
                  d="M0 50 L20 50 L25 50 L30 20 L35 80 L40 30 L45 70 L50 50 L70 50 L75 50 L80 25 L85 75 L90 35 L95 65 L100 50
                     L120 50 L140 50 L145 50 L150 20 L155 80 L160 30 L165 70 L170 50 L190 50 L195 50 L200 25 L205 75 L210 35 L215 65 L220 50
                     L240 50 L260 50 L265 50 L270 20 L275 80 L280 30 L285 70 L290 50 L310 50 L315 50 L320 25 L325 75 L330 35 L335 65 L340 50 L400 50"
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="2"
                  className="animate-pulse"
                />

                {/* Labels */}
                <text x="35" y="95" fill="#6366f1" fontSize="10">S1</text>
                <text x="85" y="95" fill="#6366f1" fontSize="10">S2</text>
                <text x="155" y="95" fill="#6366f1" fontSize="10">S1</text>
                <text x="205" y="95" fill="#6366f1" fontSize="10">S2</text>
              </svg>
            ) : (
              <div className="h-32 flex items-center justify-center">
                <p className="text-slate-600 text-sm">Place sensor on chest to record</p>
              </div>
            )}

            {recording && (
              <div className="absolute top-4 right-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-rose-400 text-xs font-mono">RECORDING</span>
              </div>
            )}
          </div>

          {recording && (
            <p className="text-xs text-emerald-400 mt-3 animate-in fade-in duration-700">
              AI analyzing heart sounds for abnormalities...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 4: ECG Electrode Animation ──────────────────────────────────────────
function ECGAnimation({ isActive }: { isActive: boolean }) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (isActive) {
      const timer = setTimeout(() => setConnected(true), 600);
      return () => clearTimeout(timer);
    } else {
      setConnected(false);
    }
  }, [isActive]);

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 h-80">
      <div className="flex gap-6 h-full">
        {/* Body with electrodes */}
        <div className="relative flex-shrink-0 w-48">
          <svg viewBox="0 0 180 250" className="w-full h-full">
            <defs>
              <linearGradient id="bodyGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#334155" />
                <stop offset="100%" stopColor="#1e293b" />
              </linearGradient>
            </defs>

            {/* Head */}
            <ellipse cx="90" cy="25" rx="22" ry="24" fill="url(#bodyGrad2)" />

            {/* Neck */}
            <rect x="78" y="46" width="24" height="14" fill="url(#bodyGrad2)" />

            {/* Body */}
            <path d="M50 60 L130 60 L140 180 L40 180 Z" fill="url(#bodyGrad2)" />

            {/* Arms */}
            <path d="M50 60 L15 100 L10 140 L20 145 L30 110 L48 75" fill="url(#bodyGrad2)" />
            <path d="M130 60 L165 100 L170 140 L160 145 L150 110 L132 75" fill="url(#bodyGrad2)" />

            {/* Legs */}
            <path d="M60 180 L55 245 L75 245 L80 185 L100 185 L105 245 L125 245 L120 180" fill="url(#bodyGrad2)" />

            {/* RA Electrode - Right Arm */}
            {connected && (
              <g className="animate-in zoom-in duration-500">
                <circle cx="25" cy="90" r="10" fill="#10b981" />
                <text x="25" y="94" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">RA</text>
                <line x1="35" y1="90" x2="50" y2="80" stroke="#10b981" strokeWidth="2" strokeDasharray="4" className="animate-pulse" />
              </g>
            )}

            {/* LA Electrode - Left Arm */}
            {connected && (
              <g className="animate-in zoom-in duration-500 delay-200">
                <circle cx="155" cy="90" r="10" fill="#3b82f6" />
                <text x="155" y="94" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">LA</text>
                <line x1="145" y1="90" x2="130" y2="80" stroke="#3b82f6" strokeWidth="2" strokeDasharray="4" className="animate-pulse" />
              </g>
            )}

            {/* RL Electrode - Right Leg */}
            {connected && (
              <g className="animate-in zoom-in duration-500 delay-400">
                <circle cx="115" cy="210" r="10" fill="#f59e0b" />
                <text x="115" y="214" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">RL</text>
                <line x1="115" y1="200" x2="110" y2="185" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4" className="animate-pulse" />
              </g>
            )}
          </svg>
        </div>

        {/* ECG Graph */}
        <div className="flex-1 flex flex-col">
          <div className="bg-black rounded-xl p-4 flex-1 relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">ECG Reading</p>
              {connected && (
                <span className="text-emerald-400 text-xs font-mono animate-pulse">LIVE</span>
              )}
            </div>

            {connected ? (
              <svg viewBox="0 0 400 120" className="w-full h-full" preserveAspectRatio="none">
                {/* Grid */}
                <g stroke="#1e3a2f" strokeWidth="0.5" opacity="0.5">
                  {[...Array(20)].map((_, i) => (
                    <line key={`v${i}`} x1={i * 20} y1="0" x2={i * 20} y2="120" />
                  ))}
                  {[...Array(6)].map((_, i) => (
                    <line key={`h${i}`} x1="0" y1={i * 20} x2="400" y2={i * 20} />
                  ))}
                </g>

                {/* ECG waveform - PQRST pattern */}
                <path
                  d="M0 60 L30 60 L35 60 L40 55 L45 60 L50 60 L55 60 L60 60 L65 40 L70 100 L75 20 L80 60 L85 55 L95 65 L100 60
                     L130 60 L135 60 L140 55 L145 60 L150 60 L155 60 L160 60 L165 40 L170 100 L175 20 L180 60 L185 55 L195 65 L200 60
                     L230 60 L235 60 L240 55 L245 60 L250 60 L255 60 L260 60 L265 40 L270 100 L275 20 L280 60 L285 55 L295 65 L300 60
                     L330 60 L335 60 L340 55 L345 60 L350 60 L355 60 L360 60 L365 40 L370 100 L375 20 L380 60 L385 55 L395 65 L400 60"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                  className="animate-pulse"
                />
              </svg>
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-slate-600 text-sm">Attach electrodes to begin</p>
              </div>
            )}
          </div>

          {/* Electrode legend */}
          <div className="flex gap-4 mt-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-xs text-slate-400">RA: Right Arm</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-xs text-slate-400">LA: Left Arm</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="text-xs text-slate-400">RL: Right Leg</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main How To Use Page ─────────────────────────────────────────────────────
export default function HowToUse() {
  const [activeStep, setActiveStep] = useState(1);

  // Auto-advance steps
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep(prev => prev >= 4 ? 1 : prev + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const steps = [
    {
      step: 1,
      title: "Power On Your Wristband",
      description: "Press the power button to turn on your CardioTrix wristband. The LED will glow green when connected.",
      component: <PowerOnAnimation isActive={activeStep === 1} />
    },
    {
      step: 2,
      title: "Measure PPG Vitals",
      description: "Place your fingertip on the PPG sensor. Keep still for 10-15 seconds to measure heart rate, SpO₂, and blood pressure.",
      component: <PPGAnimation isActive={activeStep === 2} />
    },
    {
      step: 3,
      title: "Record Heart Sounds (PCG)",
      description: "Hold the INMP441 microphone sensor against your chest, over your heart. Stay quiet while recording for AI analysis.",
      component: <PCGAnimation isActive={activeStep === 3} />
    },
    {
      step: 4,
      title: "Capture ECG Reading",
      description: "Attach the 3 electrode pads: RA (right arm), LA (left arm), RL (right leg). Relax and stay still during measurement.",
      component: <ECGAnimation isActive={activeStep === 4} />
    }
  ];

  return (
    <SidebarLayout role="patient">
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        {/* Hero Header */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-rose-500/10 via-transparent to-indigo-500/10" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-rose-500/20 rounded-full blur-3xl opacity-30" />

          <div className="relative px-8 py-12 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-500/10 border border-rose-500/20 mb-6">
              <Heart className="w-4 h-4 text-rose-500" fill="currentColor" />
              <span className="text-rose-400 text-sm font-medium">CardioTrix Wristband Guide</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              How to Use Your
              <span className="block mt-2 bg-gradient-to-r from-rose-400 via-rose-500 to-indigo-500 bg-clip-text text-transparent">
                Health Monitor
              </span>
            </h1>

            <p className="text-slate-400 max-w-2xl mx-auto text-lg">
              Follow these simple steps to monitor your cardiovascular health with precision
            </p>

            {/* Step indicators */}
            <div className="flex items-center justify-center gap-3 mt-8">
              {[1, 2, 3, 4].map((num) => (
                <button
                  key={num}
                  onClick={() => setActiveStep(num)}
                  className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold transition-all duration-300 ${
                    activeStep === num
                      ? 'bg-gradient-to-br from-rose-500 to-rose-600 text-white scale-110 shadow-lg shadow-rose-500/30'
                      : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>

            <ChevronDown className="w-6 h-6 text-slate-600 mx-auto mt-8 animate-bounce" />
          </div>
        </div>

        {/* Steps */}
        <div className="px-8 pb-16 max-w-5xl mx-auto space-y-12">
          {steps.map((step) => (
            <AnimatedStep
              key={step.step}
              step={step.step}
              title={step.title}
              description={step.description}
              isActive={activeStep === step.step}
            >
              {step.component}
            </AnimatedStep>
          ))}
        </div>

        {/* Footer CTA */}
        <div className="px-8 pb-16">
          <div className="max-w-3xl mx-auto text-center p-8 rounded-3xl bg-gradient-to-r from-rose-500/10 via-indigo-500/10 to-emerald-500/10 border border-white/10">
            <Activity className="w-12 h-12 text-rose-400 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-white mb-2">Ready to Monitor Your Health?</h3>
            <p className="text-slate-400 mb-6">
              Your CardioTrix wristband provides comprehensive cardiovascular monitoring with medical-grade sensors.
            </p>
            <div className="flex items-center justify-center gap-4 text-sm">
              <span className="px-3 py-1 rounded-full bg-rose-500/20 text-rose-400">PPG Sensor</span>
              <span className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-400">PCG Microphone</span>
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400">ECG Electrodes</span>
            </div>
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
