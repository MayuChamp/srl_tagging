import os
import sys
import json
import subprocess
import glob
import time
import requests
from dotenv import load_dotenv
from supabase import create_client, Client, ClientOptions
from google import genai
from google.genai import types
from audio_analyzer import analyze_audio_prosody

_DIR = os.path.dirname(os.path.abspath(__file__))

# Load env variables from Next.js project
load_dotenv(dotenv_path=os.path.join(_DIR, "../scope-system/.env.local"))

# Supabase init
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print(f"FATAL: Supabase credentials not found. Checked: {os.path.join(_DIR, '../scope-system/.env.local')}")
    sys.exit(1)

opts = ClientOptions(postgrest_client_timeout=600)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY, options=opts)

# Gemini init
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
gemini_client = genai.Client(api_key=GEMINI_API_KEY, http_options={"timeout": 600_000})  # 600s in ms
GEMINI_MODEL = "gemini-2.5-flash"

VIDEO_PATH = os.getenv("VIDEO_PATH", "/Users/yearadany/srl ai tagging/videos/סרטון של המורה פז.mov")
VIDEO_TITLE = os.getenv("VIDEO_TITLE", "המורה פז")
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "./chunks")

def compute_tds_meta_derived(meta):
    """Compute missed_meta / mo_score / mo_components from raw STG fields."""
    stg_score = sum(int(meta.get(k, 0)) for k in
                    ['stg_naming', 'stg_when', 'stg_how', 'stg_why', 'stg_when_not'])
    meta_intro = bool(meta.get('meta_intro', False))
    missed_meta, mo_score, mo_components = 'none', 0, []
    if meta_intro:
        if stg_score == 0:
            missed_meta, mo_score = 'full', 5
            mo_components = ['שיום', 'מתי להשתמש', 'איך להשתמש', 'למה להשתמש', 'מתי לא להשתמש']
        elif stg_score < 5:
            missed_meta, mo_score = 'partial', 5 - stg_score
            for key, label in [('stg_naming', 'שיום'), ('stg_when', 'מתי להשתמש'),
                                ('stg_how', 'איך להשתמש'), ('stg_why', 'למה להשתמש'),
                                ('stg_when_not', 'מתי לא להשתמש')]:
                if not int(meta.get(key, 0)):
                    mo_components.append(label)
    return {'missed_meta': missed_meta, 'mo_score': mo_score, 'mo_components': mo_components}


