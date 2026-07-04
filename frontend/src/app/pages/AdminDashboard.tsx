// src/app/pages/AdminDashboard.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Users, RefreshCw } from "lucide-react";
import { collection, getDocs, query, updateDoc, where, doc } from "firebase/firestore";
import { db } from "../../firebase";
import SidebarLayout from "../components/Sidebar";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [doctors,    setDoctors]    = useState<any[]>([]);
  const [patients,   setPatients]   = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [savingId,   setSavingId]   = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "admin") { navigate(role === "doctor" ? "/doctor-dashboard" : "/login"); return; }
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setError(null); setLoading(true);
      const usersRef = collection(db, "users");
      const [dSnap, pSnap] = await Promise.all([
        getDocs(query(usersRef, where("role", "==", "doctor"))),
        getDocs(query(usersRef, where("role", "==", "patient")))
      ]);
      const dl: any[] = []; dSnap.forEach(d => dl.push({ id: d.id, ...d.data() }));
      const pl: any[] = []; pSnap.forEach(d => pl.push({ id: d.id, ...d.data() }));
      setDoctors(dl); setPatients(pl);
    } catch (err: any) {
      setError(err.message || "Failed to load users.");
    } finally { setLoading(false); }
  };

  const handleAssign = async (patientId: string, doctorId: string) => {
    try {
      setSavingId(patientId);
      await updateDoc(doc(db, "users", patientId), { assignedDoctorId: doctorId });
      setPatients(prev => prev.map(p => p.id === patientId ? { ...p, assignedDoctorId: doctorId } : p));
    } catch { alert("Failed to assign doctor."); }
    finally { setSavingId(null); }
  };

  const filtered = useMemo(() => {
    const t = searchTerm.toLowerCase();
    return patients.filter(p => p.name?.toLowerCase().includes(t) || p.email?.toLowerCase().includes(t));
  }, [patients, searchTerm]);

  return (
    <SidebarLayout role="admin">
      <div className="p-6 max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-rose-500 uppercase tracking-widest mb-1">Admin Portal</p>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">User Management</h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">Assign doctors to patients</p>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-xl text-sm font-medium hover:bg-[var(--muted)] transition"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm">
            <p className="text-3xl font-bold text-[var(--foreground)]">{doctors.length}</p>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">Doctors</p>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-sm">
            <p className="text-3xl font-bold text-[var(--foreground)]">{patients.length}</p>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">Patients</p>
          </div>
        </div>

        {/* Patient list */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-[var(--foreground)]">Patients</h2>
            <span className="text-sm text-[var(--muted-foreground)]">{filtered.length} shown</span>
          </div>

          <input
            type="text" placeholder="Search patients..."
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full p-3 border border-[var(--border)] rounded-xl mb-4 text-sm bg-[var(--input-background)] focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
          />

          {loading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-[var(--muted-foreground)]">Loading...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(patient => {
                const assigned = doctors.find(d => d.id === patient.assignedDoctorId);
                return (
                  <div key={patient.id} className="p-4 rounded-xl border border-[var(--border)] bg-[var(--muted)]">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-400 to-rose-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                          {patient.name?.[0]?.toUpperCase() || "P"}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[var(--foreground)]">{patient.name || "Unknown"}</p>
                          <p className="text-xs text-[var(--muted-foreground)]">{patient.email}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Assigned: {assigned?.name || assigned?.email || "Unassigned"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          className="p-2.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--input-background)] focus:ring-2 focus:ring-rose-500"
                          defaultValue={patient.assignedDoctorId || ""}
                          onChange={e => handleAssign(patient.id, e.target.value)}
                          disabled={savingId === patient.id}
                        >
                          <option value="">Select doctor</option>
                          {doctors.map(d => (
                            <option key={d.id} value={d.id}>{d.name || d.email || d.id}</option>
                          ))}
                        </select>
                        {savingId === patient.id && (
                          <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="text-center py-8">
                  <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-[var(--muted-foreground)]">No patients found.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </SidebarLayout>
  );
}