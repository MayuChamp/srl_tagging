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

  const stats = [
    { label: "Total Videos", value: videoList.length, icon: Video,    color: "#3b82f6", sub: "uploaded sessions" },
    { label: "Total Tags",   value: tagCount,         icon: Tag,      color: "#8b5cf6", sub: "across all analyses" },
    { label: "Processed",    value: processedCount,   icon: BarChart2, color: "#10b981", sub: "completed analyses" },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Video Library</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage and review all uploaded teaching sessions.</p>
        </div>
        <UploadButton />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="bg-card border border-border rounded-2xl overflow-hidden shadow-[var(--shadow-sm)]">
            <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${stat.color}70, ${stat.color}20)` }} />
            <div className="p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${stat.color}15` }}>
                <stat.icon size={19} style={{ color: stat.color }} />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">{stat.label}</p>
                <p className="text-2xl font-extrabold tracking-tight mt-0.5">{stat.value}</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">{stat.sub}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <VideoSearch videos={videoList} />
    </div>
  );
}