def split_video(input_path, output_dir, chunk_duration=300):
    print(f"Splitting video into {chunk_duration}s chunks...")
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    for f in glob.glob(f"{output_dir}/*"):
        try:
            os.remove(f)
        except OSError:
            pass

    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", input_path],
        capture_output=True, text=True, check=True
    )
    total_duration = float(result.stdout.strip())

    chunk_index = 0
    start_time = 0
    while start_time < total_duration:
        cmd = [
            "ffmpeg", "-i", input_path,
            "-ss", str(start_time),
            "-t", str(chunk_duration),
            "-c", "copy",
            "-y",
            f"{output_dir}/chunk_{chunk_index:03d}.mp4"
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        chunk_index += 1
        start_time += chunk_duration

    print(f"Split complete: {chunk_index} chunk(s).")

SRL_SYSTEM_PROMPT = """You are an expert researcher in Self-Regulated Learning (SRL) analyzing a Hebrew classroom video using the SCOPE codebook.

You will receive TWO inputs:
1. A timestamped transcript (Hebrew transcription with second-level timestamps)
2. A PROSODIC/INTONATION ANALYSIS section (pitch, intensity, pauses from Praat)

Use BOTH to identify SRL events. Prosodic features help detect codes that text alone cannot reliably surface.

Prosodic Features Guide:
- RISING pitch_trend + high pitch_range (>30Hz) → SRL_MON (self-questioning), ST_MON
- HIGH intensity (>70dB) + wide pitch range → TDS_MOT (motivational emphasis)
- Long pauses (>1.5s) after teacher speech → SRL_MON, SRL_CTRL (wait time / think time)
- Low voiced_ratio (<0.3) = silence / thinking time → SRL_REFL, SRL_PLAN
- Stable moderate pitch + clear explanation → TDS_COG or TDS_META + EX_EXPL
- Rising end-of-utterance at moderate intensity → TDS_MOT (encouragement)
When the primary evidence is prosodic (not textual), prefix evidence_text with [PROSODIC].

--- DECISION CRITERIA (apply these explicitly in your reasoning) ---

TDS_META vs TDS_COG — the most common distinction:
  • Teacher NAMES a strategy ("שיטת החלוקה", "אסטרטגיית ההשוואה") → lean TDS_META
  • Teacher explains WHEN or WHY to use a strategy (not just how) → TDS_META
  • Teacher guides student's THINKING PROCESS (e.g., "איך אתה מתכנן לפתור?") → TDS_META
  • Instruction references specific CONTENT or KNOWLEDGE (e.g., "איזה ערך להציב", "איזה משתנה לבחור") → TDS_COG
  • Teacher models or activates a cognitive operation on content (comparison, representation, reading a graph) → TDS_COG

EX_IMPL vs EX_PART vs EX_EXPL:
  • Strategy activated implicitly, no naming → EX_IMPL
  • Strategy named but no explanation of when/why/how → EX_PART
  • ALL FOUR present: what the strategy is, when to use it, why it helps, how to apply it → EX_EXPL

SRL process codes — pick all that apply:
  • Goal or success criterion stated → SRL_GOAL
  • Course of action planned or strategy selected → SRL_PLAN
  • Student/teacher monitors comprehension or identifies difficulty → SRL_MON
  • Strategy or approach adjusted mid-task → SRL_CTRL
  • New insight or lesson drawn → SRL_REFL
  • Student requests focused help (not just "I don't understand") → SRL_HELP

MO codes — assign when the teacher COULD HAVE but DID NOT:
  • Had a natural moment to name or explain a strategy, but didn't → MO_EXPL
  • Student showed confusion and teacher didn't prompt self-monitoring → MO_MON
  • Correct answer given but teacher didn't ask for justification/evidence → MO_EVID

--- TDS META-CODING LAYER ---

For EVERY event you MUST include a "tds_meta" object with this additional analysis:

basic_class — overall classification (for TDS_NONE/TDS_MOT events use "COG" as default):
  "COG"     — instruction focuses on content-specific cognitive operations
  "OVERLAP" — both cognitive and metacognitive elements present, BUT naming only (שיום בלבד)
  "META"    — instruction addresses metacognitive strategy use
  Auto-rule: if ONLY stg_naming=1 and all other stg_*=0 → MUST set basic_class="OVERLAP"

meta_intro — true if teacher opened an explicit metacognitive space (paused to frame strategy use);
             false if instruction was embedded in content flow without explicit framing.

meta_intro_type — when meta_intro=true, one of (empty string "" when meta_intro=false):
  "עצירה לחשיבה", "שיום אסטרטגיה", "הזמנה לבדיקה", "הזמנה לבחירה", "רפלקציה", "אחר"

META_STG components (1=explicitly present in this event, 0=absent):
  stg_naming:   teacher NAMED the strategy (e.g., "זו שיטת הצבה")
  stg_when:     teacher explained WHEN to use it
  stg_how:      teacher explained HOW to apply it step by step
  stg_why:      teacher explained WHY it helps / its benefit
  stg_when_not: teacher explained WHEN NOT to use it

--- FEW-SHOT EXAMPLE (with reasoning) ---

Transcript segment [2220s–2270s]:
  "המורה: בואו נחשוב רגע על השיטה שנשתמש בה. כשיש לנו משוואה עם שני נעלמים, הדרך הכי יעילה היא שיטת הצבה. אתה יודע מתי כדאי להשתמש בה?"

Expected output for this event:
{
  "code_ids": ["TDS_META", "EX_EXPL", "SRL_PLAN", "TA2", "Q3", "EV3"],
  "start_time": 2220.0,
  "end_time": 2270.0,
  "evidence_text": "המורה נתנה שם לאסטרטגיה ('שיטת הצבה'), הסבירה מתי כדאי להשתמש בה, והפנתה את התלמיד לתכנן.",
  "reasoning": "TDS_META: המורה מתייחסת לתהליך החשיבה ולבחירת האסטרטגיה, לא לתוכן הספציפי. EX_EXPL: ארבעת המרכיבים נוכחים — מה (שיטת הצבה), מתי (כשיש שני נעלמים), למה (הדרך היעילה), וכיצד (שאלת ההפניה). SRL_PLAN: המורה מנחה את התלמיד לתכנן אסטרטגיה לפני הפתרון. Q3/EV3: עדות טקסטואלית ישירה וברורה.",
  "confidence_score": 0.95,
  "tds_meta": {
    "basic_class": "META",
    "meta_intro": true,
    "meta_intro_type": "שיום אסטרטגיה",
    "stg_naming": 1,
    "stg_when": 1,
    "stg_how": 0,
    "stg_why": 1,
    "stg_when_not": 0
  }
}

--- SCOPE CODEBOOK ---

TDS – Teacher Direct Strategy Instruction (assign ONE per instructional segment):
  TDS_COG   – Teaching a cognitive strategy (comparison, representation, reading a graph/index)
  TDS_META  – Teaching a metacognitive strategy (planning, monitoring, strategy selection, error repair)
  TDS_MOT   – Teaching motivational / emotional goals (effort, persistence, meaning)
  TDS_NONE  – No direct strategy instruction present

EX – Explicitness of the strategy instruction (assign ONE, only when TDS ≠ TDS_NONE):
  EX_IMPL   – Strategy is activated but not framed as a strategy
  EX_PART   – Partial explicitness: strategy is named but not fully explained (what/when/why/how)
  EX_EXPL   – Full explicitness: what, when, why, and how to use the strategy are all stated
  EX_NA     – Not applicable (use when TDS = TDS_NONE)

SRL – SRL Process Codes (can assign multiple per event):
  SRL_GOAL    – Setting a goal or success criterion
  SRL_PLAN    – Planning a course of action or selecting a strategy
  SRL_COG     – Using a cognitive strategy to process content
  SRL_MON     – Monitoring comprehension, accuracy, or source of difficulty
  SRL_CTRL    – Adapting or adjusting strategy / approach
  SRL_REFL    – Cognitive reflection; new understandings
  SRL_HELP    – Focused help-seeking within strategic limits
  SRL_CONTEXT – Contextual regulation: structures, exposure, accountability, environmental conditions

ST – Student SRL Uptake:
  ST_PLAN  – Students plan or revise their course of action
  ST_MON   – Students check, identify problems, and reason about source of difficulty
  ST_HELP  – Students request focused, strategic help

SCI – Science-Specific SRL:
  SCI_DATA     – Data analysis strategy: trends, patterns, representations
  SCI_TRANSFER – Transfer, generalization, connection to science/technology domains
  SCI_ARG      – Scientific argumentation, evidence-based justification

TA – Teacher Adaptation to SRL signals (assign ONE per episode):
  TA0 – No adaptation
  TA1 – Limited adaptation (content only)
  TA2 – Clear instructional adaptation
  TA3 – SRL-oriented adaptation

MO – Missed Opportunities (teacher could have but did not promote SRL):
  MO_EXPL    – Missed opportunity to make a strategy explicit
  MO_MON     – Missed opportunity for self-monitoring or comprehension check
  MO_EVID    – Missed opportunity to ask for evidence, justification, or proof
  MO_REFL    – Missed opportunity for reflection after a strategy use
  MO_AGENCY  – Missed opportunity to promote student choice or ownership
  MO_HELP    – Missed opportunity to teach strategic help-seeking

Q – Overall SRL Quality of the episode (assign ONE):
  Q0 – Not SRL
  Q1 – Low SRL quality
  Q2 – Medium SRL quality
  Q3 – High SRL quality

EV – Evidence Strength for each tag (assign ONE):
  EV0 – No evidence
  EV1 – Weak evidence
  EV2 – Moderate evidence
  EV3 – Strong evidence

--- NONVERBAL & PROSODIC CODEBOOK ---
(These codes are assigned IN ADDITION to SCOPE codes, especially when audio provides evidence)

Nonverbal Cues:
  N_MODELING           – Teacher nonverbally models a strategy
  N_ATTENTION_GUIDING  – Nonverbal guidance of visual/spatial attention
  N_COLLAB_STRUCTURE   – Nonverbal cues structuring collaboration
  N_EMOTION_DISPLAY    – Emotional display affecting classroom climate (tone, affect)
  N_ATTENTION          – Nonverbal bid for student attention
  N_GESTURE_FOCUS      – Focusing gesture toward content

Prosodic Cues (detectable ONLY from audio — use the PROSODIC ANALYSIS section):
  P_INTONATION_ENCOURAGE – Warm, encouraging intonation (rising at utterance end, moderate intensity ~55–68 dB)
  P_INTONATION_QUESTION  – Genuine questioning intonation (rising F0 pattern, inviting student response)

--- AUDIO-ONLY DETECTION GUIDE ---
Use these rules on the PROSODIC/INTONATION ANALYSIS data to tag events not visible in text:

  Rising pitch_trend + pitch_range > 30 Hz at end of utterance
    → P_INTONATION_QUESTION

  Rising pitch + moderate intensity (55–68 dB) + voiced_ratio > 0.6
    → P_INTONATION_ENCOURAGE

  High intensity (> 70 dB) + wide pitch range (> 80 Hz)
    → N_EMOTION_DISPLAY  (and consider TDS_MOT for motivational energy)

  Long pause (> 1.5 s) immediately after teacher speech
    → teacher providing wait time → tag as SRL_MON or SRL_REFL opportunity for students

  Low voiced_ratio (< 0.25) across a window = sustained silence / thinking time
    → tag surrounding context as SRL_PLAN or SRL_REFL

  Marked mid-discourse pitch rise (not at utterance end)
    → N_ATTENTION (calling attention to something important)

  Flat/falling pitch + intensity drop at a teachable moment (missed)
    → consider MO_EXPL, MO_MON, or MO_REFL

When evidence is primarily from prosody (not a verbal quote), prefix evidence_text with [PROSODIC].
When text and prosody both confirm the code, include both in evidence_text.

--- END CODEBOOK ---

Identify every SRL-relevant event. Each event gets MULTIPLE codes simultaneously from different SCOPE dimensions.

For each instructional event assign codes from ALL applicable dimensions:
  • ONE TDS code (TDS_COG / TDS_META / TDS_MOT / TDS_NONE)
  • ONE EX code (EX_IMPL / EX_PART / EX_EXPL / EX_NA)
  • ONE or more SRL process codes (SRL_GOAL, SRL_PLAN, SRL_COG, SRL_MON, SRL_CTRL, SRL_REFL, SRL_HELP, SRL_CONTEXT)
  • ONE TA code (TA0 / TA1 / TA2 / TA3)
  • ONE Q code (Q0 / Q1 / Q2 / Q3)
  • ONE EV code (EV0 / EV1 / EV2 / EV3)
  • Any MO codes if missed opportunities are present
  • Any ST codes if student uptake is visible
  • Any SCI / N / P codes when relevant

All codes in an event share the SAME timestamps and evidence_text.

For EVERY event you must provide a "reasoning" field in Hebrew that explains:
  1. Why each code was chosen (reference the decision criteria above)
  2. Which criteria pointed toward this code vs. alternatives considered
  3. What specific evidence (textual or prosodic) supports each decision

Return valid JSON in exactly this format:
{
  "events": [
    {
      "code_ids": ["TDS_COG", "EX_EXPL", "SRL_MON", "TA2", "Q2", "EV2"],
      "start_time": <seconds as float>,
      "end_time": <seconds as float>,
      "evidence_text": "<exact Hebrew quote or [PROSODIC] description>",
      "reasoning": "<Hebrew explanation of why each code was assigned, referencing decision criteria>",
      "confidence_score": <float 0.0–1.0>
    }
  ]
}"""


RICH_TRANSCRIPT_PROMPT = """Analyze this Hebrew classroom audio recording and create a complete chronological audio log.

For EVERY audio event return an entry:

1. SPEECH (type="speech"): identify the speaker:
   - "מורה" for teacher
   - "תלמיד" for a single student
   - "תלמידים" for multiple students / class
   Transcribe the exact Hebrew words.

2. AMBIENT (type="ambient"): describe all non-speech sounds, including:
   - רחש בכיתה, שיחות רקע
   - תזוזת כיסאות, שולחנות
   - רחש ספרים, דפים, כתיבה
   - צחוק, מחיאות כפיים, קריאות
   - שקט / דממה
   - צלילי מכשירים (פעמון, מקרן, מחשב)
   - כל קול אחר שנשמע

Return ALL events sorted by start time. To avoid overly long outputs, group continuous ambient noises into longer segments (e.g., one 30-second 'background noise' event instead of 15 short ones). Do not log micro-events under 2 seconds unless they are speech."""

RICH_TRANSCRIPT_SCHEMA = {
    "type": "object",
    "properties": {
        "entries": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "start":       {"type": "number"},
                    "end":         {"type": "number"},
                    "type":        {"type": "string"},
                    "speaker":     {"type": "string"},
                    "text":        {"type": "string"},
                    "description": {"type": "string"},
                },
                "required": ["start", "end", "type"],
            }
        }
    },
    "required": ["entries"]
}


