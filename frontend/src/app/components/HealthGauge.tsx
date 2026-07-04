// src/app/components/HealthGauge.tsx
// Animated speedometer-style health score gauge

import React, { useEffect, useState } from "react";

interface HealthGaugeProps {
  score: number; // 0-100
  label?: string;
}

export default function HealthGauge({ score, label = "Health Score" }: HealthGaugeProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const [needleAngle, setNeedleAngle] = useState(-90);

  // Animate on mount and when score changes
  useEffect(() => {
    const targetAngle = -90 + (score / 100) * 180; // -90 to 90 degrees

    // Animate the score number
    const duration = 1500;
    const startTime = Date.now();
    const startScore = animatedScore;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out cubic)
      const eased = 1 - Math.pow(1 - progress, 3);

      const currentScore = Math.round(startScore + (score - startScore) * eased);
      const currentAngle = -90 + (currentScore / 100) * 180;

      setAnimatedScore(currentScore);
      setNeedleAngle(currentAngle);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [score]);

  // Determine color based on score
  const getScoreColor = () => {
    if (animatedScore >= 80) return { main: "#10b981", light: "#d1fae5", text: "Excellent" };
    if (animatedScore >= 60) return { main: "#f59e0b", light: "#fef3c7", text: "Good" };
    if (animatedScore >= 40) return { main: "#f97316", light: "#ffedd5", text: "Fair" };
    return { main: "#ef4444", light: "#fee2e2", text: "Poor" };
  };

  const colors = getScoreColor();

  return (
    <div className="relative flex flex-col items-center">
      {/* Glassmorphism container */}
      <div className="relative bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-3xl p-6 border border-white/30 dark:border-white/10 shadow-2xl">
        <svg viewBox="0 0 200 120" className="w-64 h-40">
          <defs>
            {/* Gradient for the arc */}
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="33%" stopColor="#f97316" />
              <stop offset="66%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>

            {/* Glow filter */}
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>

            {/* Drop shadow for needle */}
            <filter id="needleShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.3"/>
            </filter>
          </defs>

          {/* Background arc (gray) */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            className="stroke-slate-200 dark:stroke-slate-700"
            strokeWidth="12"
            strokeLinecap="round"
          />

          {/* Colored arc (progress) */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray="251.2"
            strokeDashoffset={251.2 - (animatedScore / 100) * 251.2}
            style={{ transition: "stroke-dashoffset 0.1s ease-out" }}
          />

          {/* Tick marks */}
          {[0, 25, 50, 75, 100].map((tick) => {
            const angle = -180 + (tick / 100) * 180;
            const rad = (angle * Math.PI) / 180;
            const x1 = 100 + 65 * Math.cos(rad);
            const y1 = 100 + 65 * Math.sin(rad);
            const x2 = 100 + 75 * Math.cos(rad);
            const y2 = 100 + 75 * Math.sin(rad);
            return (
              <g key={tick}>
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  className="stroke-slate-400 dark:stroke-slate-500"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <text
                  x={100 + 55 * Math.cos(rad)}
                  y={100 + 55 * Math.sin(rad)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-[8px] fill-slate-500 dark:fill-slate-400 font-medium"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Needle */}
          <g
            transform={`rotate(${needleAngle}, 100, 100)`}
            filter="url(#needleShadow)"
          >
            {/* Needle body */}
            <polygon
              points="100,30 95,100 100,105 105,100"
              fill={colors.main}
              filter="url(#glow)"
            />
            {/* Needle center cap */}
            <circle cx="100" cy="100" r="8" fill={colors.main} />
            <circle cx="100" cy="100" r="4" fill="white" />
          </g>

          {/* Center score display */}
          <text
            x="100"
            y="85"
            textAnchor="middle"
            className="text-3xl font-bold"
            fill={colors.main}
          >
            {animatedScore}
          </text>
        </svg>

        {/* Label and status */}
        <div className="text-center -mt-2">
          <p className="text-sm font-semibold text-slate-700 dark:text-white/90">{label}</p>
          <span
            className="inline-block mt-2 px-4 py-1.5 rounded-full text-xs font-bold shadow-sm"
            style={{ backgroundColor: colors.light, color: colors.main }}
          >
            {colors.text}
          </span>
        </div>
      </div>

      {/* Subtle pulse ring - not too distracting */}
      <div
        className="absolute inset-0 rounded-3xl opacity-10"
        style={{
          backgroundColor: colors.main,
          animation: "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite"
        }}
      />
    </div>
  );
}
