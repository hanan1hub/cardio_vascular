// src/app/components/TrendCharts.tsx
import React, { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

export interface TrendReading {
  id: string;
  hr?: number | null;
  spo2?: number | null;
  sbp?: number | null;
  dbp?: number | null;
  blood_sugar?: number | null;
  timestamp: any;
  type: string;
  ecg_samples?: number[];
  ecg_result?: string | null;
  ecg_probability?: number | null;
  ecg_windows?: any[] | null;
  isHistorical?: boolean;
}

function syntheticEcg(seed: number, n = 1250): number[] {
  let s = (seed >>> 0) || 1;
  const rand = () => { s = ((s * 1664525 + 1013904223) | 0); return (s >>> 0) / 4294967295; };
  const spb = 208; // ~72 BPM at 250 Hz
  return Array.from({ length: n }, (_, i) => {
    const ph = (i % spb) / spb;
    let v = 0;
    if (ph < 0.12)                   v = 0.15 * Math.sin(ph / 0.12 * Math.PI);
    else if (ph < 0.29)              v = 0;
    else if (ph < 0.30)              v = -0.1;
    else if (ph < 0.33)              v = Math.sin((ph - 0.30) / 0.03 * Math.PI);
    else if (ph < 0.35)              v = -0.2;
    else if (ph > 0.50 && ph < 0.72) v = 0.3 * Math.sin((ph - 0.50) / 0.22 * Math.PI);
    return v + (rand() - 0.5) * 0.05;
  });
}

export function generateHistoricalData(patientId: string, email?: string | null): TrendReading[] {
  const result: TrendReading[] = [];
  const now = new Date();
  let seed = (patientId.split("").reduce((a, c) => a + c.charCodeAt(0), 0) || 12345);
  const rand = () => { seed = ((seed * 1664525 + 1013904223) | 0); return (seed >>> 0) / 4294967295; };
  const isP1 = email === "patient1@gmail.com";

  for (let day = 1; day <= 14; day++) {
    const base = new Date(now);
    base.setDate(base.getDate() - day);
    const n = Math.floor(rand() * 2) + 1;
    const recentWeek = day <= 7;

    for (let j = 0; j < n; j++) {
      const d = new Date(base);
      d.setHours(8 + j * 8, Math.floor(rand() * 60), 0, 0);

      let sbp: number, dbp: number;
      if (isP1 && recentWeek) {
        const highDay = rand() > 0.28; // ~70% high-BP days
        sbp = highDay ? Math.round(138 + rand() * 26) : Math.round(112 + rand() * 12);
        dbp = highDay ? Math.round(88  + rand() * 14) : Math.round(70  + rand() * 10);
      } else {
        sbp = Math.round(108 + rand() * 14);
        dbp = Math.round(68  + rand() * 12);
      }

      result.push({
        id: `hist-${day}-${j}-${patientId.slice(0, 4)}`,
        hr:   Math.round(65 + rand() * 20),
        spo2: Math.round((97 + rand() * 2) * 10) / 10,
        sbp, dbp,
        timestamp: { toDate: () => new Date(d) },
        type: "vitals",
        isHistorical: true,
      });
    }

    // ECG recording every 3 days (more frequent for p1 during recent week)
    const addEcg = day % 3 === 0 || (isP1 && recentWeek && day % 2 === 0);
    if (addEcg) {
      const et = new Date(base); et.setHours(14, 0, 0, 0);
      const ecgSeed = (seed ^ (day * 2654435761)) >>> 0;
      const abnormal = isP1 && recentWeek && rand() > 0.35;
      result.push({
        id: `hist-ecg-${day}-${patientId.slice(0, 4)}`,
        timestamp: { toDate: () => new Date(et) },
        type: "ecg_recording",
        ecg_samples: syntheticEcg(ecgSeed),
        ecg_result: abnormal ? "ABNORMAL" : "NORMAL",
        ecg_probability: abnormal
          ? Math.round((0.60 + rand() * 0.30) * 100) / 100
          : Math.round((0.08 + rand() * 0.28) * 100) / 100,
        isHistorical: true,
      });
    }
  }
  // ── Specific entries for May 1–4, 2026 ──────────────────────────────────────
  // patient1 gets elevated BP (consistent with the high-BP recent-week pattern)
  const p1  = isP1;
  const MAY = [
    // May 1
    { date: [2026,4,1], h: 7,  m: 45, type: "vitals",     hr: 72, spo2: 98.2, sbp: p1?148:118, dbp: p1?94:76  },
    { date: [2026,4,1], h: 8,  m: 10, type: "blood_sugar", bs: 94,  spo2: 98.1, sbp: p1?147:117, dbp: p1?93:75 },
    { date: [2026,4,1], h: 12, m: 30, type: "vitals",     hr: 76, spo2: 97.6, sbp: p1?152:122, dbp: p1?97:79  },
    { date: [2026,4,1], h: 14, m: 20, type: "vitals",     hr: 68, spo2: 97.9, sbp: p1?144:121, dbp: p1?91:78  },
    { date: [2026,4,1], h: 20, m: 0,  type: "blood_sugar", bs: 138, spo2: 97.7, sbp: p1?150:120, dbp: p1?95:77 },
    { date: [2026,4,1], h: 21, m: 10, type: "vitals",     hr: 70, spo2: 98.1, sbp: p1?146:119, dbp: p1?93:77  },
    // May 2
    { date: [2026,4,2], h: 7,  m: 30, type: "vitals",     hr: 74, spo2: 98.5, sbp: p1?142:116, dbp: p1?89:74  },
    { date: [2026,4,2], h: 8,  m: 5,  type: "blood_sugar", bs: 89,  spo2: 98.4, sbp: p1?141:115, dbp: p1?88:73 },
    { date: [2026,4,2], h: 12, m: 0,  type: "vitals",     hr: 78, spo2: 97.7, sbp: p1?156:120, dbp: p1?98:76  },
    { date: [2026,4,2], h: 13, m: 0,  type: "ecg_recording" },
    { date: [2026,4,2], h: 19, m: 30, type: "vitals",     hr: 71, spo2: 98.1, sbp: p1?150:119, dbp: p1?95:77  },
    { date: [2026,4,2], h: 21, m: 15, type: "blood_sugar", bs: 142, spo2: 97.9, sbp: p1?152:121, dbp: p1?96:78 },
    // May 3
    { date: [2026,4,3], h: 8,  m: 0,  type: "vitals",     hr: 70, spo2: 98.3, sbp: p1?138:117, dbp: p1?88:75  },
    { date: [2026,4,3], h: 8,  m: 30, type: "blood_sugar", bs: 91,  spo2: 98.2, sbp: p1?139:116, dbp: p1?87:74 },
    { date: [2026,4,3], h: 13, m: 15, type: "vitals",     hr: 73, spo2: 97.5, sbp: p1?149:118, dbp: p1?93:75  },
    { date: [2026,4,3], h: 15, m: 0,  type: "ecg_recording" },
    { date: [2026,4,3], h: 20, m: 45, type: "vitals",     hr: 75, spo2: 97.8, sbp: p1?145:120, dbp: p1?92:78  },
    // May 4
    { date: [2026,4,4], h: 7,  m: 55, type: "vitals",     hr: 73, spo2: 98.4, sbp: p1?141:115, dbp: p1?90:73  },
    { date: [2026,4,4], h: 8,  m: 20, type: "blood_sugar", bs: 87,  spo2: 98.5, sbp: p1?140:114, dbp: p1?89:72 },
    { date: [2026,4,4], h: 12, m: 0,  type: "ecg_recording" },
    { date: [2026,4,4], h: 13, m: 30, type: "vitals",     hr: 77, spo2: 97.4, sbp: p1?153:121, dbp: p1?96:77  },
    { date: [2026,4,4], h: 20, m: 0,  type: "blood_sugar", bs: 128, spo2: 97.6, sbp: p1?148:119, dbp: p1?94:76 },
    { date: [2026,4,4], h: 21, m: 0,  type: "vitals",     hr: 69, spo2: 98.0, sbp: p1?147:118, dbp: p1?92:76  },
  ];

  MAY.forEach((e, i) => {
    const d = new Date(e.date[0], e.date[1], e.date[2], e.h, e.m, 0, 0);
    const key = `may-${i}-${patientId.slice(0, 4)}`;
    if (result.find(r => r.id === key)) return;

    if (e.type === "blood_sugar") {
      const bse = e as any;
      result.push({
        id: key,
        timestamp: { toDate: () => new Date(d) },
        type: "blood_sugar",
        blood_sugar: bse.bs,
        spo2: bse.spo2 ?? null,
        sbp:  bse.sbp  ?? null,
        dbp:  bse.dbp  ?? null,
        isHistorical: true,
      });
    } else if (e.type === "ecg_recording") {
      const ecgSeed = (seed ^ (i * 2654435761 + 99)) >>> 0;
      const abnormal = isP1 && rand() > 0.5;
      result.push({
        id: key,
        timestamp: { toDate: () => new Date(d) },
        type: "ecg_recording",
        ecg_samples: syntheticEcg(ecgSeed),
        ecg_result: abnormal ? "ABNORMAL" : "NORMAL",
        ecg_probability: abnormal
          ? Math.round((0.55 + rand() * 0.35) * 100) / 100
          : Math.round((0.06 + rand() * 0.18) * 100) / 100,
        isHistorical: true,
      });
    } else {
      const v = rand() * 2 - 1;  // ±1 small variation
      result.push({
        id: key,
        hr:   Math.round((e as any).hr   + v),
        spo2: parseFloat(((e as any).spo2 + v * 0.05).toFixed(1)),
        sbp:  Math.round((e as any).sbp  + v),
        dbp:  Math.round((e as any).dbp  + v * 0.5),
        timestamp: { toDate: () => new Date(d) },
        type: "vitals",
        isHistorical: true,
      });
    }
  });

  return result;
}

function useChartData(readings: TrendReading[], period: "week" | "month" | "year") {
  return useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now);
    if (period === "week")  cutoff.setDate(cutoff.getDate() - 7);
    else if (period === "month") cutoff.setDate(cutoff.getDate() - 30);
    else cutoff.setFullYear(cutoff.getFullYear() - 1);

    const grouped: Record<string, { hr: number[]; spo2: number[]; sbp: number[]; dbp: number[] }> = {};
    readings.filter(r => r.type === "vitals").forEach(r => {
      const d = r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp);
      if (d < cutoff) return;
      const k = period === "year"
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        : d.toISOString().split("T")[0];
      if (!grouped[k]) grouped[k] = { hr: [], spo2: [], sbp: [], dbp: [] };
      if (r.hr)   grouped[k].hr.push(r.hr);
      if (r.spo2) grouped[k].spo2.push(r.spo2);
      if (r.sbp)  grouped[k].sbp.push(r.sbp);
      if (r.dbp)  grouped[k].dbp.push(r.dbp);
    });

    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b) / arr.length * 10) / 10 : null;

    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({
        date: period === "year" ? k : k.slice(5),
        hr: avg(v.hr), spo2: avg(v.spo2), sbp: avg(v.sbp), dbp: avg(v.dbp),
      }));
  }, [readings, period]);
}

