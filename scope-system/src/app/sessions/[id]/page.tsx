import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { type VideoMarker, type Caption } from "@/components/video/VideoPlayer";
import { BookOpen, Tag, Calendar, Video, Clock, RotateCcw, ArrowLeft } from "lucide-react";
import { SessionViewPlayer } from "./SessionViewPlayer";

export const revalidate = 0;

// All known code colors — kept broad for backward-compat with old ATES sessions
const CODE_COLORS: Record<string, string> = {
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

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: analysis } = await supabase
    .from("analyses")
    .select("*, videos(title, storage_path)")
    .eq("id", id)
    .eq("is_ai_generated", false)
    .maybeSingle();

  if (!analysis) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <Link href="/sessions" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={15} /> Session Library
        </Link>
        <div className="bg-card border border-border rounded-xl p-16 flex flex-col items-center justify-center text-muted-foreground gap-4">
          <BookOpen size={40} className="opacity-30" />
          <p className="text-lg font-medium">Session not found</p>
          <Link href="/sessions" className="text-primary hover:underline text-sm">
            Return to Session Library
          </Link>
        </div>
      </div>
    );
  }

  const { data: tagData } = await supabase
    .from("tags")
    .select("id, code_id, start_time, end_time, evidence_text, confidence_score")
    .eq("analysis_id", id)
    .order("start_time", { ascending: true });

  const tags = tagData || [];

  // Group individual tag rows into multi-label events by matching time + evidence
  type TagRow = { id: string; code_id: string; start_time: number; end_time: number; evidence_text: string | null; confidence_score: number | null };
  const grouped = new Map<string, TagRow[]>();
  for (const t of tags as TagRow[]) {
    const key = `${t.start_time}|${t.end_time}|${t.evidence_text ?? ""}|${t.confidence_score ?? ""}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(t);
  }
  const events = [...grouped.values()].sort((a, b) => a[0].start_time - b[0].start_time);

  const sessionName = analysis.summary_metrics?.session_name || "Unnamed Session";
  const videoUrl: string | null =
    (analysis.videos as { storage_path: string } | null)?.storage_path ||
    analysis.summary_metrics?.video_url ||
    null;
  const videoTitle: string | null =
    (analysis.videos as { title: string } | null)?.title || null;
  const captions: Caption[] = analysis.summary_metrics?.captions || [];

  const markers: VideoMarker[] = events.map(group => {
    const first = group[0];
    const codes = group.map(t => t.code_id);
    return {
      id: first.id,
      startTime: first.start_time,
      endTime: first.end_time,
      label: codes[0],
      color: CODE_COLORS[codes[0]] ?? "#6b7280",
      labels: codes,
      colors: codes.map(c => CODE_COLORS[c] ?? "#6b7280"),
      evidence: first.evidence_text ?? undefined,
      confidence: first.confidence_score ?? undefined,
    };
  });

  const totalDuration = tags.length > 0
    ? tags.reduce((sum, t) => sum + (t.end_time - t.start_time), 0)
    : 0;

  const avgConfidence = tags.filter(t => t.confidence_score != null).length > 0
    ? tags.reduce((s, t) => s + (t.confidence_score ?? 0), 0) /
      tags.filter(t => t.confidence_score != null).length
    : null;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <Link href="/sessions" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft size={15} /> Session Library
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
            <BookOpen size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{sessionName}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar size={13} />
                {formatDate(analysis.created_at)}
              </span>
              {videoTitle && (
                <span className="flex items-center gap-1.5">
                  <Video size={13} />
                  {videoTitle}
                </span>
              )}
            </div>
          </div>
        </div>
        <Link
          href={`/tagging?session=${id}`}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors text-sm font-medium shrink-0"
        >
          <RotateCcw size={15} />
          Keep Tagging
        </Link>
      </header>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Events", value: events.length, icon: Tag, color: "text-purple-400" },
          { label: "Tagged Duration", value: formatTime(totalDuration), icon: Clock, color: "text-blue-400" },
          {
            label: "Avg Confidence",
            value: avgConfidence != null ? `${Math.round(avgConfidence * 100)}%` : "—",
            icon: BookOpen,
            color: "text-emerald-400",
          },
        ].map((stat, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <stat.icon size={24} className={stat.color} />
            <div>
              <p className="text-muted-foreground text-xs font-medium">{stat.label}</p>
              <p className="text-xl font-bold">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <SessionViewPlayer videoUrl={videoUrl} markers={markers} events={events} captions={captions} />

    </div>
  );
}
