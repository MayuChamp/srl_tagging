"""
Prosodic/intonation analysis module for SRL classroom video analysis.
Uses praat-parselmouth (Praat) for pitch, intensity, and pause analysis.

Install: pip3 install praat-parselmouth
"""

import subprocess
import os
import numpy as np

DEFAULT_PITCH_FLOOR = 75
DEFAULT_PITCH_CEILING = 400
DEFAULT_THRESHOLD_DB = 42.0


def extract_audio_wav(video_path: str) -> str:
    """Extract 16kHz mono WAV from video for Praat analysis."""
    audio_path = video_path.rsplit(".", 1)[0] + "_praat.wav"
    subprocess.run([
        "ffmpeg", "-i", video_path,
        "-vn", "-acodec", "pcm_s16le",
        "-ar", "16000", "-ac", "1",
        "-y", audio_path
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return audio_path


def analyze_prosody(snd, pitch_obj, intensity_obj, segment_duration: float = 5.0) -> list:
    """
    Analyze prosodic features in fixed-duration windows using Praat.

    Returns list of dicts with pitch (F0), intensity, voiced ratio, and intonation trend.
    Pitch floor=75Hz (Hebrew female/male teacher range), ceiling=400Hz.
    """
    import parselmouth

    total_duration = snd.duration

    segments = []
    t = 0.0
    while t < total_duration:
        end = min(t + segment_duration, total_duration)
        sample_times = np.arange(t, end, 0.05)

        raw_pitch = [pitch_obj.get_value_at_time(pt) for pt in sample_times]
        voiced = [v for v in raw_pitch if not np.isnan(v) and v > 0]
        voiced_ratio = len(voiced) / max(len(raw_pitch), 1)

        raw_intensity = []
        for pt in sample_times:
            try:
                val = intensity_obj.get_value(pt)
                if val is not None and not np.isnan(val):
                    raw_intensity.append(val)
            except parselmouth.PraatError:
                pass

        pitch_mean = float(np.mean(voiced)) if voiced else None
        pitch_range = float(np.max(voiced) - np.min(voiced)) if len(voiced) > 1 else 0.0
        intensity_mean = float(np.mean(raw_intensity)) if raw_intensity else None

        # Intonation trend: compare first vs last third of voiced frames
        trend = "neutral"
        if len(voiced) >= 6:
            third = len(voiced) // 3
            first_mean = np.mean(voiced[:third])
            last_mean = np.mean(voiced[-third:])
            diff = last_mean - first_mean
            if diff > 10:
                trend = "rising"
            elif diff < -10:
                trend = "falling"

        segments.append({
            "start": round(t, 1),
            "end": round(end, 1),
            "pitch_mean_hz": round(pitch_mean, 1) if pitch_mean else None,
            "pitch_range_hz": round(pitch_range, 1),
            "pitch_trend": trend,
            "intensity_mean_db": round(intensity_mean, 1) if intensity_mean else None,
            "voiced_ratio": round(voiced_ratio, 2),
        })
        t = end

    return segments


def detect_pauses(snd, intensity_obj, min_pause_duration: float = 0.5, threshold_db: float = DEFAULT_THRESHOLD_DB) -> list:
    """
    Detect silences/pauses based on intensity threshold.
    Threshold: 42dB (calibrated for typical classroom recording).
    """
    import parselmouth

    pauses = []
    in_pause = False
    pause_start = 0.0
    times = np.arange(0, snd.duration, 0.01)

    for t in times:
        try:
            val = intensity_obj.get_value(t)
            is_silent = (val is None or np.isnan(val) or val < threshold_db)
        except parselmouth.PraatError:
            is_silent = True

        if is_silent and not in_pause:
            in_pause = True
            pause_start = float(t)
        elif not is_silent and in_pause:
            in_pause = False
            duration = float(t) - pause_start
            if duration >= min_pause_duration:
                pauses.append({
                    "start": round(pause_start, 2),
                    "end": round(float(t), 2),
                    "duration": round(duration, 2),
                })

    # Flush any open pause if the audio ends during silence
    if in_pause:
        duration = float(snd.duration) - pause_start
        if duration >= min_pause_duration:
            pauses.append({
                "start": round(pause_start, 2),
                "end": round(float(snd.duration), 2),
                "duration": round(duration, 2),
            })

    return pauses


def format_prosody_for_prompt(segments: list, pauses: list) -> str:
    """Format prosodic features as a structured text block for GPT-4o context."""
    lines = [
        "=== PROSODIC/INTONATION ANALYSIS (praat-parselmouth) ===",
        "Pitch in Hz (F0), Intensity in dB, voiced_ratio=proportion of speech vs silence (0-1)",
        "",
    ]

    for seg in segments:
        if seg["pitch_mean_hz"]:
            pitch_str = f"{seg['pitch_mean_hz']}Hz {seg['pitch_trend']}, range:{seg['pitch_range_hz']}Hz"
        else:
            pitch_str = "unvoiced/silence"

        intensity_str = f"{seg['intensity_mean_db']}dB" if seg["intensity_mean_db"] else "N/A"

        if seg["voiced_ratio"] > 0.7:
            speech_label = "dense speech"
        elif seg["voiced_ratio"] > 0.35:
            speech_label = "moderate speech"
        else:
            speech_label = "sparse/pauses"

        lines.append(
            f"[{seg['start']}s-{seg['end']}s] pitch:{pitch_str} | "
            f"intensity:{intensity_str} | {speech_label} (voiced:{seg['voiced_ratio']})"
        )

    if pauses:
        pause_strs = [f"[{p['start']}s-{p['end']}s] {p['duration']}s" for p in pauses]
        lines.append("")
        lines.append("Notable pauses (>0.5s): " + " | ".join(pause_strs))

    return "\n".join(lines)


def analyze_audio_prosody(video_path: str) -> str:
    """
    Main entry point: extract prosodic features from a video file.
    Returns a formatted string to append to the GPT-4o user message.
    Returns "" silently if parselmouth is unavailable or analysis fails.
    """
    audio_path = None
    try:
        import parselmouth  # noqa: F401 — verify installation

        print("Extracting WAV for prosody analysis (Praat)...")
        audio_path = extract_audio_wav(video_path)

        print("Loading audio into Praat...")
        snd = parselmouth.Sound(audio_path)
        pitch_obj = snd.to_pitch(time_step=0.01, pitch_floor=DEFAULT_PITCH_FLOOR, pitch_ceiling=DEFAULT_PITCH_CEILING)
        intensity_obj = snd.to_intensity(minimum_pitch=DEFAULT_PITCH_FLOOR, time_step=0.01)

        print("Analyzing pitch and intensity per 5s window...")
        segments = analyze_prosody(snd, pitch_obj, intensity_obj)

        print("Detecting significant pauses...")
        pauses = detect_pauses(snd, intensity_obj)

        print(f"Prosody analysis complete: {len(segments)} segments, {len(pauses)} notable pauses.")
        return format_prosody_for_prompt(segments, pauses)

    except ImportError:
        print("WARNING: praat-parselmouth not installed — skipping prosody analysis.")
        print("  Install with: pip3 install praat-parselmouth")
        return ""
    except Exception as e:
        print(f"WARNING: Prosody analysis failed ({e}) — continuing without it.")
        return ""
    finally:
        if audio_path and os.path.exists(audio_path):
            os.remove(audio_path)
