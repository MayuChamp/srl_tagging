"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  Info,
  PictureInPicture2,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/cn";

export interface VideoMarker {
  id: string;
  startTime: number;
  endTime?: number;
  label: string;
  color: string;
  labels?: string[];
  colors?: string[];
  evidence?: string;
  reasoning?: string;
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
  /** Optional frame overrides (merged last). Omit it to keep the default frame. */
  className?: string;
}

type VideoUrlType = "direct" | "youtube" | "vimeo" | "drive";

// Media chrome stays black/white in both themes (the controls overlay is a
// .surface-dark area, so primary there is the on-dark terracotta). 36px
// targets with a white focus outline that reads on the dark gradient.
const playerBtn =
  "inline-flex shrink-0 items-center justify-center gap-1 h-9 min-w-9 px-1.5 rounded-lg cursor-pointer text-white/90 hover:text-white hover:bg-white/15 active:bg-white/25 focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-1";

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
    const path = (url.split("vimeo.com/")[1] ?? "").split(/[?#]/)[0];
    const [videoId, hash] = path.split("/");
    const base = `https://player.vimeo.com/video/${videoId ?? ""}`;
    return hash ? `${base}?h=${hash}` : base;
  }
  if (type === "drive") {
    // https://drive.google.com/file/d/FILE_ID/view → preview
    const match = url.match(/\/file\/d\/([^/]+)/);
    const fileId = match?.[1] ?? "";
    return `https://drive.google.com/file/d/${fileId}/preview`;
  }
  return url;
}

