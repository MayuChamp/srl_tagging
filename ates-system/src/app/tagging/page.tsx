"use client";

import { useState, useRef } from "react";
import { VideoPlayer, type VideoMarker } from "@/components/video/VideoPlayer";
import { Save, Tag, Clock, AlignLeft, PlayCircle, Layers } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

// Mock Codebooks for MVP Prisms
const PRISMS = {
  SRL: [
    { id: "D_PLAN", label: "D_PLAN: Direct Planning", color: "#3b82f6" },
    { id: "D_MONITOR", label: "D_MONITOR: Direct Monitoring", color: "#2563eb" },
    { id: "D_REFLECT", label: "D_REFLECT: Direct Reflection", color: "#1d4ed8" },
    { id: "I_SCAFFOLD", label: "I_SCAFFOLD: Scaffolded Question", color: "#10b981" },
    { id: "I_FEEDBACK", label: "I_FEEDBACK: Feedback", color: "#059669" },
    { id: "S_PLAN_TALK", label: "S_PLAN_TALK: Student Planning", color: "#8b5cf6" },
    { id: "S_MONITOR_TALK", label: "S_MONITOR_TALK: Student Monitoring", color: "#7c3aed" },
    { id: "S_EVAL_TALK", label: "S_EVAL_TALK: Student Evaluation", color: "#6d28d9" },
    { id: "S_GOAL_SET", label: "S_GOAL_SET: Student Goal Setting", color: "#a855f7" },
    { id: "N_ATTENTION", label: "N_ATTENTION: Nonverbal Attention", color: "#f59e0b" },
    { id: "N_GESTURE_FOCUS", label: "N_GESTURE_FOCUS: Focus Gesture", color: "#ea580c" },
    { id: "P_INTONATION_ENCOURAGE", label: "P_INTONATION_ENCOURAGE: Encouraging Intonation", color: "#ec4899" },
    { id: "P_INTONATION_QUESTION", label: "P_INTONATION_QUESTION: Questioning Intonation", color: "#db2777" },
  ],
  EMOTION: [
    { id: "E_JOY", label: "E_JOY: Joy / Excitement", color: "#facc15" },
    { id: "E_FRUSTRATION", label: "E_FRUSTRATION: Frustration", color: "#ef4444" },
    { id: "E_CONFUSION", label: "E_CONFUSION: Confusion", color: "#a8a29e" },
    { id: "E_ENGAGEMENT", label: "E_ENGAGEMENT: High Engagement", color: "#22c55e" },
  ],
  GENERAL: [
    { id: "G_NOTE", label: "G_NOTE: General Note", color: "#6b7280" },
    { id: "G_QUESTION", label: "G_QUESTION: Question", color: "#06b6d4" },
    { id: "G_IMPORTANT", label: "G_IMPORTANT: Important Moment", color: "#f97316" },
  ]
};

type PrismKey = keyof typeof PRISMS;

