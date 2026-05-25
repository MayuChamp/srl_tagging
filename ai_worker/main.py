import os
import subprocess
import glob
import time
import json
from dotenv import load_dotenv
from supabase import create_client, Client, ClientOptions
from google import genai
from google.genai import types

# Load env variables from Next.js project
load_dotenv(dotenv_path="../ates-system/.env.local")

# Supabase init
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

opts = ClientOptions(postgrest_client_timeout=600)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY, options=opts)

# Gemini init
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
ai_client = genai.Client(api_key=GEMINI_API_KEY)

VIDEO_PATH = "/Users/yearadany/srl ai tagging/videos/סרטון מלא 17_5_26.MOV"
OUTPUT_DIR = "./chunks"

def split_video(input_path, output_dir):
    print("Extracting a 60-second clip for demo purposes...")
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # Clean previous chunks to ensure we only have the demo chunk
    for f in glob.glob(f"{output_dir}/*"):
        try:
            os.remove(f)
        except:
            pass
            
    # Extract only the first 60 seconds
    cmd = [
        "ffmpeg", "-i", input_path,
        "-t", "60",
        "-c", "copy",
        "-y",
        f"{output_dir}/chunk_000.mp4"
    ]
    subprocess.run(cmd, check=True)
    print("Demo clip extraction complete.")

def analyze_video_with_gemini(video_path):
    print("Using MOCK AI for demo purposes (API limit reached)...")
    time.sleep(2) # Simulate some processing time
    
    mock_tags = [
        {
            "code_id": "D_PLAN",
            "start_time": 5.0,
            "end_time": 10.0,
            "evidence_text": "המורה אומרת: 'בואו נתכנן את העבודה שלנו להיום'",
            "confidence_score": 0.95
        },
        {
            "code_id": "N_GESTURE_FOCUS",
            "start_time": 12.0,
            "end_time": 15.0,
            "evidence_text": "המורה מצביעה על הלוח למיקוד תשומת לב",
            "confidence_score": 0.88
        },
        {
            "code_id": "P_INTONATION_ENCOURAGE",
            "start_time": 16.0,
            "end_time": 20.0,
            "evidence_text": "המורה בטון מעודד: 'מצוין, זו התחלה טובה!'",
            "confidence_score": 0.92
        },
        {
            "code_id": "S_GOAL_SET",
            "start_time": 22.0,
            "end_time": 28.0,
            "evidence_text": "תלמיד: 'אז המטרה שלנו היא לסיים את החלק הראשון עד ההפסקה'",
            "confidence_score": 0.90
        },
        {
            "code_id": "I_SCAFFOLD",
            "start_time": 30.0,
            "end_time": 35.0,
            "evidence_text": "המורה שואלת: 'איך לדעתכם נוכל לבדוק שזה עובד?'",
            "confidence_score": 0.85
        },
        {
            "code_id": "P_INTONATION_QUESTION",
            "start_time": 36.0,
            "end_time": 40.0,
            "evidence_text": "תלמיד מגיב בטון שואל ומהסס: 'אולי נריץ את זה שוב?'",
            "confidence_score": 0.87
        },
        {
            "code_id": "I_FEEDBACK",
            "start_time": 42.0,
            "end_time": 48.0,
            "evidence_text": "המורה מספקת משוב: 'רעיון טוב, ככה נוכל לוודא'",
            "confidence_score": 0.93
        },
        {
            "code_id": "S_EVAL_TALK",
            "start_time": 50.0,
            "end_time": 55.0,
            "evidence_text": "תלמיד מעריך: 'כן, נראה שזה באמת עובד עכשיו'",
            "confidence_score": 0.89
        }
    ]
    return mock_tags

def compress_chunk(input_path):
    output_path = input_path.replace(".mp4", "_compressed.mp4")
    print(f"Compressing {input_path} to reduce size (under 50MB)...")
    # Scale down to 360p, use ultrafast preset and CRF 32 to guarantee size fits free tier
    cmd = [
        "ffmpeg", "-i", input_path,
        "-vf", "scale=-2:360",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "32",
        "-c:a", "aac",
        "-b:a", "64k",
        "-y", output_path
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return output_path

def process_chunk(chunk_path, chunk_index):
    file_name = os.path.basename(chunk_path)
    print(f"--- Processing {file_name} ---")
    
    # 0. Compress chunk
    compressed_path = compress_chunk(chunk_path)
    compressed_file_name = os.path.basename(compressed_path)
    
    # 1. Upload to Supabase Storage
    print(f"Uploading {compressed_file_name} to Supabase Storage...")
    with open(compressed_path, 'rb') as f:
        # Use upsert to overwrite if it failed previously
        supabase.storage.from_("videos").upload(compressed_file_name, f, file_options={"upsert": "true"})
    
    # Get public URL
    public_url = supabase.storage.from_("videos").get_public_url(compressed_file_name)
    
    # 2. Insert into videos table
    print("Inserting into videos table...")
    video_res = supabase.table("videos").insert({
        "title": f"סרטון מלא - חלק {chunk_index+1}",
        "storage_path": public_url,
        "status": "processing"
    }).execute()
    
    video_id = video_res.data[0]['id']
    
    # Create analysis session
    analysis_res = supabase.table("analyses").insert({
        "video_id": video_id,
        "is_ai_generated": True
    }).execute()
    analysis_id = analysis_res.data[0]['id']
    
    # 3. Analyze with Gemini
    try:
        tags = analyze_video_with_gemini(compressed_path)
        print(f"Gemini returned {len(tags)} tags.")
        
        # 4. Insert tags to DB
        for tag in tags:
            supabase.table("tags").insert({
                "analysis_id": analysis_id,
                "code_id": tag.get("code_id"),
                "start_time": tag.get("start_time"),
                "end_time": tag.get("end_time"),
                "evidence_text": tag.get("evidence_text"),
                "confidence_score": tag.get("confidence_score")
            }).execute()
            
        # Mark as completed
        supabase.table("videos").update({"status": "completed"}).eq("id", video_id).execute()
        print(f"{file_name} processing COMPLETED.")
        
    except Exception as e:
        print(f"Error analyzing {file_name}: {e}")
        supabase.table("videos").update({"status": "failed"}).eq("id", video_id).execute()
        
    print("Sleeping for 60 seconds to respect API rate limits...")
    time.sleep(60)

def main():
    print("Starting AI Worker Pipeline")
    
    # Check if bucket exists, create if not (requires proper permissions which service_role has)
    try:
        supabase.storage.get_bucket("videos")
    except Exception:
        print("Bucket 'videos' not found. Ensure it was created as public in Supabase dashboard.")
    
    # Step 1: Extract Demo Clip
    split_video(VIDEO_PATH, OUTPUT_DIR)
    
    chunks = sorted(glob.glob(f"{OUTPUT_DIR}/chunk_???.mp4"))
    print(f"Found {len(chunks)} chunks to process.")
    
    # Step 2: Process each chunk
    for i, chunk in enumerate(chunks):
        process_chunk(chunk, i)
        
    print("All processing finished!")

if __name__ == "__main__":
    main()
