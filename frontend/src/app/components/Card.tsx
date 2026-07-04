import React from "react";

interface CardProps {
  title: string;
  value: string | number;
  unit?: string;
  className?: string;
  children?: React.ReactNode;
}

export default function Card({ title, value, unit, className = "", children }: CardProps) {
  return (
    <div className={`bg-white rounded-xl border-2 border-blue-100 p-6 shadow-lg hover:shadow-xl transition-shadow ${className}`}>
      <p className="text-sm font-semibold text-slate-600 mb-2">{title}</p>
      <p className="text-3xl font-bold text-slate-900">{value}</p>
      {unit && <p className="text-xs text-slate-500 mt-1">{unit}</p>}
      {children}
    </div>
  );
}
