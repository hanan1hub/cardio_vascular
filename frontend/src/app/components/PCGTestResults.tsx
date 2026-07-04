// PCGTestResults.tsx
// Shows the patient's latest PCG diagnosis at the top (patient-friendly),
// then the model accuracy table for the full test set.

import React, { useEffect, useState } from "react";
import { Stethoscope, RefreshCw, CheckCircle, XCircle, AlertTriangle, Heart } from "lucide-react";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import { backendPath } from "../utils/api";

// ── Class metadata ────────────────────────────────────────────────────────────
const CLASS_INFO: Record<string, { full: string; color: string; badge: string }> = {
  N:   { full: "Normal",                color: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700" },
  AS:  { full: "Aortic Stenosis",       color: "text-red-700",     badge: "bg-red-100 text-red-700"         },
  MR:  { full: "Mitral Regurgitation",  color: "text-orange-700",  badge: "bg-orange-100 text-orange-700"   },
  MS:  { full: "Mitral Stenosis",       color: "text-amber-700",   badge: "bg-amber-100 text-amber-700"     },
  MVP: { full: "Mitral Valve Prolapse", color: "text-purple-700",  badge: "bg-purple-100 text-purple-700"   },
};

function ClassBadge({ code }: { code: string | null }) {
  if (!code) return <span className="text-slate-400">—</span>;
  const info = CLASS_INFO[code];
  if (!info) return <span className="font-medium">{code}</span>;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${info.badge}`}>
      {code} — {info.full}
    </span>
  );
}

// ── Patient's own latest PCG result ──────────────────────────────────────────
function PatientPCGCard() {
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    const patientId = localStorage.getItem("userId");
    if (!patientId) return;
    (async () => {
      try {
        // Fetch recent readings and find the first one with a PCG result (avoids composite index)
        const snap = await getDocs(query(
          collection(db, "sensorReadings"),
          where("patientId", "==", patientId),
          orderBy("timestamp", "desc"), limit(15)
        ));
        const withPCG = snap.docs.find(d => d.data().heart_rate_type);
        if (withPCG) setResult(withPCG.data());
      } catch { /* silently skip if no index or no data */ }
    })();
  }, []);

  if (!result?.heart_rate_type) return null;

  const code = result.heart_rate_type;
  const info = CLASS_INFO[code];
  const isNormal = code === "N";

  return (
    <div className={`rounded-2xl border p-5 mb-2 ${
      isNormal ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"
    }`}>
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-xl ${isNormal ? "bg-emerald-100" : "bg-amber-100"}`}>
          {isNormal
            ? <Heart className="w-6 h-6 text-emerald-600" />
            : <AlertTriangle className="w-6 h-6 text-amber-600" />}
        </div>
        <div className="flex-1">
          <p className={`text-xs font-semibold uppercase tracking-widest mb-1 ${isNormal ? "text-emerald-600" : "text-amber-600"}`}>
            Your Latest PCG Result
          </p>
          <p className={`text-xl font-bold ${isNormal ? "text-emerald-800" : "text-amber-800"}`}>
            {isNormal ? "Normal Heart Sound" : `${info?.full ?? code} detected`}
          </p>
          <p className={`text-sm mt-1 ${isNormal ? "text-emerald-700" : "text-amber-700"}`}>
            {isNormal
              ? "No cardiac abnormality was detected. Keep up with regular check-ups."
              : "Please consult your doctor to discuss this finding."}
          </p>
          {result.heart_rate_type_confidence != null && (
            <p className="text-xs mt-2 text-slate-500">
              AI confidence: {(result.heart_rate_type_confidence * 100).toFixed(1)}%
            </p>
          )}
        </div>
        <span className={`text-xs font-bold px-3 py-1.5 rounded-full flex-shrink-0 ${info?.badge ?? "bg-slate-100 text-slate-700"}`}>
          {code}
        </span>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PCGTestResults() {
  const [data,    setData]    = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const fetchResults = async () => {
    setLoading(true);
    setError(null);
    try {
      // Use the Node backend proxy so we don't need to expose port 5002
      const res  = await fetch(backendPath("/api/pcg/test-accuracy"));
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch");
      // Unwrap backend wrapper: { ok: true, data: { status, results, summary, class_breakdown } }
      setData(json.data ?? json);
    } catch (err: any) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchResults(); }, []);

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-[var(--accent)] rounded-lg">
            <Stethoscope className="w-5 h-5 text-[var(--primary)]" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--foreground)]">PCG Heart Sound — Model Accuracy</h3>
        </div>
        <div className="flex items-center gap-3 py-6">
          <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[var(--muted-foreground)]">Running model on test files…</p>
        </div>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-red-100 rounded-lg">
            <Stethoscope className="w-5 h-5 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--foreground)]">PCG Heart Sound — Model Accuracy</h3>
        </div>
        <p className="text-sm text-red-600 mb-1">{error}</p>
        <p className="text-xs text-[var(--muted-foreground)] mb-4">
          Make sure both the Node backend (port 5000) and PCG server (port 5002) are running.
        </p>
        <button
          onClick={fetchResults}
          className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 transition"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const results:         any[]            = data.results         ?? [];
  const summary:         any              = data.summary         ?? {};
  const classBreakdown:  Record<string, any> = data.class_breakdown ?? {};
  const accuracyColor = summary.accuracy >= 90
    ? "text-emerald-700"
    : summary.accuracy >= 70
    ? "text-amber-700"
    : "text-red-700";

  return (
    <div className="space-y-4">

      {/* ── Patient's own result (patient-friendly banner) ──────────────────── */}
      <PatientPCGCard />

    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6 shadow-sm space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[var(--accent)] rounded-lg">
            <Stethoscope className="w-5 h-5 text-[var(--primary)]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">
              PCG Heart Sound — Model Accuracy
            </h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              Conv1D model · Classes: AS, MR, MS, MVP, N
            </p>
          </div>
        </div>
        <button
          onClick={fetchResults}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--muted)] disabled:opacity-50 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Running…" : "Re-run"}
        </button>
      </div>

      {/* ── Overall summary ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[var(--muted)] rounded-xl p-4 text-center border border-[var(--border)]">
          <p className={`text-4xl font-bold ${accuracyColor}`}>
            {summary.accuracy ?? "—"}%
          </p>
          <p className="text-xs text-[var(--muted-foreground)] mt-1 font-medium">Overall Accuracy</p>
        </div>
        <div className="bg-[var(--muted)] rounded-xl p-4 text-center border border-[var(--border)]">
          <p className="text-4xl font-bold text-emerald-700">{summary.correct ?? "—"}</p>
          <p className="text-xs text-[var(--muted-foreground)] mt-1 font-medium">Correct</p>
        </div>
        <div className="bg-[var(--muted)] rounded-xl p-4 text-center border border-[var(--border)]">
          <p className="text-4xl font-bold text-[var(--foreground)]">{summary.total ?? "—"}</p>
          <p className="text-xs text-[var(--muted-foreground)] mt-1 font-medium">Total Files</p>
        </div>
      </div>

      {/* ── Per-class breakdown ─────────────────────────────────────────────── */}
      {Object.keys(classBreakdown).length > 0 && (
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)] mb-3">Per-Class Accuracy</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Object.entries(classBreakdown).map(([cls, stats]: [string, any]) => {
              const info = CLASS_INFO[cls];
              const acc  = stats.accuracy ?? 0;
              return (
                <div key={cls} className="bg-[var(--muted)] rounded-xl p-3 border border-[var(--border)]">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-bold ${info?.color ?? "text-slate-700"}`}>{cls}</span>
                    <span className={`text-xs font-semibold ${acc >= 90 ? "text-emerald-600" : acc >= 70 ? "text-amber-600" : "text-red-600"}`}>
                      {acc}%
                    </span>
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] mb-2 truncate">
                    {info?.full ?? cls}
                  </p>
                  <div className="w-full bg-[var(--border)] rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-700 ${
                        acc >= 90 ? "bg-emerald-500" : acc >= 70 ? "bg-amber-500" : "bg-red-500"
                      }`}
                      style={{ width: `${acc}%` }}
                    />
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] mt-1 text-right">
                    {stats.correct}/{stats.total}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Detailed results table ──────────────────────────────────────────── */}
      {results.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)] mb-3">
            Detailed Results ({results.length} files)
          </p>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--muted)]">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">File</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">Actual</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">Predicted</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">Confidence</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {results.map((r: any, i: number) => (
                  <tr
                    key={r.filename + i}
                    className={r.match === false ? "bg-red-50" : "hover:bg-[var(--muted)] transition-colors"}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-[var(--muted-foreground)]">
                      {r.filename}
                    </td>
                    <td className="px-4 py-2.5">
                      <ClassBadge code={r.actual_label} />
                    </td>
                    <td className="px-4 py-2.5">
                      {r.error
                        ? <span className="text-red-500 text-xs">{r.error}</span>
                        : <ClassBadge code={r.predicted_label} />
                      }
                    </td>
                    <td className="px-4 py-2.5">
                      {r.confidence != null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-[var(--border)] rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full bg-[var(--primary)] transition-all"
                              style={{ width: `${(r.confidence * 100).toFixed(0)}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium">
                            {(r.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {r.match === true  && <CheckCircle className="w-4 h-4 text-emerald-600 mx-auto" />}
                      {r.match === false && <XCircle     className="w-4 h-4 text-red-500 mx-auto"     />}
                      {r.match == null   && <span className="text-slate-400 text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
    </div>
  );
}