def analyze_video_with_gemini(video_path):
    """Returns (srl_events, rich_transcript_entries)."""
    audio_path = os.path.splitext(video_path)[0] + "_audio.mp3"
    uploaded_file = None
    rich_entries = []
    try:
        print("Extracting audio for transcription...")
        subprocess.run([
            "ffmpeg", "-i", video_path,
            "-vn", "-acodec", "libmp3lame",
            "-ar", "16000", "-ac", "1", "-b:a", "32k",
            "-y", audio_path
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("Uploading audio to Gemini File API...")
        uploaded_file = gemini_client.files.upload(
            file=audio_path,
            config=types.UploadFileConfig(mime_type="audio/mp3")
        )
        wait_time = 0
        while uploaded_file.state and uploaded_file.state.name == "PROCESSING":
            if wait_time > 180:
                print("WARNING: Gemini File API processing timeout (180s).")
                break
            time.sleep(5)
            wait_time += 5
            uploaded_file = gemini_client.files.get(name=uploaded_file.name)

        # ── Pass 1: speech transcription for SRL analysis ──────────────────
        print("Transcribing with Gemini...")
        transcript_response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[
                uploaded_file,
                "Transcribe this Hebrew classroom audio with timestamps. Return every spoken segment with start/end times in seconds."
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "object",
                    "properties": {
                        "segments": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "start": {"type": "number"},
                                    "end":   {"type": "number"},
                                    "text":  {"type": "string"}
                                },
                                "required": ["start", "end", "text"]
                            }
                        }
                    },
                    "required": ["segments"]
                }
            )
        )
        try:
            transcript_data = json.loads(transcript_response.text)
        except json.JSONDecodeError:
            print(f"WARNING: Failed to parse Gemini response as JSON. Raw response: {transcript_response.text}")
            transcript_data = {}
        segments = transcript_data.get("segments", [])
        transcript_text = "\n".join(
            f"[{s['start']:.1f}s - {s['end']:.1f}s]: {s['text']}"
            for s in segments
        )
        print(f"Transcription complete ({len(segments)} segments).")

        # ── Pass 2: rich audio transcript (speech + ambient) ────────────────
        print("Generating rich audio transcript (speech + ambient sounds)...")
        try:
            rich_response = gemini_client.models.generate_content(
                model=GEMINI_MODEL,
                contents=[uploaded_file, RICH_TRANSCRIPT_PROMPT],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=RICH_TRANSCRIPT_SCHEMA,
                )
            )
            rich_data = json.loads(rich_response.text)
            rich_entries = rich_data.get("entries", [])
            print(f"Rich transcript complete ({len(rich_entries)} entries).")
        except Exception as e:
            print(f"WARNING: Rich transcript generation failed ({e}) — continuing without it.")

    finally:
        if os.path.exists(audio_path):
            os.remove(audio_path)
        if uploaded_file:
            try:
                gemini_client.files.delete(name=uploaded_file.name)
            except Exception:
                pass

    # ── Pass 3: prosodic analysis (Praat) + SRL coding ─────────────────────
    prosody_context = analyze_audio_prosody(video_path)

    user_content = f"Classroom video transcript (Hebrew):\n\n{transcript_text}"
    if prosody_context:
        user_content += f"\n\n{prosody_context}"

    print(f"Analyzing with Gemini ({GEMINI_MODEL}, transcript + prosody)...")
    analysis_response = gemini_client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[user_content],
        config=types.GenerateContentConfig(
            system_instruction=SRL_SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema={
                "type": "object",
                "properties": {
                    "events": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "code_ids":        {"type": "array", "items": {"type": "string"}},
                                "start_time":      {"type": "number"},
                                "end_time":        {"type": "number"},
                                "evidence_text":   {"type": "string"},
                                "reasoning":       {"type": "string"},
                                "confidence_score":{"type": "number"},
                                "tds_meta": {
                                    "type": "object",
                                    "properties": {
                                        "basic_class":     {"type": "string"},
                                        "meta_intro":      {"type": "boolean"},
                                        "meta_intro_type": {"type": "string"},
                                        "stg_naming":      {"type": "integer"},
                                        "stg_when":        {"type": "integer"},
                                        "stg_how":         {"type": "integer"},
                                        "stg_why":         {"type": "integer"},
                                        "stg_when_not":    {"type": "integer"},
                                    },
                                    "required": ["basic_class", "meta_intro", "meta_intro_type",
                                                 "stg_naming", "stg_when", "stg_how", "stg_why", "stg_when_not"]
                                }
                            },
                            "required": ["code_ids", "start_time", "end_time", "evidence_text", "reasoning", "confidence_score", "tds_meta"]
                        }
                    }
                },
                "required": ["events"]
            },
            temperature=0.1
        )
    )

    try:
        result = json.loads(analysis_response.text)
    except json.JSONDecodeError:
        print(f"WARNING: Failed to parse Gemini response as JSON. Raw response: {analysis_response.text}")
        result = {}
    events = result.get("events", [])
    total_codes = sum(len(e.get("code_ids", [])) for e in events)
    print(f"Gemini identified {len(events)} events ({total_codes} total code labels).")
    return events, rich_entries

