import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/analyze  { videoId }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const videoId: string | undefined = body.videoId;

  if (!videoId) {
    return NextResponse.json({ error: "videoId required" }, { status: 400 });
  }

  // Clear previous AI analysis so the re-run is fresh
  const { data: prev } = await supabase
    .from("analyses")
    .select("id")
    .eq("video_id", videoId)
    .eq("is_ai_generated", true);

  for (const a of prev ?? []) {
    await supabase.from("tags").delete().eq("analysis_id", a.id);
  }
  if ((prev ?? []).length) {
    await supabase.from("analyses").delete().eq("video_id", videoId).eq("is_ai_generated", true);
  }

  await supabase.from("videos").update({ status: "pending" }).eq("id", videoId);

  return NextResponse.json({ status: "processing" });
}

// GET /api/analyze?videoId=X
export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json({ error: "videoId required" }, { status: 400 });
  }

  const { data: video } = await supabase
    .from("videos")
    .select("status")
    .eq("id", videoId)
    .single();

  const status = video?.status ?? "unknown";

  if (status === "completed") {
    const { data: analysis } = await supabase
      .from("analyses")
      .select("id")
      .eq("video_id", videoId)
      .eq("is_ai_generated", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (analysis) {
      const { data: tags } = await supabase
        .from("tags")
        .select("*")
        .eq("analysis_id", analysis.id)
        .order("start_time", { ascending: true });

      return NextResponse.json({ status: "completed", tags: tags ?? [] });
    }
  }

  return NextResponse.json({ status });
}

// POST /api/analyze/reset  { videoId }  — force-resets a stuck "processing" status
export async function DELETE(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("videoId");
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });
  await supabase.from("videos").update({ status: "failed" }).eq("id", videoId);
  return NextResponse.json({ status: "reset" });
}
