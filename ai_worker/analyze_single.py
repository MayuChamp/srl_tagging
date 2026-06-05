"""
Run AI analysis (Gemini + Praat prosody) on a single video by Supabase ID.
Called by the Next.js API route when the user clicks "Analyze with AI" in the UI.

Usage:
    python3 analyze_single.py --video-id <supabase-uuid>
"""

import os
import sys
import argparse
import requests
import tempfile

# Ensure imports from this directory work regardless of CWD
_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(_DIR)
sys.path.insert(0, _DIR)

from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(_DIR, "../scope-system/.env.local"))

from supabase import create_client, Client, ClientOptions
from main import analyze_video_with_gemini

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print(f"FATAL: Supabase credentials not found. Checked: {os.path.join(_DIR, '../scope-system/.env.local')}")
    sys.exit(1)

opts = ClientOptions(postgrest_client_timeout=600)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY, options=opts)


def run(video_id: str) -> None:
    print(f"[analyze_single] Starting AI analysis for video: {video_id}")

    res = supabase.table("videos").select("*").eq("id", video_id).execute()
    if not res.data:
        print(f"ERROR: Video {video_id} not found.")
        sys.exit(1)

    video = res.data[0]
    storage_path = video.get("storage_path", "")
    if not storage_path:
        print("ERROR: Video has no storage_path.")
        supabase.table("videos").update({"status": "failed"}).eq("id", video_id).execute()
        sys.exit(1)

    supabase.table("videos").update({"status": "processing"}).eq("id", video_id).execute()

    # Remove any previous AI analysis for this video (re-run clean)
    existing = supabase.table("analyses").select("id").eq("video_id", video_id).eq("is_ai_generated", True).execute()
    for old in existing.data:
        supabase.table("tags").delete().eq("analysis_id", old["id"]).execute()
        supabase.table("analyses").delete().eq("id", old["id"]).execute()

    tmp_path = None
    try:
        print(f"[analyze_single] Downloading video...")
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp_path = tmp.name

        r = requests.get(storage_path, stream=True, timeout=300)
        r.raise_for_status()
        with open(tmp_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
        print(f"[analyze_single] Download complete ({os.path.getsize(tmp_path) // 1024 // 1024} MB).")

        # Create analysis record
        analysis_res = supabase.table("analyses").insert({
            "video_id": video_id,
            "is_ai_generated": True,
        }).execute()
        analysis_id = analysis_res.data[0]["id"]

        # Run Gemini transcription + Praat prosody + Gemini SRL coding
        events, rich_entries = analyze_video_with_gemini(tmp_path)

        # Insert tags — one row per code_id per event
        rows = []
        for event in events:
            for code_id in event.get("code_ids", []):
                rows.append({
                    "analysis_id": analysis_id,
                    "code_id": code_id,
                    "start_time": event.get("start_time"),
                    "end_time": event.get("end_time"),
                    "evidence_text": event.get("evidence_text"),
                    "confidence_score": event.get("confidence_score"),
                })
        if rows:
            supabase.table("tags").insert(rows).execute()
        print(f"[analyze_single] Inserted {len(rows)} tag rows for {len(events)} events.")

        # Save rich audio transcript to summary_metrics
        if rich_entries:
            supabase.table("analyses").update({
                "summary_metrics": {"audio_transcript": rich_entries}
            }).eq("id", analysis_id).execute()
            print(f"[analyze_single] Rich transcript saved ({len(rich_entries)} entries).")

        supabase.table("videos").update({"status": "completed"}).eq("id", video_id).execute()
        print(f"[analyze_single] DONE — {len(rows)} tags + {len(rich_entries)} transcript entries saved.")

    except Exception as e:
        print(f"[analyze_single] ERROR: {e}")
        supabase.table("videos").update({"status": "failed"}).eq("id", video_id).execute()
        sys.exit(1)

    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Analyze a single video by Supabase UUID.")
    parser.add_argument("--video-id", required=True, help="Supabase video UUID")
    args = parser.parse_args()
    run(args.video_id)
