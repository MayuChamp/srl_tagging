import time
from main import process_pending_videos

def main():
    print("Starting AI Worker Polling Service for Cloud Deployment...")
    print("Waiting for pending videos in Supabase...")
    
    while True:
        try:
            process_pending_videos()
        except Exception as e:
            print(f"Unhandled error in polling loop: {e}")
        
        # Sleep for 15 seconds before checking again to avoid rate-limiting the DB
        time.sleep(15)

if __name__ == "__main__":
    main()
