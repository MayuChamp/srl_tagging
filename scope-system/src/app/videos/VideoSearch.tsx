"use client";

import { useState, useEffect, useRef } from "react";
import {
  Search, Trash2, RefreshCw, Save, X, AlertTriangle, CheckCircle2,
  Video, MoreVertical, Eye, Clock, Folder, FolderOpen, FolderInput,
  ChevronRight, ChevronDown, List, FolderTree as FolderTreeIcon,
} from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

interface VideoItem {
  id: string;
  title: string | null;
  status: string | null;
  created_at: string | null;
  duration_seconds: number | null;
  storage_path?: string;
  folder_path?: string | null;
}

interface FolderNode {
  name: string;
  path: string;
  children: Map<string, FolderNode>;
  videos: VideoItem[];
}

function buildFolderTree(videos: VideoItem[]): FolderNode {
  const root: FolderNode = { name: "", path: "", children: new Map(), videos: [] };
  for (const video of videos) {
    const segments = (video.folder_path || "").split("/").map(s => s.trim()).filter(Boolean);
    let node = root;
    let path = "";
    for (const segment of segments) {
      path = path ? `${path}/${segment}` : segment;
      if (!node.children.has(segment)) {
        node.children.set(segment, { name: segment, path, children: new Map(), videos: [] });
      }
      node = node.children.get(segment)!;
    }
    node.videos.push(video);
  }
  return root;
}

function countVideos(node: FolderNode): number {
  return node.videos.length + Array.from(node.children.values()).reduce((sum, c) => sum + countVideos(c), 0);
}

type Framework = "ATES" | "SCOPE";

const STATUS: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  completed: { label: "Completed",  color: "#10b981", bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.3)",  dot: "bg-emerald-400" },
  processing: { label: "Processing", color: "#6d6cf9", bg: "rgba(109,108,249,0.12)", border: "rgba(109,108,249,0.3)", dot: "bg-indigo-400 animate-pulse" },
  pending:    { label: "Pending",    color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.3)",  dot: "bg-amber-400" },
  failed:     { label: "Failed",     color: "#f04444", bg: "rgba(240,68,68,0.12)",   border: "rgba(240,68,68,0.3)",   dot: "bg-red-400" },
};

