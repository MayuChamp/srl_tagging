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
    print("Splitting video into 10-minute chunks...")
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # We use -c copy to instantly slice the video without re-encoding
    cmd = [
        "ffmpeg", "-i", input_path,
        "-c", "copy",
        "-f", "segment",
        "-segment_time", "600",
        "-reset_timestamps", "1",
        f"{output_dir}/chunk_%03d.mp4"
    ]
    subprocess.run(cmd, check=True)
    print("Video split complete.")

def analyze_video_with_gemini(video_path):
    print(f"Uploading {video_path} to Gemini...")
    # Upload file to Gemini
    uploaded_file = ai_client.files.upload(file=video_path)
    
    print(f"Waiting for Gemini to process {uploaded_file.name}...")
    while uploaded_file.state.name == "PROCESSING":
        print(".", end="", flush=True)
        time.sleep(10)
        uploaded_file = ai_client.files.get(name=uploaded_file.name)
    print()
    
    if uploaded_file.state.name == "FAILED":
        raise Exception(f"Gemini processing failed for {video_path}")
        
    print("Analyzing video...")
    prompt = """
אתה מומחה פדגוגי למודל ה-SRL (Self-Regulated Learning) ובמיוחד במודל ATES. לפניך מקטע סרטון כיתה.
אנא נתח את הוידאו וספק לי רשימה של תיוגים המבוססים על כל תיאוריות ה-SRL, בדגש על ATES. כמו כן, שים לב במיוחד להזדמנויות תיוג נוספות כגון מחוות גוף ואינטונציה של הדוברים הקשורות לנושא.

הקודים האפשריים לתיוג:
- D_PLAN (הנחיה ישירה לתכנון)
- D_MONITOR (הנחיה ישירה לבקרה)
- D_REFLECT (הנחיה ישירה לרפלקציה)
- I_SCAFFOLD (פיגום עקיף/שאלות מנחות)
- I_FEEDBACK (מתן משוב)
- S_PLAN_TALK (תלמיד מתכנן)
- S_MONITOR_TALK (תלמיד מבקר/בודק)
- S_EVAL_TALK (תלמיד מעריך)
- S_GOAL_SET (תלמיד מציב מטרות)
- N_ATTENTION (מחוות לא-מילוליות/קשב)
- N_GESTURE_FOCUS (מחוות מיקוד והצבעה)
- P_INTONATION_ENCOURAGE (אינטונציה מעודדת ותומכת)
- P_INTONATION_QUESTION (אינטונציה שואלת/ספקנית)

החזר את התשובה בפורמט JSON בלבד (ללא טקסט נוסף), כמערך של אובייקטים המכילים:
[
  {
    "code_id": "D_PLAN",
    "start_time": 10.5,
    "end_time": 25.0,
    "evidence_text": "המורה אומרת לתלמידים לתכנן את הפרויקט (טקסט או תיאור פעולה מחוותית/קולית)",
    "confidence_score": 0.95
  }
]
הזמנים בשניות מתחילת הסרטון.
"""
    
    response = ai_client.models.generate_content(
        model='gemini-2.0-flash',
        contents=[
            uploaded_file,
            prompt
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.2
        )
    )
    
    # Cleanup file from Gemini servers
    ai_client.files.delete(name=uploaded_file.name)
    
    return json.loads(response.text)

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
    
    # Step 1: Split
    if not os.path.exists(OUTPUT_DIR) or len(glob.glob(f"{OUTPUT_DIR}/chunk_???.mp4")) == 0:
        split_video(VIDEO_PATH, OUTPUT_DIR)
    
    chunks = sorted(glob.glob(f"{OUTPUT_DIR}/chunk_???.mp4"))
    print(f"Found {len(chunks)} chunks to process.")
    
    # Step 2: Process each chunk
    for i, chunk in enumerate(chunks):
        process_chunk(chunk, i)
        
    print("All processing finished!")

if __name__ == "__main__":
    main()
