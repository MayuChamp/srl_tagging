import { 
  Video, 
  BarChart2, 
  Users, 
  BrainCircuit, 
  Clock 
} from "lucide-react";
import { VideoPlayer, type VideoMarker } from "@/components/video/VideoPlayer";
import { supabase } from "@/lib/supabase/client";
import { ActivityChart } from "@/components/dashboard/ActivityChart";

// Mappings for colors based on ATES codes
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

export const revalidate = 0; // Disable caching to always get fresh data

export default async function Dashboard() {
  // Fetch real data from Supabase
  const { data: videos } = await supabase.from("videos").select("*").order("created_at", { ascending: false });
  const { data: tags } = await supabase.from("tags").select("*").order("start_time", { ascending: true });
  
  const latestVideo = videos && videos.length > 0 ? videos[0] : null;
  
  // Filter tags for the latest video's analysis (for MVP simplicity, we just show tags if we have them)
  // In a real app, we'd join tags -> analyses -> videos. For now, we'll map all tags to the player if it's the latest video.
  const mappedMarkers: VideoMarker[] = (tags || []).map(tag => ({
    id: tag.id,
    startTime: tag.start_time,
    endTime: tag.end_time || tag.start_time + 5,
    label: tag.code_id,
    color: CODE_COLORS[tag.code_id] || "#ef4444"
  }));

  const totalVideos = videos?.length || 0;
  const totalTags = tags?.length || 0;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analysis Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of your recent ATES multimodal analyses.</p>
        </div>
        <button className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md font-medium transition-colors flex items-center gap-2 shadow-lg shadow-primary/20">
          <Video size={18} />
          <span>New Analysis</span>
        </button>
      </header>

      {/* Video Player Section */}
      <section className="bg-card border border-border rounded-xl p-6 flex flex-col shadow-sm">
        <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <Video size={18} className="text-primary" />
          {latestVideo ? `Recent Analysis: ${latestVideo.title}` : "Waiting for videos to process..."}
        </h3>
        {latestVideo ? (
          <VideoPlayer 
            url={latestVideo.storage_path} 
            markers={mappedMarkers} 
          />
        ) : (
          <div className="h-64 flex items-center justify-center border-2 border-dashed border-border/50 rounded-lg text-muted-foreground">
            No videos uploaded yet. AI is processing...
          </div>
        )}
      </section>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Videos Analyzed", value: totalVideos.toString(), icon: Video, color: "text-blue-500" },
          { label: "Avg. Talk Ratio (T/S)", value: "65 / 35", icon: Users, color: "text-emerald-500" },
          { label: "Total SRL Moments", value: totalTags.toString(), icon: BrainCircuit, color: "text-purple-500" },
          { label: "AI Process Status", value: latestVideo?.status || "N/A", icon: Clock, color: "text-orange-500" }
        ].map((stat, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col justify-between group hover:border-primary/50 transition-colors">
            <div className="flex justify-between items-start">
              <span className="text-muted-foreground font-medium text-sm">{stat.label}</span>
              <stat.icon size={20} className={stat.color} />
            </div>
            <div className="mt-4">
              <span className="text-3xl font-bold text-foreground capitalize">{stat.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Area Placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 min-h-[400px] flex flex-col">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <BarChart2 size={18} className="text-primary" />
            Activity Timeline Chart
          </h3>
          <ActivityChart tags={tags || []} />
        </div>
        
        <div className="bg-card border border-border rounded-xl p-6 flex flex-col overflow-hidden">
          <h3 className="font-semibold text-lg mb-4">Top SRL Highlights</h3>
          <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-2">
            {tags && tags.length > 0 ? (
              tags.slice(0, 10).map((tag) => (
                <div key={tag.id} className="p-3 border border-border/50 rounded-lg bg-secondary/20 hover:bg-secondary/40 transition-colors cursor-pointer shrink-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: CODE_COLORS[tag.code_id] || '#666' }}>
                      {tag.code_id}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {Math.floor(tag.start_time / 60)}:{Math.floor(tag.start_time % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                  <p className="text-sm font-medium mt-2">{tag.evidence_text || "No text evidence provided."}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No highlights found yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