function relativeDate(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtDur(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function VideoSearch({ videos: initialVideos }: { videos: VideoItem[] }) {
  const [query, setQuery] = useState("");
  const [videos, setVideos] = useState<VideoItem[]>(initialVideos);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reanalyzeVideoId, setReanalyzeVideoId] = useState<string | null>(null);
  const [selectedFramework, setSelectedFramework] = useState<Framework>("ATES");
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [reanalyzedToast, setReanalyzedToast] = useState(false);
  const [saveSessionVideoId, setSaveSessionVideoId] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState("");
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState<Record<string, { current: number; total: number }>>({});
  const processingRef = useRef<string[]>([]);

  const [viewMode, setViewMode] = useState<"flat" | "folders">("flat");
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [moveFolderVideoId, setMoveFolderVideoId] = useState<string | null>(null);
  const [moveFolderValue, setMoveFolderValue] = useState("");
  const [isMovingFolder, setIsMovingFolder] = useState(false);

  // Keep ref in sync with current processing video IDs
  useEffect(() => {
    processingRef.current = videos.filter(v => v.status === "processing").map(v => v.id);
  }, [videos]);

  // Poll progress for any processing videos
  useEffect(() => {
    const poll = async () => {
      const ids = processingRef.current;
      if (!ids.length) return;
      for (const id of ids) {
        try {
          const res = await fetch(`/api/analyze?videoId=${id}`);
          if (!res.ok) continue;
          const data = await res.json();
          if (data.status !== "processing") {
            setVideos(prev => prev.map(v => v.id === id ? { ...v, status: data.status } : v));
          }
          if (data.progress) {
            setVideoProgress(prev => ({ ...prev, [id]: data.progress }));
          }
        } catch { /* ignore network errors */ }
      }
    };
    poll();
    const interval = setInterval(poll, 10_000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = query.trim()
    ? videos.filter(v => (v.title || "Untitled").toLowerCase().includes(query.toLowerCase()))
    : videos;

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { data: analyses } = await supabase.from("analyses").select("id").eq("video_id", id);
      if (analyses?.length) {
        await supabase.from("tags").delete().in("analysis_id", analyses.map(a => a.id));
        await supabase.from("analyses").delete().eq("video_id", id);
      }
      await supabase.from("videos").delete().eq("id", id);
      setVideos(prev => prev.filter(v => v.id !== id));
      setConfirmDeleteId(null);
    } catch { alert("Failed to delete video."); }
    finally { setDeletingId(null); }
  };

  const handleReanalyze = async () => {
    if (!reanalyzeVideoId) return;
    setIsReanalyzing(true);
    try {
      const { data: existing } = await supabase.from("analyses").select("id").eq("video_id", reanalyzeVideoId).eq("is_ai_generated", true);
      if (existing?.length) {
        await supabase.from("tags").delete().in("analysis_id", existing.map(a => a.id));
        await supabase.from("analyses").delete().in("id", existing.map(a => a.id));
      }
      await supabase.from("videos").update({ status: "pending" }).eq("id", reanalyzeVideoId);
      await supabase.from("analyses").insert({ video_id: reanalyzeVideoId, is_ai_generated: true, summary_metrics: { framework: selectedFramework } });
      setVideos(prev => prev.map(v => v.id === reanalyzeVideoId ? { ...v, status: "pending" } : v));
      setReanalyzeVideoId(null);
      setReanalyzedToast(true);
      setTimeout(() => setReanalyzedToast(false), 4000);
    } catch { alert("Failed to queue re-analysis."); }
    finally { setIsReanalyzing(false); }
  };

  const handleSaveSession = async () => {
    if (!saveSessionVideoId) return;
    setIsSavingSession(true);
    try {
      const name = sessionName.trim() || `session_${new Date().toISOString().slice(0, 10)}`;
      const { data: existing } = await supabase.from("analyses").select("id, summary_metrics").eq("video_id", saveSessionVideoId).eq("is_ai_generated", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const { data: newA, error } = await supabase.from("analyses").insert({ is_ai_generated: false, video_id: saveSessionVideoId, summary_metrics: { session_name: name, ...(existing?.summary_metrics || {}) } }).select().single();
      if (error) throw error;
      if (existing) {
        const { data: t } = await supabase.from("tags").select("code_id, start_time, end_time, evidence_text, confidence_score").eq("analysis_id", existing.id);
        if (t?.length) await supabase.from("tags").insert(t.map(x => ({ ...x, analysis_id: newA.id })));
      }
      setSavedSessionId(newA.id);
      setSaveSessionVideoId(null);
      setSessionName("");
      setTimeout(() => setSavedSessionId(null), 6000);
    } catch { alert("Failed to save session."); }
    finally { setIsSavingSession(false); }
  };

  const handleMoveFolder = async () => {
    if (!moveFolderVideoId) return;
    setIsMovingFolder(true);
    try {
      const folder_path = moveFolderValue.trim().replace(/^\/+|\/+$/g, "") || null;
      const { error } = await supabase.from("videos").update({ folder_path }).eq("id", moveFolderVideoId);
      if (error) throw error;
      setVideos(prev => prev.map(v => v.id === moveFolderVideoId ? { ...v, folder_path } : v));
      setMoveFolderVideoId(null);
      setMoveFolderValue("");
    } catch { alert("Failed to move video."); }
    finally { setIsMovingFolder(false); }
  };

  const toggleFolder = (path: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const knownFolders = Array.from(new Set(videos.map(v => v.folder_path).filter(Boolean) as string[])).sort();

  const ModalBase = ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md mx-4">{children}</div>
    </div>
  );

  const Spinner = () => <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />;

  const renderCard = (video: VideoItem) => {
    const sk = video.status ?? "pending";
    const s = STATUS[sk] ?? STATUS.pending;
    const isMenuOpen = openMenuId === video.id;

    return (
      <div key={video.id}
        className="bg-card border border-border rounded-2xl overflow-hidden shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all group"
      >
        {/* Status accent bar */}
        <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${s.color}80, ${s.color}20)` }} />

        <div className="p-4">
          {/* Header row */}
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${s.color}12` }}>
              <Video size={18} style={{ color: s.color }} />
            </div>

            <div className="flex-1 min-w-0 mt-0.5">
              <p className="font-semibold text-[14px] leading-tight truncate">{video.title || "Untitled Video"}</p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                <span className="text-xs font-medium" style={{ color: s.color }}>{s.label}</span>
                {viewMode === "flat" && video.folder_path && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                    <Folder size={10} className="shrink-0" /> {video.folder_path}
                  </span>
                )}
              </div>
            </div>

            {/* Action menu */}
            <div className="relative shrink-0">
              <button onClick={() => setOpenMenuId(isMenuOpen ? null : video.id)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
                <MoreVertical size={15} />
              </button>
              {isMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                  <div className="absolute right-0 top-9 z-20 bg-card border border-border rounded-xl shadow-[var(--shadow-lg)] py-1.5 min-w-[170px] overflow-hidden">
                    <Link href={`/videos/${video.id}`} onClick={() => setOpenMenuId(null)}
                      className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] hover:bg-secondary transition-colors">
                      <Eye size={14} className="text-muted-foreground" /> View details
                    </Link>
                    <button onClick={() => { setSaveSessionVideoId(video.id); setSessionName(""); setOpenMenuId(null); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] hover:bg-secondary transition-colors">
                      <Save size={14} className="text-muted-foreground" /> Save as session
                    </button>
                    <button onClick={() => { setReanalyzeVideoId(video.id); setSelectedFramework("ATES"); setOpenMenuId(null); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] hover:bg-secondary transition-colors">
                      <RefreshCw size={14} className="text-muted-foreground" /> Re-analyze
                    </button>
                    <button onClick={() => { setMoveFolderVideoId(video.id); setMoveFolderValue(video.folder_path || ""); setOpenMenuId(null); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] hover:bg-secondary transition-colors">
                      <FolderInput size={14} className="text-muted-foreground" /> Move to folder
                    </button>
                    <div className="h-px bg-border mx-2 my-1" />
                    <button onClick={() => { setConfirmDeleteId(video.id); setOpenMenuId(null); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-destructive hover:bg-destructive/10 transition-colors">
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Progress bar (processing only) */}
          {sk === "processing" && (() => {
            const prog = videoProgress[video.id];
            const pct = prog ? Math.round((prog.current / prog.total) * 100) : null;
            return (
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{prog ? `chunk ${prog.current}/${prog.total}` : "מתחיל…"}</span>
                  {pct !== null && <span>{pct}%</span>}
                </div>
                <div className="h-1.5 bg-secondary/40 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct ?? 0}%`, background: s.color }}
                  />
                </div>
              </div>
            );
          })()}

          {/* Metadata row */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock size={11} />
              {video.created_at ? relativeDate(video.created_at) : "—"}
            </span>
            <span className="font-mono">
              {video.duration_seconds ? fmtDur(video.duration_seconds) : "—"}
            </span>
          </div>

          {/* CTA */}
          <Link href={`/videos/${video.id}`}
            className="mt-3 flex items-center justify-center gap-1.5 w-full text-[13px] font-semibold text-primary bg-primary/8 hover:bg-primary/15 py-2 rounded-xl transition-all border border-primary/20 hover:border-primary/40">
            View Analysis
          </Link>
        </div>
      </div>
    );
  };

  const renderFolderSection = (node: FolderNode, depth = 0): React.ReactNode => {
    const childFolders = Array.from(node.children.values()).sort((a, b) => a.name.localeCompare(b.name));
    const sortedVideos = [...node.videos].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    const isRoot = depth === 0 && node.path === "";

    return (
      <div key={node.path || "__root__"} className={depth > 0 ? "mt-3 pl-4 border-l border-border/60" : "space-y-3"}>
        {!isRoot && (
          <button onClick={() => toggleFolder(node.path)}
            className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors py-1">
            {collapsedFolders.has(node.path) ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
            <FolderOpen size={15} className="text-muted-foreground" />
            {node.name}
            <span className="text-xs font-normal text-muted-foreground">
              ({sortedVideos.length + childFolders.reduce((sum, c) => sum + countVideos(c), 0)})
            </span>
          </button>
        )}
        {(isRoot || !collapsedFolders.has(node.path)) && (
          <div className={isRoot ? "space-y-3" : "mt-2 space-y-3"}>
            {childFolders.map(child => renderFolderSection(child, depth + 1))}
            {sortedVideos.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedVideos.map(renderCard)}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Modals */}
      {confirmDeleteId && (
        <ModalBase onClose={() => !deletingId && setConfirmDeleteId(null)}>
          <div className="bg-card border border-border rounded-2xl shadow-[var(--shadow-lg)] p-6 space-y-4">
            <div className="flex items-center gap-3 text-destructive">
              <div className="w-10 h-10 rounded-xl bg-destructive/12 flex items-center justify-center">
                <AlertTriangle size={18} />
              </div>
              <div>
                <h2 className="font-semibold text-base">Delete Video</h2>
                <p className="text-xs text-muted-foreground mt-0.5">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">All analyses and tags linked to this video will also be permanently deleted.</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setConfirmDeleteId(null)} disabled={!!deletingId} className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-border hover:bg-secondary transition-all disabled:opacity-50">Cancel</button>
              <button onClick={() => handleDelete(confirmDeleteId)} disabled={!!deletingId} className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-destructive text-white hover:bg-destructive/90 flex items-center justify-center gap-2 disabled:opacity-50">
                {deletingId ? <><Spinner />Deleting…</> : <><Trash2 size={14} />Delete</>}
              </button>
            </div>
          </div>
        </ModalBase>
      )}

      {reanalyzeVideoId && (
        <ModalBase onClose={() => !isReanalyzing && setReanalyzeVideoId(null)}>
          <div className="bg-card border border-border rounded-2xl shadow-[var(--shadow-lg)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-base flex items-center gap-2"><RefreshCw size={16} className="text-primary" /> Re-analyze</h2>
              <button onClick={() => setReanalyzeVideoId(null)} disabled={isReanalyzing} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-all"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground">Choose the analysis framework. Any existing AI analysis will be replaced.</p>
              <div className="grid grid-cols-2 gap-3">
                {(["ATES", "SCOPE"] as Framework[]).map(fw => (
                  <button key={fw} onClick={() => setSelectedFramework(fw)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${selectedFramework === fw ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}>
                    <p className="font-bold text-sm">{fw}</p>
                    <p className="text-xs text-muted-foreground mt-1">{fw === "ATES" ? "Teacher & Student SRL" : "Science Classroom Protocol"}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={() => setReanalyzeVideoId(null)} disabled={isReanalyzing} className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-border hover:bg-secondary transition-all disabled:opacity-50">Cancel</button>
              <button onClick={handleReanalyze} disabled={isReanalyzing} className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-primary text-white hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-50">
                {isReanalyzing ? <><Spinner />Queuing…</> : <><RefreshCw size={14} />Re-analyze</>}
              </button>
            </div>
          </div>
        </ModalBase>
      )}

      {saveSessionVideoId && (
        <ModalBase onClose={() => !isSavingSession && setSaveSessionVideoId(null)}>
          <div className="bg-card border border-border rounded-2xl shadow-[var(--shadow-lg)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-base flex items-center gap-2"><Save size={16} className="text-primary" /> Save as Session</h2>
              <button onClick={() => setSaveSessionVideoId(null)} disabled={isSavingSession} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-all"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-muted-foreground">Save the AI analysis as an editable session in the Session Library.</p>
              <input type="text" value={sessionName} onChange={e => setSessionName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSaveSession()}
                placeholder={`session_${new Date().toISOString().slice(0, 10)}`}
                className="w-full bg-secondary/60 border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                autoFocus />
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={() => setSaveSessionVideoId(null)} disabled={isSavingSession} className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-border hover:bg-secondary transition-all disabled:opacity-50">Cancel</button>
              <button onClick={handleSaveSession} disabled={isSavingSession} className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-primary text-white hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-50">
                {isSavingSession ? <><Spinner />Saving…</> : <><Save size={14} />Save</>}
              </button>
            </div>
          </div>
        </ModalBase>
      )}

      {moveFolderVideoId && (
        <ModalBase onClose={() => !isMovingFolder && setMoveFolderVideoId(null)}>
          <div className="bg-card border border-border rounded-2xl shadow-[var(--shadow-lg)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-base flex items-center gap-2"><FolderInput size={16} className="text-primary" /> Move to Folder</h2>
              <button onClick={() => setMoveFolderVideoId(null)} disabled={isMovingFolder} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-all"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-muted-foreground">Use &quot;/&quot; to nest folders. Leave blank to uncategorize.</p>
              <input type="text" value={moveFolderValue} onChange={e => setMoveFolderValue(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleMoveFolder()}
                placeholder="e.g. Class A/Lesson 1"
                list="known-folders"
                className="w-full bg-secondary/60 border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                autoFocus />
              <datalist id="known-folders">
                {knownFolders.map(f => <option key={f} value={f} />)}
              </datalist>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={() => setMoveFolderVideoId(null)} disabled={isMovingFolder} className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-border hover:bg-secondary transition-all disabled:opacity-50">Cancel</button>
              <button onClick={handleMoveFolder} disabled={isMovingFolder} className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-primary text-white hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-50">
                {isMovingFolder ? <><Spinner />Moving…</> : <><FolderInput size={14} />Move</>}
              </button>
            </div>
          </div>
        </ModalBase>
      )}

      {/* Toasts */}
      {savedSessionId && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-[var(--shadow-lg)] flex items-center gap-3 text-sm">
          <CheckCircle2 size={16} /> Session saved!{" "}
          <Link href={`/sessions/${savedSessionId}`} className="underline font-medium">View →</Link>
        </div>
      )}
      {reanalyzedToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-primary text-white px-4 py-3 rounded-xl shadow-[var(--shadow-lg)] flex items-center gap-3 text-sm">
          <RefreshCw size={16} /> Re-analysis queued — check back soon.
        </div>
      )}

      {/* Search + view toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search videos…"
            className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all" />
        </div>
        <div className="flex rounded-xl border border-border overflow-hidden shrink-0">
          <button onClick={() => setViewMode("flat")}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors ${viewMode === "flat" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-secondary"}`}>
            <List size={14} /> Flat
          </button>
          <button onClick={() => setViewMode("folders")}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors ${viewMode === "folders" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-secondary"}`}>
            <FolderTreeIcon size={14} /> Folders
          </button>
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="bg-card border border-dashed border-border rounded-2xl py-20 flex flex-col items-center gap-4 text-muted-foreground">
          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
            <Video size={28} className="opacity-30" />
          </div>
          <div className="text-center">
            <p className="font-medium text-foreground">{query ? `No results for "${query}"` : "No videos yet"}</p>
            <p className="text-sm mt-1">{query ? "Try a different search term" : "Upload your first teaching session"}</p>
          </div>
        </div>
      )}

      {/* Card grid / folder tree */}
      {filtered.length > 0 && (
        viewMode === "folders"
          ? renderFolderSection(buildFolderTree(filtered))
          : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(renderCard)}
            </div>
          )
      )}
    </>
  );
}