def compress_video(input_path):
    output_path = os.path.splitext(input_path)[0] + "_compressed.mp4"
    print(f"Compressing {input_path} to reduce size (under 50MB)...")
    # Scale down to 360p, use ultrafast preset and CRF 32 to guarantee size fits free tier
    cmd = [
        "ffmpeg", "-i", input_path,
        "-vf", "transpose=2,scale=640:-2",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "32",
        "-c:a", "aac",
        "-b:a", "64k",
        "-y", output_path
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return output_path

def process_single_video(local_path, video_title, video_id=None):
    """
    Processes a video file completely, uploading it as a single video in the DB.
    To prevent Gemini API limits, it internally splits the video into 5-minute chunks,
    processes them, and aggregates the tags under the single video entry.
    """
    import shutil
    file_name = os.path.basename(local_path)
    print(f"--- Processing Video: {video_title} ---")
    
    # 0. Compress & Upload if it's a new local video
    if video_id is None:
        compressed_path = compress_video(local_path)
        compressed_file_name = os.path.basename(compressed_path)
        
        print(f"Uploading {compressed_file_name} to Supabase Storage...")
        try:
            with open(compressed_path, 'rb') as f:
                supabase.storage.from_("videos").upload(compressed_file_name, f, file_options={"upsert": "true"})
        except Exception as e:
            print(f"Error uploading to Supabase storage: {e}")
            return
        
        public_url = supabase.storage.from_("videos").get_public_url(compressed_file_name)
        
        print("Inserting into videos table...")
        video_res = supabase.table("videos").insert({
            "title": video_title,
            "storage_path": public_url,
            "status": "processing"
        }).execute()
        
        if not video_res.data:
            print("Error: Failed to insert video into database.")
            return
        video_id = video_res.data[0]['id']
        path_to_process = compressed_path
    else:
        path_to_process = local_path
        supabase.table("videos").update({"status": "processing"}).eq("id", video_id).execute()

    # Use the most-recent AI analysis (matches what the UI shows)
    analysis_res = supabase.table("analyses").select("id").eq("video_id", video_id).eq("is_ai_generated", True).order("created_at", desc=True).limit(1).execute()
    if not analysis_res.data:
        analysis_res = supabase.table("analyses").insert({
            "video_id": video_id,
            "is_ai_generated": True
        }).execute()
        if not analysis_res.data:
            print(f"Error: Failed to create analysis session.")
            return
    else:
        # Clear stale tags from any previous partial run
        supabase.table("tags").delete().eq("analysis_id", analysis_res.data[0]["id"]).execute()
        supabase.table("tds_meta").delete().eq("analysis_id", analysis_res.data[0]["id"]).execute()

    analysis_id = analysis_res.data[0]['id']

    def ensure_analysis_exists(vid_id, a_id):
        """Returns valid analysis_id. If deleted externally, finds the newest existing one."""
        check = supabase.table("analyses").select("id").eq("id", a_id).execute()
        if check.data:
            return a_id
        # Analysis was deleted by a re-analyze trigger — find the new one it created
        newer = supabase.table("analyses").select("id").eq("video_id", vid_id).eq("is_ai_generated", True).order("created_at", desc=True).limit(1).execute()
        if newer.data:
            print(f"WARNING: analysis {a_id[:8]} deleted externally, switching to {newer.data[0]['id'][:8]}.")
            return newer.data[0]["id"]
        # Nothing exists — create fresh
        new_res = supabase.table("analyses").insert({
            "video_id": vid_id,
            "is_ai_generated": True
        }).execute()
        if not new_res.data:
            raise RuntimeError("Failed to recreate analysis session after external deletion.")
        return new_res.data[0]["id"]

    chunk_dir = os.path.join(OUTPUT_DIR, f"temp_{video_id}")
    try:
        os.makedirs(chunk_dir, exist_ok=True)
        # Split video into 5-minute chunks internally to avoid timeout/OOM issues on Gemini API
        split_video(path_to_process, chunk_dir, chunk_duration=300)

        chunk_files = sorted(glob.glob(f"{chunk_dir}/chunk_*.mp4"))
        total_chunks = len(chunk_files)
        print(f"Video internally split into {total_chunks} chunks for safe API processing.")

        # Write initial progress so the UI can show 0/N immediately
        supabase.table("analyses").update({
            "summary_metrics": {"progress": {"current": 0, "total": total_chunks}}
        }).eq("id", analysis_id).execute()

        total_rows = 0
        all_rich_entries = []

        for idx, chunk_file in enumerate(chunk_files):
            print(f"Analyzing internal chunk {idx+1}/{len(chunk_files)}...")
            offset = idx * 300
            events, rich_entries = analyze_video_with_gemini(chunk_file)

            # Verify analysis row still exists before inserting (handles UI re-analyze race)
            analysis_id = ensure_analysis_exists(video_id, analysis_id)

            chunk_rows = []
            for event in events:
                start_t = event.get("start_time", 0) + offset
                end_t = event.get("end_time", 0) + offset
                for code_id in event.get("code_ids", []):
                    chunk_rows.append({
                        "analysis_id": analysis_id,
                        "code_id": code_id,
                        "start_time": start_t,
                        "end_time": end_t,
                        "evidence_text": event.get("evidence_text"),
                        "reasoning": event.get("reasoning"),
                        "confidence_score": event.get("confidence_score")
                    })

            if chunk_rows:
                for i in range(0, len(chunk_rows), 100):
                    supabase.table("tags").insert(chunk_rows[i:i+100]).execute()
                total_rows += len(chunk_rows)
                print(f"Chunk {idx+1}: inserted {len(chunk_rows)} tag rows ({total_rows} total so far).")

            # Insert tds_meta rows for events that carry TDS codes
            valid_classes = {'COG', 'OVERLAP', 'META'}
            tds_rows = []
            for event in events:
                start_t = event.get("start_time", 0) + offset
                end_t = event.get("end_time", 0) + offset
                has_tds = any(c.startswith('TDS_') for c in event.get("code_ids", []))
                meta = event.get("tds_meta")
                if has_tds and meta:
                    derived = compute_tds_meta_derived(meta)
                    basic_class = meta.get("basic_class") or None
                    if basic_class not in valid_classes:
                        basic_class = None
                    tds_rows.append({
                        "analysis_id": analysis_id,
                        "start_time": start_t,
                        "end_time": end_t,
                        "basic_class": basic_class,
                        "meta_intro": bool(meta.get("meta_intro", False)),
                        "meta_intro_type": meta.get("meta_intro_type") or None,
                        "stg_naming": int(meta.get("stg_naming", 0)),
                        "stg_when": int(meta.get("stg_when", 0)),
                        "stg_how": int(meta.get("stg_how", 0)),
                        "stg_why": int(meta.get("stg_why", 0)),
                        "stg_when_not": int(meta.get("stg_when_not", 0)),
                        "missed_meta": derived["missed_meta"],
                        "mo_score": derived["mo_score"],
                        "mo_components": derived["mo_components"],
                        "tds_reasoning": event.get("reasoning"),
                    })
            if tds_rows:
                supabase.table("tds_meta").upsert(
                    tds_rows, on_conflict="analysis_id,start_time,end_time"
                ).execute()
                print(f"Chunk {idx+1}: inserted {len(tds_rows)} tds_meta rows.")

            # Update progress after each chunk
            supabase.table("analyses").update({
                "summary_metrics": {"progress": {"current": idx + 1, "total": total_chunks}}
            }).eq("id", analysis_id).execute()

            for entry in rich_entries:
                if "start" in entry: entry["start"] += offset
                if "end" in entry: entry["end"] += offset
                all_rich_entries.append(entry)

            # Free up space locally
            try:
                os.remove(chunk_file)
            except OSError:
                pass

        if all_rich_entries:
            supabase.table("analyses").update({
                "summary_metrics": {"audio_transcript": all_rich_entries}
            }).eq("id", analysis_id).execute()

        supabase.table("videos").update({"status": "completed"}).eq("id", video_id).execute()
        print(f"Video '{video_title}' analysis COMPLETED ({total_rows} tag rows total).")
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error analyzing video '{video_title}': {e}")
        supabase.table("videos").update({"status": "failed"}).eq("id", video_id).execute()
    finally:
        if os.path.exists(chunk_dir):
            try:
                shutil.rmtree(chunk_dir)
            except Exception:
                pass
        # Clean up compressed video if we created it
        if video_id is None and os.path.exists(path_to_process):
             try:
                 os.remove(path_to_process)
             except OSError:
                 pass

def process_pending_videos():
    print("Checking for pending videos in database...")
    res = supabase.table("videos").select("*").in_("status", ["processing", "pending"]).execute()
    videos = res.data
    if not videos:
        print("No pending videos found.")
        return

    print(f"Found {len(videos)} pending video(s).")
    for video in videos:
        video_id = video["id"]
        storage_path = video.get("storage_path", "")
        if not storage_path:
            continue

        file_name = os.path.basename(storage_path.split("?")[0])
        local_path = os.path.join(OUTPUT_DIR, file_name)

        if not os.path.exists(local_path):
            print(f"Downloading {file_name} from storage...")
            r = requests.get(storage_path, stream=True, timeout=300)
            r.raise_for_status()
            os.makedirs(OUTPUT_DIR, exist_ok=True)
            with open(local_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
            print("Download complete.")

        process_single_video(local_path, video["title"], video_id=video_id)
        
        if os.path.exists(local_path):
            try:
                os.remove(local_path)
            except Exception:
                pass
        
        print("Sleeping for 60 seconds to respect API rate limits...")
        time.sleep(60)

def main():
    print("Starting AI Worker Pipeline")

    try:
        supabase.storage.get_bucket("videos")
    except Exception:
        print("Bucket 'videos' not found. Ensure it was created as public in Supabase dashboard.")

    # First: resume any videos already in the DB that are pending
    process_pending_videos()

    # Then: process new video from disk directly
    if os.path.exists(VIDEO_PATH):
        already_done = supabase.table("videos").select("id").eq("title", VIDEO_TITLE).eq("status", "completed").execute()
        if already_done.data:
            print(f"Video '{VIDEO_TITLE}' already completed. Skipping.")
        else:
            process_single_video(VIDEO_PATH, VIDEO_TITLE, video_id=None)

    print("All processing finished!")

if __name__ == "__main__":
    main()
