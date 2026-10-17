import { Video, Tag, BarChart2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { VideoSearch } from "./VideoSearch";
import { UploadButton } from "./UploadButton";

export const revalidate = 0;

export default async function VideoLibrary() {
  const { data: videos } = await supabase.from("videos").select("*").order("created_at", { ascending: false });
  const { data: tags } = await supabase.from("tags").select("id, code_id");

  const videoList = videos || [];
  const tagCount = tags?.length || 0;
  const processedCount = videoList.filter(v => v.status === "completed").length;

  // tone-* classes give each card a distinct hue (blue / terracotta / green) that follows the theme.
  const stats = [
    { label: "Total Videos", value: videoList.length, icon: Video,    tone: "tone-info",    sub: "uploaded sessions" },
    { label: "Total Tags",   value: tagCount,         icon: Tag,      tone: "tone-primary", sub: "across all analyses" },
    { label: "Processed",    value: processedCount,   icon: BarChart2, tone: "tone-success", sub: "completed analyses" },
  ];

  return (
    <div className="page space-y-8">
      <div className="page-header">
        <div className="min-w-0">
          <h1 className="page-title">Video Library</h1>
          <p className="page-subtitle">Manage and review all uploaded teaching sessions.</p>
        </div>
        <UploadButton />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="card overflow-hidden">
            <div className={`stat-strip ${stat.tone}`} />
            <div className="p-5 flex items-center gap-4">
              <div className={`icon-tile icon-tile-md ${stat.tone}`}>
                <stat.icon size={19} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="stat-label">{stat.label}</p>
                <p className="stat-value mt-0.5">{stat.value}</p>
                <p className="stat-sub mt-0.5">{stat.sub}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <VideoSearch videos={videoList} />
    </div>
  );
}
