import { BookOpen, Tag, Video, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import Link from "next/link";
import { SessionList } from "./SessionList";

export const revalidate = 0;

interface SessionRow {
  id: string;
  created_at: string;
  summary_metrics: { session_name?: string; video_url?: string; framework?: string; folder_path?: string } | null;
  video_id: string | null;
  tags: { count: number }[];
  videos: { title: string }[] | null;
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

      <SessionList sessions={sessionList} />
    </div>
  );
}
