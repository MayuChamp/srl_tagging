import { supabase } from "@/lib/supabase/client";
import { DashboardClient } from "./DashboardClient";

export const revalidate = 0;

export default async function Dashboard() {
  const { data: videos } = await supabase
    .from("videos")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: tags } = await supabase
    .from("tags")
    .select("*, analyses(video_id)")
    .order("start_time", { ascending: true });

  return (
    <DashboardClient
      videos={videos ?? []}
      tags={tags ?? []}
    />
  );
}
