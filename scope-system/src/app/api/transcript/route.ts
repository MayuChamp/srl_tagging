import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/transcript?videoId=X
export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json({ error: "videoId required" }, { status: 400 });
  }

  const { data: analysis } = await supabase
    .from("analyses")
    .select("summary_metrics")
    .eq("video_id", videoId)
    .eq("is_ai_generated", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const transcript: unknown[] = analysis?.summary_metrics?.audio_transcript ?? null;
  return NextResponse.json({ transcript });
}
