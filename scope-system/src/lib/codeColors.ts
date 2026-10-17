/**
 * Canonical code-identity colors (hex) for every SCOPE, Nonverbal/Prosodic and
 * legacy ATES code.
 *
 * Copied verbatim from the superset map in src/app/sessions/[id]/page.tsx.
 * Code identity colors never change: render them through the .code-chip /
 * .code-dot classes (globals.css) by setting the `--code` custom property,
 * e.g. style={{ "--code": codeColor(id) } as React.CSSProperties}.
 * The pure hex is meant for dots, timeline markers and accent bars only.
 */
export const CODE_COLORS: Record<string, string> = {
  // SCOPE: TDS
  TDS_COG: "#0891b2", TDS_META: "#0e7490", TDS_MOT: "#155e75", TDS_NONE: "#475569",
  // SCOPE: EX
  EX_IMPL: "#6366f1", EX_PART: "#7c3aed", EX_EXPL: "#4f46e5", EX_NA: "#64748b",
  // SCOPE: SRL
  SRL_GOAL: "#0ea5e9", SRL_PLAN: "#0284c7", SRL_COG: "#0369a1", SRL_MON: "#075985",
  SRL_CTRL: "#0c4a6e", SRL_REFL: "#164e63", SRL_HELP: "#155e75", SRL_CONTEXT: "#312e81",
  // SCOPE: ST
  ST_PLAN: "#9333ea", ST_MON: "#7e22ce", ST_HELP: "#a855f7",
  // SCOPE: SCI
  SCI_DATA: "#92400e", SCI_TRANSFER: "#6ee7b7", SCI_ARG: "#ea580c",
  // SCOPE: TA
  TA0: "#94a3b8", TA1: "#f87171", TA2: "#fb923c", TA3: "#4ade80",
  // SCOPE: MO
  MO_EXPL: "#ef4444", MO_MON: "#f97316", MO_EVID: "#eab308",
  MO_REFL: "#a78bfa", MO_AGENCY: "#ec4899", MO_HELP: "#f43f5e",
  // SCOPE: Q
  Q0: "#94a3b8", Q1: "#fca5a5", Q2: "#fcd34d", Q3: "#86efac",
  // SCOPE: EV
  EV0: "#94a3b8", EV1: "#fca5a5", EV2: "#fcd34d", EV3: "#86efac",
  // NONVERBAL
  N_MODELING: "#d97706", N_ATTENTION_GUIDING: "#b45309",
  N_COLLAB_STRUCTURE: "#92400e", N_EMOTION_DISPLAY: "#78350f",
  N_ATTENTION: "#f59e0b", N_GESTURE_FOCUS: "#ea580c",
  P_INTONATION_ENCOURAGE: "#ec4899", P_INTONATION_QUESTION: "#db2777",
  // Legacy ATES codes (for older sessions)
  D_PLAN: "#3b82f6", D_MONITOR: "#2563eb", D_REFLECT: "#1d4ed8",
  D_STRATEGY_EXPLAIN: "#1e40af", D_MOTIVATION: "#1e3a8a",
  I_CHOICE: "#0d9488", I_SCAFFOLD: "#10b981", I_PEER_SR: "#16a34a",
  I_TASK_DESIGN: "#15803d", I_FEEDBACK_SR: "#166534", I_FEEDBACK: "#059669",
  S_PLAN_TALK: "#8b5cf6", S_MONITOR_TALK: "#7c3aed", S_REFLECT_TALK: "#9333ea",
  S_STRATEGY_LABEL: "#7e22ce", S_MOTIVATION_TALK: "#6b21a8",
  S_GOAL_SET: "#a855f7", S_EVAL_TALK: "#6d28d9",
  Q_INQUIRY: "#22d3ee", Q_METACOG: "#0891b2", Q_EVIDENCE: "#0e7490",
  PV1_PROMPT: "#f43f5e", PV2_STUDENT_VOICE: "#e11d48",
  PV3_ADJUSTMENT: "#be185d", PV4_CONSOLIDATION: "#9d174d",
  EP_PLAN: "#6366f1", EP_MONITOR: "#4f46e5", EP_REFLECT: "#4338ca",
  SRL1_GOAL_SETTING: "#0ea5e9", SRL2_PLANNING: "#0284c7",
  SRL3_COGNITIVE: "#0369a1", SRL4_METACOG_MONITORING: "#075985",
  SRL5_CONTROL: "#0c4a6e", SRL6_REFLECTION: "#164e63",
  SRL7_HELP_SEEKING: "#155e75", SRL8_MOTIVATION: "#083344",
  SRL9_CONTEXTUAL: "#312e81",
  ATES1_EXPLICIT: "#dc2626", ATES2_PARTIAL: "#b91c1c",
  ATES3_IMPLICIT: "#991b1b", ATES4_INDIRECT: "#7f1d1d", ATES5_MISSED: "#64748b",
  SCI1_HYPOTHESIS: "#a3e635", SCI2_VARIABLE: "#84cc16", SCI3_EVIDENCE: "#65a30d",
  SCI4_DATA_INTERP: "#4d7c0f", SCI5_EXPLANATION: "#3f6212", SCI6_CONFLICT: "#365314",
  SCI7_ARGUMENTATION: "#34d399", SCI8_TRANSFER: "#6ee7b7",
};

/** Look up a code's identity color, falling back to neutral gray (#6b7280) for unknown ids. */
export function codeColor(id: string, fallback = "#6b7280"): string {
  return CODE_COLORS[id] ?? fallback;
}
