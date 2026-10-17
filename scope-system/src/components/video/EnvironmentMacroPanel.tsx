import { useState } from "react";
import { EVIDENCE_STATES, type EnvironmentMacro, type EnvironmentMacroEpisode, type EnvironmentMacroReview, type EnvironmentObservation, type EnvironmentReview } from "@/lib/environment";

const mechanisms: Record<string, string> = { planning: "תכנון", choice: "בחירה", monitoring: "ניטור", revision: "תיקון דרך הפעולה", self_evaluation: "הערכה עצמית", help_seeking: "בקשת עזרה", co_regulation: "ויסות משותף" };
const support: Record<string, string> = { direct: "ישירה", indirect: "עקיפה", mixed: "משולבת", unknown: "לא ניתן לקבוע" };
const responsibility: Record<string, string> = { teacher: "המורה", shared: "אחריות משותפת", students: "התלמידים", unknown: "לא ניתן לקבוע" };
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function EnvironmentMacroPanel({ macro, enabled, runId, observations, reviews, reviewsUnavailable, onEvidence, onReview }: {
  macro?: EnvironmentMacro; enabled: boolean; runId: string; observations: EnvironmentObservation[];
  reviews: EnvironmentMacroReview[]; reviewsUnavailable?: boolean; onEvidence: (observation: EnvironmentObservation, time: number) => void;
  onReview: (review: EnvironmentMacroReview) => void;
}) {
  function evidenceLinks(ids: string[], episode: EnvironmentMacroEpisode) {
    return <div className="flex flex-wrap gap-2">{ids.map(id => {
      const observation = observations.find(o => episode.window_indices.includes(o.window_index) && o.evidence.some(e => e.id === id));
      const evidence = observation?.evidence.find(e => e.id === id);
      return observation && evidence ? <button key={id} className="btn btn-secondary btn-sm" onClick={() => onEvidence(observation, evidence.start)}>
        ראיה <bdi>{id}</bdi> · <bdi>{time(evidence.start)}</bdi>
      </button> : <span key={id} className="text-xs text-muted-foreground">ראיה <bdi>{id}</bdi> אינה זמינה בתצוגה</span>;
    })}</div>;
  }
  return <section className="panel p-4 sm:p-5 space-y-4" aria-label="אפיזודות וראיות לאורך השיעור">
    <h2 className="card-title">אפיזודות וראיות לאורך השיעור</h2>
    <p className="text-xs text-muted-foreground leading-relaxed">ניתוח אוטומטי של אפיזודות מתוך דגימות ותמלול. הזדמנות שהמורה יצרה ומימוש שנצפה מוצגים בנפרד; אין כאן מדידה של התפתחות יכולת אצל התלמידים.</p>
    {!macro && <p className="text-sm text-muted-foreground">{enabled ? "ניתוח המאקרו יופיע לאחר עיבוד חלונות השיעור." : "להרצה זו אין ניתוח מאקרו. אפשר להפעיל אותו בהרצה חדשה באמצעות האפשרות שלמעלה."}</p>}
    {macro?.status === "disabled" && <p className="text-sm text-muted-foreground">ניתוח המאקרו לא הופעל בהרצה זו.</p>}
    {macro?.status === "failed" && <p role="status" className="callout tone-warning">ניתוח המאקרו לא הושלם. התצפיות המקוריות נשמרו.</p>}
    {macro?.status === "completed" && <>
      <p className="reading whitespace-pre-line">{macro.lesson_summary}</p>
      <nav aria-label="ציר זמן של אפיזודות" className="flex flex-wrap gap-2">
        {macro.episodes.map(episode => <a href={`#macro-${runId}-${episode.id}`} key={episode.id} className="btn btn-secondary btn-sm"><bdi>{time(episode.start_time)}</bdi> · {episode.title}</a>)}
      </nav>
      {!macro.episodes.length && <p className="text-sm text-muted-foreground">לא זוהו אפיזודות שניתן לבסס על הראיות הזמינות.</p>}
      {macro.episodes.map(episode => <article id={`macro-${runId}-${episode.id}`} key={episode.id} className="panel-inset space-y-4 scroll-mt-6">
        <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-sm font-semibold">{episode.title}</h3><span className="text-xs font-mono" dir="ltr">{time(episode.start_time)}–{time(episode.end_time)}</span></div>
        <p className="text-xs text-muted-foreground">גבולות האפיזודה משוערים על בסיס הדגימות. {episode.window_indices.length} חלונות מקושרים.</p>
        {episode.artifacts.map(artifact => <div key={artifact.id} className="space-y-2 text-sm">
          <strong>{artifact.label}</strong><p>{artifact.changes}</p>
          <p className="text-xs text-muted-foreground">רציפות הרכיב: {artifact.continuity === "supported" ? "נתמכת בראיות" : "קישור מוצע לבדיקה"}</p>
          {evidenceLinks(artifact.evidence_ids, episode)}
        </div>)}
        {episode.opportunities.map((finding, index) => <div key={index} className="list-card space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">{mechanisms[finding.mechanism] ?? finding.mechanism}</h4><span className="badge">{EVIDENCE_STATES[finding.state]}</span></div>
          <p className="reading">{finding.rationale}</p>
          <p className="text-xs">תמיכה: {support[finding.support_type]} · אחריות: {responsibility[finding.responsibility]}</p>
          {evidenceLinks(finding.evidence_ids, episode)}
          <p className="text-xs">מימוש אצל תלמידים: {finding.uptake === "observed" ? "נצפתה ראיה למימוש" : "לא ניתן לקבוע"}</p>
          {evidenceLinks(finding.uptake_evidence_ids, episode)}
        </div>)}
        {evidenceLinks(episode.evidence_ids, episode)}
        {episode.limitations.length > 0 && <div className="text-xs text-muted-foreground space-y-1">{episode.limitations.map((limitation, i) => <p key={i}>{limitation}</p>)}</div>}
        {macro.audit.issues.filter(issue => issue.episode_id === episode.id).map((issue, i) => <p key={i} className="callout tone-warning text-xs">ביקורת מודל: {issue.reason}</p>)}
        {reviewsUnavailable ? <p className="text-xs text-muted-foreground">שמירת בדיקת אפיזודה תהיה זמינה לאחר התקנת עדכון מסד הנתונים.</p> : <MacroReview key={`${runId}-${episode.id}`} runId={runId} episodeId={episode.id} latest={reviews.find(review => review.episode_id === episode.id)} onReview={onReview} />}
      </article>)}
      {macro.audit.performed && <p className="text-xs text-muted-foreground">בוצעה ביקורת מודל נוספת. זו אינה בדיקה אנושית עצמאית.</p>}
    </>}
    {macro?.limitations?.map((limitation, i) => <p key={i} className="text-xs text-muted-foreground">{limitation}</p>)}
  </section>;
}

