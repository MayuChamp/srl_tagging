import { useId } from "react";
import { ORGANIZATION_LABELS, summarizeOrganization, type EnvironmentObservation, type OrganizationKind } from "@/lib/environment";

const colors: Record<OrganizationKind, string> = {
  whole_class: "#32798a", individual: "#b96c49", pairs: "#9570b5", groups: "#4e8970",
  mixed: "#bb9235", unknown: "#8b9098",
};

export function EnvironmentOrganizationChart({ observations, totalWindows }: {
  observations: EnvironmentObservation[]; totalWindows?: number;
}) {
  const id = useId();
  const summary = summarizeOrganization(observations, totalWindows);
  let cursor = 0;
  const slices = (Object.keys(ORGANIZATION_LABELS) as OrganizationKind[]).map(kind => {
    const count = summary.counts[kind];
    const percent = summary.completed ? count / summary.completed * 100 : 0;
    const start = cursor; cursor += percent;
    return { kind, count, percent, start, end: cursor };
  });
  const gradient = slices.filter(s => s.count).map(s => `${colors[s.kind]} ${s.start}% ${s.end}%`).join(", ");
  return <section className="panel p-4 sm:p-5 space-y-4" aria-labelledby={`${id}-title`}>
    <div className="space-y-1.5">
      <h2 id={`${id}-title`} className="card-title">סוגי סביבת הלמידה בדגימות</h2>
      <p className="text-xs text-muted-foreground leading-relaxed">התפלגות חלונות שנותחו, לא משך השיעור. כל חלון נספר פעם אחת; גם חלונות שלא ניתן לסווג נכללים בעוגה.</p>
    </div>
    {summary.completed > 0 ? <div className="flex flex-wrap items-center gap-6">
      <div className="relative size-44 shrink-0 rounded-full mx-auto sm:mx-0" aria-hidden="true"
        style={{ background: `conic-gradient(${gradient})` }}>
        <div className="absolute inset-9 rounded-full bg-card flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-semibold tabular-nums">{summary.completed}</span>
          <span className="text-xs text-muted-foreground">חלונות נותחו</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2 text-sm" aria-label="מספר ואחוז חלונות לפי ארגון הלמידה">
        {slices.map(slice => <li key={slice.kind} className="flex gap-2 items-center justify-between">
          <span className="flex items-center gap-2"><span className="size-3 rounded-full shrink-0" style={{ background: colors[slice.kind] }} aria-hidden="true" />
            {ORGANIZATION_LABELS[slice.kind]}</span>
          <span className="tabular-nums text-xs whitespace-nowrap">{slice.count} חלונות · {slice.percent.toLocaleString("he-IL", { maximumFractionDigits: 1 })}%</span>
        </li>)}
      </ul>
    </div> : <p className="text-sm text-muted-foreground">התרשים יופיע לאחר השלמת ניתוח של חלון אחד לפחות.</p>}
    <p className="text-xs text-muted-foreground leading-relaxed">{summary.failed} חלונות נכשלו · {summary.unprocessed === null ? "מספר החלונות שטרם עובדו אינו ידוע" : `${summary.unprocessed} חלונות טרם עובדו`}. אלה אינם נכללים בעוגה.</p>
    {summary.completed > 0 && <p className="text-xs text-muted-foreground leading-relaxed">ב־{summary.limitedCoverage} מתוך {summary.completed} חלונות כיסוי המצלמה מוגבל או לא ידוע. מליאה אינה בהכרח הוראה פרונטלית; ארגון בקבוצות אינו מעיד כשלעצמו על שיתוף פעולה או ויסות עצמי.</p>}
  </section>;
}