const hrColor   = (v: number) => v < 60 ? "#3b82f6" : v > 100 ? "#ef4444" : "#10b981";
const spo2Color = (v: number) => v < 90 ? "#ef4444" : v < 95 ? "#3b82f6" : "#10b981";
const sbpColor  = (v: number) => v >= 130 ? "#ef4444" : v < 90 ? "#3b82f6" : "#10b981";
const dbpColor  = (v: number) => v >= 85  ? "#ef4444" : v < 60 ? "#3b82f6" : "#10b981";

const SbpDot  = (p: any) => (p.cx != null && p.payload.sbp)  ? <circle cx={p.cx} cy={p.cy} r={3.5} fill={sbpColor(p.payload.sbp)} /> : null;
const DbpDot  = (p: any) => (p.cx != null && p.payload.dbp)  ? <circle cx={p.cx} cy={p.cy} r={3.5} fill={dbpColor(p.payload.dbp)} opacity={0.8} /> : null;
const HrDot   = (p: any) => (p.cx != null && p.payload.hr)   ? <circle cx={p.cx} cy={p.cy} r={3.5} fill={hrColor(p.payload.hr)} /> : null;
const Spo2Dot = (p: any) => (p.cx != null && p.payload.spo2) ? <circle cx={p.cx} cy={p.cy} r={3.5} fill={spo2Color(p.payload.spo2)} /> : null;

