"use client";

import { useEffect, useState } from "react";
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
const button = "rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed";
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
        body: JSON.stringify({ videoId, config: { interval_seconds: interval, frames_per_window: frames, adaptive_video: adaptive } }) });
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
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <p className="text-sm text-muted-foreground">ניתוח סביבת הלמידה ותמיכה עקיפה ב־SRL. ממצאי הפיילוט דורשים בדיקה אנושית; דגימה אינה תיעוד רציף של השיעור.</p>
      <div className="flex flex-wrap items-end gap-4">
        <label className="space-y-1 text-sm"><span className="block">דגימת תמונות</span>
          <select value={sampling} onChange={e => setSampling(e.target.value)} disabled={busy || active} className={button + " bg-background"}>
            <option value="60:3">3 תמונות בכל דקה (מומלץ לפיילוט)</option>
            <option value="60:1">תמונה בכל דקה</option><option value="180:1">תמונה בכל 3 דקות</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm py-2"><input type="checkbox" checked={adaptive}
          onChange={e => setAdaptive(e.target.checked)} disabled={busy || active} />בדיקת תנועה לפי הצורך (עד 6 קטעים)</label>
        <button onClick={startRun} disabled={busy || active || loading || !data} className={button + " bg-primary text-primary-foreground"}>
          {busy ? "שומרת…" : active ? "קיימת הרצה פעילה" : "התחלת ניתוח סביבת הלמידה"}
        </button>
        <button onClick={() => setRevision(n => n + 1)} className={button}>רענון</button>
      </div>
      <p className="text-xs text-muted-foreground">ההרצה נעשית ברקע ושומרת את ניתוח ה־SRL הישיר. תמלול קיים ישולב כראיה; אם חסר תמלול, הדבר יסומן כמגבלת הניתוח.</p>
    </div>
    {error && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm">{error}</p>}
    {loading && <p role="status">טוענת את ניתוח סביבת הלמידה…</p>}
    {!loading && data && !run && <p className="p-6 text-muted-foreground border border-dashed border-border rounded-xl">עדיין אין הרצות שלך לשיעור הזה. בחרי את הדגימה והתחילי ניתוח.</p>}
    {run && <>
      <div className="flex flex-wrap gap-3 items-center">
        <label className="text-sm flex items-center gap-2">הרצה
          <select className={button + " bg-background"} value={run.id} onChange={e => {
            setRunId(e.target.value); setData(null); setLoading(true); setSelectedId(""); setNotes("");
          }}>
            {(data?.runs ?? []).map(r => <option key={r.id} value={r.id}>
              {new Date(r.created_at).toLocaleString("he-IL")} · {RUN_STATES[r.status]}
            </option>)}
          </select>
        </label>
        <span role="status" className="text-sm">{RUN_STATES[run.status]}{run.progress.total ? ` · ${run.progress.current ?? 0}/${run.progress.total} חלונות` : ""}</span>
        <button onClick={exportRun} disabled={!observations.length} className={button}>ייצוא ראיות וקידוד JSON</button>
      </div>
      {run.status === "pending" && <p className="text-sm text-muted-foreground">הבקשה ממתינה ל־Worker. ההתקדמות תתעדכן כאן אוטומטית כשהעיבוד יתחיל.</p>}
      {run.error && <p role="alert" className="text-sm text-red-500" dir="auto">{run.error}</p>}
      {run.summary.transcript_available === false && <p className="text-sm text-amber-600">לא נמצא תמלול להרצה זו. אין להסיק הוראות משימה או מימוש מילולי מהתמונות בלבד.</p>}
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-4 min-w-0">
          <div className="aspect-video overflow-hidden rounded-xl border border-border" dir="ltr">
            <VideoPlayer url={videoUrl} seekRequest={seek} markers={observations.map(o => ({ id: o.id, startTime: o.start_time,
              label: o.observation.description ?? "חלון שלא נותח", color: o.status === "failed" ? "#f59e0b" : "#0d9488" }))} />
          </div>
          <div className="rounded-xl bg-card border border-border p-4 space-y-3">
            <h2 className="font-semibold">חלונות הדגימה</h2>
            <p className="text-xs text-muted-foreground">לחיצה מציגה את הראיות ומעבירה את הנגן לזמן המתאים. קטעי תנועה נוספים אינם נספרים כדגימות נוספות.</p>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto" dir="ltr">
              {observations.map(o => <button key={o.id} onClick={() => { setSelectedId(o.id); setNotes(""); setReviewVerdict("accepted"); seekTo(o.start_time); }}
                aria-pressed={o.id === selected?.id} title={o.status === "failed" ? "החלון לא נותח" : o.observation.description}
                className={`${button} font-mono ${o.id === selected?.id ? "bg-primary/15 border-primary" : ""} ${o.status === "failed" ? "text-amber-600" : ""}`}>
                {time(o.start_time)}{o.status === "failed" ? " !" : ""}
              </button>)}
              {!observations.length && <p dir="rtl" className="text-sm text-muted-foreground">חלונות הניתוח יופיעו כאן עם השלמתם.</p>}
            </div>
          </div>
          {run.summary.counts && <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h2 className="font-semibold">הזדמנויות שזוהו בדגימות</h2>
            <p className="text-xs text-muted-foreground">ספירת קידוד אוטומטי לפני תיקוני אדם. המכנה כולל חלונות שניתנים להערכה לכל ממד; חלונות לא ידועים או כושלים אינם נחשבים להיעדר תמיכה. זו אינה חלוקת זמן השיעור.</p>
            {Object.entries(run.summary.counts).map(([code, counts]) => <div key={code} className="flex justify-between gap-3 text-sm">
              <span>{ENVIRONMENT_CODES[code] ?? code}</span>
              <span>{counts.supported} נתמכים מתוך {counts.assessable} ניתנים להערכה · {counts.partial} חלקיים · {counts.unknown} לא ידועים</span>
            </div>)}
            <p className="text-xs text-muted-foreground">נותחו {run.summary.completed_windows} חלונות; {run.summary.failed_windows} נכשלו.</p>
          </div>}
          <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">פרטי ההרצה</summary>
            <p className="mt-2" dir="ltr">{run.protocol_version} · {Object.values(run.models).join(" / ")}</p>
            <p>{run.config.frames_per_window} תמונות בכל {run.config.interval_seconds} שניות</p>
          </details>
        </div>
        {selected && <div className="rounded-xl bg-card border border-border p-5 space-y-5 min-w-0">
          <div className="flex justify-between items-center gap-3"><h2 className="font-semibold">תצפית וראיות</h2>
            <button dir="ltr" className={button + " font-mono"} onClick={() => seekTo(selected.start_time)}>{time(selected.start_time)}–{time(selected.end_time)}</button></div>
          {selected.status === "failed" ? <p role="alert" className="text-amber-600 text-sm" dir="auto">{selected.error}</p> : <>
            <div className="space-y-2"><h3 className="text-sm font-semibold">מה נצפה</h3>
              <p className="text-sm leading-7">{selected.observation.description}</p>
              <p className="text-xs text-muted-foreground">{organization[selected.observation.organization ?? "unknown"]} · {coverage[selected.observation.coverage ?? "unusable"]}</p>
              <p className="text-xs">משאבים: {selected.observation.resources?.join(" · ") || "לא זוהו"}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {selected.evidence.filter(e => e.kind === "image").map(e => <figure key={e.id} className="space-y-1">
                {e.url ? <a href={e.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- private expiring evidence URLs */}
                  <img src={e.url} alt={`תמונת ראיה מהשיעור בזמן ${time(e.start)}`} className="w-full rounded-lg border border-border" loading="lazy" />
                </a> : <div className="p-4 border border-dashed border-border text-xs">התמונה אינה זמינה; אפשר לרענן.</div>}
                <figcaption className="text-xs text-muted-foreground" dir="ltr">{e.id} · {time(e.start)}</figcaption>
              </figure>)}
            </div>
            {selected.evidence.filter(e => e.kind === "video").map(e => <figure key={e.id}>
              {e.url && <video controls preload="none" src={e.url} className="w-full rounded-lg" />}
              <figcaption className="text-xs text-muted-foreground">בדיקת תנועה ללא שמע · {time(e.start)}–{time(e.end)} · {e.id}</figcaption>
            </figure>)}
            <details className="rounded-lg bg-secondary/30 p-3"><summary className="cursor-pointer text-sm">תמלול והקשר המשימה ({selected.evidence.filter(e => e.kind === "transcript").length})</summary>
              <div className="mt-3 max-h-60 overflow-y-auto space-y-3">
                {selected.evidence.filter(e => e.kind === "transcript").map(e => <div key={e.id} className="text-sm">
                  <p className="text-xs text-muted-foreground">{e.id} · {time(e.start)} · {e.speaker} {e.context_only ? "· הקשר קודם בלבד" : ""}</p>
                  <blockquote>{e.text}</blockquote>
                </div>)}
                {!selected.evidence.some(e => e.kind === "transcript") && <p className="text-xs">אין תמלול זמין לחלון זה.</p>}
              </div>
            </details>
            <div className="space-y-3"><h3 className="text-sm font-semibold">הזדמנויות לוויסות ומימושן</h3>
              {selected.interpretation.findings.map(f => <div key={f.code} className="border border-border rounded-lg p-3 space-y-2">
                <div className="flex justify-between gap-2 text-sm"><strong>{ENVIRONMENT_CODES[f.code]}</strong><span>{EVIDENCE_STATES[f.state]}</span></div>
                <p className="text-sm leading-6">{f.rationale}</p>
                <p className="text-xs text-muted-foreground">תחולה: {scope[f.scope]} · ראיות: {f.evidence_ids.join(", ") || "אין"}</p>
                <p className="text-xs">מימוש: {f.uptake === "observed" ? "נצפתה עדות למימוש" : f.uptake === "not_observed" ? "לא נצפה בדגימה" : "לא ניתן לקבוע"}
                  {f.uptake_evidence_ids.length > 0 ? ` · ${f.uptake_evidence_ids.join(", ")}` : ""}
                  {f.direct_support_also_present ? " · זוהתה גם תמיכה ישירה" : ""}</p>
              </div>)}
            </div>
            {[...(selected.observation.limitations ?? []), ...selected.interpretation.limitations].map((text, i) =>
              <p key={i} className="text-xs text-amber-600">{text}</p>)}
            {selected.audit.performed && <div className="text-xs text-muted-foreground space-y-1">
              <p>בוצעה ביקורת מודל נוספת; זו אינה בדיקה אנושית.</p>
              {selected.audit.issues?.map((issue, i) => <p key={i}>{ENVIRONMENT_CODES[issue.code]}: {issue.reason}</p>)}
            </div>}
            <div className="border-t border-border pt-4 space-y-3"><h3 className="text-sm font-semibold">בדיקה אנושית</h3>
              {latestReview && <p className="text-sm">{verdicts[latestReview.verdict]} · {latestReview.notes}</p>}
              <label className="block text-sm">החלטה
                <select className={button + " block w-full mt-1 bg-background"} value={reviewVerdict}
                  onChange={e => setReviewVerdict(e.target.value as EnvironmentReview["verdict"])}>
                  {Object.entries(verdicts).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select></label>
              <label className="block text-sm">הערות ותיקון מוצע
                <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={4000} rows={3}
                  className="block w-full mt-1 rounded-lg border border-border bg-background p-3" placeholder="מה דורש תיקון ומהן הראיות לכך?" /></label>
              <button onClick={saveReview} disabled={busy || (reviewVerdict === "needs_correction" && !notes.trim())} className={button}>שמירת בדיקה</button>
              <p className="text-xs text-muted-foreground">ההערה נשמרת לצד הפלט המקורי. הספירות לעיל אינן משתנות בעקבות ההערה.</p>
            </div>
          </>}
        </div>}
      </div>
    </>}
  </div>;
}
