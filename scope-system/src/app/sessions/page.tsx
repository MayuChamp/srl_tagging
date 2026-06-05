import { BookOpen, Tag, Calendar, Video, ArrowRight, Plus, Layers } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import Link from "next/link";

export const revalidate = 0;

interface SessionRow {
  id: string;
  created_at: string;
  summary_metrics: { session_name?: string; video_url?: string; framework?: string } | null;
  video_id: string | null;
  tags: { count: number }[];
  videos: { title: string }[] | null;
}

const FRAMEWORK_COLORS: Record<string, string> = {
  ATES: "#6d6cf9", NONVERBAL: "#f59e0b", SCOPE: "#10b981",
};

function relativeDate(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function SessionsLibrary() {
  const { data: sessions } = await supabase
    .from("analyses")
    .select("id, created_at, summary_metrics, video_id, tags(count), videos(title)")
    .eq("is_ai_generated", false)
    .order("created_at", { ascending: false });

  const sessionList = (sessions as SessionRow[]) || [];
  const totalTags = sessionList.reduce((s, x) => s + (x.tags?.[0]?.count ?? 0), 0);
  const withVideo = sessionList.filter(s => s.video_id || s.summary_metrics?.video_url).length;

  const statCards = [
    { label: "Sessions",    value: sessionList.length, icon: BookOpen, color: "#6d6cf9" },
    { label: "Total Tags",  value: totalTags,          icon: Tag,      color: "#8b5cf6" },
    { label: "With Video",  value: withVideo,          icon: Video,    color: "#10b981" },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Session Library</h1>
          <p className="text-muted-foreground mt-1 text-sm">All saved manual tagging sessions.</p>
        </div>
        <Link
          href="/tagging"
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-all glow-primary hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus size={16} /> New Session
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {statCards.map((stat, i) => (
          <div key={i} className="bg-card border border-border rounded-2xl overflow-hidden shadow-[var(--shadow-sm)]">
            <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${stat.color}70, ${stat.color}20)` }} />
            <div className="p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${stat.color}15` }}>
                <stat.icon size={19} style={{ color: stat.color }} />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">{stat.label}</p>
                <p className="text-2xl font-extrabold tracking-tight mt-0.5">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {sessionList.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl py-20 flex flex-col items-center gap-5 text-muted-foreground">
          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
            <BookOpen size={28} className="opacity-30" />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-foreground">No sessions saved yet</p>
            <p className="text-sm mt-1">Start tagging a video and save your session to see it here.</p>
          </div>
          <Link
            href="/tagging"
            className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all"
          >
            <Plus size={15} /> Start Tagging
          </Link>
        </div>
      ) : (
        /* Session cards */
        <div className="space-y-3">
          {sessionList.map(session => {
            const name = session.summary_metrics?.session_name || "Unnamed Session";
            const tagCount = session.tags?.[0]?.count ?? 0;
            const videoTitle = (session.videos as { title: string }[] | null)?.[0]?.title ?? null;
            const fw = session.summary_metrics?.framework ?? null;
            const fwColor = fw ? (FRAMEWORK_COLORS[fw] ?? "#6d6cf9") : "#6d6cf9";

            return (
              <div
                key={session.id}
                className="bg-card border border-border rounded-2xl overflow-hidden shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all group relative"
              >
                {/* Left accent bar */}
                <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl" style={{ background: fwColor }} />

                <div className="pl-6 pr-4 py-4 flex items-center gap-4">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${fwColor}15` }}>
                    <BookOpen size={16} style={{ color: fwColor }} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-[14px]">{name}</p>
                      {fw && (
                        <span
                          className="text-[11px] font-bold px-2 py-0.5 rounded-md"
                          style={{ color: fwColor, background: `${fwColor}18` }}
                        >
                          {fw}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {videoTitle ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Video size={11} /> {videoTitle}
                        </span>
                      ) : session.summary_metrics?.video_url ? (
                        <span className="text-xs text-muted-foreground/60">External URL</span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">No video</span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar size={11} /> {relativeDate(session.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Tag count */}
                  <div
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border shrink-0"
                    style={{ color: fwColor, background: `${fwColor}12`, borderColor: `${fwColor}30` }}
                  >
                    <Tag size={11} />
                    {tagCount}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/tagging?session=${session.id}`}
                      className="text-xs font-semibold text-muted-foreground bg-secondary hover:bg-secondary/80 px-3 py-2 rounded-xl transition-all border border-border"
                    >
                      Continue
                    </Link>
                    <Link
                      href={`/sessions/${session.id}`}
                      className="flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/18 px-3 py-2 rounded-xl transition-all border border-primary/25"
                    >
                      View <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
