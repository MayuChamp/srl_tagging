"""Independent queue worker: python environment_worker.py [--once]."""
import argparse
import copy
import json
import math
import os
import subprocess
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

from environment_protocol import (
    BUCKET, PROTOCOL_VERSION, sampling_windows, summarize, transcript_evidence,
    guard_interpretation, validate_observation,
)


def probe_duration(path):
    result = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
                            check=True, capture_output=True, text=True, timeout=30)
    duration = float(result.stdout.strip())
    if not math.isfinite(duration) or not 0 < duration <= 10800:
        raise ValueError("Pilot supports videos up to three hours")
    return duration


def extract_frame(video, timestamp, target):
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-ss", str(timestamp), "-i", str(video),
                    "-frames:v", "1", "-vf", "scale=1280:720:force_original_aspect_ratio=decrease",
                    "-q:v", "3", "-y", str(target)],
                   check=True, capture_output=True, timeout=60)
    if not Path(target).exists() or Path(target).stat().st_size == 0:
        raise ValueError("Frame unavailable at sample timestamp")


def extract_clip(video, start, duration, target):
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-ss", str(start), "-i", str(video),
                    "-t", str(duration), "-an", "-vf", "scale=640:360:force_original_aspect_ratio=decrease",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "28", "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart", "-y", str(target)],
                   check=True, capture_output=True, timeout=120)
    if not Path(target).exists() or Path(target).stat().st_size > 10 * 1024 * 1024:
        raise ValueError("Clip missing or exceeds evidence size limit")


def download_video(url, target, supabase_url):
    """Only fetch this project's storage; never arbitrary URLs from a database row."""
    import requests
    source, project = urlparse(url), urlparse(supabase_url)
    if (source.scheme != "https" or source.netloc != project.netloc
            or source.username or source.password
            or not source.path.startswith(("/storage/v1/object/public/videos/", "/storage/v1/object/sign/videos/"))):
        raise ValueError("Environment analysis requires a video stored in this project's videos bucket")
    with requests.get(url, stream=True, timeout=(15, 120), allow_redirects=False) as response:
        if response.status_code != 200:
            raise RuntimeError("Video download failed (HTTP %s)" % response.status_code)
        written = 0
        with open(target, "wb") as output:
            for block in response.iter_content(1024 * 1024):
                written += len(block)
                if written > 2 * 1024 ** 3:
                    raise ValueError("Pilot video exceeds 2 GiB limit")
                output.write(block)


def analyze_window(video, window, transcript, models, workdir, adaptive=True, clip_budget=None, heartbeat=None, macro_enabled=False):
    evidence = transcript_evidence(transcript, window["start"], window["end"])
    media = []
    models.usage = []
    for number, timestamp in enumerate(window["timestamps"]):
        item = {"id": "w%d_f%d" % (window["index"], number), "kind": "image",
                "start": timestamp, "end": timestamp, "context_only": False}
        path = Path(workdir) / (item["id"] + ".jpg")
        extract_frame(video, timestamp, path)
        evidence.append(item)
        media.append((item, path))
    observation = validate_observation(models.observe(window, media), evidence, window)
    if heartbeat:
        heartbeat()
    clip_requested = observation["needs_video"]
    if clip_requested and adaptive and (clip_budget is None or clip_budget["remaining"] > 0):
        if clip_budget is not None:
            clip_budget["remaining"] -= 1
        length = min(20, window["end"] - window["start"])
        start = max(window["start"], min(observation["video_check_time"] - length / 2,
                                         window["end"] - length))
        item = {"id": "w%d_clip" % window["index"], "kind": "video",
                "start": start, "end": start + length, "context_only": False}
        path = Path(workdir) / (item["id"] + ".mp4")
        extract_clip(video, start, length, path)
        evidence.append(item)
        media.append((item, path))
        observation = validate_observation(models.observe(window, media), evidence, window)
        if heartbeat:
            heartbeat()
    elif clip_requested:
        observation["limitations"].append("נדרשה בדיקת תנועה; הרחבת הווידאו לא הופעלה או שהמכסה מוצתה.")
    candidate = models.interpret(window, observation, evidence, media)
    interpretation, guard_issues = guard_interpretation(candidate, evidence, observation)
    if heartbeat:
        heartbeat()
    # Review ambiguous windows and a deterministic 10% sample of the others.
    audit_required = (bool(guard_issues) or clip_requested or observation["coverage"] != "class_visible"
                      or any(f["state"] == "partial" for f in interpretation["findings"])
                      or window["index"] % 10 == 0)
    audit = {"performed": False, "issues": [], "guard_issues": guard_issues}
    if guard_issues:
        audit["original_interpretation_before_guards"] = copy.deepcopy(candidate)
    if audit_required:
        checked = models.audit(observation, interpretation, evidence, media)
        audit.update(performed=True, issues=checked["issues"])
        if checked["issues"]:
            audit["original_interpretation"] = copy.deepcopy(interpretation)
            flagged = {issue["code"] for issue in checked["issues"]}
            for finding in interpretation["findings"]:
                if finding["code"] in flagged:
                    reasons = "; ".join(i["reason"] for i in checked["issues"] if i["code"] == finding["code"])
                    finding.update(state="unknown", uptake="unknown", uptake_evidence_ids=[],
                                   direct_support_also_present=False,
                                   rationale="נדרשת בדיקה אנושית: " + reasons)
            interpretation["limitations"].append("ממצאים שסומנו בביקורת הועברו למצב לא ניתן לקבוע; נדרשת בדיקה אנושית.")
    if macro_enabled:
        try:
            artifacts = models.inspect_artifacts(window, media)
            from environment_macro import VISUAL_ARTIFACT_SCHEMA
            from environment_protocol import validate_schema
            validate_schema(artifacts, VISUAL_ARTIFACT_SCHEMA)
            visual_ids = {e['id'] for e in evidence if e['kind'] in ('image', 'video')}
            for artifact in artifacts['artifacts']:
                if not artifact['evidence_ids'] or not set(artifact['evidence_ids']) <= visual_ids:
                    raise ValueError('Invalid visual artifact references')
            observation['visual_artifacts'] = artifacts['artifacts']
        except Exception as artifact_error:
            observation['visual_artifacts'] = []
            audit['artifact_error'] = 'Visual artifact extraction failed (%s)' % type(artifact_error).__name__
            observation['limitations'].append('חילוץ הרכיבים החזותיים נכשל; התצפית המקורית נשמרה.')
        if heartbeat:
            heartbeat()
    row = {"window_index": window["index"], "start_time": window["start"],
           "end_time": window["end"], "status": "completed", "observation": observation,
           "interpretation": interpretation, "evidence": evidence, "audit": audit,
           "usage": list(models.usage), "error": None}
    return row, media


