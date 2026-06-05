"use client";

import { useState } from "react";
import { Settings, Database, Brain, Bell, Shield, User, Save, CheckCircle2 } from "lucide-react";

const SECTIONS = [
  { id: "profile",       label: "Profile",          icon: User },
  { id: "ai",            label: "AI & Analysis",    icon: Brain },
  { id: "database",      label: "Database",         icon: Database },
  { id: "notifications", label: "Notifications",    icon: Bell },
  { id: "security",      label: "Security",         icon: Shield },
];

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState("profile");
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState({ name: "Researcher", email: "", institution: "", role: "researcher" });
  const [aiSettings, setAiSettings] = useState({ model: "gemini-1-5-pro", confidenceThreshold: 0.66, autoTag: true, multimodal: true, language: "he" });
  const [notifications, setNotifications] = useState({ onProcessingComplete: true, onTagAdded: false, emailSummary: false });

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/12 flex items-center justify-center">
            <Settings size={18} className="text-primary" />
          </div>
          Settings
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">Configure your SCOPE workspace.</p>
      </div>

      <div className="flex gap-5">
        {/* Tab nav */}
        <nav className="w-52 shrink-0 space-y-0.5">
          {SECTIONS.map(s => {
            const Icon = s.icon;
            const active = activeSection === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13.5px] font-medium transition-all ${
                  active
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                }`}
              >
                <Icon size={15} className="shrink-0" />
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* Content panel */}
        <div className="flex-1 bg-card border border-border rounded-2xl shadow-[var(--shadow-sm)] overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-secondary/10">
            <h2 className="font-semibold text-[15px]">
              {SECTIONS.find(s => s.id === activeSection)?.label}
            </h2>
          </div>

          <div className="p-6 space-y-5">
            {activeSection === "profile" && (
              <>
                <Field label="Display Name">
                  <Input value={profile.name} onChange={v => setProfile({ ...profile, name: v })} />
                </Field>
                <Field label="Email">
                  <Input type="email" value={profile.email} onChange={v => setProfile({ ...profile, email: v })} placeholder="you@institution.edu" />
                </Field>
                <Field label="Institution">
                  <Input value={profile.institution} onChange={v => setProfile({ ...profile, institution: v })} placeholder="e.g. Dyellin Academic College" />
                </Field>
                <Field label="Role">
                  <Select value={profile.role} onChange={v => setProfile({ ...profile, role: v })}>
                    <option value="researcher">Researcher</option>
                    <option value="teacher">Teacher</option>
                    <option value="admin">Admin</option>
                  </Select>
                </Field>
              </>
            )}

            {activeSection === "ai" && (
              <>
                <Field label="Gemini Model">
                  <Select value={aiSettings.model} onChange={v => setAiSettings({ ...aiSettings, model: v })}>
                    <option value="gemini-1-5-pro">Gemini 1.5 Pro — Recommended</option>
                    <option value="gemini-1-5-flash">Gemini 1.5 Flash — Fastest</option>
                  </Select>
                </Field>
                <Field label="Confidence Threshold" description="Tags below this threshold are flagged for review.">
                  <div className="flex items-center gap-4 mt-1">
                    <input
                      type="range" min={0} max={1} step={0.01}
                      value={aiSettings.confidenceThreshold}
                      onChange={e => setAiSettings({ ...aiSettings, confidenceThreshold: parseFloat(e.target.value) })}
                      className="flex-1 accent-primary h-1.5"
                    />
                    <span className="font-mono text-sm font-semibold w-10 text-right text-primary">
                      {Math.round(aiSettings.confidenceThreshold * 100)}%
                    </span>
                  </div>
                </Field>
                <Field label="Auto-Tag on Upload">
                  <Toggle checked={aiSettings.autoTag} onChange={v => setAiSettings({ ...aiSettings, autoTag: v })}
                    label="Automatically run AI analysis when a video is uploaded" />
                </Field>
                <Field label="Multimodal Analysis">
                  <Toggle checked={aiSettings.multimodal} onChange={v => setAiSettings({ ...aiSettings, multimodal: v })}
                    label="Include video frames alongside transcript for richer context" />
                </Field>
                <Field label="Primary Language">
                  <Select value={aiSettings.language} onChange={v => setAiSettings({ ...aiSettings, language: v })}>
                    <option value="he">Hebrew (עברית)</option>
                    <option value="en">English</option>
                    <option value="ar">Arabic (عربية)</option>
                  </Select>
                </Field>
              </>
            )}

            {activeSection === "database" && (
              <div className="space-y-4">
                <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-400">Connected to Supabase</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Via <code className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded-md">NEXT_PUBLIC_SUPABASE_URL</code>
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Database credentials are managed through environment variables. Edit your{" "}
                  <code className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded-md">.env.local</code>{" "}
                  file to update the connection.
                </p>
              </div>
            )}

            {activeSection === "notifications" && (
              <>
                <Field label="Processing Complete">
                  <Toggle checked={notifications.onProcessingComplete} onChange={v => setNotifications({ ...notifications, onProcessingComplete: v })}
                    label="Notify when AI finishes analyzing a video" />
                </Field>
                <Field label="Tag Added">
                  <Toggle checked={notifications.onTagAdded} onChange={v => setNotifications({ ...notifications, onTagAdded: v })}
                    label="Notify when a new annotation is saved" />
                </Field>
                <Field label="Weekly Email Summary">
                  <Toggle checked={notifications.emailSummary} onChange={v => setNotifications({ ...notifications, emailSummary: v })}
                    label="Receive a weekly digest of analysis activity" />
                </Field>
              </>
            )}

            {activeSection === "security" && (
              <div className="space-y-4">
                <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-4">
                  <p className="text-sm font-semibold text-amber-400">Authentication not yet configured</p>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Row-Level Security is enabled on Supabase. Configure Supabase Auth to restrict access per user.
                  </p>
                </div>
                <Field label="Current Access Mode">
                  <div className="bg-secondary/60 border border-border rounded-xl px-3.5 py-2.5 text-sm text-muted-foreground cursor-not-allowed">
                    Public (no auth) — MVP mode
                  </div>
                </Field>
              </div>
            )}
          </div>

          {activeSection !== "database" && activeSection !== "security" && (
            <div className="px-6 pb-6">
              <button
                onClick={handleSave}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  saved
                    ? "bg-emerald-600 text-white"
                    : "bg-primary text-primary-foreground hover:bg-primary/90 glow-primary hover:scale-[1.02] active:scale-[0.98]"
                }`}
              >
                {saved ? <><CheckCircle2 size={15} />Saved!</> : <><Save size={15} />Save Changes</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-[13.5px] font-semibold text-foreground">{label}</label>
      {description && <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>}
      {children}
    </div>
  );
}

function Input({ type = "text", value, onChange, placeholder }: { type?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type={type} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-secondary/60 border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
    />
  );
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      className="w-full bg-secondary/60 border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none transition-all"
    >
      {children}
    </select>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-all ${checked ? "bg-primary" : "bg-secondary border border-border"}`}
      >
        <div className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? "translate-x-[22px]" : "translate-x-[3px]"}`} />
      </button>
      <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
    </label>
  );
}
