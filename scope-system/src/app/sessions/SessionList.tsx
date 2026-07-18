"use client";

import { useState } from "react";
import {
  BookOpen, Tag, Calendar, Video, ArrowRight, Plus, X,
  FolderInput, FolderOpen, ChevronRight, ChevronDown, List, FolderTree as FolderTreeIcon,
} from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

interface SessionRow {
  id: string;
  created_at: string;
  summary_metrics: { session_name?: string; video_url?: string; framework?: string; folder_path?: string } | null;
  video_id: string | null;
  tags: { count: number }[];
  videos: { title: string }[] | null;
}

interface FolderNode {
  name: string;
  path: string;
  children: Map<string, FolderNode>;
  sessions: SessionRow[];
}

const FRAMEWORK_COLORS: Record<string, string> = {
  ATES: "#6d6cf9", NONVERBAL: "#f59e0b", SCOPE: "#10b981",
};

function relativeDate(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function buildFolderTree(sessions: SessionRow[]): FolderNode {
  const root: FolderNode = { name: "", path: "", children: new Map(), sessions: [] };
  for (const session of sessions) {
    const segments = (session.summary_metrics?.folder_path || "").split("/").map(s => s.trim()).filter(Boolean);
    let node = root;
    let path = "";
    for (const segment of segments) {
      path = path ? `${path}/${segment}` : segment;
      if (!node.children.has(segment)) {
        node.children.set(segment, { name: segment, path, children: new Map(), sessions: [] });
      }
      node = node.children.get(segment)!;
    }
    node.sessions.push(session);
  }
  return root;
}

function countSessions(node: FolderNode): number {
  return node.sessions.length + Array.from(node.children.values()).reduce((sum, c) => sum + countSessions(c), 0);
}

export function SessionList({ sessions: initialSessions }: { sessions: SessionRow[] }) {
  const [sessions, setSessions] = useState<SessionRow[]>(initialSessions);
  const [viewMode, setViewMode] = useState<"flat" | "folders">("flat");
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [moveFolderSessionId, setMoveFolderSessionId] = useState<string | null>(null);
  const [moveFolderValue, setMoveFolderValue] = useState("");
  const [isMovingFolder, setIsMovingFolder] = useState(false);

  const toggleFolder = (path: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const knownFolders = Array.from(
    new Set(sessions.map(s => s.summary_metrics?.folder_path).filter(Boolean) as string[])
  ).sort();

  const handleMoveFolder = async () => {
    if (!moveFolderSessionId) return;
    setIsMovingFolder(true);
    try {
      const folder_path = moveFolderValue.trim().replace(/^\/+|\/+$/g, "") || undefined;
      const current = sessions.find(s => s.id === moveFolderSessionId);
      const nextMetrics = { ...(current?.summary_metrics || {}) };
      if (folder_path) nextMetrics.folder_path = folder_path;
      else delete nextMetrics.folder_path;

      const { error } = await supabase.from("analyses").update({ summary_metrics: nextMetrics }).eq("id", moveFolderSessionId);
      if (error) throw error;
      setSessions(prev => prev.map(s => s.id === moveFolderSessionId ? { ...s, summary_metrics: nextMetrics } : s));
      setMoveFolderSessionId(null);
      setMoveFolderValue("");
    } catch { alert("Failed to move session."); }
    finally { setIsMovingFolder(false); }
  };

  const renderCard = (session: SessionRow) => {
    const name = session.summary_metrics?.session_name || "Unnamed Session";
    const tagCount = session.tags?.[0]?.count ?? 0;
    const videoTitle = (session.videos as { title: string }[] | null)?.[0]?.title ?? null;
    const fw = session.summary_metrics?.framework ?? null;
    const fwColor = fw ? (FRAMEWORK_COLORS[fw] ?? "#6d6cf9") : "#6d6cf9";

    return (
      <div
        key={session.id}
        className="bg-card border border-border rounded-2xl overflow-hidden shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all group relative"
      >
        {/* Left accent bar */}
        <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl" style={{ background: fwColor }} />

        <div className="pl-6 pr-4 py-4 flex items-center gap-4">
          {/* Icon */}
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${fwColor}15` }}>
            <BookOpen size={16} style={{ color: fwColor }} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-[14px]">{name}</p>
              {fw && (
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded-md"
                  style={{ color: fwColor, background: `${fwColor}18` }}
                >
                  {fw}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {videoTitle ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Video size={11} /> {videoTitle}
                </span>
              ) : session.summary_metrics?.video_url ? (
                <span className="text-xs text-muted-foreground/60">External URL</span>
              ) : (
                <span className="text-xs text-muted-foreground/40">No video</span>
              )}
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar size={11} /> {relativeDate(session.created_at)}
              </span>
              {viewMode === "flat" && session.summary_metrics?.folder_path && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                  <FolderOpen size={11} /> {session.summary_metrics.folder_path}
                </span>
              )}
            </div>
          </div>

          {/* Tag count */}
          <div
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border shrink-0"
            style={{ color: fwColor, background: `${fwColor}12`, borderColor: `${fwColor}30` }}
          >
            <Tag size={11} />
            {tagCount}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { setMoveFolderSessionId(session.id); setMoveFolderValue(session.summary_metrics?.folder_path || ""); }}
              title="Move to folder"
              className="text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/80 p-2 rounded-xl transition-all border border-border"
            >
              <FolderInput size={14} />
            </button>
            <Link
              href={`/tagging?session=${session.id}`}
              className="text-xs font-semibold text-muted-foreground bg-secondary hover:bg-secondary/80 px-3 py-2 rounded-xl transition-all border border-border"
            >
              Continue
            </Link>
            <Link
              href={`/sessions/${session.id}`}
              className="flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/18 px-3 py-2 rounded-xl transition-all border border-primary/25"
            >
              View <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      </div>
    );
  };

  const renderFolderSection = (node: FolderNode, depth = 0): React.ReactNode => {
    const childFolders = Array.from(node.children.values()).sort((a, b) => a.name.localeCompare(b.name));
    const sortedSessions = [...node.sessions].sort((a, b) =>
      (a.summary_metrics?.session_name || "").localeCompare(b.summary_metrics?.session_name || "")
    );
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
              ({sortedSessions.length + childFolders.reduce((sum, c) => sum + countSessions(c), 0)})
            </span>
          </button>
        )}
        {(isRoot || !collapsedFolders.has(node.path)) && (
          <div className={isRoot ? "space-y-3" : "mt-2 space-y-3"}>
            {childFolders.map(child => renderFolderSection(child, depth + 1))}
            {sortedSessions.length > 0 && (
              <div className="space-y-3">
                {sortedSessions.map(renderCard)}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {moveFolderSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isMovingFolder && setMoveFolderSessionId(null)} />
          <div className="relative z-10 w-full max-w-md mx-4 bg-card border border-border rounded-2xl shadow-[var(--shadow-lg)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-base flex items-center gap-2"><FolderInput size={16} className="text-primary" /> Move to Folder</h2>
              <button onClick={() => setMoveFolderSessionId(null)} disabled={isMovingFolder} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-all"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-muted-foreground">Use &quot;/&quot; to nest folders. Leave blank to uncategorize.</p>
              <input type="text" value={moveFolderValue} onChange={e => setMoveFolderValue(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleMoveFolder()}
                placeholder="e.g. Class A/Lesson 1"
                list="known-session-folders"
                className="w-full bg-secondary/60 border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                autoFocus />
              <datalist id="known-session-folders">
                {knownFolders.map(f => <option key={f} value={f} />)}
              </datalist>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={() => setMoveFolderSessionId(null)} disabled={isMovingFolder} className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-border hover:bg-secondary transition-all disabled:opacity-50">Cancel</button>
              <button onClick={handleMoveFolder} disabled={isMovingFolder} className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-primary text-white hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-50">
                <FolderInput size={14} />{isMovingFolder ? "Moving…" : "Move"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {sessions.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl py-20 flex flex-col items-center gap-5 text-muted-foreground">
          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
            <BookOpen size={28} className="opacity-30" />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-foreground">No sessions saved yet</p>
            <p className="text-sm mt-1">Start tagging a video and save your session to see it here.</p>
          </div>
          <Link
            href="/tagging"
            className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all"
          >
            <Plus size={15} /> Start Tagging
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex rounded-xl border border-border overflow-hidden w-fit">
            <button onClick={() => setViewMode("flat")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors ${viewMode === "flat" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-secondary"}`}>
              <List size={14} /> Flat
            </button>
            <button onClick={() => setViewMode("folders")}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors ${viewMode === "folders" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-secondary"}`}>
              <FolderTreeIcon size={14} /> Folders
            </button>
          </div>

          {viewMode === "folders"
            ? renderFolderSection(buildFolderTree(sessions))
            : <div className="space-y-3">{sessions.map(renderCard)}</div>}
        </div>
      )}
    </>
  );
}
