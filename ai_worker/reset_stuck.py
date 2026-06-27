import os
from supabase import create_client

from dotenv import load_dotenv
load_dotenv(dotenv_path="/Users/yearadany/srl ai tagging/scope-system/.env.local", override=False)
url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(url, key)
supabase.table("videos").update({"status": "pending"}).in_("status", ["processing", "failed"]).execute()
print("Reset all stuck videos to pending.")
