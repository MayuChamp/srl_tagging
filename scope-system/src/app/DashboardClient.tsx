"use client";

import React, { useState, useMemo } from "react";

function contrastColor(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? "#111118" : "#ffffff";
}
import { useRouter } from "next/navigation";
import {
  Video, BarChart2, BrainCircuit, Clock, ChevronDown,
  Plus, CheckCircle2, Loader2, AlertCircle, Tag, Zap,
} from "lucide-react";
import { VideoPlayer, type VideoMarker } from "@/components/video/VideoPlayer";
import { ActivityChart } from "@/components/dashboard/ActivityChart";
import { motion } from "framer-motion";

const CODE_COLORS: Record<string, string> = {
  "D_PLAN": "#3b82f6", "D_MONITOR": "#2563eb", "D_REFLECT": "#1d4ed8",
  "I_SCAFFOLD": "#10b981", "S_PLAN_TALK": "#8b5cf6", "S_MONITOR_TALK": "#7c3aed",
  "S_EVAL_TALK": "#6d28d9", "S_GOAL_SET": "#a855f7", "N_ATTENTION": "#f59e0b",
  "N_GESTURE_FOCUS": "#ea580c", "P_INTONATION_ENCOURAGE": "#ec4899",
  "P_INTONATION_QUESTION": "#db2777", "I_FEEDBACK": "#059669",
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  completed: { label: "Completed",  icon: CheckCircle2, color: "#10b981", bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.3)" },
  processing: { label: "Processing", icon: Loader2,      color: "#6d6cf9", bg: "rgba(109,108,249,0.12)", border: "rgba(109,108,249,0.3)" },
  pending:    { label: "Pending",    icon: Clock,        color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.3)" },
  failed:     { label: "Failed",     icon: AlertCircle,  color: "#f04444", bg: "rgba(240,68,68,0.12)",   border: "rgba(240,68,68,0.3)" },
};

interface TagRow {
  id: string; code_id: string; start_time: number; end_time: number;
  evidence_text?: string | null; confidence_score?: number | null;
  analyses: { video_id: string } | null;
}
interface VideoRow {
  id: string; title: string; storage_path: string; status: string; created_at: string;
}
interface Props { videos: VideoRow[]; tags: TagRow[]; }