function MacroReview({ runId, episodeId, latest, onReview }: { runId: string; episodeId: string;
  latest?: EnvironmentMacroReview; onReview: (review: EnvironmentMacroReview) => void;
}) {
  const [verdict, setVerdict] = useState<EnvironmentReview["verdict"]>("accepted");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/environment", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId, episodeId, verdict, notes }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "שמירת הבדיקה נכשלה");
      onReview(result.review); setNotes("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "שמירת הבדיקה נכשלה"); }
    finally { setBusy(false); }
  }
  return <details className="border-t border-border pt-3">
    <summary className="cursor-pointer text-sm font-medium">בדיקה אנושית של האפיזודה{latest ? " · נשמרה בדיקה" : ""}</summary>
    <div className="space-y-3 mt-3">
      {latest && <p className="text-sm">{latest.verdict === "accepted" ? "אושר" : latest.verdict === "rejected" ? "נדחה" : "נדרש תיקון"}: {latest.notes}</p>}
      <label className="block space-y-1"><span className="field-label">החלטה</span><select className="field" value={verdict} onChange={event => setVerdict(event.target.value as EnvironmentReview["verdict"])}><option value="accepted">אושר</option><option value="needs_correction">נדרש תיקון</option><option value="rejected">נדחה</option></select></label>
      <label className="block space-y-1"><span className="field-label">תיקון גבולות, ראיות או פרשנות</span><textarea className="field w-full" rows={3} maxLength={4000} value={notes} onChange={event => setNotes(event.target.value)} placeholder="צייני זמנים, מזהי ראיות ותיקון מוצע." /></label>
      <p className="text-xs text-muted-foreground">הבדיקה נשמרת לצד המקור. בשלב זה תיקונים מתועדים בהערה ואינם משנים אוטומטית את גבולות האפיזודה או מסקנות המודל.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button className="btn btn-primary" disabled={busy || (verdict === "needs_correction" && !notes.trim())} onClick={save}>{busy ? "שומרת…" : "שמירת בדיקת אפיזודה"}</button>
    </div>
  </details>;
}
