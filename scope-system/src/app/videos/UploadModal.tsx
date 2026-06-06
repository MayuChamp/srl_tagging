"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export function UploadModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!title.trim() || !file) {
      setError("Please provide a title and select a video file.");
      return;
    }

    setUploading(true);
    setError("");

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
      .insert({ title: title.trim(), storage_path: publicUrl, status: "pending" });

    router.refresh();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-6 z-10">
        <h2 className="text-lg font-semibold">Upload New Video</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="upload-title">
              Title
            </label>
            <input
              id="upload-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-secondary/30 border border-border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
              placeholder="Enter video title"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="upload-file">
              Video file
            </label>
            <label
              htmlFor="upload-file"
              className="flex items-center gap-3 w-full bg-secondary/30 border border-border rounded-md px-3 py-2 text-sm cursor-pointer hover:bg-secondary/10 transition-colors"
            >
              <span className="shrink-0 text-muted-foreground">Choose file</span>
              <span className="text-muted-foreground truncate">
                {file ? file.name : "No file selected"}
              </span>
            </label>
            <input
              id="upload-file"
              type="file"
              accept="video/*"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-secondary/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="bg-primary hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed text-primary-foreground px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
            >
              {uploading && (
                <svg
                  className="animate-spin h-4 w-4 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
              )}
              {uploading ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
