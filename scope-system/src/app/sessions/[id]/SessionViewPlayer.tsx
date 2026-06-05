"use client";

import { useState } from "react";
import { VideoPlayer, type VideoMarker } from "@/components/video/VideoPlayer";
import { Video, Play } from "lucide-react";

const CODE_COLORS: Record<string, string> = {
  TDS_COG: "#0891b2", TDS_META: "#0e7490", TDS_MOT: "#155e75", TDS_NONE: "#475569",
  EX_IMPL: "#6366f1", EX_PART: "#7c3aed", EX_EXPL: "#4f46e5", EX_NA: "#64748b",
  SRL_GOAL: "#0ea5e9", SRL_PLAN: "#0284c7", SRL_COG: "#0369a1", SRL_MON: "#075985",
  SRL_CTRL: "#0c4a6e", SRL_REFL: "#164e63", SRL_HELP: "#155e75", SRL_CONTEXT: "#312e81",
  ST_PLAN: "#9333ea", ST_MON: "#7e22ce", ST_HELP: "#a855f7",
  SCI_DATA: "#92400e", SCI_TRANSFER: "#6ee7b7", SCI_ARG: "#ea580c",
  TA0: "#94a3b8", TA1: "#f87171", TA2: "#fb923c", TA3: "#4ade80",
  MO_EXPL: "#ef4444", MO_MON: "#f97316", MO_EVID: "#eab308",
  MO_REFL: "#a78bfa", MO_AGENCY: "#ec4899", MO_HELP: "#f43f5e",
  Q0: "#94a3b8", Q1: "#fca5a5", Q2: "#fcd34d", Q3: "#86efac",
  EV0: "#94a3b8", EV1: "#fca5a5", EV2: "#fcd34d", EV3: "#86efac",
  N_MODELING: "#d97706", N_ATTENTION_GUIDING: "#b45309",
  N_COLLAB_STRUCTURE: "#92400e", N_EMOTION_DISPLAY: "#78350f",
  N_ATTENTION: "#f59e0b", N_GESTURE_FOCUS: "#ea580c",
  P_INTONATION_ENCOURAGE: "#ec4899", P_INTONATION_QUESTION: "#db2777",
  // Legacy
  D_PLAN: "#3b82f6", D_MONITOR: "#2563eb", I_SCAFFOLD: "#10b981",
  S_PLAN_TALK: "#8b5cf6", S_MONITOR_TALK: "#7c3aed",
};

type TagRow = {
  id: string; code_id: string; start_time: number; end_time: number;
  evidence_text: string | null; confidence_score: number | null;
};
type EventGroup = TagRow[];

function fmtTime(s: number) {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `${m}:${ss < 10 ? "0" : ""}${ss}`;
}

interface Props {
  videoUrl: string | null;
  markers: VideoMarker[];
  events: EventGroup[];
}

export function SessionViewPlayer({ videoUrl, markers, events }: Props) {
  const [seekRequest, setSeekRequest] = useState<{ time: number; seq: number } | null>(null);

  const seekTo = (time: number) => {
    setSeekRequest(prev => ({ time, seq: (prev?.seq ?? 0) + 1 }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Video */}
      <div className="lg:col-span-2">
        {videoUrl ? (
          <VideoPlayer url={videoUrl} markers={markers} seekRequest={seekRequest} />
        ) : (
          <div className="bg-card border border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-3 h-48 text-muted-foreground text-sm">
            <Video size={32} className="opacity-30" />
            <p>No video linked to this session.</p>
          </div>
        )}
      </div>

      {/* Event list */}
      <div className="flex flex-col gap-2 overflow-y-auto max-h-[560px] pr-1">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
          Events ({events.length})
        </p>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tags in this session.</p>
        ) : (
          events.map(group => {
            const first = group[0];
            const codes = group.map(t => t.code_id);
            const strengthLabel =
              first.confidence_score == null ? null :
              first.confidence_score >= 0.8 ? { text: "חזק", cls: "bg-green-500/20 text-green-400 border-green-500/30" } :
              first.confidence_score >= 0.5 ? { text: "בינוני", cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" } :
              { text: "חלש", cls: "bg-red-500/20 text-red-400 border-red-500/30" };

            return (
              <div
                key={first.id}
                className="bg-card border border-border rounded-xl p-3 space-y-2 shrink-0 cursor-pointer hover:border-primary/40 hover:bg-secondary/20 transition-all group"
                onClick={() => seekTo(first.start_time)}
                title={`Seek to ${fmtTime(first.start_time)}`}
              >
                <div className="flex items-start justify-between gap-2">
                  {/* Code chips */}
                  <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                    {codes.map(code => {
                      const c = CODE_COLORS[code] ?? "#6b7280";
                      return (
                        <span
                          key={code}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold border"
                          style={{ borderColor: c + "50", backgroundColor: c + "18", color: c }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c }} />
                          {code}
                        </span>
                      );
                    })}
                  </div>
                  {/* Time + strength + play hint */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {strengthLabel && (
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${strengthLabel.cls}`}>
                        {strengthLabel.text}
                      </span>
                    )}
                    <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                      {fmtTime(first.start_time)}
                    </span>
                    <Play size={12} className="text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                  </div>
                </div>

                {first.evidence_text && (
                  <p className="text-xs text-muted-foreground leading-relaxed border-t border-border/50 pt-2" dir="rtl">
                    {first.evidence_text}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
