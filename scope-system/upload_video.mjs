// Script to upload a local video to Supabase Storage and register it in the videos table
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const SUPABASE_URL = "https://bldonljspcigqtzyouyz.supabase.co";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsZG9ubGpzcGNpZ3F0enlvdXl6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTU0NzMwOCwiZXhwIjoyMDk1MTIzMzA4fQ.fqBZOmF9iYe9v8_uMEo-FdCQmyf_EXCL103KEJV-uCg";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ---- Configuration ----
const VIDEO_PATH = "/Users/yearadany/srl ai tagging/videos/נגזרת_ופונקציה_compressed.mp4";
const VIDEO_TITLE = "נגזרת ופונקציה";
const FOLDER_PATH = null; // set to e.g. "מתמטיקה" if you want a folder

async function main() {
  console.log("📹 Starting video upload...");
  console.log(`   File: ${path.basename(VIDEO_PATH)}`);

  const stat = fs.statSync(VIDEO_PATH);
  const fileSizeMB = (stat.size / 1024 / 1024).toFixed(1);
  console.log(`   Size: ${fileSizeMB} MB`);

  // Read file as buffer (uses Node streams to avoid memory issues)
  const fileBuffer = fs.readFileSync(VIDEO_PATH);
  const filename = `${Date.now()}_${path.basename(VIDEO_PATH).replace(/\s+/g, "_")}`;

  console.log(`\n⬆️  Uploading to Supabase Storage as: ${filename}`);
  console.log("   This may take a while for large files...\n");

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("videos")
    .upload(filename, fileBuffer, {
      cacheControl: "3600",
      upsert: false,
      contentType: "video/mp4",
    });

  if (uploadError) {
    console.error("❌ Upload failed:", uploadError.message);
    process.exit(1);
  }

  console.log("✅ Upload complete!");

  const publicUrl = supabase.storage.from("videos").getPublicUrl(filename).data
    .publicUrl;

  console.log(`   Public URL: ${publicUrl}`);

  // Insert into videos table
  const { error: insertError } = await supabase.from("videos").insert({
    title: VIDEO_TITLE,
    storage_path: publicUrl,
    status: "pending",
    folder_path: FOLDER_PATH,
  });

  if (insertError) {
    console.error("❌ Failed to add to database:", insertError.message);
    process.exit(1);
  }

  console.log("\n🎉 Video successfully added to the library!");
  console.log(`   Title: ${VIDEO_TITLE}`);
  console.log(`   Status: pending (ready for analysis)`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
