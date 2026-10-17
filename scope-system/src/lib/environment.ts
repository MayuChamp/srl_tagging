export const ENVIRONMENT_CODES: Record<string, string> = {
  ENV_CHOICE: "בחירה ושליטה",
  ENV_OPEN_TASK: "משימה פתוחה",
  ENV_KNOWLEDGE: "בניית ידע והקשר",
  ENV_COLLABORATION: "שיתוף פעולה מובנה",
  ENV_PLANNING: "תנאים לתכנון",
  ENV_MONITORING: "תנאים לניטור ולהערכה",
};
export const EVIDENCE_STATES = {
  supported: "נתמך בראיות", partial: "ראיות חלקיות",
  not_observed: "לא נצפה בדגימה", unknown: "לא ניתן לקבוע",
};
export const RUN_STATES: Record<string, string> = {
  pending: "ממתין לעיבוד", processing: "בניתוח", completed: "הניתוח הושלם",
  completed_with_errors: "הושלם עם חלונות שלא נותחו", failed: "הניתוח נכשל",
};
export interface EnvironmentConfig {
  interval_seconds: number; frames_per_window: number; adaptive_video: boolean; macro_analysis?: boolean;
  tagging_session_id?: string; tagging_snapshot?: EnvironmentTaggingSnapshot;
}
export interface EnvironmentRun {
  id: string; video_id: string; created_at: string; status: string;
  protocol_version: string; config: EnvironmentConfig;
  models: Record<string, string>; progress: { current?: number; total?: number };
  summary: { completed_windows?: number; failed_windows?: number; unprocessed_windows?: number; transcript_available?: boolean;
    macro?: EnvironmentMacro; counts?: Record<string, Record<string, number>> };
  error: string | null;
}
export interface EnvironmentEvidence {
  id: string; kind: "image" | "video" | "transcript"; start: number; end: number;
  text?: string; speaker?: string; context_only: boolean; storage_path?: string; url?: string;
}
export interface EnvironmentFinding {
  code: string; state: keyof typeof EVIDENCE_STATES; rationale: string; evidence_ids: string[];
  scope: string; uptake: "observed" | "not_observed" | "unknown";
  uptake_evidence_ids: string[]; direct_support_also_present: boolean;
}
export interface EnvironmentObservation {
  id: string; run_id: string; window_index: number; start_time: number; end_time: number;
  status: "completed" | "failed"; error: string | null;
  observation: { description?: string; organization?: string; coverage?: string;
    teacher_actions?: string[]; student_actions?: string[]; resources?: string[];
    limitations?: string[]; evidence_ids?: string[]; visual_artifacts?: { label: string; readable_text: string; evidence_ids: string[]; limitations: string[] }[] };
  interpretation: { findings: EnvironmentFinding[]; limitations: string[] };
  evidence: EnvironmentEvidence[];
  audit: { performed?: boolean; issues?: { code: string; reason: string }[] };
}
export interface EnvironmentReview {
  id: string; observation_id: string; created_at: string;
  verdict: "accepted" | "needs_correction" | "rejected"; notes: string;
}
export interface EnvironmentResponse {
  runs: EnvironmentRun[]; run: EnvironmentRun | null;
  observations: EnvironmentObservation[]; reviews: EnvironmentReview[]; macroReviews?: EnvironmentMacroReview[]; macroReviewsUnavailable?: boolean;
  taggingSessions?: EnvironmentTaggingSession[]; taggingSessionsUnavailable?: boolean;
}
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export function parseEnvironmentConfig(value: unknown): EnvironmentConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const c = value as Record<string, unknown>;
  if (Object.keys(c).some(k => !["interval_seconds", "frames_per_window", "adaptive_video", "macro_analysis", "tagging_session_id"].includes(k))) return null;
  const validSampling = (c.interval_seconds === 60 && (c.frames_per_window === 1 || c.frames_per_window === 3))
    || (c.interval_seconds === 180 && c.frames_per_window === 1);
  if (!validSampling || typeof c.adaptive_video !== "boolean" || (c.macro_analysis !== undefined && typeof c.macro_analysis !== "boolean")) return null;
  if (c.tagging_session_id !== undefined && (!isUuid(c.tagging_session_id) || c.macro_analysis !== true)) return null;
  return { interval_seconds: c.interval_seconds as number, frames_per_window: c.frames_per_window as number,
    adaptive_video: c.adaptive_video, ...(c.macro_analysis === undefined ? {} : { macro_analysis: c.macro_analysis as boolean }),
    ...(c.tagging_session_id === undefined ? {} : { tagging_session_id: c.tagging_session_id as string }) };
}

export const ORGANIZATION_LABELS = {
  whole_class: "מליאה", individual: "עבודה אישית", pairs: "עבודה בזוגות",
  groups: "ארגון בקבוצות", mixed: "ארגון משולב", unknown: "לא ניתן לקבוע",
} as const;
export type OrganizationKind = keyof typeof ORGANIZATION_LABELS;

/** Each completed sampled window contributes exactly once, including unknown. */
export function summarizeOrganization(
  observations: Pick<EnvironmentObservation, "status" | "observation">[], totalWindows?: number,
) {
  const counts = Object.fromEntries(Object.keys(ORGANIZATION_LABELS).map(key => [key, 0])) as Record<OrganizationKind, number>;
  let completed = 0;
  let failed = 0;
  let limitedCoverage = 0;
  for (const item of observations) {
    if (item.status !== "completed") { failed++; continue; }
    completed++;
    if (item.observation.coverage !== "class_visible") limitedCoverage++;
    const value = item.observation.organization;
    const kind: OrganizationKind = value && Object.hasOwn(ORGANIZATION_LABELS, value)
      ? value as OrganizationKind : "unknown";
    counts[kind]++;
  }
  return { counts, completed, failed, limitedCoverage,
    unprocessed: typeof totalWindows === "number" && Number.isFinite(totalWindows)
      ? Math.max(0, Math.floor(totalWindows) - completed - failed) : null };
}

