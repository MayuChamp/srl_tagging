"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  SkipBack,
  SkipForward,
  Info
} from "lucide-react";

export interface VideoMarker {
  id: string;
  startTime: number;
  endTime?: number;
  label: string;
  color: string;
  labels?: string[];
  colors?: string[];
  evidence?: string;
  interpretation?: string;
  confidence?: number;
}

export interface Caption {
  startTime: number;
  endTime: number;
  text: string;
}

interface VideoPlayerProps {
  url: string;
  markers?: VideoMarker[];
  onTimeUpdate?: (time: number) => void;
  captions?: Caption[];
  seekRequest?: { time: number; seq: number } | null;
}

type VideoUrlType = "direct" | "youtube" | "vimeo" | "drive";

function detectUrlType(url: string): VideoUrlType {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("vimeo.com")) return "vimeo";
  if (url.includes("drive.google.com")) return "drive";
  return "direct";
}

function buildEmbedUrl(url: string, type: VideoUrlType): string {
  if (type === "youtube") {
    let videoId = "";
    if (url.includes("youtu.be/")) {
      videoId = url.split("youtu.be/")[1]?.split(/[?&#]/)[0] ?? "";
    } else {
      try {
        videoId = new URL(url).searchParams.get("v") ?? "";
      } catch {
        videoId = "";
      }
    }
    return `https://www.youtube.com/embed/${videoId}?rel=0`;
  }
  if (type === "vimeo") {
    const videoId = url.split("vimeo.com/")[1]?.split(/[?&#/]/)[0] ?? "";
    return `https://player.vimeo.com/video/${videoId}`;
  }
  if (type === "drive") {
    // https://drive.google.com/file/d/FILE_ID/view → preview
    const match = url.match(/\/file\/d\/([^/]+)/);
    const fileId = match?.[1] ?? "";
    return `https://drive.google.com/file/d/${fileId}/preview`;
  }
  return url;
}

export function VideoPlayer({ url, markers = [], onTimeUpdate, captions = [], seekRequest }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const urlType = detectUrlType(url);
  const isEmbed = urlType !== "direct";
  const embedUrl = isEmbed ? buildEmbedUrl(url, urlType) : url;

  // Reload video and reset state when URL changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url || isEmbed) return;
    video.load();
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    onTimeUpdate?.(0);
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const video = videoRef.current;
    if (!video || isEmbed) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      onTimeUpdate?.(video.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
    };
  }, [onTimeUpdate, isEmbed]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => {});
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = () => {
    if (containerRef.current) {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !videoRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const newTime = pos * duration;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  const skip = (amount: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime += amount;
    }
  };

  // Seek to a specific time when seekRequest changes
  useEffect(() => {
    if (!seekRequest || !videoRef.current || isEmbed) return;
    videoRef.current.currentTime = seekRequest.time;
    videoRef.current.play().catch(() => {});
  }, [seekRequest?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isEmbed) {
    return (
      <div ref={containerRef} className="relative bg-black rounded-xl overflow-hidden border border-border shadow-lg">
        <div className="aspect-video w-full">
          <iframe
            src={embedUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-secondary/40 border-t border-border text-xs text-muted-foreground">
          <Info size={12} className="shrink-0" />
          <span>
            Embedded player — use the video controls directly. Set timestamps manually in the annotation form.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative group bg-black rounded-xl overflow-hidden border border-border shadow-lg aspect-video w-full"
    >
      <video
        ref={videoRef}
        src={url}
        className="absolute inset-0 w-full h-full object-contain cursor-pointer"
        onClick={togglePlay}
      />

      {/* Caption Overlay */}
      {(() => {
        const active = captions.find(c => currentTime >= c.startTime && currentTime < c.endTime);
        if (!active) return null;
        return (
          <div className="absolute bottom-16 left-0 right-0 flex justify-center pointer-events-none px-4">
            <div className="bg-black/80 text-white text-sm px-3 py-1.5 rounded-md max-w-[90%] text-center whitespace-pre-line leading-snug">
              {active.text.replace(/<[^>]+>/g, "")}
            </div>
          </div>
        );
      })()}

      {/* Controls Overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">

        {/* Timeline */}
        <div
          ref={timelineRef}
          className="relative h-2 bg-white/20 rounded-full mb-4 cursor-pointer hover:h-3 transition-all"
          onClick={handleTimelineClick}
        >
          {/* Progress Bar */}
          <div
            className="absolute top-0 left-0 h-full bg-primary rounded-full pointer-events-none"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />

          {/* Markers */}
          {markers.map((marker) => {
            const leftPos = (marker.startTime / duration) * 100;
            const widthPos = marker.endTime ? ((marker.endTime - marker.startTime) / duration) * 100 : 0.5;

            return (
              <div
                key={marker.id}
                className="absolute top-0 h-full group/marker cursor-pointer rounded-sm"
                style={{
                  left: `${leftPos}%`,
                  width: `${widthPos}%`,
                  backgroundColor: marker.color,
                  minWidth: "2px"
                }}
                title={(marker.labels ?? [marker.label]).join(", ")}
              >
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/90 text-white text-xs px-2 py-1 rounded opacity-0 group-hover/marker:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                  {(marker.labels ?? [marker.label]).join(", ")}
                </div>
              </div>
            );
          })}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-4">
            <button onClick={togglePlay} className="hover:text-primary transition-colors">
              {isPlaying ? <Pause size={24} /> : <Play size={24} fill="currentColor" />}
            </button>
            <button onClick={() => skip(-10)} className="hover:text-primary transition-colors flex items-center gap-1 text-xs font-medium">
              <SkipBack size={20} />
              <span>-10s</span>
            </button>
            <button onClick={() => skip(10)} className="hover:text-primary transition-colors flex items-center gap-1 text-xs font-medium">
              <span>+10s</span>
              <SkipForward size={20} />
            </button>
            <div className="flex items-center gap-2">
              <button onClick={toggleMute} className="hover:text-primary transition-colors">
                {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
            </div>
            <div className="text-sm font-mono tracking-wider">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button onClick={toggleFullscreen} className="hover:text-primary transition-colors">
              <Maximize size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
