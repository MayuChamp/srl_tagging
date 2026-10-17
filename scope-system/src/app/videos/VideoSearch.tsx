"use client";

import { useState, useEffect, useRef } from "react";
import {
  Search, Trash2, RefreshCw, Save, X, AlertTriangle, CheckCircle2,
  Video, MoreVertical, Eye, Clock, Folder, FolderOpen, FolderInput,
  ChevronRight, ChevronDown, List, FolderTree as FolderTreeIcon, Tag,
  Loader2, Timer,
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

// Status → semantic tone class (badge, status-dot, icon tile, accent strip,
// progress fill), so the colours follow the light/dark theme and pass AA.
const STATUS: Record<string, { label: string; tone: string; pulse?: boolean }> = {
  completed:  { label: "Completed",  tone: "tone-success" },
  processing: { label: "Processing", tone: "tone-primary", pulse: true },
  pending:    { label: "Pending",    tone: "tone-warning" },
  failed:     { label: "Failed",     tone: "tone-danger" },
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

// Declared at module scope so the modal is not re-created (and remounted) on
// every render: typing in a modal input keeps the caret and datalist popup.
function ModalBase({ children, onClose, labelledBy }: { children: React.ReactNode; onClose: () => void; labelledBy: string }) {
  return (
    <div className="modal-root">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>{children}</div>
    </div>
  );
}

function Spinner() {
  return <Loader2 className="size-3.5 animate-spin" aria-hidden />;
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

  const renderCard = (video: VideoItem) => {
    const sk = video.status ?? "pending";
    const s = STATUS[sk] ?? STATUS.pending;
    const isMenuOpen = openMenuId === video.id;

    return (
      <div key={video.id}
        className={`card relative group transition-shadow duration-200 hover:shadow-md ${isMenuOpen ? "z-30" : ""}`}
      >
        {/* Status accent bar (clipped to the card's rounded top; the card itself
            no longer clips, so the action menu can overflow it) */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-4 overflow-hidden rounded-t-[calc(1rem-1px)]">
          <div className={`stat-strip ${s.tone}`} />
        </div>

        <div className="p-4">
          {/* Header row */}
          <div className="flex items-start gap-3">
            <div className={`icon-tile icon-tile-md ${s.tone}`}>
              <Video size={18} aria-hidden />
            </div>

            <div className="flex-1 min-w-0 mt-0.5">
              <p className="font-semibold text-sm leading-tight truncate" dir="auto" title={video.title ?? undefined}>{video.title || "Untitled Video"}</p>
              <div className="flex items-center gap-2 mt-1.5 min-w-0">
                <span className={`badge shrink-0 ${s.tone}`}>
                  <span className={`status-dot ${s.tone} ${s.pulse ? "animate-pulse" : ""}`} aria-hidden />
                  {s.label}
                </span>
                {viewMode === "flat" && video.folder_path && (
                  <span className="flex items-center gap-1 min-w-0 text-xs text-muted-foreground">
                    <Folder size={11} className="shrink-0" aria-hidden />
                    <span className="truncate" dir="auto">{video.folder_path}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Action menu */}
            <div className="relative shrink-0">
              <button onClick={() => setOpenMenuId(isMenuOpen ? null : video.id)}
                aria-label="Video actions" aria-haspopup="menu" aria-expanded={isMenuOpen}
                className={`icon-btn ${isMenuOpen ? "bg-secondary text-foreground" : ""}`}>
                <MoreVertical size={15} aria-hidden />
              </button>
              {isMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                  <div role="menu" aria-label="Video actions" className="menu absolute end-0 top-9 z-20">
                    <Link href={`/tagging?video=${video.id}`} onClick={() => setOpenMenuId(null)} role="menuitem"
                      className="menu-item font-medium">
                      <Tag size={14} className="text-primary" aria-hidden /> Start Tagging
                    </Link>
                    <Link href={`/videos/${video.id}`} onClick={() => setOpenMenuId(null)} role="menuitem"
                      className="menu-item">
                      <Eye size={14} className="text-muted-foreground" aria-hidden /> View details
                    </Link>
                    <button onClick={() => { setSaveSessionVideoId(video.id); setSessionName(""); setOpenMenuId(null); }} role="menuitem"
                      className="menu-item">
                      <Save size={14} className="text-muted-foreground" aria-hidden /> Save as session
                    </button>
                    <button onClick={() => { setReanalyzeVideoId(video.id); setSelectedFramework("ATES"); setOpenMenuId(null); }} role="menuitem"
                      className="menu-item">
                      <RefreshCw size={14} className="text-muted-foreground" aria-hidden /> Re-analyze
                    </button>
                    <button onClick={() => { setMoveFolderVideoId(video.id); setMoveFolderValue(video.folder_path || ""); setOpenMenuId(null); }} role="menuitem"
                      className="menu-item">
                      <FolderInput size={14} className="text-muted-foreground" aria-hidden /> Move to folder
                    </button>
                    <div role="separator" className="menu-sep" />
                    <button onClick={() => { setConfirmDeleteId(video.id); setOpenMenuId(null); }} role="menuitem"
                      className="menu-item menu-item-danger">
                      <Trash2 size={14} aria-hidden /> Delete
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
                <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                  <span dir="auto" lang={prog ? undefined : "he"}>{prog ? `chunk ${prog.current}/${prog.total}` : "מתחיל…"}</span>
                  {pct !== null && <span>{pct}%</span>}
                </div>
                <div className="meter">
                  <div
                    className={`meter-fill ${s.tone} transition-all duration-500 ${pct === null ? "meter-indeterminate" : ""}`}
                    style={pct === null ? undefined : { width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })()}

          {/* Metadata row */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock size={11} aria-hidden />
              {video.created_at ? relativeDate(video.created_at) : "—"}
            </span>
            <span className="flex items-center gap-1.5 font-mono tabular-nums">
              <Timer size={11} aria-hidden />
              <span className="sr-only">Duration</span>
              {video.duration_seconds ? fmtDur(video.duration_seconds) : "—"}
            </span>
          </div>

          {/* CTA */}
          <div className="mt-3 flex gap-2">
            <Link href={`/tagging?video=${video.id}`}
              className="btn btn-primary btn-sm h-8 flex-1">
              <Tag size={13} aria-hidden /> Start Tagging
            </Link>
            <Link href={`/videos/${video.id}`}
              className="btn btn-secondary btn-sm h-8 flex-1">
              <Eye size={13} aria-hidden /> View Analysis
            </Link>
          </div>
        </div>
      </div>
    );
  };

  const renderFolderSection = (node: FolderNode, depth = 0): React.ReactNode => {
    const childFolders = Array.from(node.children.values()).sort((a, b) => a.name.localeCompare(b.name));
    const sortedVideos = [...node.videos].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    const isRoot = depth === 0 && node.path === "";

    return (
      <div key={node.path || "__root__"} className={depth > 0 ? "mt-3 ps-4 border-s border-border" : "space-y-3"}>
        {!isRoot && (
          <button onClick={() => toggleFolder(node.path)} aria-expanded={!collapsedFolders.has(node.path)}
            className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm font-semibold text-foreground hover:bg-foreground/8 transition-colors cursor-pointer">
            {collapsedFolders.has(node.path)
              ? <ChevronRight size={15} className="shrink-0 text-muted-foreground" aria-hidden />
              : <ChevronDown size={15} className="shrink-0 text-muted-foreground" aria-hidden />}
            <FolderOpen size={15} className="shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate" dir="auto">{node.name}</span>
            <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
              ({sortedVideos.length + childFolders.reduce((sum, c) => sum + countVideos(c), 0)})
            </span>
          </button>
        )}
        {(isRoot || !collapsedFolders.has(node.path)) && (
          <div className={isRoot ? "space-y-3" : "mt-2 space-y-3"}>
            {childFolders.map(child => renderFolderSection(child, depth + 1))}
            {isRoot && childFolders.length > 0 && sortedVideos.length > 0 && (
              <p className="eyebrow pt-3 px-2">Uncategorized</p>
            )}
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
        <ModalBase labelledBy="delete-video-title" onClose={() => !deletingId && setConfirmDeleteId(null)}>
          <div className="modal-header justify-start">
            <div className="icon-tile icon-tile-md tone-danger">
              <AlertTriangle size={18} aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 id="delete-video-title" className="modal-title">Delete Video</h2>
              <p className="text-xs text-muted-foreground mt-0.5">This action cannot be undone</p>
            </div>
          </div>
          <div className="modal-body">
            <p className="text-sm text-muted-foreground">All analyses and tags linked to this video will also be permanently deleted.</p>
          </div>
          <div className="modal-footer">
            <button onClick={() => setConfirmDeleteId(null)} disabled={!!deletingId} className="btn btn-outline flex-1">Cancel</button>
            <button onClick={() => handleDelete(confirmDeleteId)} disabled={!!deletingId} className="btn btn-destructive flex-1">
              {deletingId ? <><Spinner />Deleting…</> : <><Trash2 size={14} aria-hidden />Delete</>}
            </button>
          </div>
        </ModalBase>
      )}

      {reanalyzeVideoId && (
        <ModalBase labelledBy="reanalyze-title" onClose={() => !isReanalyzing && setReanalyzeVideoId(null)}>
          <div className="modal-header">
            <h2 id="reanalyze-title" className="modal-title"><RefreshCw size={16} className="text-primary" aria-hidden /> Re-analyze</h2>
            <button onClick={() => setReanalyzeVideoId(null)} disabled={isReanalyzing} aria-label="Close" className="icon-btn"><X size={16} aria-hidden /></button>
          </div>
          <div className="modal-body space-y-4">
            <p className="text-sm text-muted-foreground">Choose the analysis framework. Any existing AI analysis will be replaced.</p>
            <div className="grid grid-cols-2 gap-3">
              {(["ATES", "SCOPE"] as Framework[]).map(fw => (
                <button key={fw} onClick={() => setSelectedFramework(fw)} aria-pressed={selectedFramework === fw}
                  className={`p-4 rounded-xl border text-start transition-colors cursor-pointer ${selectedFramework === fw ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-input hover:border-primary/40 hover:bg-secondary/50"}`}>
                  <p className="font-bold text-sm">{fw}</p>
                  <p className="text-xs text-muted-foreground mt-1">{fw === "ATES" ? "Teacher & Student SRL" : "Science Classroom Protocol"}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <button onClick={() => setReanalyzeVideoId(null)} disabled={isReanalyzing} className="btn btn-outline flex-1">Cancel</button>
            <button onClick={handleReanalyze} disabled={isReanalyzing} className="btn btn-primary flex-1">
              {isReanalyzing ? <><Spinner />Queuing…</> : <><RefreshCw size={14} aria-hidden />Re-analyze</>}
            </button>
          </div>
        </ModalBase>
      )}

      {saveSessionVideoId && (
        <ModalBase labelledBy="save-session-title" onClose={() => !isSavingSession && setSaveSessionVideoId(null)}>
          <div className="modal-header">
            <h2 id="save-session-title" className="modal-title"><Save size={16} className="text-primary" aria-hidden /> Save as Session</h2>
            <button onClick={() => setSaveSessionVideoId(null)} disabled={isSavingSession} aria-label="Close" className="icon-btn"><X size={16} aria-hidden /></button>
          </div>
          <div className="modal-body space-y-4">
            <p className="text-sm text-muted-foreground">Save the AI analysis as an editable session in the Session Library.</p>
            <input type="text" value={sessionName} onChange={e => setSessionName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSaveSession()}
              placeholder={`session_${new Date().toISOString().slice(0, 10)}`}
              aria-labelledby="save-session-title"
              dir="auto"
              className="field"
              autoFocus />
          </div>
          <div className="modal-footer">
            <button onClick={() => setSaveSessionVideoId(null)} disabled={isSavingSession} className="btn btn-outline flex-1">Cancel</button>
            <button onClick={handleSaveSession} disabled={isSavingSession} className="btn btn-primary flex-1">
              {isSavingSession ? <><Spinner />Saving…</> : <><Save size={14} aria-hidden />Save</>}
            </button>
          </div>
        </ModalBase>
      )}

      {moveFolderVideoId && (
        <ModalBase labelledBy="move-folder-title" onClose={() => !isMovingFolder && setMoveFolderVideoId(null)}>
          <div className="modal-header">
            <h2 id="move-folder-title" className="modal-title"><FolderInput size={16} className="text-primary" aria-hidden /> Move to Folder</h2>
            <button onClick={() => setMoveFolderVideoId(null)} disabled={isMovingFolder} aria-label="Close" className="icon-btn"><X size={16} aria-hidden /></button>
          </div>
          <div className="modal-body space-y-4">
            <p className="text-sm text-muted-foreground">Use &quot;/&quot; to nest folders. Leave blank to uncategorize.</p>
            <input type="text" value={moveFolderValue} onChange={e => setMoveFolderValue(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleMoveFolder()}
              placeholder="e.g. Class A/Lesson 1"
              list="known-folders"
              aria-labelledby="move-folder-title"
              dir="auto"
              className="field"
              autoFocus />
            <datalist id="known-folders">
              {knownFolders.map(f => <option key={f} value={f} />)}
            </datalist>
          </div>
          <div className="modal-footer">
            <button onClick={() => setMoveFolderVideoId(null)} disabled={isMovingFolder} className="btn btn-outline flex-1">Cancel</button>
            <button onClick={handleMoveFolder} disabled={isMovingFolder} className="btn btn-primary flex-1">
              {isMovingFolder ? <><Spinner />Moving…</> : <><FolderInput size={14} aria-hidden />Move</>}
            </button>
          </div>
        </ModalBase>
      )}

      {/* Toasts (one stack, so the two never overlap) */}
      <div className="toast-stack" role="status" aria-live="polite">
        {savedSessionId && (
          <div className="toast toast-success animate-fade-in">
            <CheckCircle2 size={16} aria-hidden /> Session saved!{" "}
            <Link href={`/sessions/${savedSessionId}`} className="underline font-medium focus-visible:outline-current">View →</Link>
          </div>
        )}
        {reanalyzedToast && (
          <div className="toast toast-info animate-fade-in">
            <RefreshCw size={16} aria-hidden /> Re-analysis queued — check back soon.
          </div>
        )}
      </div>

      {/* Search + view toggle */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search videos…"
            aria-label="Search videos"
            dir="auto"
            className="field pl-10" />
        </div>
        <div role="group" aria-label="View mode" className="segmented self-start sm:self-auto shrink-0">
          <button onClick={() => setViewMode("flat")} aria-pressed={viewMode === "flat"}
            className="segmented-item h-8">
            <List size={14} aria-hidden /> Flat
          </button>
          <button onClick={() => setViewMode("folders")} aria-pressed={viewMode === "folders"}
            className="segmented-item h-8">
            <FolderTreeIcon size={14} aria-hidden /> Folders
          </button>
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="empty-state py-16">
          <div className="empty-state-icon">
            <Video size={22} aria-hidden />
          </div>
          <div>
            <p className="empty-state-title">{query ? `No results for "${query}"` : "No videos yet"}</p>
            <p className="empty-state-text mt-1">{query ? "Try a different search term" : "Upload your first teaching session"}</p>
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