export interface EnvironmentMacroOpportunity {
  mechanism: string; support_type: string; responsibility: string;
  state: "supported" | "partial" | "unknown"; rationale: string;
  evidence_ids: string[]; uptake: "observed" | "unknown"; uptake_evidence_ids: string[];
}
export interface EnvironmentMacroEpisode {
  id: string; start_time: number; end_time: number; title: string;
  window_indices: number[]; evidence_ids: string[];
  artifacts: { id: string; label: string; evidence_ids: string[]; continuity: "candidate" | "supported"; changes: string }[];
  opportunities: EnvironmentMacroOpportunity[]; limitations: string[];
}
export type EnvironmentMacro = {
  protocol_version: string; status: "failed" | "disabled"; error?: string; limitations?: string[];
} | {
  protocol_version: string; status: "completed";
  source: string; lesson_overview?: EnvironmentLessonOverview; episodes: EnvironmentMacroEpisode[]; lesson_summary: string;
  limitations: string[]; audit: { performed: boolean; issues: { episode_id: string; reason: string }[] };
}
export interface EnvironmentMacroReview {
  id: string; run_id: string; episode_id: string | null; created_at: string;
  verdict: EnvironmentReview["verdict"]; notes: string;
}

export interface EnvironmentTaggingSession {
  id: string; name: string; created_at: string; is_ai_generated: boolean;
}
export interface EnvironmentTaggingSnapshot {
  session_id: string; session_name: string; is_ai_generated: boolean; captured_at: string;
  tags: { id: string; code_id: string; label: string; start_time: number; end_time: number; text: string }[];
  total_tags: number; truncated: boolean; limitations: string[];
}
export interface EnvironmentLessonOverviewItem {
  id: string; text: string; episode_ids: string[]; evidence_ids: string[]; tag_ids: string[];
  basis: "observation" | "tagging" | "combined";
  kind: "finding" | "missed_opportunity" | "suggestion" | "uncertain";
}
export type EnvironmentLessonOverview = { status: "failed"; error?: string } | {
  status: "completed"; narrative: string; synthesis: EnvironmentLessonOverviewItem[];
  progression: EnvironmentLessonOverviewItem[]; support_patterns: EnvironmentLessonOverviewItem[];
  responsibility_trajectory: EnvironmentLessonOverviewItem[]; opportunities: EnvironmentLessonOverviewItem[];
  conflicts: EnvironmentLessonOverviewItem[]; limitations: string[]; tagging_session_id: string | null;
  coverage: { completed_windows: number; total_windows: number };
};

/** Only call with rows fetched using the authenticated server client, never request JSON. */
export function buildTaggingSnapshot(session: EnvironmentTaggingSession, rows: Record<string, unknown>[],
  totalTags: number, codes: unknown, capturedAt = new Date().toISOString()): EnvironmentTaggingSnapshot {
  const labels = new Map<string, string>();
  if (Array.isArray(codes)) for (const code of codes) {
    if (code && typeof code.id === "string" && typeof code.label === "string") labels.set(code.id, code.label.slice(0, 200));
  }
  const tags: EnvironmentTaggingSnapshot["tags"] = [];
  let skipped = 0;
  let shortened = false;
  const seen = new Set<string>();
  for (const row of rows.slice(0, 400)) {
    if (!isUuid(row.id) || seen.has(row.id) || typeof row.code_id !== "string" || !row.code_id.trim()
      || row.code_id.length > 120 || typeof row.start_time !== "number" || !Number.isFinite(row.start_time)
      || row.start_time < 0 || typeof row.end_time !== "number" || !Number.isFinite(row.end_time)
      || row.end_time < row.start_time) { skipped++; continue; }
    seen.add(row.id);
    const text = typeof row.evidence_text === "string" ? row.evidence_text : "";
    if (text.length > 2000) shortened = true;
    tags.push({ id: row.id, code_id: row.code_id, label: labels.get(row.code_id) || row.code_id,
      start_time: row.start_time, end_time: row.end_time, text: text.slice(0, 2000) });
  }
  const truncated = totalTags > 400 || skipped > 0 || shortened;
  return { session_id: session.id, session_name: session.name.slice(0, 200),
    is_ai_generated: session.is_ai_generated, captured_at: capturedAt, tags, total_tags: totalTags, truncated,
    limitations: ["התיוג הוא מקור פרשני ולא אמת מאומתת; היעדר תיוג אינו מעיד על היעדר תמיכה.",
      "התיוג נשמר כפי שהיה בתחילת ההרצה; שינויים מאוחרים אינם נכללים.",
      ...(totalTags > 400 ? ["נכללו לכל היותר 400 תיוגים לפי סדר הזמן; המשך התיוג לא נכלל."] : []),
      ...(skipped ? ["תיוגים בעלי זמנים או מזהים לא תקינים הושמטו."] : []),
      ...(shortened ? ["קטעי טקסט ארוכים קוצרו ל־2,000 תווים."] : [])] };
}

export type EnvironmentLessonOverviewData = EnvironmentLessonOverview;
