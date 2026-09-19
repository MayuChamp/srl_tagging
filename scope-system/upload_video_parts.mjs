import { Upload } from "tus-js-client";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const SUPABASE_URL = "https://bldonljspcigqtzyouyz.supabase.co";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsZG9ubGpzcGNpZ3F0enlvdXl6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTU0NzMwOCwiZXhwIjoyMDk1MTIzMzA4fQ.fqBZOmF9iYe9v8_uMEo-FdCQmyf_EXCL103KEJV-uCg";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const PARTS_DIR = "/private/tmp/claude-501/-Users-yearadany-srl-ai-tagging/8e301c90-42b5-471e-9e1f-dfe52c8f4892/scratchpad/video_split";
const TITLE_BASE = "נגזרת ופונקציה";
const PART_COUNT = 5;

// The original broken row/object this split replaces.
const OLD_VIDEO_ID = "89ba8bd5-d0b5-42e9-88dc-adb6fb9e5d59";
const OLD_STORAGE_OBJECT = "1784545630327_nigzarot_vefuntzia.mp4";

function uploadOne(filePath, objectName) {
  const stat = fs.statSync(filePath);
  const fileSizeMB = (stat.size / 1024 / 1024).toFixed(1);
  console.log(`\n⬆️  Uploading ${path.basename(filePath)} (${fileSizeMB} MB) as ${objectName}`);

  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(filePath);
    const upload = new Upload(fileStream, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "x-upsert": "true",
      },
      uploadLengthDeferred: false,
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: "videos",
        objectName,
        contentType: "video/mp4",
        cacheControl: "3600",
      },
      onError: reject,
      onProgress: (bytesUploaded, bytesTotal) => {
        const pct = ((bytesUploaded / bytesTotal) * 100).toFixed(1);
        process.stdout.write(`\r   Progress: ${pct}%`);
      },
      onSuccess: () => {
        console.log("\n   ✅ Upload complete!");
        const publicUrl = supabase.storage.from("videos").getPublicUrl(objectName).data.publicUrl;
        resolve(publicUrl);
      },
    });
    upload.start();
  });
}

async function main() {
  const insertedIds = [];

  for (let i = 0; i < PART_COUNT; i++) {
    const partNum = i + 1;
    const filePath = path.join(PARTS_DIR, `part_${i}.mp4`);
    const objectName = `${Date.now()}_${i}_derivative_and_function_part${partNum}.mp4`;

    const publicUrl = await uploadOne(filePath, objectName);

    const { data, error } = await supabase
      .from("videos")
      .insert({
        title: `${TITLE_BASE} - חלק ${partNum}`,
        storage_path: publicUrl,
        status: "failed", // not yet analyzed; worker skips "failed" rows
        folder_path: null,
      })
      .select("id")
      .single();

    if (error) {
      console.error(`❌ Failed to insert row for part ${partNum}:`, error.message);
      process.exit(1);
    }

    console.log(`   🎉 Inserted row ${data.id} for part ${partNum}`);
    insertedIds.push(data.id);
  }

  console.log("\n🧹 Cleaning up old broken video row and storage object...");
  const { error: delRowError } = await supabase.from("videos").delete().eq("id", OLD_VIDEO_ID);
  if (delRowError) {
    console.error("⚠️  Failed to delete old video row:", delRowError.message);
  } else {
    console.log("   ✅ Old video row deleted.");
  }

  const { error: delObjError } = await supabase.storage.from("videos").remove([OLD_STORAGE_OBJECT]);
  if (delObjError) {
    console.error("⚠️  Failed to delete old storage object:", delObjError.message);
  } else {
    console.log("   ✅ Old truncated storage object deleted.");
  }

  console.log("\nAll done. New video row IDs:", insertedIds.join(", "));
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
