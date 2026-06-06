"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { UploadModal } from "./UploadModal";

export function UploadButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-all glow-primary hover:scale-[1.02] active:scale-[0.98]"
      >
        <Upload size={16} />
        Upload Video
      </button>
      <UploadModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