export default function TaggingMode() {
  const [videoUrl, setVideoUrl] = useState("https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4");
  const [currentTime, setCurrentTime] = useState(0);
  const [markers, setMarkers] = useState<VideoMarker[]>([]);
  
  // Tagging Form State
  const [selectedPrism, setSelectedPrism] = useState<PrismKey>("SRL");
  const [startTime, setStartTime] = useState<number | "">("");
  const [endTime, setEndTime] = useState<number | "">("");
  const [selectedCode, setSelectedCode] = useState(PRISMS["SRL"][0].id);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handlePrismChange = (prism: PrismKey) => {
    setSelectedPrism(prism);
    setSelectedCode(PRISMS[prism][0].id);
  };

  const formatTime = (time: number | string) => {
    if (time === "") return "--:--";
    const t = Number(time);
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const handleSetStartTime = () => setStartTime(currentTime);
  const handleSetEndTime = () => setEndTime(currentTime);

  const handleSaveTag = async () => {
    if (startTime === "" || endTime === "") return alert("Please set start and end time");
    
    setIsSaving(true);
    const codeData = PRISMS[selectedPrism].find(c => c.id === selectedCode);
    
    const newMarker: VideoMarker = {
      id: Math.random().toString(36).substr(2, 9),
      startTime: Number(startTime),
      endTime: Number(endTime),
      label: codeData?.id || "TAG",
      color: codeData?.color || "#fff"
    };

    // Optimistic UI update
    setMarkers(prev => [...prev, newMarker]);
    
    try {
      // Assuming we have a dummy analysis_id for now, or we would create one
      // For MVP, we'll just log it or save if we have the DB set up perfectly
      const { error } = await supabase.from('tags').insert({
        code_id: selectedCode,
        start_time: startTime,
        end_time: endTime,
        notes: notes,
        // analysis_id: "..." // omitted for MVP without auth setup
      });

      if (error) {
        console.error("Error saving tag:", error);
        // Note: Row Level Security might block this if not properly configured, but we added public access in schema.sql
      }
    } catch (err) {
      console.error("Exception:", err);
    } finally {
      setIsSaving(false);
      // Reset form
      setStartTime("");
      setEndTime("");
      setNotes("");
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto flex gap-8 h-[calc(100vh-2rem)] animate-in fade-in duration-500">
      
      {/* Left Column: Video */}
      <div className="flex-1 flex flex-col gap-4">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Tagging Workspace</h1>
          <p className="text-muted-foreground mt-1">Watch the video and annotate SRL moments.</p>
        </header>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <div className="flex gap-2 mb-4">
            <input 
              type="text" 
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary"
              placeholder="Enter Video URL..."
            />
            <button className="bg-secondary text-secondary-foreground px-4 py-2 rounded-md hover:bg-secondary/80 transition-colors">
              Load
            </button>
          </div>
          <VideoPlayer 
            url={videoUrl} 
            markers={markers}
            onTimeUpdate={(t) => setCurrentTime(t)}
          />
        </div>

        {/* List of current tags */}
        <div className="bg-card border border-border rounded-xl p-4 flex-1 overflow-hidden flex flex-col shadow-sm">
          <h3 className="font-semibold text-lg flex items-center gap-2 mb-4">
            <Tag size={18} className="text-primary" />
            Current Session Tags
          </h3>
          <div className="overflow-y-auto flex-1 space-y-2 pr-2">
            {markers.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">No tags added yet.</p>
            ) : (
              markers.map(m => (
                <div key={m.id} className="bg-secondary/30 border border-border rounded-lg p-3 flex justify-between items-center hover:border-primary/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: m.color }} />
                    <span className="font-medium text-sm">{m.label}</span>
                  </div>
                  <div className="text-xs font-mono text-muted-foreground bg-background px-2 py-1 rounded">
                    {formatTime(m.startTime)} - {formatTime(m.endTime || m.startTime)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Tagging Form */}
      <div className="w-96 bg-card border border-border rounded-xl shadow-sm flex flex-col overflow-hidden shrink-0">
        <div className="p-4 border-b border-border bg-secondary/20">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <PlayCircle size={18} className="text-primary" />
            New Annotation
          </h2>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {/* Time Capture */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock size={16} /> Time Range
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <button 
                  onClick={handleSetStartTime}
                  className="w-full bg-secondary hover:bg-secondary/80 text-secondary-foreground py-2 rounded-md font-mono text-sm transition-colors border border-border"
                >
                  {startTime === "" ? "Set Start" : formatTime(startTime as number)}
                </button>
              </div>
              <span className="text-muted-foreground">-</span>
              <div className="flex-1">
                <button 
                  onClick={handleSetEndTime}
                  className="w-full bg-secondary hover:bg-secondary/80 text-secondary-foreground py-2 rounded-md font-mono text-sm transition-colors border border-border"
                >
                  {endTime === "" ? "Set End" : formatTime(endTime as number)}
                </button>
              </div>
            </div>
          </div>

          {/* Prism Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Layers size={16} /> Analysis Prism
            </label>
            <select 
              value={selectedPrism}
              onChange={(e) => handlePrismChange(e.target.value as PrismKey)}
              className="w-full bg-background border border-border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary appearance-none"
            >
              <option value="SRL">SRL (ATES Framework)</option>
              <option value="EMOTION">Emotions & Affect</option>
              <option value="GENERAL">General Observations</option>
            </select>
          </div>

          {/* Code Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Tag size={16} /> Annotation Tag
            </label>
            <select 
              value={selectedCode}
              onChange={(e) => setSelectedCode(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary appearance-none"
            >
              {PRISMS[selectedPrism].map(code => (
                <option key={code.id} value={code.id}>
                  {code.label}
                </option>
              ))}
            </select>
          </div>

          {/* Notes / Evidence */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlignLeft size={16} /> Evidence / Notes
            </label>
            <textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="E.g. Teacher asked students to reflect on their learning..."
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
        </div>

        {/* Action Button */}
        <div className="p-4 border-t border-border bg-secondary/10">
          <button 
            onClick={handleSaveTag}
            disabled={isSaving || startTime === "" || endTime === ""}
            className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground py-3 rounded-md font-semibold transition-colors flex justify-center items-center gap-2 shadow-lg shadow-primary/20"
          >
            <Save size={18} />
            {isSaving ? "Saving..." : "Save Annotation"}
          </button>
        </div>
      </div>
    </div>
  );
}
