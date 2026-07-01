import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { VideoPlayer, VideoMarker } from "@/components/video/VideoPlayer";
import { ArrowLeft } from "lucide-react";

const CODE_COLORS: Record<string, string> = {
  "D_PLAN": "#3b82f6",
  "D_MONITOR": "#2563eb",
  "D_REFLECT": "#1d4ed8",
  "I_SCAFFOLD": "#10b981",
  "S_PLAN_TALK": "#8b5cf6",
  "S_MONITOR_TALK": "#7c3aed",
  "S_EVAL_TALK": "#6d28d9",
  "S_GOAL_SET": "#a855f7",
  "N_ATTENTION": "#f59e0b",
  "N_GESTURE_FOCUS": "#ea580c",
  "P_INTONATION_ENCOURAGE": "#ec4899",
  "P_INTONATION_QUESTION": "#db2777",
  "I_FEEDBACK": "#059669",
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
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <Link href="/videos" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={15} /> Video Library
        </Link>
        <div className="bg-card border border-border rounded-xl p-16 flex flex-col items-center justify-center text-muted-foreground gap-4">
          <p className="text-lg font-medium">Video not found</p>
          <Link
            href="/videos"
            className="text-primary hover:underline text-sm"
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

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    processing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    completed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    failed: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  const statusClass =
    statusColors[video.status as string] ??
    "bg-secondary/30 text-muted-foreground border-border";

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <Link
        href="/videos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={15} /> Video Library
      </Link>

      <header className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{video.title}</h1>
        <span
          className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border ${statusClass}`}
        >
          {video.status}
        </span>
      </header>

      {!analysis ? (
        <div className="bg-card border border-dashed border-border rounded-xl p-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
          <p className="text-base font-medium">Analysis pending</p>
          <p className="text-sm">
            This video has not been analysed yet. Check back soon.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <VideoPlayer url={video.storage_path} markers={markers} />
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Tags ({tags.length})
            </h2>

            <div className="flex flex-col gap-3 overflow-y-auto max-h-[600px] pr-1">
              {tags.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No tags for this analysis.
                </p>
              )}

              {tags.map((tag) => {
                const color = CODE_COLORS[tag.code_id] ?? "#ef4444";
                const confidence =
                  tag.confidence_score != null
                    ? Math.round(tag.confidence_score * 100)
                    : null;

                return (
                  <div
                    key={tag.id}
                    className="bg-card border border-border rounded-xl p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-sm font-semibold">
                          {tag.code_id}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">
                        {formatTime(tag.start_time)} &ndash;{" "}
                        {formatTime(tag.end_time)}
                      </span>
                    </div>

                    {tag.evidence_text && (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                        {tag.evidence_text}
                      </p>
                    )}

                    {confidence != null && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Confidence</span>
                          <span>{confidence}%</span>
                        </div>
                        <div className="h-1.5 bg-secondary/30 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${confidence}%`,
                              backgroundColor: color,
                            }}
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
