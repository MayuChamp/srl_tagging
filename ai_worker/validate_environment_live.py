"""Run a bounded live-provider pilot without writing to the production database.

Example: python validate_environment_live.py --video-id UUID --output chunks/environment-validation
Outputs contain classroom evidence; keep them private. This is an engineering
smoke test, not independent human coding or a research validity estimate.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time
from uuid import UUID

from environment_models import EnvironmentModels, model_config, check_credentials
from environment_protocol import (
    PROTOCOL_VERSION, INTERPRETATION_PROMPT, VISUAL_PROMPT, sampling_windows, summarize,
)
from environment_worker import analyze_window, download_video, probe_duration


def main():
    from dotenv import load_dotenv
    from supabase import create_client
    load_dotenv(Path(__file__).resolve().parent.parent / "scope-system" / ".env.local")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video-id", required=True, type=UUID)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--max-windows", type=int, choices=(1, 2, 3), default=3)
    parser.add_argument("--interpretation-provider", choices=("openai", "gemini"))
    args = parser.parse_args()
    models_config = model_config()
    if args.interpretation_provider:
        models_config["interpretation_provider"] = args.interpretation_provider
        models_config["interpretation"] = (models_config["vision"] if args.interpretation_provider == "gemini"
                                            else "gpt-5.4-2026-03-05")
    check_credentials(models_config)
    os.umask(0o077)
    args.output.mkdir(parents=True, exist_ok=True)
    report_path = args.output / "validation.json"
    if report_path.exists():
        parser.error("Output already contains a validation report; choose a new directory")
    db = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    video = db.table("videos").select("id,title,storage_path").eq("id", str(args.video_id)).single().execute().data
    analyses = (db.table("analyses").select("id,summary_metrics").eq("video_id", str(args.video_id))
                .eq("is_ai_generated", True).order("created_at", desc=True).limit(1).execute().data)
    transcript = (analyses[0].get("summary_metrics") or {}).get("audio_transcript", []) if analyses else []
    report = {"kind": "live_engineering_validation_not_human_review", "video_id": video["id"],
              "title": video["title"], "protocol": PROTOCOL_VERSION, "models": models_config,
              "prompt_sha256": {name: hashlib.sha256(prompt.encode("utf-8")).hexdigest()
                                for name, prompt in (("visual", VISUAL_PROMPT),
                                                     ("interpretation", INTERPRETATION_PROMPT))},
              "source_analysis_id": analyses[0]["id"] if analyses else None,
              "transcript_entries": len(transcript), "windows": []}
    models = EnvironmentModels(report["models"])
    budget = {"remaining": 1}
    with tempfile.TemporaryDirectory(prefix="srl-validation-") as temp:
        source = Path(temp) / "lesson.mp4"
        print("Downloading source video from existing system storage", flush=True)
        download_video(video["storage_path"], source, os.environ["NEXT_PUBLIC_SUPABASE_URL"])
        report["duration_seconds"] = probe_duration(source)
        windows = sampling_windows(report["duration_seconds"])
        indices = list(dict.fromkeys([min(1, len(windows)-1), len(windows)//2, max(0,len(windows)-2)]))[:args.max_windows]
        report["selected_indices"] = indices
        for index in indices:
            target = args.output / ("window-%03d" % index)
            target.mkdir(exist_ok=True)
            started = time.monotonic()
            print("Analyzing selected window %d at %.0f seconds" % (index, windows[index]["start"]), flush=True)
            try:
                row, media = analyze_window(source, windows[index], transcript, models, target,
                                            adaptive=True, clip_budget=budget)
                for evidence, path in media:
                    evidence["local_path"] = str(path.resolve())
            except Exception as error:
                row = {"window_index": index, "status": "failed", "error_type": type(error).__name__,
                       "error": str(error)[:300] if isinstance(error, (ValueError, RuntimeError)) else "See local configuration",
                       "usage": list(models.usage)}
            row["elapsed_seconds"] = round(time.monotonic()-started, 2)
            report["windows"].append(row)
            report["summary"] = summarize(report["windows"], len(indices))
            report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            print("Window %d: %s; %.1f seconds" % (index, row["status"], row["elapsed_seconds"]), flush=True)
            if row["status"] == "failed":
                print("Stopping bounded pilot on first failure", flush=True)
                raise SystemExit(1)
    print("Saved private validation report: " + str(report_path), flush=True)


if __name__ == "__main__":
    main()
