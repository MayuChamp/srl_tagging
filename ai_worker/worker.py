import os
import sys
import time

_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _DIR)
os.chdir(_DIR)

from dotenv import load_dotenv

# override=False: don't clobber env vars already injected by the container runtime
load_dotenv(dotenv_path=os.path.join(_DIR, "../scope-system/.env.local"), override=False)

_missing = [k for k in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY")
            if not os.getenv(k)]
if _missing:
    print(f"FATAL: Missing required env vars: {', '.join(_missing)}")
    sys.exit(1)

# Delayed import — main.py calls genai.Client() at module load, needs GEMINI_API_KEY set first
from main import process_pending_videos

POLL_INTERVAL = int(os.getenv("POLL_INTERVAL_SECONDS", "60"))

print(f"AI Worker started — polling every {POLL_INTERVAL}s for pending videos...")
while True:
    try:
        process_pending_videos()
    except Exception as e:
        print(f"[worker] Unhandled error in poll cycle: {e}")
    time.sleep(POLL_INTERVAL)
