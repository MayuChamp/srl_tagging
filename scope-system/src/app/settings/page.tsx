"use client";

import { useId, useState } from "react";
import { Settings, Database, Brain, Bell, Shield, User, Save, CheckCircle2, AlertTriangle, Lock } from "lucide-react";

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
    <div className="page max-w-5xl space-y-8">
      <div>
        <h1 className="page-title flex items-center gap-3">
          <span className="icon-tile icon-tile-md" aria-hidden="true">
            <Settings size={18} />
          </span>
          Settings
        </h1>
        <p className="page-subtitle">Configure your SCOPE workspace.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-5">
        {/* Tab nav: a scrolling row on phones, a side column from md up */}
        <nav
          role="tablist"
          className="md:w-52 shrink-0 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible -mx-4 px-4 sm:-mx-6 sm:px-6 md:mx-0 md:px-0 py-1 md:py-0"
        >
          {SECTIONS.map(s => {
            const Icon = s.icon;
            const active = activeSection === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="settings-panel"
                onClick={() => setActiveSection(s.id)}
                className={`relative shrink-0 md:w-full whitespace-nowrap flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-sm font-medium cursor-pointer ${
                  active
                    ? "bg-card border-border shadow-sm text-foreground before:absolute before:start-0 before:inset-y-2 before:w-0.5 before:rounded-full before:bg-primary"
                    : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Icon size={15} className={`shrink-0 ${active ? "text-primary" : ""}`} />
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* Content panel */}
        <div role="tabpanel" id="settings-panel" className="card flex-1 min-w-0 overflow-hidden">
          <div className="card-header px-6 bg-secondary/30">
            <h2 className="card-title">
              {SECTIONS.find(s => s.id === activeSection)?.label}
            </h2>
          </div>

          <div className="p-6 space-y-5">
            {activeSection === "profile" && (
              <>
                <Field label="Display Name">
                  {f => <Input {...f} dir="auto" value={profile.name} onChange={v => setProfile({ ...profile, name: v })} />}
                </Field>
                <Field label="Email">
                  {f => <Input {...f} dir="ltr" type="email" value={profile.email} onChange={v => setProfile({ ...profile, email: v })} placeholder="you@institution.edu" />}
                </Field>
                <Field label="Institution">
                  {f => <Input {...f} dir="auto" value={profile.institution} onChange={v => setProfile({ ...profile, institution: v })} placeholder="e.g. Dyellin Academic College" />}
                </Field>
                <Field label="Role">
                  {f => (
                    <Select {...f} value={profile.role} onChange={v => setProfile({ ...profile, role: v })}>
                      <option value="researcher">Researcher</option>
                      <option value="teacher">Teacher</option>
                      <option value="admin">Admin</option>
                    </Select>
                  )}
                </Field>
              </>
            )}

            {activeSection === "ai" && (
              <>
                <Field label="Gemini Model">
                  {f => (
                    <Select {...f} value={aiSettings.model} onChange={v => setAiSettings({ ...aiSettings, model: v })}>
                      <option value="gemini-1-5-pro">Gemini 1.5 Pro — Recommended</option>
                      <option value="gemini-1-5-flash">Gemini 1.5 Flash — Fastest</option>
                    </Select>
                  )}
                </Field>
                <Field label="Confidence Threshold" description="Tags below this threshold are flagged for review.">
                  {f => (
                    <div className="flex items-start gap-4 mt-1">
                      <div className="flex-1 min-w-0">
                        <input
                          {...f}
                          type="range" min={0} max={1} step={0.01}
                          value={aiSettings.confidenceThreshold}
                          onChange={e => setAiSettings({ ...aiSettings, confidenceThreshold: parseFloat(e.target.value) })}
                          aria-valuetext={`${Math.round(aiSettings.confidenceThreshold * 100)}%`}
                          className="w-full h-5 accent-primary cursor-pointer"
                        />
                        <div className="flex justify-between text-2xs text-muted-foreground" aria-hidden="true">
                          <span>0%</span><span>100%</span>
                        </div>
                      </div>
                      <span className="h-5 w-12 flex items-center justify-end font-mono text-sm font-semibold tabular-nums text-foreground">
                        {Math.round(aiSettings.confidenceThreshold * 100)}%
                      </span>
                    </div>
                  )}
                </Field>
                <div className="divide-y divide-border border-y border-border">
                  <Toggle heading="Auto-Tag on Upload" checked={aiSettings.autoTag} onChange={v => setAiSettings({ ...aiSettings, autoTag: v })}
                    label="Automatically run AI analysis when a video is uploaded" />
                  <Toggle heading="Multimodal Analysis" checked={aiSettings.multimodal} onChange={v => setAiSettings({ ...aiSettings, multimodal: v })}
                    label="Include video frames alongside transcript for richer context" />
                </div>
                <Field label="Primary Language">
                  {f => (
                    <Select {...f} value={aiSettings.language} onChange={v => setAiSettings({ ...aiSettings, language: v })}>
                      <option value="he">Hebrew (עברית)</option>
                      <option value="en">English</option>
                      <option value="ar">Arabic (عربية)</option>
                    </Select>
                  )}
                </Field>
              </>
            )}

            {activeSection === "database" && (
              <div className="space-y-4">
                <div className="callout tone-success items-center">
                  <span className="status-dot tone-success size-2" aria-hidden="true" />
                  <div>
                    <p className="callout-title">Connected to Supabase</p>
                    <p className="callout-text text-xs mt-0.5">
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
              <div className="divide-y divide-border -my-4">
                <Toggle heading="Processing Complete" checked={notifications.onProcessingComplete} onChange={v => setNotifications({ ...notifications, onProcessingComplete: v })}
                  label="Notify when AI finishes analyzing a video" />
                <Toggle heading="Tag Added" checked={notifications.onTagAdded} onChange={v => setNotifications({ ...notifications, onTagAdded: v })}
                  label="Notify when a new annotation is saved" />
                <Toggle heading="Weekly Email Summary" checked={notifications.emailSummary} onChange={v => setNotifications({ ...notifications, emailSummary: v })}
                  label="Receive a weekly digest of analysis activity" />
              </div>
            )}

            {activeSection === "security" && (
              <div className="space-y-4">
                <div className="callout tone-warning">
                  <AlertTriangle size={16} className="callout-icon" aria-hidden="true" />
                  <div>
                    <p className="callout-title">Authentication not yet configured</p>
                    <p className="callout-text mt-1 leading-relaxed">
                      Row-Level Security is enabled on Supabase. Configure Supabase Auth to restrict access per user.
                    </p>
                  </div>
                </div>
                <Field label="Current Access Mode">
                  {f => (
                    <div
                      id={f.id}
                      role="textbox"
                      aria-readonly="true"
                      aria-labelledby={`${f.id}-label`}
                      className="flex items-center gap-2 h-10 px-3.5 rounded-[10px] border border-border bg-secondary/60 text-sm text-muted-foreground cursor-not-allowed"
                    >
                      <Lock size={14} className="shrink-0" aria-hidden="true" />
                      Public (no auth) — MVP mode
                    </div>
                  )}
                </Field>
              </div>
            )}
          </div>

          {activeSection !== "database" && activeSection !== "security" && (
            <div className="px-6 py-4 border-t border-border bg-secondary/20 flex justify-end">
              <button
                type="button"
                onClick={handleSave}
                className={`btn btn-lg ${saved ? "btn-success" : "btn-primary"}`}
              >
                <span aria-live="polite" className="inline-flex items-center gap-2">
                  {saved ? <><CheckCircle2 size={15} />Saved!</> : <><Save size={15} />Save Changes</>}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Props Field hands to its control so the label, hint and control are linked. */
type FieldControl = { id: string; "aria-describedby"?: string };

function Field({ label, description, children }: { label: string; description?: string; children: (control: FieldControl) => React.ReactNode }) {
  const id = useId();
  const descId = `${id}-desc`;
  return (
    <div className="space-y-2">
      <label id={`${id}-label`} htmlFor={id} className="block text-sm font-semibold text-foreground">{label}</label>
      {description && <p id={descId} className="field-hint">{description}</p>}
      {children({ id, "aria-describedby": description ? descId : undefined })}
    </div>
  );
}

function Input({ type = "text", value, onChange, placeholder, id, dir, "aria-describedby": describedBy }: {
  type?: string; value: string; onChange: (v: string) => void; placeholder?: string;
  id?: string; dir?: "ltr" | "rtl" | "auto"; "aria-describedby"?: string;
}) {
  return (
    <input
      id={id} dir={dir} aria-describedby={describedBy}
      type={type} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className="field"
    />
  );
}

function Select({ value, onChange, children, id, "aria-describedby": describedBy }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode;
  id?: string; "aria-describedby"?: string;
}) {
  return (
    <select
      id={id} aria-describedby={describedBy}
      value={value} onChange={e => onChange(e.target.value)}
      className="field"
    >
      {children}
    </select>
  );
}

/** Settings row: title + description at the start, switch at the end. The
 *  whole row is a <label>, so clicking the text still flips the switch. */
function Toggle({ heading, checked, onChange, label }: { heading: string; checked: boolean; onChange: (v: boolean) => void; label: string }) {
  const descId = useId();
  return (
    <label className="flex items-start justify-between gap-6 py-4 cursor-pointer">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{heading}</span>
        <span id={descId} className="block text-xs text-muted-foreground mt-0.5 leading-relaxed">{label}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={heading}
        aria-describedby={descId}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 shrink-0 rounded-full ring-1 ring-inset transition-colors ${checked ? "bg-primary-solid ring-primary-solid" : "bg-muted-foreground/25 ring-input"}`}
      >
        <span className={`absolute top-[3px] left-0 w-[18px] h-[18px] rounded-full shadow-sm transition-[translate,background-color] duration-200 ${checked ? "translate-x-[22px] bg-white" : "translate-x-[3px] bg-muted-foreground"}`} />
      </button>
    </label>
  );
}
