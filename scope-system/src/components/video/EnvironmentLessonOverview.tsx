import type { EnvironmentConfig, EnvironmentLessonOverviewData, EnvironmentLessonOverviewItem, EnvironmentMacroEpisode, EnvironmentObservation } from "@/lib/environment";

const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const bases = { observation: "תמונות ותמלול זמינים", tagging: "תיוג", combined: "שילוב תצפיות ותיוג" };
const kinds = { finding: "ממצא", missed_opportunity: "החמצה הנתמכת בראיות", suggestion: "אפשרות פדגוגית להרחבה", uncertain: "לא ניתן לקבוע" };
const evidenceKinds = { image: "תמונה", video: "תנועה", transcript: "תמלול" };

export function EnvironmentLessonOverview({ overview, macroStatus, enabled, runId, episodes, observations, taggingSnapshot, onEvidence, onSeek }: {
  overview?: EnvironmentLessonOverviewData; macroStatus?: string; enabled: boolean; runId: string;
  episodes: EnvironmentMacroEpisode[]; observations: EnvironmentObservation[];
  taggingSnapshot?: EnvironmentConfig["tagging_snapshot"];
  onEvidence: (observation: EnvironmentObservation, timestamp: number) => void;
  onSeek: (timestamp: number) => void;
}) {
  function finding(item: EnvironmentLessonOverviewItem) {
    const linkedEpisodes = episodes.filter(episode => item.episode_ids.includes(episode.id));
    const starts = linkedEpisodes.map(episode => episode.start_time);
    const ends = linkedEpisodes.map(episode => episode.end_time);
    return <article key={item.id} className="list-card space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`badge ${item.kind === "missed_opportunity" ? "tone-warning" : "tone-neutral"}`}>{kinds[item.kind]}</span>
        <span className="text-xs text-muted-foreground">{bases[item.basis]}</span>
        {starts.length > 0 && <span className="text-xs font-mono ms-auto" dir="ltr">{time(Math.min(...starts))}–{time(Math.max(...ends))}</span>}
      </div>
      <p className="reading whitespace-pre-line">{item.text}</p>
      <div className="flex flex-wrap gap-2">
        {item.evidence_ids.map(id => {
          const observation = observations.find(row => row.evidence.some(evidence => evidence.id === id));
          const evidence = observation?.evidence.find(entry => entry.id === id);
          return observation && evidence ? <button key={id} className="btn btn-secondary btn-sm" onClick={() => onEvidence(observation, evidence.start)}>
            {evidenceKinds[evidence.kind]} · <bdi>{time(evidence.start)}</bdi>{evidence.context_only ? " · הקשר קודם" : ""}
          </button> : <span key={id} className="text-xs text-muted-foreground">ראיה <bdi>{id}</bdi> אינה זמינה</span>;
        })}
        {linkedEpisodes.map(episode => <a key={episode.id} className="btn btn-secondary btn-sm" href={`#macro-${runId}-${episode.id}`}>אפיזודה: {episode.title}</a>)}
      </div>
      {item.tag_ids.map(id => {
        const tag = taggingSnapshot?.tags.find(entry => entry.id === id);
        return tag ? <details key={id} className="panel-inset text-sm">
          <summary className="cursor-pointer">תיוג: {tag.label} · <bdi>{time(tag.start_time)}</bdi></summary>
          <div className="space-y-2 mt-2">
            <p className="whitespace-pre-line">{tag.text || "אין טקסט ראיה נוסף בתיוג."}</p>
            <button className="btn btn-secondary btn-sm" onClick={() => onSeek(tag.start_time)}>לרגע המתויג בשיעור</button>
          </div>
        </details> : <p key={id} className="text-xs text-muted-foreground">תיוג <bdi>{id}</bdi> אינו זמין בתצוגה</p>;
      })}
    </article>;
  }
  const sections: { key: "progression" | "support_patterns" | "responsibility_trajectory" | "opportunities" | "conflicts"; title: string; empty: string }[] = [
    { key: "progression", title: "מהלך השיעור", empty: "אין די ראיות לתיאור מהלך השיעור." },
    { key: "support_patterns", title: "כיצד הסביבה תמכה בהכוונה עצמית", empty: "לא זוהה דפוס תמיכה שניתן לבסס לאורך השיעור." },
    { key: "responsibility_trajectory", title: "האחריות ללמידה לאורך השיעור", empty: "לא ניתן לקבוע כיצד האחריות עברה בין המורה לתלמידים." },
    { key: "opportunities", title: "החמצות מבוססות והזדמנויות להרחבה", empty: "לא נמצאו החמצות מבוססות או הצעות שניתן לקשור לראיות הזמינות." },
    { key: "conflicts", title: "פערים בין המקורות לבדיקה", empty: "לא זוהו סתירות מבוססות בין המקורות. אין בכך אישור לנכונות התיוגים." },
  ];
  return <section className="panel p-4 sm:p-6 space-y-5" aria-label="תמונת העל של השיעור">
    <div className="space-y-2">
      <h2 className="card-title">תמונת העל של השיעור</h2>
      <p className="text-sm text-muted-foreground leading-relaxed">איך עיצוב הסביבה תמך בתכנון, בניטור ובהערכה עצמית, ומה ניתן ללמוד על העברת האחריות לתלמידים לאורך השיעור.</p>
    </div>
    {!overview && <p className="callout tone-neutral">{macroStatus === "completed" ? "להרצה זו יש ניתוח אפיזודות, אך טרם נוצרה תמונת על. היא תופק בהרצה חדשה עם ניתוח המאקרו מסומן, עם תיוג או בלעדיו." : macroStatus === "failed" ? "תמונת העל אינה זמינה משום שניתוח המאקרו לא הושלם. התצפיות הזמינות נשמרו בהמשך." : enabled ? "תמונת העל תיבנה לאחר השלמת התצפיות והאפיזודות." : "כדי להפיק תמונת על, סמני ניתוח מאקרו בהרצה חדשה. אפשר לנתח ללא תיוג או לבחור סשן תיוג להעשרת הניתוח."}</p>}
    {overview?.status === "failed" && <p role="status" className="callout tone-warning">תמונת העל לא הושלמה. ניתוח האפיזודות והראיות הזמינות מוצגים בהמשך.</p>}
    {overview?.status === "completed" && <>
      <div className="panel-inset space-y-2">
        <p className="reading whitespace-pre-line">{overview.narrative}</p>
        <p className="text-xs text-muted-foreground">כיסוי: {overview.coverage.completed_windows} מתוך {overview.coverage.total_windows} חלונות. זו תמונת על של התיעוד הזמין, ולא תצפית רציפה.</p>
        <p className="text-xs">{overview.tagging_session_id ? `הניתוח נעזר בסשן התיוג: ${taggingSnapshot?.session_name ?? "הסשן שנבחר בהרצה"}${taggingSnapshot?.is_ai_generated ? " · תיוג אוטומטי" : ""}` : "הניתוח הופק ללא סשן תיוג, על בסיס התצפיות והתמלול הזמינים."}</p>
        {overview.tagging_session_id && <p className="text-xs text-muted-foreground">התיוגים נשמרו כפי שהיו בזמן יצירת ההרצה. הם מקור נוסף לבדיקה; היעדר תיוג אינו היעדר תמיכה.</p>}
      </div>
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5 space-y-3">
        <h3 className="text-base font-semibold">המסקנה הכוללת</h3>
        {overview.synthesis?.length ? overview.synthesis.map(finding) : <p className="text-sm text-muted-foreground">אין די ראיות למסקנה כוללת על התמיכה בהכוונה עצמית לאורך השיעור.</p>}
      </div>
      {sections.map(section => <div key={section.key} className="space-y-3">
        <h3 className="text-sm font-semibold">{section.title}</h3>
        {section.key === "opportunities" && <p className="text-xs text-muted-foreground">הצעה להרחבה אינה קביעה שהמורה החמיצה הזדמנות. היעדר פעולה בסנפשוט אינו כשלעצמו ראיה להחמצה.</p>}
        {overview[section.key].length ? overview[section.key].map(finding) : <p className="text-sm text-muted-foreground">{section.empty}</p>}
      </div>)}
    </>}
    {overview?.status === "completed" && !!overview.limitations.length && <details className="border-t border-border pt-3" open>
      <summary className="cursor-pointer text-sm font-semibold">מגבלות תמונת העל</summary>
      <ul className="list-disc ps-5 mt-2 space-y-1 text-xs text-muted-foreground">{overview.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>
    </details>}
  </section>;
}
