# SRL AI Tagging System

## Learning environment / Indirect SRL pilot

The video detail and tagging pages now link to **סביבת הלמידה · Indirect SRL**.
This is a separate, explicitly queued analysis; running it does not delete or
rerun direct-SRL tags. Runs and human review history are retained independently.

### Install and run

1. Apply `scope-system/src/lib/supabase/migrations/0003_learning_environment.sql`
   using the project's migration role. It creates three RLS-protected tables,
   two service-role-only queue functions, and the private `environment-evidence`
   bucket. Apply it once, after the existing schema/migrations. This change does
   not migrate or change permissions on the legacy videos/tags tables.
2. Set these **worker-side** variables (or add them to the existing `.env.local`):

   ```dotenv
   OPENAI_API_KEY=<your project key>
   ENVIRONMENT_VISION_MODEL=gemini-3.8-flash
   ENVIRONMENT_REASONING_MODEL=gpt-5.4-2026-03-05
   ```

   The existing `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` are also required. Never put provider/service keys
   in a `NEXT_PUBLIC_*` variable. Model access must be enabled for your accounts;
   changing the configured model is recorded on new runs, not silently on retries.
   To explicitly run the interpretation stage with Gemini instead, configure
   `ENVIRONMENT_REASONING_PROVIDER=gemini` and
   `ENVIRONMENT_REASONING_MODEL=gemini-3.8-flash`. That mode does not require an
   OpenAI key. The selected provider is recorded on every new run. There is no
   automatic provider fallback; an exhausted OpenAI quota stops without retrying.
3. Use the worker's existing requirements/virtual environment and FFmpeg:

   ```sh
   cd ai_worker
   python environment_worker.py
   # Process at most one queued run, then exit:
   python environment_worker.py --once
   ```

   Alternatively, set `ENABLE_ENVIRONMENT_ANALYSIS=true` for the existing
   `worker.py`. A dedicated environment worker avoids waiting for direct-SRL
   transcription. Atomic claims allow both workers to coexist. In a container
   built from `ai_worker/Dockerfile`, override the command with
   `python environment_worker.py` for a dedicated worker.
4. Start the dashboard as usual, sign in, open a video from the system's storage,
   and choose **ניתוח סביבת הלמידה**. Queue a run and follow its progress. The UI
   reports an uninstalled migration rather than treating missing tables as an
   empty successful analysis.

### Macro pilot and organization chart

The organization pie chart describes **completed sampled windows**, not lesson
duration. Unknown organization is included; failed/unprocessed windows are shown
separately. Whole-class activity is not necessarily lecture, and grouped seating
does not establish collaboration. Existing runs can display this chart immediately.

New runs can explicitly enable `config.macro_analysis=true` (off by default).
The worker then uses the configured Gemini vision model for separate visual
artifact extraction, episode synthesis, and evidence audit calls. This adds paid
calls; existing runs are neither reprocessed nor overwritten. Extracted artifacts
contain legible text and image references. Macro episodes link artifacts and task
instructions to planning, choice, monitoring, revision, self-evaluation, help-seeking
and co-regulation, distinguishing direct/indirect/mixed support, responsibility,
opportunity and observed uptake. Results are versioned as `indirect-srl-macro-v1`
inside `environment_runs.summary.macro`. A macro failure preserves window results.

Install `0004_environment_macro_reviews.sql` after migration 0003 to enable
owner-only append-only episode reviews. Until installed, results remain readable
and the UI explains that saving episode reviews is unavailable. Corrections are
recorded as notes; they do not automatically rewrite boundaries or model claims.

This first macro version links sampled artifacts; it does not perform geometric
object tracking/cropping or recover unreadable writing. Boundaries are approximate,
gaps remain explicit, and earlier task instructions cannot establish uptake.
The audit reviews extracted descriptions and transcript, not original pixels;
it is not independent human validation. Before research use, compare human and
model coding on visually similar but functionally different examples (copying a
table versus using it for revision; grouped seating versus shared decisions).
No SRL-development score or causal claim is produced.

