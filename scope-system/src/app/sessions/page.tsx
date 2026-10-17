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
    { label: "Sessions",    value: sessionList.length, icon: BookOpen, tone: "tone-primary" },
    { label: "Total Tags",  value: totalTags,          icon: Tag,      tone: "tone-info" },
    { label: "With Video",  value: withVideo,          icon: Video,    tone: "tone-success" },
  ];

  return (
    <div className="page space-y-6 lg:space-y-8">

      {/* Header */}
      <div className="page-header">
        <div className="min-w-0">
          <h1 className="page-title">Session Library</h1>
          <p className="page-subtitle">All saved manual tagging sessions.</p>
        </div>
        <Link
          href="/tagging"
          className="btn btn-primary shrink-0"
        >
          <Plus size={16} /> New Session
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {statCards.map((stat, i) => (
          <div key={i} className="card overflow-hidden min-w-0">
            <div className={`stat-strip ${stat.tone}`} />
            <div className="p-3 sm:p-5 flex items-center gap-3 sm:gap-4">
              <div className={`icon-tile icon-tile-md hidden sm:grid ${stat.tone}`}>
                <stat.icon size={18} />
              </div>
              <div className="min-w-0">
                <p className="stat-label">{stat.label}</p>
                <p className="stat-value mt-0.5">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <SessionList sessions={sessionList} />
    </div>
  );
}