export function EcgWave({ samples }: { samples: number[] }) {
  if (!samples?.length) return (
    <div className="h-20 bg-slate-800 rounded-lg flex items-center justify-center">
      <p className="text-xs text-emerald-400 text-center px-2">
        No ECG recording saved.<br />
        <span className="text-[10px] text-slate-500">Record 30s from Dashboard → Save to History</span>
      </p>
    </div>
  );
  const H = 80;
  const W = Math.max(600, samples.length * 1.5);
  const min = Math.min(...samples), max = Math.max(...samples), range = max - min || 1;
  const pts = samples.map((v, i) =>
    `${(i / (samples.length - 1) * W).toFixed(1)},${(H - ((v - min) / range) * H * 0.85 - H * 0.075).toFixed(1)}`
  ).join(" ");
  return (
    <div className="overflow-x-auto bg-slate-900 rounded-lg p-2" style={{ cursor: "grab" }}>
      <svg width={W} height={H} className="block">
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1="0" y1={H * f} x2={W} y2={H * f} stroke="#1e293b" strokeWidth="1" />
        ))}
        <polyline points={pts} fill="none" stroke="#34d399" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// Bar fill color helpers — green=normal, red=high, blue=low
function bpBarFill(entry: any, key: "sbp" | "dbp") {
  const v = entry[key];
  if (!v) return "#e5e7eb";
  return key === "sbp" ? sbpColor(v) : dbpColor(v);
}
function hrBarFill(entry: any) { return !entry.hr ? "#e5e7eb" : hrColor(entry.hr); }
function spo2BarFill(entry: any) { return !entry.spo2 ? "#e5e7eb" : spo2Color(entry.spo2); }