New macro runs also produce `summary.macro.lesson_overview` (protocol
`indirect-srl-overview-v1`): a cited overall conclusion, chronological progression,
support patterns, responsibility trajectory, opportunities and source conflicts.
Two additional Gemini calls synthesize and audit this layer. Rejected episode
claims cannot be revived, and failed overview synthesis preserves the episodes.
Recommendations are separate from evidence-supported missed opportunities;
missing images, missing tags or unseen uptake never establish a missed opportunity.

Optionally select a tagging session of the same video. The authenticated API
verifies visibility and video membership, then freezes at most 400 tags with their
labels, text and times into `config.tagging_snapshot`. Client-supplied snapshots
are rejected. The selector shows the latest 100 accessible sessions. Text limits,
omissions and empty sources are disclosed. Tags remain fallible interpretations;
combined claims require overlap with both an episode and cited current evidence.
Without a selected session, synthesis uses sampled observations and available
transcript. No new database migration is required for the overview itself.
Existing runs are not reprocessed. Deploy both the web app and worker to enable
new overview runs; changing only the web app does not upgrade a remote worker.

Additional offline checks:

```sh
python3 -m unittest discover -s ai_worker -p 'test_environment*.py' -v
cd scope-system
node --test tests/environment.test.mjs tests/environment-organization.test.mjs
```

### Protocol and evidence

- Protocol `indirect-srl-pilot-v1` lives in `ai_worker/environment_protocol.py`.
  It distinguishes visible conditions, opportunities and observable uptake.
  The six pilot dimensions cover choice, open tasks, knowledge/context,
  structured collaboration, planning conditions and monitoring conditions.
- Default: 60-second windows, frames at offsets 0/20/40. Comparison configurations
  are one frame every 60 or 180 seconds. The final window stops at the actual
  video duration; frame extraction uses the original lesson's absolute timeline.
- Gemini describes the images. GPT-5.4 interprets images, descriptions and an
  exact snapshot of the latest existing AI audio transcript. Up to 90 seconds of
  preceding speech are explicitly marked context-only. Missing transcripts
  remain missing; this worker does not launch a new transcription job.
- Gemini can request a silent motion clip (up to 20 seconds, inside the window).
  The budget is six clip attempts per run. These enrich an existing sample and
  do not enter the denominator as extra samples. The current pilot does not
  independently detect scene changes or ingest worksheets/slides.
- A separate Gemini call audits ambiguous windows plus every tenth window.
  Flagged interpretations become `unknown`, retaining the candidate and audit
  reason. This is model review, not human validation. No calibrated confidence
  scores or overall teacher-quality scores are produced.
- Claims require existing evidence IDs, current-window evidence and compatible
  camera coverage. Uptake requires its own evidence references. Prompts forbid
  inferring thought, attention or motivation from gaze, silence or seating.
  A failed evidence/scope check downgrades only the affected finding to `unknown`
  and preserves the original candidate and reason; malformed output still fails
  the window. Teacher instructions can support teacher-scoped opportunities
  without establishing class-wide uptake.
  These guards reduce unsupported claims; semantic accuracy still needs human
  validation on held-out lessons.
- Statistics count sampled windows per code. Unknown/failed windows are not
  counted as absent support. Human decisions and correction notes are
  append-only and exported with the raw output; they do not rewrite the model
  output or automatically change the displayed counts.

### Access, failure handling and limits

New results and media are accessible only to the signed-in account that queued
the run; sharing between researchers is not implemented in this pilot. Media
URLs expire after one hour and are refreshed by the UI. JSON export omits signed
URLs. Existing source-video permissions are unchanged.

The worker accepts only HTTPS video URLs from this project's Supabase `videos`
bucket, disables redirects, and limits downloads to 2 GiB / three hours. Images
are uploaded to a private bucket, never to the public source-video bucket.
Provider payloads/errors and credentials are not logged. OpenAI requests set
`store=false`; provider retention terms still apply.

