"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Download, Layers, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { EnvironmentOrganizationChart } from "@/components/video/EnvironmentOrganizationChart";
import { EnvironmentMacroPanel } from "@/components/video/EnvironmentMacroPanel";
import { EnvironmentLessonOverview } from "@/components/video/EnvironmentLessonOverview";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { ENVIRONMENT_CODES, EVIDENCE_STATES, RUN_STATES,
  type EnvironmentResponse, type EnvironmentReview } from "@/lib/environment";

const organization: Record<string, string> = { whole_class: "מליאה", individual: "יחידים", pairs: "זוגות",
  groups: "קבוצות", mixed: "ארגון משולב", unknown: "לא ניתן לקבוע" };
const coverage: Record<string, string> = { class_visible: "הכיתה נראית", partial_class: "חלק מהכיתה נראה",
  teacher_only: "המורה בלבד", board_only: "הלוח בלבד", unusable: "התמונה אינה מאפשרת הערכה" };
const scope: Record<string, string> = { teacher: "המורה", visible_group: "הקבוצה הנראית",
  visible_class: "הכיתה הנראית", unknown: "תחולה לא ידועה" };
const verdicts: Record<EnvironmentReview["verdict"], string> = {
  accepted: "אושר בבדיקה אנושית", needs_correction: "נדרש תיקון", rejected: "נדחה בבדיקה אנושית",
};
// Button recipes (globals.css), split by variant so the primary CTA keeps its
// terracotta fill on hover. Selects / textarea use .field, window chips .chip-toggle.
const btnPrimary = "btn btn-primary";
const btnSecondary = "btn btn-secondary";
// Display-only status → tone maps (badge / status-dot / meter).
const runTone: Record<string, string> = { pending: "tone-warning", processing: "tone-primary",
  completed: "tone-success", completed_with_errors: "tone-warning", failed: "tone-danger" };
const evidenceTone: Record<string, string> = { supported: "tone-success", partial: "tone-warning",
  not_observed: "tone-neutral", unknown: "tone-neutral" };
