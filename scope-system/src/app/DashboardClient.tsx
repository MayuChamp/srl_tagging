"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Video, BarChart2, BrainCircuit, Clock, ChevronDown,
  Plus, CheckCircle2, Loader2, AlertCircle, Tag, Zap,
} from "lucide-react";
import { VideoPlayer, type VideoMarker } from "@/components/video/VideoPlayer";
import { ActivityChart } from "@/components/dashboard/ActivityChart";
import { CODE_COLORS } from "@/lib/codeColors";
import { motion } from "framer-motion";

// Status pills render as `badge tone-*` so the text stays readable in both themes.
const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; tone: string }> = {
  completed:  { label: "Completed",  icon: CheckCircle2, tone: "tone-success" },
  processing: { label: "Processing", icon: Loader2,      tone: "tone-primary" },
  pending:    { label: "Pending",    icon: Clock,        tone: "tone-warning" },
  failed:     { label: "Failed",     icon: AlertCircle,  tone: "tone-danger" },
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

  // tone-* gives each card its own hue (blue / green / terracotta / amber) and follows the theme.
  const statCards = [
    {
      label: "Total Videos", value: videos.length, sub: "in your library",
      icon: Video, tone: "tone-info",
    },
    {
      label: "Talk Ratio (T/S)", value: "65 / 35", sub: null,
      icon: BarChart2, tone: "tone-success",
      bar: true, sample: true,
    },
    {
      label: "SRL Moments", value: filteredTags.length,
      sub: selectedVideo ? `in "${selectedVideo.title}"` : "across all videos",
      icon: BrainCircuit, tone: "tone-primary",
    },
    {
      label: "AI Status", value: null, sub: selectedVideo?.title ?? null,
      icon: Zap, tone: "tone-warning",
      statusCfg,
    },
  ];

  const highlightCount = Math.min(filteredTags.length, 10);

  return (
    <div className="page space-y-8">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Analysis Dashboard</h1>
          <p className="page-subtitle">Overview of your SRL video analyses.</p>
        </div>
        <button
          onClick={() => router.push("/tagging")}
          className="btn btn-primary"
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
              title={stat.sample ? "Placeholder value — not yet computed from transcripts" : undefined}
              className="card overflow-hidden flex flex-col h-full transition-shadow duration-200 hover:shadow-md"
            >
              {/* Tone top strip */}
              <div className={`stat-strip ${stat.tone}`} />
              <div className="p-5 flex flex-col flex-1">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-2">
                    <div className={`icon-tile icon-tile-md ${stat.tone}`}>
                      <Icon size={18} />
                    </div>
                    {stat.sample && <span className="badge tone-neutral">Sample</span>}
                  </div>
                  {stat.statusCfg && StatusIcon && (
                    <span className={`badge badge-lg ${stat.statusCfg.tone}`}>
                      <StatusIcon size={12} className={selectedVideo?.status === "processing" ? "animate-spin" : ""} />
                      {stat.statusCfg.label}
                    </span>
                  )}
                </div>
                <div className="min-h-9 flex items-end">
                  {stat.statusCfg ? (
                    <p className="text-xl font-semibold tracking-tight capitalize">{selectedVideo?.status ?? "N/A"}</p>
                  ) : (
                    <p className="text-3xl font-semibold tracking-tight">{stat.value}</p>
                  )}
                </div>
                <div className="mt-auto">
                  {stat.bar && (
                    <div className="mt-2.5 mb-1">
                      <div className="meter">
                        <div className={`meter-fill ${stat.tone}`} style={{ width: "65%" }} />
                      </div>
                      <div className="flex justify-between mt-1 text-2xs text-muted-foreground">
                        <span>Teacher 65%</span><span>Student 35%</span>
                      </div>
                    </div>
                  )}
                  {stat.sub && <p dir="auto" title={stat.sub} className="text-xs text-muted-foreground mt-1 truncate text-start">{stat.sub}</p>}
                  {!stat.sub && !stat.bar && !stat.statusCfg && <p className="text-xs text-muted-foreground mt-1 invisible">–</p>}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── Video Section ─────────────────────────────────────────────────── */}
      {/* No overflow-hidden here: it clipped the video dropdown panel. */}
      <div className="card">
        {/* Header */}
        <div className="card-header flex-wrap justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="icon-tile">
              <Video size={15} />
            </div>
            <h3 dir="auto" title={selectedVideo?.title} className="card-title truncate">
              {selectedVideo ? selectedVideo.title : "No video selected"}
            </h3>
          </div>

          {videos.length > 0 && (
            <div className="relative w-full sm:w-auto shrink-0">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setDropdownOpen(false);
                }}
                aria-haspopup="listbox"
                aria-expanded={dropdownOpen}
                className="btn btn-outline w-full sm:w-auto sm:min-w-[200px] justify-between"
              >
                <span dir="auto" title={selectedVideo?.title} className="truncate min-w-0 sm:max-w-[160px] font-medium text-start">
                  {selectedVideo?.title ?? "Select video"}
                </span>
                <ChevronDown size={14} className={`text-muted-foreground transition-transform shrink-0 ${dropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {dropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                  <div
                    role="listbox"
                    className="menu absolute end-0 top-[calc(100%+6px)] z-20 w-72 min-w-full max-w-[calc(100vw-2rem)] max-h-80 overflow-y-auto overscroll-contain"
                  >
                    {videos.map(v => (
                      <button key={v.id}
                        role="option"
                        aria-selected={v.id === selectedVideoId}
                        onClick={() => { setSelectedVideoId(v.id); setDropdownOpen(false); }}
                        className={`menu-item ${v.id === selectedVideoId ? "font-semibold text-[color:color-mix(in_oklab,var(--primary)_80%,var(--foreground))]" : ""}`}
                      >
                        <Video size={13} className="text-muted-foreground shrink-0" />
                        <span dir="auto" title={v.title} className="truncate flex-1 text-start">{v.title}</span>
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
          <div className="flex gap-2 px-5 pt-4 pb-2 overflow-x-auto snap-x">
            {videos.map(v => (
              <button key={v.id} onClick={() => setSelectedVideoId(v.id)}
                aria-pressed={v.id === selectedVideoId}
                className="chip-toggle snap-start shrink-0"
              >
                <Video size={12} className="shrink-0" />
                <span dir="auto" title={v.title} className="max-w-[120px] truncate">{v.title}</span>
              </button>
            ))}
          </div>
        )}

        {/* Player */}
        <div className="p-4 pt-4">
          {selectedVideo ? (
            <VideoPlayer key={selectedVideo.id} url={selectedVideo.storage_path} markers={mappedMarkers} />
          ) : (
            <div className="empty-state min-h-64">
              <div className="empty-state-icon" aria-hidden="true">
                <Video size={22} />
              </div>
              <p className="empty-state-title">No videos uploaded yet.</p>
              <button
                onClick={() => router.push("/tagging")}
                className="btn btn-soft mt-1"
              >
                <Plus size={16} /> Upload Video
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Charts + Highlights ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Activity Timeline */}
        <div className="lg:col-span-2 card overflow-hidden flex flex-col">
          <div className="card-header">
            <div className="icon-tile">
              <BarChart2 size={15} />
            </div>
            <div className="min-w-0">
              <h3 className="card-title">Activity Timeline</h3>
              {selectedVideo && (
                <p dir="auto" title={selectedVideo.title} className="text-xs text-muted-foreground mt-0.5 truncate text-start">{selectedVideo.title}</p>
              )}
            </div>
          </div>
          <div className="flex-1 p-6 min-h-[340px] flex flex-col">
            <ActivityChart tags={filteredTags} />
          </div>
        </div>

        {/* Top SRL Highlights */}
        <div className="card overflow-hidden flex flex-col lg:max-h-[440px]">
          <div className="card-header shrink-0">
            <div className="icon-tile">
              <Tag size={15} />
            </div>
            <h3 className="card-title">SRL Highlights</h3>
            {filteredTags.length > 0 && (
              <span className="count-pill ms-auto">{highlightCount} / {filteredTags.length}</span>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
            {filteredTags.length > 0 ? (
              filteredTags.slice(0, 10).map((tag, i) => {
                const color = CODE_COLORS[tag.code_id] ?? "#666";
                return (
                  <div key={tag.id}
                    className="list-card flex gap-3 transition-colors hover:border-input"
                  >
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center shrink-0 pt-0.5" aria-hidden="true">
                      <div className="w-2 h-2 rounded-full mt-1" style={{ background: color }} />
                      {i < highlightCount - 1 && <div className="w-px flex-1 mt-1.5 mb-0" style={{ background: `color-mix(in oklab, ${color} 20%, transparent)` }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="code-chip" style={{ "--code": color } as React.CSSProperties}>
                          {tag.code_id}
                        </span>
                        <span className="time-pill ms-auto">
                          {fmt(tag.start_time)}
                        </span>
                      </div>
                      <p dir="auto" className="text-sm text-muted-foreground leading-relaxed line-clamp-2 text-start">
                        {tag.evidence_text ?? <span className="italic">No evidence text</span>}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-state empty-state-compact h-full">
                <div className="empty-state-icon" aria-hidden="true">
                  <BrainCircuit size={22} />
                </div>
                <div>
                  <p className="empty-state-title">No highlights yet</p>
                  <p className="empty-state-text mt-1">Run the AI analyzer to generate highlights</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
