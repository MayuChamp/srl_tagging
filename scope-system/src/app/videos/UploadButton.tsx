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
        className="btn btn-primary btn-lg"
      >
        <Upload size={16} aria-hidden />
        Upload Video
      </button>
      <UploadModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