Queue claims use leases and fencing tokens; a crashed job can be reclaimed after
30 minutes without repeating stored windows. Provider/stage heartbeats renew
the lease. Three consecutive failed windows stop the run to avoid repeated paid
calls during an outage. Completed windows remain reviewable. New runs preserve
earlier results. Temporary local media is removed after processing; stored
evidence is retained for review (no automatic retention/deletion policy yet).
Token usage returned by providers is stored per window; it is not a billing
estimate and cannot include requests whose provider response was lost.

### Offline verification

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s ai_worker -p 'test_environment.py' -v
cd scope-system
npx tsc --noEmit
# Node 22.18+ for native TypeScript stripping in this test:
node --test tests/environment.test.mjs
```

The Python tests use generated video and fake models; no classroom media or
provider calls are involved. They cover clipping, absolute times, partial
windows, unsupported citations, context-only claims, audit downgrades and
missing-data denominators.

The optional database integration test executes migration 0003 in an isolated
PGlite PostgreSQL instance with minimal Supabase auth/storage scaffolding. Install
`@electric-sql/pglite@0.3.16` in a temporary directory and set `PGLITE_MODULE` to its
`dist/index.js`, then run:

```sh
PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node --test tests/environment-db.test.mjs
```

It checks owner isolation, private storage policy, forbidden status writes,
duplicate jobs, lease reclamation/fencing and append-only review. It does not
replace a staging smoke test against the real Supabase Storage service and
enabled provider models.

### Bounded live validation

After explicitly authorizing transfer of the selected classroom images/transcript
to Google Gemini and OpenAI, the validation CLI can test up to three minute-long
windows without installing the migration or writing to the production database:

```sh
ai_worker/venv/bin/python ai_worker/validate_environment_live.py \
  --video-id <existing-video-uuid> \
  --output ai_worker/chunks/environment-validation-<unique-run-name>
```

It selects windows near the beginning, middle and end, allows at most one motion
clip, and stops at the first failure. Provider calls may incur usage charges.
Source video is temporary; the local report and sampled evidence are retained
with private permissions in the specified output directory, which is excluded
from Git when using the path above. Existing reports are never overwritten.
The output is an engineering validation artifact, not independent human review
or a research accuracy estimate.
Pass `--interpretation-provider gemini` to explicitly test the all-Gemini route.
Its results do not validate the GPT-5.4 interpretation route.
New reports include hashes of the visual and interpretation prompts, so revisions
within a pilot protocol version can be distinguished. Rechecking the same windows
after prompt changes is development feedback, not held-out validation.

---

## 📖 הסבר קצר למשתמשים (עברית)

### מה המערכת עושה?

מערכת זו מאפשרת **ניתוח אוטומטי של סרטוני למידה** באמצעות בינה מלאכותית.
היא מזהה ומתייגת אוטומטית דפוסי **למידה מווסתת עצמית (SRL)** בתוך הסרטונים — כמו תכנון, ניטור עצמי, הערכה, ויסות רגשי ועוד.

**מה קורה מאחורי הקלעים:**
- **ה-Worker (Python)** — קורא את קבצי הווידאו, מפצל אותם לקטעים קצרים, מחלץ שמע, שולח לניתוח של Google Gemini וניתוח פרוזודי (Praat), ומעלה את התוצאות למסד הנתונים.
- **הדשבורד (Next.js)** — ממשק ויזואלי לצפייה, עריכה וניהול של התיוגים שנוצרו.

---

### 🚀 שתי דרכים להשתמש במערכת

#### 1. המערכת המקוונת (מומלץ למחקר)
גש ישירות לכתובת המערכת המקוונת — ללא צורך בהתקנה.
ניתן לצפות בסרטונים, לראות תיוגים, לערוך ולייצא נתונים ישירות מהדפדפן.

#### 2. הרצה מקומית מ-GitHub (למפתחים / הרצת ה-Worker)
כדי להריץ את ה-Worker המקומי (עיבוד סרטונים חדשים), יש להוריד את הקוד מ-GitHub ולעקוב אחרי ההוראות המפורטות בהמשך ה-README הזה.
> דרישות מוקדמות, הגדרת משתני סביבה והוראות הרצה מפורטות — ראו בהמשך.

---


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