def fenced_update(db, run, values):
    values["updated_at"] = datetime.now(timezone.utc).isoformat()
    values["lease_expires_at"] = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
    result = (db.table("environment_runs").update(values).eq("id", run["id"])
              .eq("lease_token", run["lease_token"]).eq("status", "processing").execute())
    if not result.data:
        raise RuntimeError("Environment lease lost")


def process_run(db, run):
    from environment_models import EnvironmentModels, ModelError, check_credentials, model_config
    try:
        if run["protocol_version"] != PROTOCOL_VERSION:
            raise ValueError("Worker does not support queued protocol version")
        config = run["config"]
        # Validate before downloading or making billable model calls.
        sampling_windows(1, config["interval_seconds"], config["frames_per_window"])
        if type(config.get("macro_analysis", False)) is not bool:
            raise ValueError("Invalid macro configuration")
        if type(config.get("adaptive_video")) is not bool:
            raise ValueError("Invalid adaptive video configuration")
        video = db.table("videos").select("storage_path").eq("id", run["video_id"]).single().execute().data
        models_config = run["models"] or model_config()
        check_credentials(models_config)
        transcript = run.get("transcript_snapshot")
        source_id = run.get("source_analysis_id")
        if transcript is None:
            analyses = (db.table("analyses").select("id,summary_metrics").eq("video_id", run["video_id"])
                        .eq("is_ai_generated", True).order("created_at", desc=True).limit(1).execute().data)
            source_id = analyses[0]["id"] if analyses else None
            transcript = ((analyses[0].get("summary_metrics") or {}).get("audio_transcript") or []) if analyses else []
        if not isinstance(transcript, list):
            raise ValueError("Invalid source transcript")
        fenced_update(db, run, {"models": models_config, "transcript_snapshot": transcript,
                                "source_analysis_id": source_id, "error": None})
        models = EnvironmentModels(models_config)
        with tempfile.TemporaryDirectory(prefix="srl-environment-") as directory:
            path = Path(directory) / "lesson.mp4"
            download_video(video["storage_path"], path, os.environ["NEXT_PUBLIC_SUPABASE_URL"])
            duration = probe_duration(path)
            windows = sampling_windows(duration, config["interval_seconds"], config["frames_per_window"])
            rows = (db.table("environment_observations").select("*").eq("run_id", run["id"])
                    .order("window_index").execute().data)
            existing = {row["window_index"] for row in rows}
            clips = sum(e["kind"] == "video" for row in rows for e in row["evidence"])
            clip_budget = {"remaining": max(0, 6 - sum(bool(r["audit"].get("clip_attempted")) for r in rows))}
            consecutive_failures = 0
            fenced_update(db, run, {"progress": {"current": len(rows), "total": len(windows)}})
            for window in windows:
                if window["index"] in existing:
                    continue
                fenced_update(db, run, {})
                budget_before = clip_budget["remaining"]
                models.usage = []
                uploaded_paths = []
                try:
                    with tempfile.TemporaryDirectory(dir=directory, prefix="window-") as workdir:
                        row, media = analyze_window(path, window, transcript, models, workdir,
                                                    config["adaptive_video"], clip_budget, lambda: fenced_update(db, run, {}), macro_enabled=config.get("macro_analysis", False))
                        # Check lease before publishing media; include token to avoid concurrent overwrite.
                        fenced_update(db, run, {})
                        for evidence, media_path in media:
                            key = "%s/%s/%s/%s" % (run["requested_by"], run["id"], run["lease_token"], media_path.name)
                            db.storage.from_(BUCKET).upload(key, media_path.read_bytes(),
                                file_options={"content-type": "video/mp4" if evidence["kind"] == "video" else "image/jpeg",
                                              "upsert": "true"})
                            uploaded_paths.append(key)
                            evidence["storage_path"] = key
                            clips += evidence["kind"] == "video"
                except Exception as error:
                    if uploaded_paths:
                        try:
                            db.storage.from_(BUCKET).remove(uploaded_paths)
                        except Exception:
                            print("Could not remove unreferenced evidence from failed window", flush=True)
                    # No source content, signed URLs or credentials in persisted diagnostics.
                    row = {"window_index": window["index"], "start_time": window["start"],
                           "end_time": window["end"], "status": "failed", "observation": {},
                           "interpretation": {"findings": [], "limitations": []}, "evidence": [],
                           "audit": {}, "usage": list(models.usage),
                           "error": str(error) if isinstance(error, ModelError) else
                           "Window processing failed (%s); inspect worker configuration and provider availability." % type(error).__name__}
                row["audit"]["clip_attempted"] = clip_budget["remaining"] < budget_before
                db.rpc("save_environment_window", {"p_run": run["id"], "p_lease": run["lease_token"], "p_row": row}).execute()
                rows.append(row)
                print("Environment %s: %d/%d (%s)" % (run["id"], len(rows), len(windows), row["status"]), flush=True)
                consecutive_failures = consecutive_failures + 1 if row["status"] == "failed" else 0
                if consecutive_failures >= 3:
                    break  # Avoid repeated billable calls when a provider or storage is unavailable.
            summary = summarize(rows, len(windows))
            summary["transcript_available"] = bool(transcript)
            summary["adaptive_clips"] = clips
            summary['macro'] = {'protocol_version': 'indirect-srl-macro-v1', 'status': 'disabled'}
            if config.get('macro_analysis', False):
                try:
                    from environment_macro import analyze_macro
                    fenced_update(db, run, {})
                    summary['macro'] = analyze_macro(rows, models, lambda: fenced_update(db, run, {}))
                    try:
                        from environment_overview import analyze_overview
                        fenced_update(db, run, {})
                        summary['macro']['lesson_overview'] = analyze_overview(
                            rows, summary['macro'], models, config.get('tagging_snapshot'),
                            len(windows), lambda: fenced_update(db, run, {}))
                    except Exception as overview_error:
                        summary['macro']['lesson_overview'] = {'status': 'failed',
                            'error': 'Lesson overview failed (%s); episode results are preserved.' % type(overview_error).__name__}
                    summary['macro']['usage'] = list(models.usage)
                except Exception as macro_error:
                    summary['macro'] = {'protocol_version': 'indirect-srl-macro-v1', 'status': 'failed',
                        'error': 'Macro analysis failed (%s); sampled observations are preserved.' % type(macro_error).__name__,
                        'usage': list(models.usage)}
            status = "completed" if summary["failed_windows"] == 0 else "completed_with_errors"
            if summary["completed_windows"] == 0 or summary["unprocessed_windows"]:
                status = "failed"
            fenced_update(db, run, {"status": status, "summary": summary,
                                    "error": "Processing stopped after repeated failures; completed windows are preserved." if status == "failed" else None})
    except Exception as error:
        message = (str(error) if isinstance(error, (ValueError, RuntimeError))
                   else "Environment processing failed (%s)" % type(error).__name__)
        # Only our own bounded configuration errors are exposed; provider exceptions are sanitized in adapters.
        try:
            fenced_update(db, run, {"status": "failed", "error": message[:500]})
        except Exception:
            print("Environment run stopped; lease expired or persistence unavailable", flush=True)


def process_pending_environment(db):
    runs = db.rpc("claim_environment_run", {}).execute().data
    if runs:
        process_run(db, runs[0])
    return bool(runs)


def main():
    from dotenv import load_dotenv
    from supabase import create_client
    load_dotenv(Path(__file__).resolve().parent.parent / "scope-system" / ".env.local")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    db = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    while True:
        try:
            process_pending_environment(db)
        except Exception as error:
            print("Environment queue unavailable (%s); check migration 0003 and worker configuration" % type(error).__name__, flush=True)
            if args.once:
                raise SystemExit(1)
        if args.once:
            break
        time.sleep(10)


if __name__ == "__main__":
    main()
