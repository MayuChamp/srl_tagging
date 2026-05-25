"use client";

import React, { useRef, useState, useEffect } from "react";
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  SkipBack, 
  SkipForward 
} from "lucide-react";

export interface VideoMarker {
  id: string;
  startTime: number;
  endTime?: number;
  label: string;
  color: string;
}

interface VideoPlayerProps {
  url: string;
  markers?: VideoMarker[];
  onTimeUpdate?: (time: number) => void;
}

export function VideoPlayer({ url, markers = [], onTimeUpdate }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      onTimeUpdate?.(video.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    
    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [onTimeUpdate]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
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

  return (
    <div 
      ref={containerRef} 
      className="relative group bg-black rounded-xl overflow-hidden border border-border shadow-lg flex flex-col"
    >
      <video
        ref={videoRef}
        src={url}
        className="w-full max-h-[600px] object-contain cursor-pointer"
        onClick={togglePlay}
      />
      
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
                title={marker.label}
              >
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-secondary text-white text-xs px-2 py-1 rounded opacity-0 group-hover/marker:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                  {marker.label}
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
            <button onClick={() => skip(-10)} className="hover:text-primary transition-colors">
              <SkipBack size={20} />
            </button>
            <button onClick={() => skip(10)} className="hover:text-primary transition-colors">
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
