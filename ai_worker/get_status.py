import os
from supabase import create_client

url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path="/Users/yearadany/srl ai tagging/scope-system/.env.local", override=False)
    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(url, key)

res = supabase.table("videos").select("id, title, status").execute()
for r in res.data:
    if "חלק 3" in r["title"] or r["status"] in ["failed", "processing", "pending"]:
        print(r)
