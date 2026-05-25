import os
import random
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(dotenv_path="../ates-system/.env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

CODES = ["D_PLAN", "D_MONITOR", "D_REFLECT", "I_SCAFFOLD", "S_PLAN_TALK", "S_MONITOR_TALK", "N_ATTENTION"]

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
        start_time = random.uniform(0, 580) # anywhere in 10 mins
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
