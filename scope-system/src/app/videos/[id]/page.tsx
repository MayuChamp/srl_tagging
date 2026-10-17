import Link from "next/link";
import type { CSSProperties } from "react";
import { supabase } from "@/lib/supabase/client";
import { VideoPlayer, VideoMarker } from "@/components/video/VideoPlayer";
import { ArrowLeft, Layers, Clock, AlertTriangle, VideoOff } from "lucide-react";
import { CODE_COLORS, codeColor } from "@/lib/codeColors";

// Status → semantic tone (same mapping as the Video Library cards).
const STATUS_TONE: Record<string, string> = {
  pending: "tone-warning",
  processing: "tone-primary",
  completed: "tone-success",
  failed: "tone-danger",
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export const revalidate = 0;

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: video } = await supabase
    .from("videos")
    .select("*")
    .eq("id", id)
    .single();

  if (!video) {
    return (
      <div className="page space-y-6">
        <Link href="/videos" className="back-link">
          <ArrowLeft size={15} aria-hidden /> Video Library
        </Link>
        <div className="empty-state py-16">
          <div className="empty-state-icon">
            <VideoOff size={22} aria-hidden />
          </div>
          <p className="empty-state-title text-base">Video not found</p>
          <Link
            href="/videos"
            className="btn btn-link text-sm"
          >
            Return to Video Library
          </Link>
        </div>
      </div>
    );
  }

  const { data: analysis } = await supabase
    .from("analyses")
    .select("*")
    .eq("video_id", id)
    .eq("is_ai_generated", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  type TagRow = {
    id: string;
    code_id: string;
    start_time: number;
    end_time: number;
    evidence_text: string | null;
    confidence_score: number | null;
  };

  let tags: TagRow[] = [];

  if (analysis) {
    const { data: tagData } = await supabase
      .from("tags")
      .select("*")
      .eq("analysis_id", analysis.id)
      .order("start_time", { ascending: true });
    tags = (tagData as TagRow[]) ?? [];
  }

  const markers: VideoMarker[] = tags.map((tag) => ({
    id: tag.id,
    startTime: tag.start_time,
    endTime: tag.end_time,
    label: tag.code_id,
    color: CODE_COLORS[tag.code_id] ?? "#ef4444",
    evidence: tag.evidence_text ?? undefined,
    confidence: tag.confidence_score ?? undefined,
  }));

  const statusClass =
    STATUS_TONE[video.status as string] ??
    "tone-neutral";

  return (
    <div className="page space-y-6">
      <Link
        href="/videos"
        className="back-link"
      >
        <ArrowLeft size={15} aria-hidden /> Video Library
      </Link>

      <header className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="page-title min-w-0 break-words" dir="auto">{video.title || "Untitled Video"}</h1>
          <span
            className={`badge badge-lg capitalize shrink-0 mt-1.5 ${statusClass}`}
          >
            <span className={`status-dot ${statusClass} ${video.status === "processing" ? "animate-pulse" : ""}`} aria-hidden />
            {video.status}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/videos/${id}/environment`} className="btn btn-soft">
            <Layers size={15} aria-hidden />
            <span><span lang="he" dir="rtl">ניתוח סביבת הלמידה</span> · <span>Indirect SRL</span></span>
          </Link>
        </div>
      </header>

      {!analysis ? (
        <div className="empty-state py-16">
          {video.status === "failed" ? (
            <div className="icon-tile icon-tile-lg tone-danger">
              <AlertTriangle size={22} aria-hidden />
            </div>
          ) : (
            <div className="empty-state-icon">
              <Clock size={22} aria-hidden />
            </div>
          )}
          <p className="empty-state-title text-base">Analysis pending</p>
          <p className="empty-state-text">
            This video has not been analysed yet. Check back soon.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 min-w-0">
            <VideoPlayer url={video.storage_path} markers={markers} />
          </div>

          <div className="panel flex flex-col min-h-0 lg:sticky lg:top-6 lg:self-start">
            <div className="panel-header">
              <h2 className="eyebrow">
                Tags ({tags.length})
              </h2>
            </div>

            <div
              className="flex flex-col gap-2 overflow-y-auto max-h-[600px] lg:max-h-[calc(100vh-12rem)] p-3"
              tabIndex={0}
              role="region"
              aria-label="Tags"
            >
              {tags.length === 0 && (
                <p className="text-sm text-muted-foreground px-1 py-6 text-center">
                  No tags for this analysis.
                </p>
              )}

              {tags.map((tag) => {
                // Display-only neutral fallback for unknown codes (the timeline
                // markers above keep their original #ef4444 fallback).
                const color = codeColor(tag.code_id);
                const confidence =
                  tag.confidence_score != null
                    ? Math.round(tag.confidence_score * 100)
                    : null;

                return (
                  <div
                    key={tag.id}
                    className="list-card space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="code-chip code-chip-md font-mono min-w-0"
                        style={{ "--code": color } as CSSProperties}
                      >
                        <span className="code-dot" aria-hidden />
                        <span className="truncate">{tag.code_id}</span>
                      </span>
                      <span className="time-pill shrink-0">
                        {formatTime(tag.start_time)} &ndash;{" "}
                        {formatTime(tag.end_time)}
                      </span>
                    </div>

                    {tag.evidence_text && (
                      <p
                        dir="auto"
                        className="text-start text-xs text-muted-foreground leading-relaxed line-clamp-3"
                        title={tag.evidence_text}
                      >
                        {tag.evidence_text}
                      </p>
                    )}

                    {confidence != null && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                          <span>Confidence</span>
                          <span>{confidence}%</span>
                        </div>
                        <div className="meter">
                          <div
                            className="meter-fill transition-all"
                            style={{
                              width: `${confidence}%`,
                              // Hue of the code, pulled toward the text colour so
                              // pale/deep codes stay visible on the track.
                              "--tone": `color-mix(in oklab, ${color} 60%, var(--foreground))`,
                            } as CSSProperties}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
