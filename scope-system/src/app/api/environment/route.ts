import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid, parseEnvironmentConfig, type EnvironmentObservation } from "@/lib/environment";

const RUN_FIELDS = "id,video_id,created_at,status,protocol_version,config,models,progress,summary,error";
const BUCKET = "environment-evidence";
const noCache = { "Cache-Control": "private, no-store" };
function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: noCache });
}
function databaseError(error: { code?: string }) {
  const missing = ["42P01", "PGRST205"].includes(error.code ?? "");
  return json({ error: missing ? "שכבת סביבת הלמידה טרם הותקנה במסד הנתונים. נדרשת מיגרציה 0003."
    : "לא ניתן לגשת לנתוני סביבת הלמידה כרגע." }, missing ? 503 : 500);
}

export async function GET(request: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: "נדרשת התחברות" }, 401);
  const videoId = request.nextUrl.searchParams.get("videoId");
  const runId = request.nextUrl.searchParams.get("runId");
  if (!isUuid(videoId) || (runId && !isUuid(runId))) return json({ error: "מזהה לא תקין" }, 400);
  const { data: runs, error } = await db.from("environment_runs").select(RUN_FIELDS)
    .eq("video_id", videoId).eq("requested_by", user.id).order("created_at", { ascending: false }).limit(20);
  if (error) return databaseError(error);
  let run = runs?.[0] ?? null;
  if (runId) {
    const result = await db.from("environment_runs").select(RUN_FIELDS)
      .eq("id", runId).eq("video_id", videoId).eq("requested_by", user.id).maybeSingle();
    if (result.error) return databaseError(result.error);
    if (!result.data) return json({ error: "הרצה לא נמצאה" }, 404);
    run = result.data;
  }
  if (!run) return json({ runs: [], run: null, observations: [], reviews: [] });
  const result = await db.from("environment_observations").select("*")
    .eq("run_id", run.id).order("window_index");
  if (result.error) return databaseError(result.error);
  const observations = (result.data ?? []) as EnvironmentObservation[];
  const paths = observations.flatMap(o => o.evidence.filter(e => e.storage_path).map(e => e.storage_path!));
  if (paths.length) {
    const signed = await db.storage.from(BUCKET).createSignedUrls(paths, 3600);
    // Signing uses the session client and storage RLS, never a service-role client.
    const urls = new Map((signed.data ?? []).map(item => [item.path, item.signedUrl]));
    for (const observation of observations) {
      observation.evidence = observation.evidence.map(e => {
        const url = e.storage_path ? urls.get(e.storage_path) : undefined;
        return url ? { ...e, url } : e;
      });
    }
  }
  const reviewsResult = observations.length ? await db.from("environment_reviews").select("*")
    .in("observation_id", observations.map(o => o.id)).order("created_at", { ascending: false })
    : { data: [], error: null };
  if (reviewsResult.error) return databaseError(reviewsResult.error);
  return json({ runs, run, observations, reviews: reviewsResult.data ?? [] });
}

export async function POST(request: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: "נדרשת התחברות" }, 401);
  const body = await request.json().catch(() => null);
  const config = parseEnvironmentConfig(body?.config);
  if (!isUuid(body?.videoId) || !config) return json({ error: "הגדרות דגימה לא תקינות" }, 400);
  const video = await db.from("videos").select("id,storage_path").eq("id", body.videoId).maybeSingle();
  if (video.error) return databaseError(video.error);
  if (!video.data) return json({ error: "השיעור לא נמצא או שאינו נגיש" }, 404);
  try {
    const url = new URL(video.data.storage_path);
    const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    if (url.protocol !== "https:" || url.host !== project.host || url.username || url.password
      || !/^\/storage\/v1\/object\/(public|sign)\/videos\//.test(url.pathname)) throw new Error();
  } catch {
    return json({ error: "לניתוח סביבת הלמידה יש לבחור סרטון המאוחסן בספריית המערכת." }, 400);
  }
  const { data, error } = await db.from("environment_runs").insert({
    video_id: body.videoId, requested_by: user.id, config,
  }).select(RUN_FIELDS).single();
  if (error?.code === "23505") return json({ error: "כבר קיימת הרצה פעילה לשיעור הזה." }, 409);
  if (error) return databaseError(error);
  return json({ run: data }, 202);
}

export async function PATCH(request: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: "נדרשת התחברות" }, 401);
  const body = await request.json().catch(() => null);
  if (!isUuid(body?.observationId) || !["accepted", "needs_correction", "rejected"].includes(body?.verdict)
    || typeof body?.notes !== "string" || body.notes.length > 4000
    || (body.verdict === "needs_correction" && !body.notes.trim())) {
    return json({ error: "יש לציין החלטה תקינה והערת תיקון במידת הצורך (עד 4,000 תווים)." }, 400);
  }
  const observation = await db.from("environment_observations").select("id")
    .eq("id", body.observationId).maybeSingle();
  if (observation.error) return databaseError(observation.error);
  if (!observation.data) return json({ error: "התצפית אינה נגישה" }, 404);
  const result = await db.from("environment_reviews").insert({ observation_id: body.observationId,
    reviewer_id: user.id, verdict: body.verdict, notes: body.notes.trim() }).select("*").single();
  if (result.error) return databaseError(result.error);
  return json({ review: result.data });
}
