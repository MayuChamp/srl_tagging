"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

type Mode = "upload" | "link";

export function UploadModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("upload");
  const [title, setTitle] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const reset = () => {
    setTitle("");
    setFolderPath("");
    setFile(null);
    setUrl("");
    setError("");
    setUploading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Please provide a title.");
      return;
    }

    setUploading(true);

    const folder_path = folderPath.trim().replace(/^\/+|\/+$/g, "") || null;

    if (mode === "link") {
      if (!url.trim()) {
        setError("Please enter a video URL.");
        setUploading(false);
        return;
      }

      const { error: insertError } = await supabase
        .from("videos")
        .insert({ title: title.trim(), storage_path: url.trim(), status: "pending", folder_path });

      if (insertError) {
        setError(insertError.message);
        setUploading(false);
        return;
      }
    } else {
      if (!file) {
        setError("Please select a video file.");
        setUploading(false);
        return;
      }

      const filename = `${Date.now()}_${file.name.replace(/\s+/g, "_")}`;

      const { error: uploadError } = await supabase.storage
        .from("videos")
        .upload(filename, file, { cacheControl: "3600", upsert: false });

      if (uploadError) {
        setError(uploadError.message);
        setUploading(false);
        return;
      }

      const publicUrl = supabase.storage
        .from("videos")
        .getPublicUrl(filename).data.publicUrl;

      await supabase
        .from("videos")
        .insert({ title: title.trim(), storage_path: publicUrl, status: "pending", folder_path });
    }

    router.refresh();
    handleClose();
  };

  return (
    <div className="modal-root">
      <div
        className="modal-backdrop"
        onClick={handleClose}
      />

      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-video-title"
      >
        <div className="modal-header">
          <h2 id="add-video-title" className="modal-title">
            <Upload size={16} className="text-primary" aria-hidden />
            Add Video
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="icon-btn"
            aria-label="Close"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="modal-body space-y-5">
          {/* Mode toggle */}
          <div className="segmented w-full">
            <button
              type="button"
              onClick={() => { setMode("upload"); setError(""); }}
              aria-pressed={mode === "upload"}
              className="segmented-item flex-1 h-8 text-sm"
            >
              Upload file
            </button>
            <button
              type="button"
              onClick={() => { setMode("link"); setError(""); }}
              aria-pressed={mode === "link"}
              className="segmented-item flex-1 h-8 text-sm"
            >
              From link
            </button>
          </div>

          <form onSubmit={handleSubmit} aria-busy={uploading} className="space-y-4">
            <div className="space-y-1.5">
              <label className="field-label" htmlFor="add-title">
                Title
              </label>
              <input
                id="add-title"
                type="text"
                required
                dir="auto"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="field"
                placeholder="Enter video title"
              />
            </div>

            <div className="space-y-1.5">
              <label className="field-label" htmlFor="add-folder">
                Folder <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                id="add-folder"
                type="text"
                dir="auto"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                className="field"
                placeholder="e.g. Class A/Lesson 1"
              />
              <p className="field-hint">
                Use &quot;/&quot; to nest folders. Leave blank to keep this video uncategorized.
              </p>
            </div>

            {mode === "link" ? (
              <div className="space-y-1.5">
                <label className="field-label" htmlFor="add-url">
                  Video URL
                </label>
                <input
                  id="add-url"
                  type="url"
                  required
                  dir="ltr"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="field"
                  placeholder="https://vimeo.com/... or YouTube / Google Drive"
                />
                <p className="field-hint">
                  Supports Vimeo (including private links), YouTube, and Google Drive.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="field-label" htmlFor="upload-file">
                  Video file
                </label>
                {/* The ring shows keyboard focus of the visually hidden file input. */}
                <div className="rounded-xl has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring has-[input:focus-visible]:ring-offset-2 has-[input:focus-visible]:ring-offset-card">
                  <label
                    htmlFor="upload-file"
                    className="flex flex-col items-center justify-center gap-2 w-full rounded-xl border border-dashed border-input bg-secondary/40 px-4 py-6 text-sm text-center cursor-pointer transition-colors hover:border-primary/50 hover:bg-primary/5"
                  >
                    <Upload size={18} className="text-muted-foreground" aria-hidden />
                    <span className="btn btn-secondary btn-sm">Choose file</span>
                    {file ? (
                      <span className="flex items-center justify-center gap-1.5 min-w-0 max-w-full text-foreground">
                        <CheckCircle2 size={14} className="shrink-0 text-success" aria-hidden />
                        <span className="truncate" dir="auto">{file.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          ({(file.size / 1e6).toFixed(1)} MB)
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground truncate max-w-full">
                        No file selected
                      </span>
                    )}
                  </label>
                  <input
                    id="upload-file"
                    type="file"
                    accept="video/*"
                    className="sr-only"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
            )}

            {error && (
              <div role="alert" className="callout tone-danger">
                <AlertTriangle size={16} className="callout-icon" aria-hidden />
                <p className="min-w-0" dir="auto">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="btn btn-outline"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading}
                className="btn btn-primary"
              >
                {uploading && (
                  <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden />
                )}
                {uploading
                  ? mode === "link" ? "Adding..." : "Uploading..."
                  : mode === "link" ? "Add video" : "Upload"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
