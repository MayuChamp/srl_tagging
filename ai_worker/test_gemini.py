import os
from dotenv import load_dotenv
from google import genai

load_dotenv(dotenv_path="../scope-system/.env.local")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
print("Key length:", len(GEMINI_API_KEY) if GEMINI_API_KEY else 0)

try:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    response = gemini_client.models.generate_content(
        model="gemini-2.5-flash",
        contents=["Hello world"],
    )
    print("Response:", response.text)
except Exception as e:
    import traceback
    traceback.print_exc()
