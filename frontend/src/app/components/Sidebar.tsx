// src/app/components/Sidebar.tsx
// Persistent sidebar navigation for all authenticated pages.
// Usage: wrap your page content in <SidebarLayout role="patient">...</SidebarLayout>

import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { LuChevronRight, LuBell } from "react-icons/lu";
import {
  Heart, Activity, Droplets, MessageCircle, User, LogOut, X,
  Settings, Users, Stethoscope, AlertCircle, Menu,
  ChevronRight, Bell, HelpCircle, Calendar
} from "lucide-react";

interface SidebarLayoutProps {
  children: React.ReactNode;
  role: "patient" | "doctor" | "admin";
}

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  badge?: number;
}

// ── Pulse animation for the logo ─────────────────────────────────────────────
const HeartPulse = () => (
  <div className="relative flex items-center justify-center w-10 h-10">
    <div className="absolute w-10 h-10 rounded-full bg-rose-500/20 animate-ping" />
    <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center shadow-lg shadow-rose-500/30">
      <Heart className="w-5 h-5 text-white" fill="white" />
    </div>
  </div>
);

export default function SidebarLayout({ children, role }: SidebarLayoutProps) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [open, setOpen]       = useState(false); // mobile drawer
  const [profile, setProfile] = useState({ name: "", role: "" });
  const [unread, setUnread]   = useState(0);

  useEffect(() => {
    const name     = JSON.parse(localStorage.getItem("userProfile") || "{}").name || "";
    const userRole = localStorage.getItem("userRole") || role;
    setProfile({ name, role: userRole });
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userId");
    sessionStorage.removeItem("isLoggedIn"); // clears session-only login flag
    navigate("/login");
  };

  // ── Nav items per role ──────────────────────────────────────────────────────
  const patientNav: NavItem[] = [
    { label: "Dashboard",      path: "/dashboard",      icon: <Activity className="w-5 h-5" /> },
    { label: "History",        path: "/history",        icon: <Calendar className="w-5 h-5" /> },
    { label: "Blood Sugar",    path: "/dashboard?tab=forms",        icon: <Droplets className="w-5 h-5" /> },
    { label: "Questionnaire",  path: "/dashboard?tab=questionnaire", icon: <AlertCircle className="w-5 h-5" /> },
    { label: "How to Use",     path: "/how-to-use",     icon: <Stethoscope className="w-5 h-5" /> },
    { label: "About Us",       path: "/about-us",       icon: <HelpCircle className="w-5 h-5" /> },
    { label: "Contact Doctor", path: "/contact-doctor", icon: <MessageCircle className="w-5 h-5" />, badge: unread },
  ];

  const doctorNav: NavItem[] = [
    { label: "Patients",       path: "/doctor-dashboard", icon: <Users className="w-5 h-5" /> },
    { label: "Monitoring",     path: "/doctor-dashboard?tab=vitals", icon: <Activity className="w-5 h-5" /> },
  ];

  const adminNav: NavItem[] = [
    { label: "User Management", path: "/admin-dashboard", icon: <Users className="w-5 h-5" /> },
  ];

  const bottomNav: NavItem[] = [
    { label: "Edit Profile",   path: "/profile",   icon: <User className="w-5 h-5" /> },
    { label: "Settings",       path: "/settings",  icon: <Settings className="w-5 h-5" /> },
  ];

  const mainNav = role === "patient" ? patientNav
                : role === "doctor"  ? doctorNav
                : adminNav;

  const isActive = (path: string) => {
    const base = path.split("?")[0];
    return location.pathname === base;
  };

  // ── Sidebar content (shared between desktop + mobile) ─────────────────────
  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-white/10">
        <HeartPulse />
        <div>
          <p className="text-white font-bold text-base tracking-tight leading-none">CardioTrix</p>
          <p className="text-rose-300/70 text-xs mt-0.5 capitalize">{profile.role} Portal</p>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest px-3 mb-3">
          Navigation
        </p>
        {mainNav.map((item) => (
          <button
            key={item.path}
            onClick={() => { navigate(item.path); setOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative group ${
              isActive(item.path)
                ? "bg-rose-500/20 text-rose-300 shadow-inner"
                : "text-slate-400 hover:text-white hover:bg-white/8"
            }`}
          >
            <span className={isActive(item.path) ? "text-rose-400" : "text-slate-500 group-hover:text-slate-300"}>
              {item.icon}
            </span>
            <span className="flex-1 text-left">{item.label}</span>
            {item.badge && item.badge > 0 ? (
              <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center font-bold">
                {item.badge}
              </span>
            ) : isActive(item.path) ? (
              <ChevronRight className="w-3.5 h-3.5 text-rose-400" />
            ) : null}
          </button>
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="px-3 pb-3 pt-2 border-t border-white/10 space-y-1">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest px-3 mb-3 mt-2">
          Account
        </p>
        {bottomNav.map((item) => (
          <button
            key={item.path}
            onClick={() => { navigate(item.path); setOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
              isActive(item.path)
                ? "bg-rose-500/20 text-rose-300"
                : "text-slate-400 hover:text-white hover:bg-white/8"
            }`}
          >
            <span className={isActive(item.path) ? "text-rose-400" : "text-slate-500 group-hover:text-slate-300"}>
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}

        {/* User card */}
        <div className="mx-1 mt-3 p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center text-white text-sm font-bold shadow">
              {profile.name?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{profile.name || "User"}</p>
              <p className="text-xs text-slate-400 capitalize">{profile.role}</p>
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all group mt-1"
        >
          <LogOut className="w-5 h-5 group-hover:text-rose-400" />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[var(--background)] overflow-hidden">

      {/* ── Desktop Sidebar ─────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-64 bg-slate-900 border-r border-white/10 flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* ── Mobile overlay ──────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Mobile drawer ───────────────────────────────────────────────────── */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-white/10 transform transition-transform duration-300 lg:hidden ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}>
        <button
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 text-slate-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
        <SidebarContent />
      </aside>

      {/* ── Main content area ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-4 px-4 py-3 bg-slate-900 border-b border-white/10 flex-shrink-0">
          <button
            onClick={() => setOpen(true)}
            className="text-slate-400 hover:text-white"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-rose-500" fill="currentColor" />
            <span className="text-white font-bold text-sm">CardioTrix</span>
          </div>
        </header>

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}