const verdictTone: Record<EnvironmentReview["verdict"], string> = {
  accepted: "tone-success", needs_correction: "tone-warning", rejected: "tone-danger",
};
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function EnvironmentWorkspace({ videoId, videoUrl }: { videoId: string; videoUrl: string }) {
  const [data, setData] = useState<EnvironmentResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState("");
  const [revision, setRevision] = useState(0);
  const [sampling, setSampling] = useState("60:3");
  const [adaptive, setAdaptive] = useState(true);
  const [macroAnalysis, setMacroAnalysis] = useState(false);
  const [taggingSessionId, setTaggingSessionId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [seek, setSeek] = useState<{ time: number; seq: number } | null>(null);
  const [notes, setNotes] = useState("");
  const [reviewVerdict, setReviewVerdict] = useState<EnvironmentReview["verdict"]>("accepted");

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const response = await fetch(`/api/environment?videoId=${videoId}${runId ? `&runId=${runId}` : ""}`,
          { signal: controller.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "טעינת הניתוח נכשלה");
        if (controller.signal.aborted) return;
        setData(result); setError(""); setLoading(false);
        const active = ["pending", "processing"].includes(result.run?.status);
        // Refresh signed image URLs even after completion.
        timer = setTimeout(refresh, active ? 7000 : 300000);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "שגיאת תקשורת"); setLoading(false);
        }
      }
    }
    refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [videoId, runId, revision]);

  const run = data?.run;
  const observations = data?.observations ?? [];
  const selected = observations.find(o => o.id === selectedId) ?? observations[0];
  const latestReview = data?.reviews.find(r => r.observation_id === selected?.id);
  const active = data?.runs.some(r => ["pending", "processing"].includes(r.status));
  const seekTo = (value: number) => setSeek(previous => ({ time: value, seq: (previous?.seq ?? 0) + 1 }));

  async function startRun() {
    setBusy(true); setError("");
    const [interval, frames] = sampling.split(":").map(Number);
    try {
      const response = await fetch("/api/environment", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, config: { interval_seconds: interval, frames_per_window: frames, adaptive_video: adaptive, macro_analysis: macroAnalysis,
          ...(macroAnalysis && taggingSessionId ? { tagging_session_id: taggingSessionId } : {}) } }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "לא ניתן להתחיל ניתוח");
      setRunId(result.run.id); setSelectedId(""); setData(null); setLoading(true); setNotes("");
      setRevision(n => n + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "שגיאת תקשורת"); }
    finally { setBusy(false); }
  }

  async function saveReview() {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/environment", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observationId: selected.id, verdict: reviewVerdict, notes }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "שמירת הבדיקה נכשלה");
      setData(previous => previous ? { ...previous, reviews: [result.review, ...previous.reviews] } : previous);
      setNotes("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "שגיאת תקשורת"); }
    finally { setBusy(false); }
  }

  function exportRun() {
    if (!data?.run) return;
    const payload = { ...data, runs: undefined, observations: data.observations.map(o => ({ ...o,
      evidence: o.evidence.map(e => { const copy = { ...e }; delete copy.url; return copy; }) })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `environment-${data.run.id}.json`;
    link.click(); URL.revokeObjectURL(url);
  }

  return <div dir="rtl" className="space-y-5">
    <div className="panel p-4 sm:p-5 space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">ניתוח סביבת הלמידה ותמיכה עקיפה ב־SRL. ממצאי הפיילוט דורשים בדיקה אנושית; דגימה אינה תיעוד רציף של השיעור.</p>
      <div className="flex flex-wrap items-end gap-3 sm:gap-4">
        <label className="space-y-1.5"><span className="field-label">דגימת תמונות</span>
          <select value={sampling} onChange={e => setSampling(e.target.value)} disabled={busy || active} className="field block">
            <option value="60:3">3 תמונות בכל דקה (מומלץ לפיילוט)</option>
            <option value="60:1">תמונה בכל דקה</option><option value="180:1">תמונה בכל 3 דקות</option>
          </select>
        </label>
        <label className="flex h-10 items-center gap-2 text-sm cursor-pointer has-[:disabled]:opacity-50 has-[:disabled]:cursor-not-allowed"><input type="checkbox" checked={adaptive}
          onChange={e => setAdaptive(e.target.checked)} disabled={busy || active} className="size-4 shrink-0 cursor-[inherit]" />בדיקת תנועה לפי הצורך (עד 6 קטעים)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={macroAnalysis} onChange={e => setMacroAnalysis(e.target.checked)} disabled={busy || active} className="size-4" />ניתוח מאקרו של משימות ותמיכה בוויסות (פיילוט)</label>
        {macroAnalysis && <label className="space-y-1.5 min-w-0 max-w-full"><span className="field-label">העשרת תמונת העל באמצעות תיוג</span>
          <select className="field block max-w-full" value={taggingSessionId} onChange={event => setTaggingSessionId(event.target.value)} disabled={busy || active || data?.taggingSessionsUnavailable}>
            <option value="">ללא תיוג · תמונות ותמלול זמינים</option>
            {(data?.taggingSessions ?? []).map(session => <option key={session.id} value={session.id}>{session.name} · {session.is_ai_generated ? "אוטומטי" : "אנושי"} · {new Date(session.created_at).toLocaleDateString("he-IL")}</option>)}
          </select>
        </label>}
        <button onClick={startRun} disabled={busy || active || loading || !data} className={`${btnPrimary} btn-lg`}>
          {busy ? "שומרת…" : active ? "קיימת הרצה פעילה" : "התחלת ניתוח סביבת הלמידה"}
        </button>
        <button onClick={() => setRevision(n => n + 1)} className={`${btnSecondary} btn-lg`}>
          <RefreshCw size={15} className={loading ? "animate-spin" : undefined} aria-hidden />רענון</button>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">ההרצה נעשית ברקע ושומרת את ניתוח ה־SRL הישיר. תמלול קיים ישולב כראיה; אם חסר תמלול, הדבר יסומן כמגבלת הניתוח.</p>
      {macroAnalysis && <p className="text-xs text-muted-foreground">{data?.taggingSessionsUnavailable ? "רשימת התיוגים אינה זמינה כרגע. אפשר להמשיך ללא תיוג." : "בחירת סשן תיוג של השיעור תעשיר את הניתוח לפי זמני האירועים. התיוג אינו אמת מאומתת, וניתן להפיק תמונת על גם בלעדיו. הבחירה חלה על הרצה חדשה בלבד."}</p>}
    </div>
    {error && <p role="alert" className="callout tone-danger"><AlertTriangle size={16} className="callout-icon" aria-hidden /><span className="min-w-0" dir="auto">{error}</span></p>}
    {loading && <div className="space-y-4">
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="shrink-0 animate-spin" aria-hidden />טוענת את ניתוח סביבת הלמידה…</p>
      <div className="grid gap-5 xl:grid-cols-2" aria-hidden><div className="h-40 rounded-xl shimmer" /><div className="h-40 rounded-xl shimmer" /></div>
    </div>}
    {!loading && data && !run && <div className="empty-state">
      <div className="empty-state-icon"><Layers size={22} aria-hidden /></div>
      <p className="text-sm max-w-md">עדיין אין הרצות שלך לשיעור הזה. בחרי את הדגימה והתחילי ניתוח.</p>
    </div>}
    {run && <>
      <div className="flex flex-wrap gap-3 items-center">
        <label className="flex min-w-0 max-w-full items-center gap-2"><span className="field-label shrink-0">הרצה</span>
          <select className="field w-auto min-w-0 max-w-full" value={run.id} onChange={e => {
            setRunId(e.target.value); setData(null); setLoading(true); setSelectedId(""); setNotes("");
          }}>
            {(data?.runs ?? []).map(r => <option key={r.id} value={r.id}>
              {new Date(r.created_at).toLocaleString("he-IL")} · {RUN_STATES[r.status]}
            </option>)}
          </select>
        </label>
        <span role="status" className={`badge badge-lg ${runTone[run.status] ?? "tone-neutral"}`}>
          <span className={`status-dot ${runTone[run.status] ?? "tone-neutral"} ${run.status === "processing" ? "animate-pulse" : ""}`} aria-hidden />
          {RUN_STATES[run.status]}{run.progress.total ? ` · ${run.progress.current ?? 0}/${run.progress.total} חלונות` : ""}</span>
        {run.progress.total ? <div className="meter w-32" aria-hidden>
          <div className={`meter-fill ${runTone[run.status] ?? "tone-neutral"}`}
            style={{ width: `${Math.min(100, ((run.progress.current ?? 0) / run.progress.total) * 100)}%` }} />
        </div> : null}
        <button onClick={exportRun} disabled={!observations.length} className={`${btnSecondary} ms-auto`}>
          <Download size={15} aria-hidden />ייצוא ראיות וקידוד JSON</button>
      </div>
      {run.status === "pending" && <p className="text-sm text-muted-foreground">הבקשה ממתינה ל־Worker. ההתקדמות תתעדכן כאן אוטומטית כשהעיבוד יתחיל.</p>}
      {run.error && <p role="alert" className="callout tone-danger" dir="auto"><AlertTriangle size={16} className="callout-icon" aria-hidden /><span className="min-w-0">{run.error}</span></p>}
      {run.summary.transcript_available === false && <p className="callout tone-warning"><AlertTriangle size={16} className="callout-icon" aria-hidden /><span className="min-w-0">לא נמצא תמלול להרצה זו. אין להסיק הוראות משימה או מימוש מילולי מהתמונות בלבד.</span></p>}
      <EnvironmentLessonOverview overview={run.summary.macro?.status === "completed" ? run.summary.macro.lesson_overview : undefined}
        macroStatus={run.summary.macro?.status} enabled={run.config.macro_analysis === true} runId={run.id}
        episodes={run.summary.macro?.status === "completed" ? run.summary.macro.episodes : []} observations={observations}
        taggingSnapshot={run.config.tagging_snapshot}
        onEvidence={(observation, timestamp) => { setSelectedId(observation.id); setNotes(""); seekTo(timestamp); document.getElementById("environment-evidence")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
        onSeek={timestamp => { seekTo(timestamp); document.getElementById("environment-player")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />
      <EnvironmentMacroPanel macro={run.summary.macro} enabled={run.config.macro_analysis === true} runId={run.id}
        observations={observations} reviews={data?.macroReviews ?? []} reviewsUnavailable={data?.macroReviewsUnavailable}
        onEvidence={(observation, timestamp) => { setSelectedId(observation.id); setNotes(""); seekTo(timestamp); document.getElementById("environment-evidence")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
        onReview={review => setData(previous => previous ? { ...previous, macroReviews: [review, ...(previous.macroReviews ?? [])] } : previous)} />
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-4 min-w-0 xl:sticky xl:top-6 xl:self-start xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
          <div id="environment-player" dir="ltr" className="min-w-0 scroll-mt-6">
            <VideoPlayer url={videoUrl} seekRequest={seek} markers={observations.map(o => ({ id: o.id, startTime: o.start_time,
              label: o.observation.description ?? "חלון שלא נותח", color: o.status === "failed" ? "#f59e0b" : "#0d9488" }))} />
          </div>
          <div className="panel p-4 sm:p-5 space-y-3">
            <h2 className="card-title">חלונות הדגימה</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">לחיצה מציגה את הראיות ומעבירה את הנגן לזמן המתאים. קטעי תנועה נוספים אינם נספרים כדגימות נוספות.</p>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1" dir="ltr">
              {observations.map(o => <button key={o.id} onClick={() => { setSelectedId(o.id); setNotes(""); setReviewVerdict("accepted"); seekTo(o.start_time); }}
                aria-pressed={o.id === selected?.id} title={o.status === "failed" ? "החלון לא נותח" : o.observation.description}
                className={`chip-toggle font-mono tabular-nums ${o.status === "failed" ? "text-warning" : ""}`}>
                {time(o.start_time)}{o.status === "failed" ? " !" : ""}
              </button>)}
              {!observations.length && <p dir="rtl" className="text-sm text-muted-foreground">חלונות הניתוח יופיעו כאן עם השלמתם.</p>}
            </div>
          </div>
          <EnvironmentOrganizationChart observations={observations} totalWindows={run.progress.total} />
          {run.summary.counts && <div className="panel p-4 sm:p-5 space-y-3">
            <h2 className="card-title">הזדמנויות שזוהו בדגימות</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">ספירת קידוד אוטומטי לפני תיקוני אדם. המכנה כולל חלונות שניתנים להערכה לכל ממד; חלונות לא ידועים או כושלים אינם נחשבים להיעדר תמיכה. זו אינה חלוקת זמן השיעור.</p>
            <div>
              {Object.entries(run.summary.counts).map(([code, counts]) => <div key={code} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2.5 border-b border-border last:border-0 text-sm">
                <span className="font-medium">{ENVIRONMENT_CODES[code] ?? code}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{counts.supported} נתמכים מתוך {counts.assessable} ניתנים להערכה · {counts.partial} חלקיים · {counts.unknown} לא ידועים</span>
                <div className="meter col-span-2" aria-hidden>
                  <div className="meter-fill tone-success"
                    style={{ width: `${counts.assessable > 0 ? Math.min(100, ((counts.supported || 0) / counts.assessable) * 100) : 0}%` }} />
                </div>
              </div>)}
            </div>
            <p className="text-xs text-muted-foreground">נותחו {run.summary.completed_windows} חלונות; {run.summary.failed_windows} נכשלו.</p>
          </div>}
          <details className="text-xs text-muted-foreground"><summary className="cursor-pointer select-none font-medium hover:text-foreground">פרטי ההרצה</summary>
            <p className="mt-2" dir="ltr">{run.protocol_version} · {Object.values(run.models).join(" / ")}</p>
            <p>{run.config.frames_per_window} תמונות בכל {run.config.interval_seconds} שניות</p>
          </details>
        </div>
        {selected && <div id="environment-evidence" className="panel p-4 sm:p-5 space-y-5 min-w-0">
          <div className="flex justify-between items-center gap-3"><h2 className="card-title">תצפית וראיות</h2>
            <button dir="ltr" className={`${btnSecondary} btn-sm font-mono tabular-nums`} onClick={() => seekTo(selected.start_time)}>{time(selected.start_time)}–{time(selected.end_time)}</button></div>
          {selected.status === "failed" ? <p role="alert" className="callout tone-warning" dir="auto"><AlertTriangle size={16} className="callout-icon" aria-hidden /><span className="min-w-0">{selected.error}</span></p> : <>
            <div className="space-y-2"><h3 className="text-sm font-semibold">מה נצפה</h3>
              <p className="reading">{selected.observation.description}</p>
              <p className="text-xs text-muted-foreground">{organization[selected.observation.organization ?? "unknown"]} · {coverage[selected.observation.coverage ?? "unusable"]}</p>
              <p className="text-xs">משאבים: {selected.observation.resources?.join(" · ") || "לא זוהו"}</p>
            </div>
            {!!selected.observation.visual_artifacts?.length && <div className="space-y-2">
              <h3 className="text-sm font-semibold">כלים ורכיבים בסביבת הלמידה</h3>
              {selected.observation.visual_artifacts.map((artifact, index) => <div key={index} className="panel-inset space-y-1 text-sm">
                <strong>{artifact.label}</strong>
                <p className="whitespace-pre-line">{artifact.readable_text || "לא חולץ טקסט קריא"}</p>
                <p className="text-xs text-muted-foreground">ראיות: <bdi>{artifact.evidence_ids.join(", ")}</bdi></p>
                {artifact.limitations.map((limitation, i) => <p key={i} className="text-xs text-muted-foreground">{limitation}</p>)}
              </div>)}
            </div>}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {selected.evidence.filter(e => e.kind === "image").map(e => <figure key={e.id} className="space-y-1">
                {e.url ? <a href={e.url} target="_blank" rel="noreferrer" className="block rounded-lg transition-shadow hover:ring-2 hover:ring-primary/40">
                  {/* eslint-disable-next-line @next/next/no-img-element -- private expiring evidence URLs */}
                  <img src={e.url} alt={`תמונת ראיה מהשיעור בזמן ${time(e.start)}`} className="block aspect-video w-full rounded-lg border border-border bg-secondary object-contain" loading="lazy" />
                </a> : <div className="grid aspect-video place-items-center rounded-lg border border-dashed border-input p-3 text-center text-xs text-muted-foreground">התמונה אינה זמינה; אפשר לרענן.</div>}
                <figcaption className="font-mono text-xs text-muted-foreground tabular-nums" dir="ltr">{e.id} · {time(e.start)}</figcaption>
              </figure>)}
            </div>
            {selected.evidence.filter(e => e.kind === "video").map(e => <figure key={e.id} className="space-y-1">
              {e.url && <video controls preload="none" src={e.url} className="block aspect-video w-full rounded-lg bg-stage" />}
              <figcaption className="text-xs text-muted-foreground">בדיקת תנועה ללא שמע · {time(e.start)}–{time(e.end)} · <bdi dir="ltr" className="font-mono">{e.id}</bdi></figcaption>
            </figure>)}
            <details className="panel-inset"><summary className="cursor-pointer select-none text-sm font-medium hover:text-foreground">תמלול והקשר המשימה ({selected.evidence.filter(e => e.kind === "transcript").length})</summary>
              <div className="mt-3 max-h-60 overflow-y-auto space-y-3">
                {selected.evidence.filter(e => e.kind === "transcript").map(e => <div key={e.id} className="text-sm">
                  <p className="text-xs text-muted-foreground"><bdi dir="ltr" className="font-mono">{e.id}</bdi> · {time(e.start)} · {e.speaker} {e.context_only ? "· הקשר קודם בלבד" : ""}</p>
                  <blockquote className="mt-1 border-s-2 border-input ps-3 leading-7">{e.text}</blockquote>
                </div>)}
                {!selected.evidence.some(e => e.kind === "transcript") && <p className="text-xs text-muted-foreground">אין תמלול זמין לחלון זה.</p>}
              </div>
            </details>
            <div className="space-y-3"><h3 className="text-sm font-semibold">הזדמנויות לוויסות ומימושן</h3>
              {selected.interpretation.findings.map(f => <div key={f.code} className="list-card space-y-2">
                <div className="flex justify-between items-start gap-2 text-sm"><strong className="font-semibold">{ENVIRONMENT_CODES[f.code]}</strong><span className={`badge badge-lg shrink-0 ${evidenceTone[f.state] ?? "tone-neutral"}`}>{EVIDENCE_STATES[f.state]}</span></div>
                <p className="reading">{f.rationale}</p>
                <p className="text-xs text-muted-foreground">תחולה: {scope[f.scope]} · ראיות: <bdi>{f.evidence_ids.join(", ") || "אין"}</bdi></p>
                <p className="text-xs">מימוש: {f.uptake === "observed" ? "נצפתה עדות למימוש" : f.uptake === "not_observed" ? "לא נצפה בדגימה" : "לא ניתן לקבוע"}
                  {f.uptake_evidence_ids.length > 0 ? <> · <bdi>{f.uptake_evidence_ids.join(", ")}</bdi></> : ""}
                  {f.direct_support_also_present ? " · זוהתה גם תמיכה ישירה" : ""}</p>
              </div>)}
            </div>
            {(() => {
              const limitations = [...(selected.observation.limitations ?? []), ...selected.interpretation.limitations];
              return limitations.length > 0 && <div className="callout tone-warning">
                <AlertTriangle size={16} className="callout-icon" aria-hidden />
                <div className="min-w-0 space-y-1 text-xs">{limitations.map((text, i) =>
                  <p key={i}>{text}</p>)}</div>
              </div>;
            })()}
            {selected.audit.performed && <div className="panel-inset flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden />
              <div className="min-w-0 space-y-1">
                <p>בוצעה ביקורת מודל נוספת; זו אינה בדיקה אנושית.</p>
                {selected.audit.issues?.map((issue, i) => <p key={i}>{ENVIRONMENT_CODES[issue.code]}: {issue.reason}</p>)}
              </div>
            </div>}
            <div className="border-t border-border pt-4 space-y-3"><h3 className="text-sm font-semibold">בדיקה אנושית</h3>
              {latestReview && <p className="text-sm leading-relaxed"><span className={`badge badge-lg align-middle ${verdictTone[latestReview.verdict]}`}>{verdicts[latestReview.verdict]}</span> · {latestReview.notes}</p>}
              <label className="block space-y-1.5"><span className="field-label">החלטה</span>
                <select className="field block" value={reviewVerdict}
                  onChange={e => setReviewVerdict(e.target.value as EnvironmentReview["verdict"])}>
                  {Object.entries(verdicts).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select></label>
              <label className="block space-y-1.5"><span className="field-label">הערות ותיקון מוצע</span>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={4000} rows={3}
                  className="field block" placeholder="מה דורש תיקון ומהן הראיות לכך?" /></label>
              <button onClick={saveReview} disabled={busy || (reviewVerdict === "needs_correction" && !notes.trim())} className={btnPrimary}>שמירת בדיקה</button>
              <p className="text-xs text-muted-foreground">ההערה נשמרת לצד הפלט המקורי. הספירות לעיל אינן משתנות בעקבות ההערה.</p>
            </div>
          </>}
        </div>}
      </div>
    </>}
  </div>;
}
