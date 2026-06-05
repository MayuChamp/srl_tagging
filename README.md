# SRL AI Tagging System

This repository contains the code for the **Multimodal Self-Regulated Learning (SRL) Analysis System**. It consists of a Next.js web dashboard (`scope-system`) for viewing and managing video tags, and a Python background worker (`ai_worker`) that processes videos and automatically extracts SRL tags using Google Gemini and Praat prosodic analysis.

---

## 🛠 Prerequisites

Before you can run the system on your machine, you must have the following installed:
1. **[Node.js](https://nodejs.org/en/download/)** (v18 or higher)
2. **[Python](https://www.python.org/downloads/)** (v3.9 or higher)
3. **[FFmpeg](https://ffmpeg.org/download.html)** (Required by the Python worker to extract audio/video chunks).
   - *Mac:* `brew install ffmpeg`
   - *Windows:* Download from the official site or use `winget install ffmpeg`
   - *Linux:* `sudo apt install ffmpeg`

## 🔑 Environment Variables Setup

Both the frontend and the backend read environment variables from a single `.env.local` file located in the `scope-system` folder. 

1. Navigate to the `scope-system` directory:
   ```bash
   cd scope-system
   ```
2. Create a file named `.env.local`.
3. Add the following keys (ask the repository owner for the actual values):
   ```env
   NEXT_PUBLIC_SUPABASE_URL="your_supabase_url"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="your_supabase_anon_key"
   SUPABASE_SERVICE_ROLE_KEY="your_supabase_service_key"
   GEMINI_API_KEY="your_gemini_api_key"
   ```

---

## 💻 Running the Web Dashboard (Frontend)

The frontend is built with Next.js, React, and Tailwind CSS.

1. Open a terminal and navigate to the frontend folder:
   ```bash
   cd scope-system
   ```
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🤖 Running the AI Worker (Backend)

The AI worker is a Python script that reads videos, chunks them, extracts audio, calls Gemini for transcription and SRL tagging, and uploads the results to Supabase.

1. Open a **new** terminal window and navigate to the python folder:
   ```bash
   cd ai_worker
   ```
2. (Optional but recommended) Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # On Mac/Linux:
   source venv/bin/activate
   # On Windows:
   venv\Scripts\activate
   ```
3. Install the required Python packages:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the worker:
   ```bash
   python main.py
   ```
*Note: Make sure your `.env.local` is set up properly in the `scope-system` folder, as `main.py` will automatically look for it there!*