function fmt(s: number) {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

export function DashboardClient({ videos, tags }: Props) {
  const router = useRouter();
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(videos[0]?.id ?? null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const selectedVideo = useMemo(() => videos.find(v => v.id === selectedVideoId) ?? null, [selectedVideoId, videos]);

  const filteredTags = useMemo(() => {
    if (!selectedVideoId) return tags;
    const linked = tags.filter(t => t.analyses?.video_id === selectedVideoId);
    return linked.length > 0 ? linked : [];
  }, [selectedVideoId, tags]);

  const mappedMarkers: VideoMarker[] = useMemo(
    () => filteredTags.map(tag => ({
      id: tag.id, startTime: tag.start_time, endTime: tag.end_time ?? tag.start_time + 5,
      label: tag.code_id, color: CODE_COLORS[tag.code_id] ?? "#ef4444",
    })),
    [filteredTags]
  );

  const statusCfg = selectedVideo ? (STATUS_CONFIG[selectedVideo.status] ?? STATUS_CONFIG.pending) : null;
  const StatusIcon = statusCfg?.icon;

  const statCards = [
    {
      label: "Total Videos", value: videos.length, sub: "in your library",
      icon: Video, color: "#3b82f6", gradient: "from-blue-500/20 to-blue-500/5",
    },
    {
      label: "Talk Ratio (T/S)", value: "65 / 35", sub: null,
      icon: BarChart2, color: "#10b981", gradient: "from-emerald-500/20 to-emerald-500/5",
      bar: true,
    },
    {
      label: "SRL Moments", value: filteredTags.length,
      sub: selectedVideo ? `in "${selectedVideo.title}"` : "across all videos",
      icon: BrainCircuit, color: "#8b5cf6", gradient: "from-violet-500/20 to-violet-500/5",
    },
    {
      label: "AI Status", value: null, sub: selectedVideo?.title ?? null,
      icon: Zap, color: "#f59e0b", gradient: "from-amber-500/20 to-amber-500/5",
      statusCfg,
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Analysis Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">Overview of your SRL video analyses.</p>
        </div>
        <button
          onClick={() => router.push("/tagging")}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-all glow-primary hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus size={16} /> New Analysis
        </button>
      </div>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.07 }}
              className="bg-card border border-border rounded-2xl overflow-hidden shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all group"
            >
              {/* Gradient top strip */}
              <div className={`h-[3px] w-full bg-gradient-to-r ${stat.gradient} via-transparent`}
                   style={{ background: `linear-gradient(90deg, ${stat.color}70, ${stat.color}20)` }} />
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                       style={{ background: `${stat.color}18` }}>
                    <Icon size={18} style={{ color: stat.color }} />
                  </div>
                  {stat.statusCfg && StatusIcon && (
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-full border"
                      style={{ color: stat.statusCfg.color, background: stat.statusCfg.bg, borderColor: stat.statusCfg.border }}
                    >
                      {stat.statusCfg.label}
                    </span>
                  )}
                </div>
                {stat.statusCfg ? (
                  <p className="text-xl font-bold tracking-tight capitalize">{selectedVideo?.status ?? "N/A"}</p>
                ) : (
                  <p className="text-3xl font-extrabold tracking-tight">{stat.value}</p>
                )}
                {stat.bar && (
                  <div className="mt-2.5 mb-1">
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: "65%", background: stat.color }} />
                    </div>
                    <div className="flex justify-between mt-1 text-[11px] text-muted-foreground">
                      <span>Teacher 65%</span><span>Student 35%</span>
                    </div>
                  </div>
                )}
                {stat.sub && <p className="text-xs text-muted-foreground mt-1 truncate">{stat.sub}</p>}
                {!stat.sub && !stat.bar && !stat.statusCfg && <p className="text-xs text-muted-foreground mt-1 invisible">–</p>}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── Video Section ─────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[var(--shadow-sm)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/12 flex items-center justify-center shrink-0">
              <Video size={15} className="text-primary" />
            </div>
            <h3 className="font-semibold text-[15px] truncate">
              {selectedVideo ? selectedVideo.title : "No video selected"}
            </h3>
          </div>

          {videos.length > 0 && (
            <div className="relative shrink-0">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 bg-secondary border border-border text-sm rounded-xl px-3.5 py-2 hover:bg-secondary/80 transition-all min-w-[200px] justify-between"
              >
                <span className="truncate max-w-[160px] text-[13px]">{selectedVideo?.title ?? "Select video"}</span>
                <ChevronDown size={14} className={`text-muted-foreground transition-transform shrink-0 ${dropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {dropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                  <div className="absolute right-0 top-[calc(100%+6px)] z-20 bg-card border border-border rounded-xl shadow-[var(--shadow-lg)] py-1.5 min-w-full overflow-hidden">
                    {videos.map(v => (
                      <button key={v.id}
                        onClick={() => { setSelectedVideoId(v.id); setDropdownOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3.5 py-2 text-[13px] text-left hover:bg-secondary transition-colors ${v.id === selectedVideoId ? "text-primary font-semibold" : ""}`}
                      >
                        <Video size={13} className="text-muted-foreground shrink-0" />
                        <span className="truncate flex-1">{v.title}</span>
                        {v.id === selectedVideoId && <CheckCircle2 size={13} className="text-primary shrink-0" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Video tile switcher */}
        {videos.length > 1 && (
          <div className="flex gap-2 px-6 pt-4 overflow-x-auto pb-0">
            {videos.map(v => (
              <button key={v.id} onClick={() => setSelectedVideoId(v.id)}
                className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[12.5px] transition-all ${
                  v.id === selectedVideoId
                    ? "bg-primary/12 border-primary/40 text-primary font-semibold"
                    : "bg-secondary/40 border-border text-muted-foreground hover:border-primary/30"
                }`}
              >
                <Video size={12} />
                <span className="max-w-[120px] truncate">{v.title}</span>
              </button>
            ))}
          </div>
        )}

        {/* Player */}
        <div className="p-4 pt-4">
          {selectedVideo ? (
            <VideoPlayer key={selectedVideo.id} url={selectedVideo.storage_path} markers={mappedMarkers} />
          ) : (
            <div className="h-64 flex flex-col items-center justify-center border border-dashed border-border/50 rounded-xl text-muted-foreground gap-3">
              <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center">
                <Video size={24} className="opacity-40" />
              </div>
              <p className="text-sm">No videos uploaded yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Charts + Highlights ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Activity Timeline */}
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl overflow-hidden shadow-[var(--shadow-sm)]">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <div className="w-8 h-8 rounded-lg bg-primary/12 flex items-center justify-center">
              <BarChart2 size={15} className="text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-[15px]">Activity Timeline</h3>
              {selectedVideo && (
                <p className="text-xs text-muted-foreground mt-0.5">{selectedVideo.title}</p>
              )}
            </div>
          </div>
          <div className="p-6 min-h-[340px] flex flex-col">
            <ActivityChart tags={filteredTags} />
          </div>
        </div>

        {/* Top SRL Highlights */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[var(--shadow-sm)] flex flex-col">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
            <div className="w-8 h-8 rounded-lg bg-violet-500/12 flex items-center justify-center">
              <Tag size={15} className="text-violet-400" />
            </div>
            <h3 className="font-semibold text-[15px]">SRL Highlights</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredTags.length > 0 ? (
              filteredTags.slice(0, 10).map((tag, i) => {
                const color = CODE_COLORS[tag.code_id] ?? "#666";
                return (
                  <div key={tag.id}
                    className="flex gap-3 p-3 rounded-xl border border-border/50 bg-secondary/20 hover:bg-secondary/40 hover:border-border transition-all cursor-pointer group"
                  >
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center shrink-0 pt-0.5">
                      <div className="w-2 h-2 rounded-full mt-1" style={{ background: color }} />
                      {i < 9 && <div className="w-px flex-1 mt-1.5 mb-0" style={{ background: `${color}30` }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span
                          className="text-[11px] font-bold px-2 py-0.5 rounded-md"
                          style={{ background: color, color: contrastColor(color) }}
                        >
                          {tag.code_id}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-mono ml-auto">
                          {fmt(tag.start_time)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        {tag.evidence_text ?? <span className="italic opacity-50">No evidence text</span>}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground gap-3">
                <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center">
                  <BrainCircuit size={22} className="opacity-30" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">No highlights yet</p>
                  <p className="text-xs mt-1 opacity-60">Tags will appear here after AI analysis</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