export function VideoPlayer({ url, markers = [], onTimeUpdate, captions = [], seekRequest, className }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  // Display-only: swaps the fullscreen icon/label (toggleFullscreen is unchanged)
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

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

  const openPiP = () => {
    const w = 720;
    const h = 440;
    const left = window.screen.width - w - 20;
    const top = window.screen.height - h - 60;
    window.open(
      url,
      "video-pip",
      `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no`
    );
  };

  if (isEmbed) {
    return (
      <div
        ref={containerRef}
        className={cn("relative bg-black rounded-xl overflow-hidden border border-border shadow-lg", className)}
      >
        <div className="aspect-video w-full">
          <iframe
            src={embedUrl}
            title="Embedded video player"
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
        {/* Help bar: opaque card surface so the copy stays readable in light mode */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-card border-t border-border text-xs text-muted-foreground">
          <Info size={12} className="shrink-0" />
          <span className="flex-1 min-w-48 leading-snug">
            If the video shows a privacy error, pop it out to watch alongside your annotations.
          </span>
          <div className="flex items-center gap-2 shrink-0 ms-auto">
            <button
              type="button"
              onClick={openPiP}
              aria-label="Pop out video into a separate window"
              className="btn btn-outline btn-sm"
            >
              <PictureInPicture2 size={13} />
              Pop out
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline btn-sm"
            >
              Open in {urlType === "vimeo" ? "Vimeo" : urlType === "youtube" ? "YouTube" : "new tab"}
              <ExternalLink size={13} />
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Controls stay visible while paused (when researchers annotate), on touch
  // devices and while a control has keyboard focus; they fade out on playback.
  const chromeVisibility = isPlaying
    ? "opacity-0 group-hover/player:opacity-100 group-has-[:focus-visible]/player:opacity-100 [@media(hover:none)]:opacity-100"
    : "opacity-100";
  // Captions ride above the controls whenever the controls are showing.
  const captionOffset = isPlaying
    ? "bottom-5 group-hover/player:bottom-24 group-has-[:focus-visible]/player:bottom-24 [@media(hover:none)]:bottom-24"
    : "bottom-24";

  return (
    <div
      ref={containerRef}
      className={cn(
        "@container/player relative group/player bg-black rounded-xl overflow-hidden border border-border shadow-lg aspect-video w-full [&:fullscreen]:rounded-none [&:fullscreen]:border-0",
        className
      )}
    >
      <video
        ref={videoRef}
        src={url}
        className="absolute inset-0 w-full h-full object-contain cursor-pointer"
        onClick={togglePlay}
      />

      {/* Paused-at-start affordance (display only; clicks pass through to the video) */}
      {!isPlaying && currentTime === 0 && duration > 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center pb-10" aria-hidden="true">
          <span className="size-14 rounded-full bg-black/50 backdrop-blur ring-1 ring-white/20 grid place-items-center text-white">
            <Play size={24} fill="currentColor" className="translate-x-0.5" />
          </span>
        </div>
      )}

      {/* Caption Overlay */}
      {(() => {
        const active = captions.find(c => currentTime >= c.startTime && currentTime < c.endTime);
        if (!active) return null;
        return (
          <div className={`absolute left-0 right-0 flex justify-center pointer-events-none px-4 transition-[bottom] duration-300 ${captionOffset}`}>
            {/* dir=auto for Hebrew cues. The bare "Geist" face (no Hebrew in its
                unicode-range) comes first so Latin stays in Geist and Hebrew falls
                through to Heebo; var(--font-geist-sans) would put the Arial-based
                "Geist Fallback" before Heebo. The shadow is fixed black (media
                chrome is theme-independent; this pill sits outside .surface-dark). */}
            <div
              dir="auto"
              className="bg-black/70 backdrop-blur-sm text-white text-[length:clamp(0.8125rem,2.4cqw,1.75rem)] font-medium font-[family-name:Geist,var(--font-hebrew),var(--font-geist-sans),system-ui,sans-serif] px-3.5 py-1.5 rounded-lg shadow-[0_2px_8px_rgb(0_0_0/0.45)] max-w-[90%] text-center whitespace-pre-line leading-normal"
            >
              {active.text.replace(/<[^>]+>/g, "")}
            </div>
          </div>
        );
      })()}

      {/* Controls Overlay (always-dark chrome: surface-dark gives the on-dark
          terracotta to the progress fill and playhead in both themes) */}
      <div className={`surface-dark absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-2 pt-6 pb-1.5 @sm/player:px-3 @sm/player:pb-2 transition-opacity duration-300 ${chromeVisibility}`}>

        {/* Timeline (the ::before only extends the hit area vertically; the
            measured width used by handleTimelineClick is unchanged) */}
        <div
          ref={timelineRef}
          role="group"
          aria-label="Seek"
          className="relative h-2 bg-white/20 rounded-full mb-3 cursor-pointer hover:h-3 transition-[height] before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
          onClick={handleTimelineClick}
        >
          {duration > 0 ? (
            <>
              {/* Progress Bar */}
              <div
                className="absolute top-0 left-0 h-full bg-primary rounded-full pointer-events-none"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />

              {/* Markers */}
              {markers.map((marker) => {
                const leftPos = (marker.startTime / duration) * 100;
                const widthPos = marker.endTime ? ((marker.endTime - marker.startTime) / duration) * 100 : 0.5;
                const stripes = marker.colors && marker.colors.length > 1 ? marker.colors : null;
                // Keep edge tooltips inside the player instead of clipping them
                const tooltipAnchor =
                  leftPos < 12 ? "left-0" : leftPos > 88 ? "right-0 left-auto" : "left-1/2 -translate-x-1/2";
                // Wider hover target, but never past the ends of the timeline
                const hoverInset = leftPos > 2 && leftPos + widthPos < 98 ? "before:-inset-x-1" : "before:inset-x-0";

                return (
                  <div
                    key={marker.id}
                    className={`absolute top-0 h-full group/marker cursor-pointer rounded-sm ring-1 ring-white/40 before:absolute before:-inset-y-2 before:content-[''] ${hoverInset}`}
                    style={{
                      left: `${leftPos}%`,
                      width: `${widthPos}%`,
                      backgroundColor: marker.color,
                      backgroundImage: stripes
                        ? `linear-gradient(to bottom, ${stripes
                            .map((c, i) => `${c} ${(i * 100) / stripes.length}% ${((i + 1) * 100) / stripes.length}%`)
                            .join(", ")})`
                        : undefined,
                      minWidth: "3px"
                    }}
                    title={(marker.labels ?? [marker.label]).join(", ")}
                  >
                    <div className={`absolute -top-8 ${tooltipAnchor} max-w-[min(20rem,80cqw)] truncate bg-black/90 text-white text-xs px-2 py-1 rounded-md shadow-md ring-1 ring-white/10 opacity-0 group-hover/marker:opacity-100 transition-opacity pointer-events-none z-10`}>
                      {(marker.labels ?? [marker.label]).join(", ")}
                    </div>
                  </div>
                );
              })}

              {/* Playhead */}
              <span
                className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.5)] ring-[3px] ring-primary/45"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              />
            </>
          ) : (
            /* Metadata not loaded yet: quiet white shimmer instead of NaN geometry */
            <div className="absolute inset-0 rounded-full pointer-events-none bg-[linear-gradient(90deg,transparent_25%,rgb(255_255_255/0.22)_50%,transparent_75%)] bg-[length:800px_100%] animate-[shimmer_1.6s_infinite]" />
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-1 text-white">
          <div className="flex items-center gap-0.5 @md/player:gap-1.5 min-w-0">
            <button
              type="button"
              onClick={togglePlay}
              className={playerBtn}
              aria-label={isPlaying ? "Pause" : "Play"}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={22} /> : <Play size={22} fill="currentColor" />}
            </button>
            <button
              type="button"
              onClick={() => skip(-10)}
              className={`${playerBtn} font-mono text-xs font-medium`}
              aria-label="Back 10 seconds"
              title="Back 10 seconds"
            >
              <RotateCcw size={16} className="hidden @xs/player:block" />
              <span>-10s</span>
            </button>
            <button
              type="button"
              onClick={() => skip(10)}
              className={`${playerBtn} font-mono text-xs font-medium`}
              aria-label="Forward 10 seconds"
              title="Forward 10 seconds"
            >
              <span>+10s</span>
              <RotateCw size={16} className="hidden @xs/player:block" />
            </button>
            <button
              type="button"
              onClick={toggleMute}
              className={playerBtn}
              aria-label={isMuted ? "Unmute" : "Mute"}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <div className="ms-1.5 min-w-0 truncate font-mono text-xs @md/player:text-sm tabular-nums whitespace-nowrap">
              <span className="text-white">{formatTime(currentTime)}</span>
              <span className="text-white/60"> / {duration > 0 ? formatTime(duration) : "--:--"}</span>
            </div>
          </div>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={toggleFullscreen}
              className={playerBtn}
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
