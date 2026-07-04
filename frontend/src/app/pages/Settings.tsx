// src/app/pages/Settings.tsx
import React, { useState, useEffect } from "react";
import { Settings as SettingsIcon, Moon, Sun, Bell, Shield, Smartphone, Save } from "lucide-react";
import SidebarLayout from "../components/Sidebar";

export default function Settings() {
  const role = (localStorage.getItem("userRole") || "patient") as "patient" | "doctor" | "admin";

  const [settings, setSettings] = useState({
    theme:               "light",
    notifications:       true,
    emergencyAlerts:     true,
    soundAlerts:         false,
    dataRefreshInterval: "5",
    showConfidence:      true,
    compactView:         false,
  });
  const [saved, setSaved] = useState(false);

  const applyTheme = (theme: string) => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  useEffect(() => {
    const stored = localStorage.getItem("appSettings");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings(parsed);
        applyTheme(parsed.theme || "light");
      } catch {}
    }
  }, []);

  const handleChange = (key: string, value: any) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      if (key === "theme") applyTheme(value);
      return next;
    });
  };

  const handleSave = () => {
    localStorage.setItem("appSettings", JSON.stringify(settings));
    applyTheme(settings.theme);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const Section = ({ title, icon, children }: any) => (
    <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 bg-rose-50 rounded-xl">{icon}</div>
        <h3 className="text-base font-semibold text-[var(--foreground)]">{title}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );

  const Toggle = ({ label, description, value, onChange }: any) => (
    <div className="flex items-center justify-between py-1">
      <div>
        <p className="text-sm font-medium text-[var(--foreground)]">{label}</p>
        {description && <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${value ? "bg-rose-500" : "bg-slate-200"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${value ? "translate-x-5" : "translate-x-0"}`} />
      </button>
    </div>
  );

  return (
    <SidebarLayout role={role}>
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Settings</h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">Customize your CardioMonitor experience</p>
          </div>
          <button
            onClick={handleSave}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm ${
              saved
                ? "bg-emerald-500 text-white"
                : "bg-rose-500 text-white hover:bg-rose-600"
            }`}
          >
            <Save className="w-4 h-4" />
            {saved ? "Saved!" : "Save Changes"}
          </button>
        </div>

        {/* Appearance */}
        <Section title="Appearance" icon={<Sun className="w-5 h-5 text-rose-500" />}>
          <div>
            <p className="text-sm font-medium text-[var(--foreground)] mb-2">Theme</p>
            <div className="grid grid-cols-2 gap-3">
              {["light", "dark"].map(t => (
                <button
                  key={t}
                  onClick={() => handleChange("theme", t)}
                  className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all ${
                    settings.theme === t
                      ? "border-rose-500 bg-rose-50 text-rose-700"
                      : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-rose-200"
                  }`}
                >
                  {t === "light" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <Toggle
            label="Compact View"
            description="Reduce spacing and padding throughout the dashboard"
            value={settings.compactView}
            onChange={(v: boolean) => handleChange("compactView", v)}
          />
        </Section>

        {/* Notifications */}
        <Section title="Notifications" icon={<Bell className="w-5 h-5 text-rose-500" />}>
          <Toggle
            label="Push Notifications"
            description="Receive alerts for new messages and vitals updates"
            value={settings.notifications}
            onChange={(v: boolean) => handleChange("notifications", v)}
          />
          <Toggle
            label="Emergency Alerts"
            description="Always notify for emergency patient alerts"
            value={settings.emergencyAlerts}
            onChange={(v: boolean) => handleChange("emergencyAlerts", v)}
          />
          <Toggle
            label="Sound Alerts"
            description="Play a sound when emergency alerts arrive"
            value={settings.soundAlerts}
            onChange={(v: boolean) => handleChange("soundAlerts", v)}
          />
        </Section>

        {/* Data */}
        <Section title="Device & Data" icon={<Smartphone className="w-5 h-5 text-rose-500" />}>
          <div>
            <p className="text-sm font-medium text-[var(--foreground)] mb-2">Data Refresh Interval</p>
            <select
              value={settings.dataRefreshInterval}
              onChange={e => handleChange("dataRefreshInterval", e.target.value)}
              className="w-full p-3 border border-[var(--border)] rounded-xl text-sm bg-[var(--input-background)] focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
            >
              <option value="1">Every 1 second</option>
              <option value="5">Every 5 seconds</option>
              <option value="10">Every 10 seconds</option>
              <option value="30">Every 30 seconds</option>
            </select>
          </div>
          <Toggle
            label="Show Confidence Scores"
            description="Display ML model confidence percentages on predictions"
            value={settings.showConfidence}
            onChange={(v: boolean) => handleChange("showConfidence", v)}
          />
        </Section>

        {/* Privacy */}
        <Section title="Privacy & Security" icon={<Shield className="w-5 h-5 text-rose-500" />}>
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-sm font-medium text-amber-800 mb-1">Data Storage</p>
            <p className="text-xs text-amber-700">
              Sensor readings are stored locally on this device. Chat messages and health records
              are stored securely in Firebase. No data is shared with third parties.
            </p>
          </div>
          <button
            onClick={() => {
              if (confirm("Clear all local sensor data? This cannot be undone.")) {
                localStorage.removeItem("vitalsCache");
                alert("Local data cleared.");
              }
            }}
            className="w-full py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition"
          >
            Clear Local Sensor Data
          </button>
        </Section>
      </div>
    </SidebarLayout>
  );
}