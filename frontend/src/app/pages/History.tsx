// src/app/pages/History.tsx
import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { Calendar, ChevronLeft, ChevronRight, Activity, Droplets } from "lucide-react";
import SidebarLayout from "../components/Sidebar";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../../firebase";
import { TrendCharts, EcgWave, generateHistoricalData, TrendReading } from "../components/TrendCharts";

interface SavedReading extends TrendReading {
  mean_bp?: number | null;
}

function CompactCalendar({
  readings, selectedDate, onSelectDate,
}: {
  readings: SavedReading[];
  selectedDate: Date | null;
  onSelectDate: (d: Date) => void;
}) {
  const [month, setMonth] = useState(new Date());
  const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const firstDay    = new Date(month.getFullYear(), month.getMonth(), 1).getDay();

  const dayReadings = (day: number) => readings.filter(r => {
    if (!r.timestamp) return false;
    const d = r.timestamp.toDate ? r.timestamp.toDate() : new Date(r.timestamp);
    return d.getDate() === day && d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
  });

  const isSel = (day: number) =>
    !!selectedDate && selectedDate.getDate() === day &&
    selectedDate.getMonth() === month.getMonth() && selectedDate.getFullYear() === month.getFullYear();

  const isToday = (day: number) => {
    const t = new Date();
    return t.getDate() === day && t.getMonth() === month.getMonth() && t.getFullYear() === month.getFullYear();
  };

  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          className="p-1 hover:bg-[var(--muted)] rounded-lg">
          <ChevronLeft className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
        </button>
        <span className="text-xs font-semibold text-[var(--foreground)]">
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </span>
        <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          className="p-1 hover:bg-[var(--muted)] rounded-lg">
          <ChevronRight className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DAYS.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-[var(--muted-foreground)]">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const sel = isSel(day);
          const tod = isToday(day);
          const dr  = dayReadings(day);
          const hasVitals = dr.some(r => r.type === "vitals");
          const hasBs     = dr.some(r => r.type === "blood_sugar");
          const hasEcg    = dr.some(r => r.type === "ecg_recording");
          return (
            <button key={day}
              onClick={() => onSelectDate(new Date(month.getFullYear(), month.getMonth(), day))}
              className={`relative w-7 h-7 mx-auto flex flex-col items-center justify-center rounded-lg text-[11px] font-medium transition-all ${
                sel ? "bg-rose-500 text-white" :
                tod ? "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400" :
                dr.length > 0 ? "hover:bg-emerald-50 dark:hover:bg-emerald-900/20" :
                "hover:bg-[var(--muted)]"
              }`}
            >
              {day}
              {dr.length > 0 && !sel && (
                <div className="absolute bottom-0.5 flex gap-0.5">
                  {hasVitals && <div className="w-1 h-1 rounded-full bg-rose-400" />}
                  {hasBs     && <div className="w-1 h-1 rounded-full bg-amber-400" />}
                  {hasEcg    && <div className="w-1 h-1 rounded-full bg-emerald-400" />}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-[var(--border)] justify-center">
        {[["bg-rose-400","Vitals"],["bg-amber-400","Blood Sugar"],["bg-emerald-400","ECG"]].map(([c,l])=>(
          <span key={l} className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]">
            <span className={`w-1.5 h-1.5 rounded-full ${c} inline-block`}/>{l}
          </span>
        ))}
      </div>
    </div>
  );
}

function ReadingCard({ reading }: { reading: SavedReading }) {
  const time = reading.timestamp?.toDate
    ? reading.timestamp.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";

  if (reading.type === "ecg_recording") {
    const res = reading.ecg_result;
    return (
      <div className="bg-slate-900 rounded-xl p-3 border border-slate-700 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-emerald-700 flex items-center justify-center">
              <Activity className="w-3 h-3 text-white" />
            </div>
            <p className="text-xs font-semibold text-emerald-400">ECG Recording</p>
            {res && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                res === "NORMAL"
                  ? "bg-emerald-900 text-emerald-300"
                  : "bg-red-900 text-red-300"
              }`}>
                {res === "NORMAL" ? "✓ Normal" : "⚠ Abnormal"}
                {reading.ecg_probability != null && ` · ${(reading.ecg_probability * 100).toFixed(0)}%`}
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-400">{time}</p>
        </div>
        {reading.ecg_windows && reading.ecg_windows.length > 1 && (
          <div className="flex gap-1.5 flex-wrap">
            {reading.ecg_windows.map((w: any) => (
              <span key={w.window} className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                w.decision === "NORMAL" ? "bg-emerald-900 text-emerald-400" : "bg-red-900 text-red-400"
              }`}>
                {w.t_start}s: {w.decision}
              </span>
            ))}
          </div>
        )}
        <p className="text-[10px] text-slate-500">
          {reading.ecg_samples?.length || 0} samples · ~{((reading.ecg_samples?.length || 0) / 250).toFixed(1)}s · scroll →
        </p>
        <EcgWave samples={reading.ecg_samples || []} />
      </div>
    );
  }

  if (reading.type === "blood_sugar") {
    return (
      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 border border-amber-200 dark:border-amber-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center">
              <Droplets className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="text-[10px] text-[var(--muted-foreground)]">Blood Sugar</p>
              <p className="text-base font-bold text-amber-600">{reading.blood_sugar} <span className="text-xs font-normal">mg/dL</span></p>
            </div>
          </div>
          <p className="text-[10px] text-[var(--muted-foreground)]">{time}</p>
        </div>
      </div>
    );
  }

  const hrColor  = (v: number) => v < 60 ? "text-blue-500" : v > 100 ? "text-red-500" : "text-emerald-500";
  const spo2Color = (v: number) => v < 90 ? "text-red-500" : v < 95 ? "text-blue-500" : "text-emerald-500";
  const bpColor  = (sbp: number, dbp: number) =>
    sbp >= 130 || dbp >= 85 ? "text-red-500" :
    sbp < 90  || dbp < 60  ? "text-blue-500" : "text-emerald-500";

  const HS_LABEL: Record<string, { full: string; color: string; bg: string }> = {
    N:   { full: "Normal",                color: "text-emerald-700", bg: "bg-emerald-100" },
    AS:  { full: "Aortic Stenosis",       color: "text-red-700",     bg: "bg-red-100"     },
    MR:  { full: "Mitral Regurgitation",  color: "text-orange-700",  bg: "bg-orange-100"  },
    MS:  { full: "Mitral Stenosis",       color: "text-amber-700",   bg: "bg-amber-100"   },
    MVP: { full: "Mitral Valve Prolapse", color: "text-purple-700",  bg: "bg-purple-100"  },
  };
  const hs = (reading as any).heart_sound_type ? HS_LABEL[(reading as any).heart_sound_type] : null;

  return (
    <div className="rounded-xl p-3 border bg-[var(--muted)] border-[var(--border)] min-w-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded-lg bg-rose-500 flex items-center justify-center">
            <Activity className="w-3 h-3 text-white" />
          </div>
          <p className="text-xs font-semibold text-[var(--foreground)]">Vitals</p>
        </div>
        <p className="text-[10px] text-[var(--muted-foreground)]">{time}</p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-[var(--muted-foreground)]">HR</p>
          <p className={`text-base font-bold ${reading.hr ? hrColor(reading.hr) : "text-slate-300"}`}>{reading.hr ?? "—"}</p>
          <p className="text-[9px] text-[var(--muted-foreground)]">BPM</p>
        </div>
        <div>
          <p className="text-[10px] text-[var(--muted-foreground)]">SpO₂</p>
          <p className={`text-base font-bold ${reading.spo2 ? spo2Color(reading.spo2) : "text-slate-300"}`}>{reading.spo2 ?? "—"}</p>
          <p className="text-[9px] text-[var(--muted-foreground)]">%</p>
        </div>
        <div>
          <p className="text-[10px] text-[var(--muted-foreground)]">BP</p>
          <p className={`text-sm font-bold ${reading.sbp && reading.dbp ? bpColor(reading.sbp, reading.dbp) : "text-slate-300"}`}>
            {reading.sbp && reading.dbp ? `${reading.sbp}/${reading.dbp}` : "—"}
          </p>
          <p className="text-[9px] text-[var(--muted-foreground)]">mmHg</p>
        </div>
      </div>
      {hs && (
        <div className="mt-1.5 pt-1.5 border-t border-[var(--border)] flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] text-[var(--muted-foreground)] shrink-0">PCG:</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full truncate ${hs.bg} ${hs.color}`}>{hs.full}</span>
          {(reading as any).heart_sound_confidence != null && (
            <span className="text-[10px] text-[var(--muted-foreground)] ml-auto shrink-0">{((reading as any).heart_sound_confidence * 100).toFixed(0)}%</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function History() {
  const navigate = useNavigate();
  const [userId, setUserId]           = useState<string | null>(null);
  const [userEmail, setUserEmail]     = useState<string | null>(null);
  const [readings, setReadings]       = useState<SavedReading[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [loading, setLoading]         = useState(true);

  const historicalData = useMemo(() => userId ? generateHistoricalData(userId, userEmail) as SavedReading[] : [], [userId, userEmail]);
  const allReadings = useMemo(() => [...historicalData, ...readings].sort((a, b) => {
    const ta = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
    const tb = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
    return tb.getTime() - ta.getTime();
  }), [historicalData, readings]);

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    const unsubAuth = onAuthStateChanged(auth, user => {
      if (!user) { navigate("/login"); return; }
      setUserId(user.uid);
      setUserEmail(user.email);
      const pid = user.uid;

      // No orderBy — avoids composite index requirement; sort in JS
      const q1 = query(collection(db, "savedReadings"), where("patientId", "==", pid));
      unsubs.push(onSnapshot(q1, snap => {
        const data: SavedReading[] = [];
        snap.forEach(d => data.push({ id: d.id, ...d.data() } as SavedReading));
        setReadings(prev => {
          const bs = prev.filter(r => r.type === "blood_sugar");
          return [...data, ...bs].sort((a, b) => {
            const ta = a.timestamp?.toDate?.() || new Date(a.timestamp);
            const tb = b.timestamp?.toDate?.() || new Date(b.timestamp);
            return tb.getTime() - ta.getTime();
          });
        });
        setLoading(false);
      }));

      const q2 = query(collection(db, "bloodSugarReadings"), where("patientId", "==", pid));
      unsubs.push(onSnapshot(q2, snap => {
        const bs: SavedReading[] = [];
        snap.forEach(d => bs.push({ id: d.id, ...d.data(), type: "blood_sugar" } as SavedReading));
        setReadings(prev => {
          const vitals = prev.filter(r => r.type !== "blood_sugar");
          return [...vitals, ...bs].sort((a, b) => {
            const ta = a.timestamp?.toDate?.() || new Date(a.timestamp);
            const tb = b.timestamp?.toDate?.() || new Date(b.timestamp);
            return tb.getTime() - ta.getTime();
          });
        });
      }));
    });
    return () => { unsubAuth(); unsubs.forEach(u => u()); };
  }, [navigate]);

  const selectedReadings = selectedDate
    ? allReadings.filter(r => {
        if (!r.timestamp) return false;
        const d = r.timestamp.toDate ? r.timestamp.toDate() : new Date(r.timestamp);
        return d.getDate() === selectedDate.getDate() &&
               d.getMonth() === selectedDate.getMonth() &&
               d.getFullYear() === selectedDate.getFullYear();
      })
    : [];

  const formatDate = () => {
    if (!selectedDate) return "";
    const today = new Date();
    if (selectedDate.toDateString() === today.toDateString()) return "Today";
    const yest = new Date(today); yest.setDate(today.getDate() - 1);
    if (selectedDate.toDateString() === yest.toDateString()) return "Yesterday";
    return selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  };

  const realReadings = readings.filter(r => !r.isHistorical);

  return (
    <SidebarLayout role="patient">
      <div className="p-6 max-w-7xl mx-auto space-y-5">
        <div>
          <p className="text-xs font-semibold text-rose-500 uppercase tracking-widest mb-1">Health Records</p>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Reading History</h1>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Showing data history</p>
        </div>

        {/* Compact calendar + selected day */}
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
          <CompactCalendar readings={allReadings} selectedDate={selectedDate} onSelectDate={setSelectedDate} />

          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-rose-500" />
              <h3 className="text-sm font-semibold text-[var(--foreground)]">{formatDate()}</h3>
              <span className="text-xs text-[var(--muted-foreground)]">
                · {selectedReadings.length} reading{selectedReadings.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-6">
                  <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : selectedReadings.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)] text-center py-6">No readings for this day</p>
              ) : (
                selectedReadings.map(r => <ReadingCard key={r.id} reading={r} />)
              )}
            </div>
          </div>
        </div>

        {/* 4 Trend graphs */}
        {!loading && <TrendCharts readings={allReadings} />}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Real Readings",   value: realReadings.length,                                  color: "text-[var(--foreground)]" },
            { label: "Vital Readings",  value: realReadings.filter(r => r.type === "vitals").length, color: "text-rose-500" },
            { label: "ECG Recordings",  value: realReadings.filter(r => r.type === "ecg_recording").length, color: "text-emerald-500" },
            { label: "Days with Data",  value: new Set(allReadings.map(r => {
                if (!r.timestamp) return "";
                const d = r.timestamp.toDate ? r.timestamp.toDate() : new Date(r.timestamp);
                return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
              }).filter(Boolean)).size, color: "text-violet-500" },
          ].map(s => (
            <div key={s.label} className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-3">
              <p className="text-xs text-[var(--muted-foreground)]">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>
    </SidebarLayout>
  );
}
