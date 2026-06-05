import os
import random
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(dotenv_path="../scope-system/.env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

CODES = [
    # TDS – Teacher Direct Strategy Instruction
    "TDS_COG", "TDS_META", "TDS_MOT", "TDS_NONE",
    # EX – Explicitness
    "EX_IMPL", "EX_PART", "EX_EXPL", "EX_NA",
    # SRL – Process Codes
    "SRL_GOAL", "SRL_PLAN", "SRL_COG", "SRL_MON", "SRL_CTRL", "SRL_REFL", "SRL_HELP", "SRL_CONTEXT",
    # ST – Student Uptake
    "ST_PLAN", "ST_MON", "ST_HELP",
    # SCI – Science-Specific SRL
    "SCI_DATA", "SCI_TRANSFER", "SCI_ARG",
    # TA – Teacher Adaptation
    "TA0", "TA1", "TA2", "TA3",
    # MO – Missed Opportunities
    "MO_EXPL", "MO_MON", "MO_EVID", "MO_REFL", "MO_AGENCY", "MO_HELP",
    # Q – Episode Quality
    "Q0", "Q1", "Q2", "Q3",
    # EV – Evidence Strength
    "EV0", "EV1", "EV2", "EV3",
    # Nonverbal & Prosodic
    "N_MODELING", "N_ATTENTION_GUIDING", "N_COLLAB_STRUCTURE", "N_EMOTION_DISPLAY",
    "N_ATTENTION", "N_GESTURE_FOCUS",
    "P_INTONATION_ENCOURAGE", "P_INTONATION_QUESTION",
]

if __name__ == "__main__":
    print("Fetching failed videos to mock tags...")
    res = supabase.table("videos").select("*").eq("status", "failed").execute()
    videos = res.data

    if not videos:
        print("No failed videos found to mock.")

    for video in videos:
        video_id = video['id']
        # Update to completed
        supabase.table("videos").update({"status": "completed"}).eq("id", video_id).execute()

        # Get analysis
        analysis_res = supabase.table("analyses").select("*").eq("video_id", video_id).execute()
        if not analysis_res.data:
            continue

        analysis_id = analysis_res.data[0]['id']

        # Generate 10-15 random tags for the 10-minute chunk
        num_tags = random.randint(10, 15)
        for _ in range(num_tags):
            start_time = random.uniform(0, 580)  # anywhere in 10 mins
            end_time = start_time + random.uniform(5, 20)
            code = random.choice(CODES)

            supabase.table("tags").insert({
                "analysis_id": analysis_id,
                "code_id": code,
                "start_time": start_time,
                "end_time": end_time,
                "evidence_text": f"דוגמה לטקסט שחולץ אוטומטית המעיד על {code}",
                "confidence_score": round(random.uniform(0.7, 0.99), 2)
            }).execute()

        print(f"Mocked {num_tags} tags for video {video['title']}.")

    print("Done!")
