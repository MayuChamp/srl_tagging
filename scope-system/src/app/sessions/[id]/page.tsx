import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { type VideoMarker, type Caption } from "@/components/video/VideoPlayer";
import { BookOpen, Tag, Calendar, Video, Clock, RotateCcw, ArrowLeft, Gauge } from "lucide-react";
import { CODE_COLORS } from "@/lib/codeColors";
import { SessionViewPlayer } from "./SessionViewPlayer";

export const revalidate = 0;

// Display-only: dir="auto" text never matches the [dir=rtl] Heebo rule in
// globals.css; Geist stays first for Latin, Hebrew glyphs fall back to Heebo.
const autoDirFont = "font-[family-name:var(--font-geist-sans),var(--font-hebrew),system-ui,sans-serif]";

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
      <div className="page space-y-6">
        <Link href="/sessions" className="back-link">
          <ArrowLeft size={15} /> Session Library
        </Link>
        <div className="empty-state">
          <div className="empty-state-icon">
            <BookOpen size={22} />
          </div>
          <p className="empty-state-title">Session not found</p>
          <Link href="/sessions" className="btn btn-soft">
            Return to Session Library
          </Link>
        </div>
      </div>
    );
  }

  const { data: tagData } = await supabase
    .from("tags")
    .select("id, code_id, start_time, end_time, evidence_text, reasoning, confidence_score")
    .eq("analysis_id", id)
    .order("start_time", { ascending: true });

  const tags = tagData || [];

  // Group individual tag rows into multi-label events by matching time + evidence
  type TagRow = { id: string; code_id: string; start_time: number; end_time: number; evidence_text: string | null; reasoning: string | null; confidence_score: number | null };
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
    const codes = Array.from(new Set(group.map(t => t.code_id)));
    return {
      id: first.id,
      startTime: first.start_time,
      endTime: first.end_time,
      label: codes[0],
      color: CODE_COLORS[codes[0]] ?? "#6b7280",
      labels: codes,
      colors: codes.map(c => CODE_COLORS[c] ?? "#6b7280"),
      evidence: first.evidence_text ?? undefined,
      reasoning: first.reasoning ?? undefined,
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
    <div className="page space-y-6 animate-fade-in">
      <Link href="/sessions" className="back-link">
        <ArrowLeft size={15} /> Session Library
      </Link>

      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="icon-tile icon-tile-md">
            <BookOpen size={20} />
          </div>
          <div className="min-w-0">
            <h1 className={`page-title tracking-normal break-words text-left ${autoDirFont}`} dir="auto">{sessionName}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={13} className="shrink-0" />
                {formatDate(analysis.created_at)}
              </span>
              {videoTitle && (
                <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
                  <Video size={13} className="shrink-0" />
                  <span className={`truncate max-w-[18rem] ${autoDirFont}`} dir="auto" title={videoTitle}>{videoTitle}</span>
                </span>
              )}
            </div>
          </div>
        </div>
        <Link
          href={`/tagging?session=${id}`}
          className="btn btn-primary shrink-0 self-start"
        >
          <RotateCcw size={15} />
          Keep Tagging
        </Link>
      </header>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: "Events", value: events.length, icon: Tag, tone: "tone-primary" },
          { label: "Tagged Duration", value: formatTime(totalDuration), icon: Clock, tone: "tone-info" },
          {
            label: "Avg Confidence",
            value: avgConfidence != null ? `${Math.round(avgConfidence * 100)}%` : "—",
            icon: Gauge,
            tone: "tone-success",
          },
        ].map((stat, i) => (
          <div key={i} className="card p-4 sm:p-5 flex items-center gap-3">
            <div className={`icon-tile icon-tile-md ${stat.tone}`}>
              <stat.icon size={18} />
            </div>
            <div className="min-w-0">
              <p className="stat-label">{stat.label}</p>
              <p className="stat-value">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <SessionViewPlayer videoUrl={videoUrl} markers={markers} events={events} captions={captions} />

    </div>
  );
}