export function TrendCharts({ readings }: { readings: TrendReading[] }) {
  const [period,    setPeriod]    = useState<"week" | "month" | "year">("week");
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const data = useChartData(readings, period);
  const ts = { backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "11px" };
  const mg = { top: 4, right: 4, bottom: 0, left: -25 };

  const latestEcg = readings
    .filter(r => r.type === "ecg_recording" && r.ecg_samples?.length)
    .sort((a, b) => {
      const ta = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
      const tb = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
      return tb.getTime() - ta.getTime();
    })[0];

  const isBar = chartType === "bar";

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">Trend Analysis</h3>
        <div className="flex items-center gap-2">
          {/* Chart type toggle */}
          <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs font-medium">
            <button
              onClick={() => setChartType("line")}
              className={`px-3 py-1.5 transition-colors ${!isBar ? "bg-rose-500 text-white" : "bg-[var(--card)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"}`}
            >
              Line
            </button>
            <button
              onClick={() => setChartType("bar")}
              className={`px-3 py-1.5 transition-colors ${isBar ? "bg-rose-500 text-white" : "bg-[var(--card)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"}`}
            >
              Bar
            </button>
          </div>
          {/* Period dropdown */}
          <div className="relative">
            <select
              value={period}
              onChange={e => setPeriod(e.target.value as any)}
              className="appearance-none pl-3 pr-8 py-1.5 text-xs border border-[var(--border)] rounded-lg bg-[var(--card)] text-[var(--foreground)] cursor-pointer focus:outline-none focus:ring-1 focus:ring-rose-500"
            >
              <option value="week">Last Week</option>
              <option value="month">Last Month</option>
              <option value="year">Last Year</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--muted-foreground)] pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* BP */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs font-semibold text-violet-600 mb-2">Blood Pressure (mmHg)</p>
          <ResponsiveContainer width="100%" height={130}>
            {isBar ? (
              <BarChart data={data} margin={mg}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="var(--border)" />
                <YAxis domain={[50, 170]} tick={{ fontSize: 9 }} stroke="var(--border)" />
                <Tooltip contentStyle={ts} />
                <Bar dataKey="sbp" name="SBP" maxBarSize={16}>
                  {data.map((e, i) => <Cell key={i} fill={bpBarFill(e, "sbp")} />)}
                </Bar>
                <Bar dataKey="dbp" name="DBP" maxBarSize={16}>
                  {data.map((e, i) => <Cell key={i} fill={bpBarFill(e, "dbp")} opacity={0.65} />)}
                </Bar>
              </BarChart>
            ) : (
              <LineChart data={data} margin={mg}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="var(--border)" />
                <YAxis domain={[50, 170]} tick={{ fontSize: 9 }} stroke="var(--border)" />
                <Tooltip contentStyle={ts} />
                <Line type="monotone" dataKey="sbp" stroke="#8b5cf6" strokeWidth={2} dot={(p: any) => <SbpDot {...p} />} name="SBP" connectNulls />
                <Line type="monotone" dataKey="dbp" stroke="#c4b5fd" strokeWidth={2} dot={(p: any) => <DbpDot {...p} />} name="DBP" connectNulls />
              </LineChart>
            )}
          </ResponsiveContainer>
          <div className="flex gap-3 mt-1 flex-wrap">
            <span className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]"><span className="w-2 h-2 rounded-full inline-block bg-emerald-500" />Normal</span>
            <span className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]"><span className="w-2 h-2 rounded-full inline-block bg-red-500" />High</span>
            <span className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]"><span className="w-2 h-2 rounded-full inline-block bg-blue-500" />Low</span>
          </div>
        </div>

        {/* ECG Waveform */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs font-semibold text-emerald-600 mb-2">ECG Waveform — Latest Recording</p>
          {latestEcg && (
            <p className="text-[10px] text-[var(--muted-foreground)] mb-1">
              {(latestEcg.timestamp?.toDate ? latestEcg.timestamp.toDate() : new Date(latestEcg.timestamp)).toLocaleString()}
              {" · "}{latestEcg.ecg_samples!.length} samples · scroll →
            </p>
          )}
          <EcgWave samples={latestEcg?.ecg_samples || []} />
        </div>

        {/* HR */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs font-semibold text-rose-600 mb-2">Heart Rate (BPM)</p>
          <ResponsiveContainer width="100%" height={130}>
            {isBar ? (
              <BarChart data={data} margin={mg}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="var(--border)" />
                <YAxis domain={[40, 130]} tick={{ fontSize: 9 }} stroke="var(--border)" />
                <Tooltip contentStyle={ts} />
                <Bar dataKey="hr" name="HR (BPM)" maxBarSize={20}>
                  {data.map((e, i) => <Cell key={i} fill={hrBarFill(e)} />)}
                </Bar>
              </BarChart>
            ) : (
              <LineChart data={data} margin={mg}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="var(--border)" />
                <YAxis domain={[40, 130]} tick={{ fontSize: 9 }} stroke="var(--border)" />
                <Tooltip contentStyle={ts} />
                <Line type="monotone" dataKey="hr" stroke="#f43f5e" strokeWidth={2} dot={(p: any) => <HrDot {...p} />} name="HR (BPM)" connectNulls />
              </LineChart>
            )}
          </ResponsiveContainer>
          <div className="flex gap-3 mt-1 flex-wrap">
            <span className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]"><span className="w-2 h-2 rounded-full inline-block bg-emerald-500" />60–100 Normal</span>
            <span className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]"><span className="w-2 h-2 rounded-full inline-block bg-red-500" />&gt;100 High</span>
            <span className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]"><span className="w-2 h-2 rounded-full inline-block bg-blue-500" />&lt;60 Low</span>
          </div>
        </div>

        {/* SpO2 */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs font-semibold text-indigo-600 mb-2">SpO₂ (%)</p>
          <ResponsiveContainer width="100%" height={130}>
            {isBar ? (
              <BarChart data={data} margin={mg}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="var(--border)" />
                <YAxis domain={[85, 100]} tick={{ fontSize: 9 }} stroke="var(--border)" />
                <Tooltip contentStyle={ts} />
                <Bar dataKey="spo2" name="SpO₂ (%)" maxBarSize={20}>
                  {data.map((e, i) => <Cell key={i} fill={spo2BarFill(e)} />)}
                </Bar>
              </BarChart>
            ) : (
              <LineChart data={data} margin={mg}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="var(--border)" />
                <YAxis domain={[85, 100]} tick={{ fontSize: 9 }} stroke="var(--border)" />
                <Tooltip contentStyle={ts} />
                <Line type="monotone" dataKey="spo2" stroke="#6366f1" strokeWidth={2} dot={(p: any) => <Spo2Dot {...p} />} name="SpO₂ (%)" connectNulls />
              </LineChart>
            )}
          </ResponsiveContainer>
          <div className="flex gap-2 mt-1 flex-wrap">
            <span className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]"><span className="w-2 h-2 rounded-full inline-block bg-emerald-500" />≥95 Normal</span>
            <span className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]"><span className="w-2 h-2 rounded-full inline-block bg-blue-500" />90–94 Low</span>
            <span className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]"><span className="w-2 h-2 rounded-full inline-block bg-red-500" />&lt;90 Critical</span>
          </div>
        </div>
      </div>
    </div>
  );
}
