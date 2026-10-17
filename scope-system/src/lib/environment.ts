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
  interval_seconds: number; frames_per_window: number; adaptive_video: boolean;
}
export interface EnvironmentRun {
  id: string; video_id: string; created_at: string; status: string;
  protocol_version: string; config: EnvironmentConfig;
  models: Record<string, string>; progress: { current?: number; total?: number };
  summary: { completed_windows?: number; failed_windows?: number; transcript_available?: boolean;
    counts?: Record<string, Record<string, number>> };
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
    limitations?: string[]; evidence_ids?: string[] };
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
  observations: EnvironmentObservation[]; reviews: EnvironmentReview[];
}
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export function parseEnvironmentConfig(value: unknown): EnvironmentConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const c = value as Record<string, unknown>;
  if (Object.keys(c).some(k => !["interval_seconds", "frames_per_window", "adaptive_video"].includes(k))) return null;
  const validSampling = (c.interval_seconds === 60 && (c.frames_per_window === 1 || c.frames_per_window === 3))
    || (c.interval_seconds === 180 && c.frames_per_window === 1);
  if (!validSampling || typeof c.adaptive_video !== "boolean") return null;
  return { interval_seconds: c.interval_seconds as number, frames_per_window: c.frames_per_window as number,
    adaptive_video: c.adaptive_video };
}
