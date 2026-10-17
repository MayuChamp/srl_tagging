"use client";

import { useState, useMemo } from "react";
import {
  BookOpen, Tag, Calendar, Video, ArrowRight, Plus, X,
  FolderInput, Folder, FolderOpen, ChevronRight, ChevronDown, List, FolderTree as FolderTreeIcon, FolderPlus,
  Download, Loader2, RotateCcw, VideoOff, Home, Link2,
} from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

interface BackupTagRow {
  id: string;
  analysis_id: string;
  code_id: string;
  start_time: number;
  end_time: number;
  evidence_text: string | null;
  reasoning: string | null;
  confidence_score: number | null;
}

interface BackupTdsRow {
  analysis_id: string;
  start_time: number;
  end_time: number;
  basic_class: string | null;
  meta_intro: boolean;
  meta_intro_type: string | null;
  stg_naming: number;
  stg_when: number;
  stg_how: number;
  stg_why: number;
  stg_when_not: number;
  missed_meta: string;
  mo_score: number;
  mo_components: string[];
  tds_reasoning: string | null;
}

interface BackupAnalysisRow {
  id: string;
  created_at: string;
  is_ai_generated: boolean;
  summary_metrics: {
    session_name?: string;
    video_url?: string;
    framework?: string;
    folder_path?: string;
    captions?: unknown[];
  } | null;
  video_id: string | null;
  videos: { title: string; storage_path: string } | null;
}

function tdsRowToBackupMeta(row: BackupTdsRow) {
  return {
    basicClass: row.basic_class,
    metaIntro: row.meta_intro,
    metaIntroType: row.meta_intro_type ?? "",
    stgNaming: row.stg_naming === 1,
    stgWhen: row.stg_when === 1,
    stgHow: row.stg_how === 1,
    stgWhy: row.stg_why === 1,
    stgWhenNot: row.stg_when_not === 1,
    tdReasoning: row.tds_reasoning ?? "",
    metaStgScore: row.stg_naming + row.stg_when + row.stg_how + row.stg_why + row.stg_when_not,
    missedMeta: row.missed_meta,
    moScore: row.mo_score ?? 0,
    moComponents: row.mo_components ?? [],
  };
}

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

// Framework accents (inline-style CSS colors only). ATES and the no-framework
// fallback used the old brand indigo; Studio maps that brand color to the
// terracotta --primary token. NONVERBAL / SCOPE keep their hex values.
// Display-only: dir="auto" text never matches the [dir=rtl] Heebo rule in
// globals.css, so Hebrew names would fall through Geist to system-ui. Geist
// stays first for Latin; Hebrew glyphs fall back to Heebo.
const autoDirFont = "font-[family-name:var(--font-geist-sans),var(--font-hebrew),system-ui,sans-serif]";

const FRAMEWORK_COLORS: Record<string, string> = {
  ATES: "var(--primary)", NONVERBAL: "#f59e0b", SCOPE: "#10b981",
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

function walkToPath(root: FolderNode, path: string[]): FolderNode {
  let node = root;
  let cur = "";
  for (const segment of path) {
    cur = cur ? `${cur}/${segment}` : segment;
    node = node.children.get(segment) ?? { name: segment, path: cur, children: new Map(), sessions: [] };
  }
  return node;
}

export function SessionList({ sessions: initialSessions }: { sessions: SessionRow[] }) {
  const [sessions, setSessions] = useState<SessionRow[]>(initialSessions);
  const [viewMode, setViewMode] = useState<"flat" | "folders">("flat");
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [moveFolderSessionId, setMoveFolderSessionId] = useState<string | null>(null);
  const [moveFolderPath, setMoveFolderPath] = useState<string[]>([]);
  const [newFolderName, setNewFolderName] = useState("");
  const [isMovingFolder, setIsMovingFolder] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);

  const handleExportAll = async () => {
    setIsExportingAll(true);
    try {
      const [{ data: analyses, error: analysesError }, { data: allTags, error: tagsError }, { data: allTdsMeta, error: tdsError }] =
        await Promise.all([
          supabase.from("analyses").select("id, created_at, is_ai_generated, summary_metrics, video_id, videos(title, storage_path)").order("created_at", { ascending: true }),
          supabase.from("tags").select("id, analysis_id, code_id, start_time, end_time, evidence_text, reasoning, confidence_score").order("analysis_id", { ascending: true }).order("start_time", { ascending: true }),
          supabase.from("tds_meta").select("analysis_id, start_time, end_time, basic_class, meta_intro, meta_intro_type, stg_naming, stg_when, stg_how, stg_why, stg_when_not, missed_meta, mo_score, mo_components, tds_reasoning"),
        ]);
      if (analysesError) throw analysesError;
      if (tagsError) throw tagsError;
      if (tdsError) throw tdsError;

      const tagsByAnalysis = new Map<string, BackupTagRow[]>();
      for (const t of (allTags || []) as BackupTagRow[]) {
        if (!tagsByAnalysis.has(t.analysis_id)) tagsByAnalysis.set(t.analysis_id, []);
        tagsByAnalysis.get(t.analysis_id)!.push(t);
      }
      const tdsByAnalysis = new Map<string, Map<string, BackupTdsRow>>();
      for (const row of (allTdsMeta || []) as BackupTdsRow[]) {
        if (!tdsByAnalysis.has(row.analysis_id)) tdsByAnalysis.set(row.analysis_id, new Map());
        tdsByAnalysis.get(row.analysis_id)!.set(`${row.start_time}|${row.end_time}`, row);
      }

      const backupSessions = ((analyses || []) as unknown as BackupAnalysisRow[]).map(analysis => {
        const rows = tagsByAnalysis.get(analysis.id) || [];
        // Group consecutive rows sharing the same time+evidence into one multi-code event.
        const grouped: BackupTagRow[][] = [];
        let prevKey = "";
        for (const t of rows) {
          const key = `${t.start_time}|${t.end_time}|${t.evidence_text ?? ""}|${t.confidence_score ?? ""}`;
          if (key !== prevKey || grouped.length === 0) grouped.push([]);
          grouped[grouped.length - 1].push(t);
          prevKey = key;
        }
        const tdsForSession = tdsByAnalysis.get(analysis.id);
        const tags = grouped.map(group => {
          const first = group[0];
          const tdsRow = tdsForSession?.get(`${first.start_time}|${first.end_time}`);
          return {
            id: first.id,
            startTime: first.start_time,
            endTime: first.end_time,
            labels: Array.from(new Set(group.map(t => t.code_id))),
            evidence: first.evidence_text ?? undefined,
            reasoning: first.reasoning ?? undefined,
            confidence: first.confidence_score ?? undefined,
            tdsMeta: tdsRow ? tdsRowToBackupMeta(tdsRow) : undefined,
          };
        });

        return {
          id: analysis.id,
          sessionName: analysis.summary_metrics?.session_name || "Unnamed Session",
          createdAt: analysis.created_at,
          isAiGenerated: analysis.is_ai_generated,
          framework: analysis.summary_metrics?.framework ?? null,
          folderPath: analysis.summary_metrics?.folder_path ?? null,
          videoTitle: analysis.videos?.title ?? null,
          videoUrl: analysis.videos?.storage_path ?? analysis.summary_metrics?.video_url ?? null,
          captions: analysis.summary_metrics?.captions ?? [],
          tags,
        };
      });

      const backup = { exportedAt: new Date().toISOString(), sessionCount: backupSessions.length, sessions: backupSessions };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `full_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Failed to export full backup.");
    } finally {
      setIsExportingAll(false);
    }
  };

  const toggleFolder = (path: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const folderTree = useMemo(() => buildFolderTree(sessions), [sessions]);
  const pickerNode = walkToPath(folderTree, moveFolderPath);

  const handleMoveFolder = async (targetPath: string[]) => {
    if (!moveFolderSessionId) return;
    setIsMovingFolder(true);
    try {
      const folder_path = targetPath.join("/") || undefined;
      const current = sessions.find(s => s.id === moveFolderSessionId);
      const nextMetrics = { ...(current?.summary_metrics || {}) };
      if (folder_path) nextMetrics.folder_path = folder_path;
      else delete nextMetrics.folder_path;

      const { error } = await supabase.from("analyses").update({ summary_metrics: nextMetrics }).eq("id", moveFolderSessionId);
      if (error) throw error;
      setSessions(prev => prev.map(s => s.id === moveFolderSessionId ? { ...s, summary_metrics: nextMetrics } : s));
      setMoveFolderSessionId(null);
      setMoveFolderPath([]);
      setNewFolderName("");
    } catch { alert("Failed to move session."); }
    finally { setIsMovingFolder(false); }
  };

  const renderCard = (session: SessionRow) => {
    const name = session.summary_metrics?.session_name || "Unnamed Session";
    const tagCount = session.tags?.[0]?.count ?? 0;
    const videoTitle = (session.videos as { title: string }[] | null)?.[0]?.title ?? null;
    const fw = session.summary_metrics?.framework ?? null;
    const fwColor = fw ? (FRAMEWORK_COLORS[fw] ?? "var(--primary)") : "var(--primary)";

    return (
      <div
        key={session.id}
        className="card relative overflow-hidden transition-[box-shadow,border-color] duration-200 hover:shadow-md hover:border-primary/25"
      >
        {/* Left accent bar */}
        <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl" style={{ background: fwColor }} />

        <div className="pl-6 pr-4 py-4 flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4">
          {/* Icon */}
          {/* Tile tone nudged toward the foreground so amber/emerald icons keep
              >= 3:1 on their tint in light mode; the accent bar keeps the pure hex. */}
          <div className="icon-tile icon-tile-md" style={{ "--tone": `color-mix(in oklab, ${fwColor} 75%, var(--foreground))` } as React.CSSProperties}>
            <BookOpen size={16} />
          </div>

          {/* Info */}
          <div className="min-w-0 grow basis-[calc(100%-3.5rem)] sm:basis-0">
            <div className="flex items-center gap-2 min-w-0">
              <p className={`font-semibold text-sm truncate min-w-0 ${autoDirFont}`} dir="auto" title={name}>{name}</p>
              {fw && (
                <span
                  className="code-chip shrink-0"
                  style={{ "--code": fwColor } as React.CSSProperties}
                >
                  {fw}
                </span>
              )}
            </div>
            <div className="flex items-center gap-x-3 gap-y-1 mt-1.5 flex-wrap min-w-0">
              {videoTitle ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground min-w-0 max-w-full">
                  <Video size={11} className="shrink-0" /> <span className={`truncate ${autoDirFont}`} dir="auto" title={videoTitle}>{videoTitle}</span>
                </span>
              ) : session.summary_metrics?.video_url ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Link2 size={11} className="shrink-0" /> External URL
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <VideoOff size={11} className="shrink-0" /> No video
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar size={11} className="shrink-0" /> {relativeDate(session.created_at)}
              </span>
              {viewMode === "flat" && session.summary_metrics?.folder_path && (
                <span
                  className="inline-flex items-center gap-1 max-w-[16rem] min-w-0 text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-secondary/70"
                  title={session.summary_metrics.folder_path}
                >
                  <FolderOpen size={11} className="shrink-0" /> <span className={`truncate ${autoDirFont}`} dir="auto">{session.summary_metrics.folder_path}</span>
                </span>
              )}
            </div>
          </div>

          {/* Tag count + actions (wrap to their own line on phones) */}
          <div className="ms-auto flex w-full sm:w-auto shrink-0 items-center justify-end gap-2 sm:gap-4">
            {/* Tag count */}
            <div
              className="code-chip code-chip-md tabular-nums shrink-0"
              style={{ "--code": fwColor } as React.CSSProperties}
            >
              <Tag size={12} />
              {tagCount}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setMoveFolderSessionId(session.id);
                  setMoveFolderPath((session.summary_metrics?.folder_path || "").split("/").map(s => s.trim()).filter(Boolean));
                  setNewFolderName("");
                }}
                title="Move to folder"
                aria-label="Move to folder"
                className="btn btn-secondary btn-sm btn-icon size-9 sm:size-8"
              >
                <FolderInput size={14} />
              </button>
              <Link
                href={`/tagging?session=${session.id}`}
                className="btn btn-secondary btn-sm h-9 sm:h-8"
              >
                <RotateCcw size={12} /> Continue
              </Link>
              <Link
                href={`/sessions/${session.id}`}
                className="btn btn-soft btn-sm h-9 sm:h-8"
              >
                View <ArrowRight size={12} />
              </Link>
            </div>
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
      <div key={node.path || "__root__"} className={depth > 0 ? "mt-3 ps-4 border-s border-border/60" : "space-y-3"}>
        {!isRoot && (
          <button onClick={() => toggleFolder(node.path)}
            aria-expanded={!collapsedFolders.has(node.path)}
            className="w-full flex items-center gap-2 px-2 h-9 rounded-lg text-start text-sm font-semibold text-foreground hover:bg-foreground/[0.06] cursor-pointer">
            {collapsedFolders.has(node.path) ? <ChevronRight size={15} className="shrink-0 text-muted-foreground" /> : <ChevronDown size={15} className="shrink-0 text-muted-foreground" />}
            {collapsedFolders.has(node.path)
              ? <Folder size={15} className="shrink-0 text-muted-foreground" />
              : <FolderOpen size={15} className="shrink-0 text-muted-foreground" />}
            <span className={`truncate min-w-0 ${autoDirFont}`} dir="auto">{node.name}</span>
            <span className="ms-auto shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
              ({sortedSessions.length + childFolders.reduce((sum, c) => sum + countSessions(c), 0)})
            </span>
          </button>
        )}
        {(isRoot || !collapsedFolders.has(node.path)) && (
          <div className={isRoot ? "space-y-3" : "mt-2 space-y-3"}>
            {childFolders.map(child => renderFolderSection(child, depth + 1))}
            {isRoot && childFolders.length > 0 && sortedSessions.length > 0 && (
              <p className="eyebrow pt-2">Unfiled</p>
            )}
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
      {moveFolderSessionId && (() => {
        const childFolders = Array.from(pickerNode.children.values()).sort((a, b) => a.name.localeCompare(b.name));
        // Display-only: which session is moving, where it is now, and how many
        // breadcrumb segments already exist in the tree (the rest are virtual
        // folders that only get created when the move is confirmed).
        const movingSession = sessions.find(s => s.id === moveFolderSessionId);
        const movingName = movingSession?.summary_metrics?.session_name || "Unnamed Session";
        const movingFrom = movingSession?.summary_metrics?.folder_path || "Root";
        let existingDepth = 0;
        for (let node: FolderNode | undefined = folderTree; existingDepth < moveFolderPath.length; existingDepth++) {
          node = node?.children.get(moveFolderPath[existingDepth]);
          if (!node) break;
        }
        return (
          <div className="modal-root">
            <div className="modal-backdrop" onClick={() => !isMovingFolder && setMoveFolderSessionId(null)} />
            <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="move-folder-title">
              <div className="modal-header">
                <div className="min-w-0">
                  <h2 id="move-folder-title" className="modal-title"><FolderInput size={16} className="text-primary shrink-0" /> Move to Folder</h2>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    <bdi className={autoDirFont}>{movingName}</bdi> · Current: <bdi className={autoDirFont}>{movingFrom}</bdi>
                  </p>
                </div>
                <button onClick={() => setMoveFolderSessionId(null)} disabled={isMovingFolder} aria-label="Close" className="icon-btn"><X size={16} /></button>
              </div>

              {/* Breadcrumb */}
              <nav aria-label="Folder path" className="flex items-center gap-1 flex-wrap px-5 pt-4 text-sm">
                <button onClick={() => setMoveFolderPath([])}
                  aria-current={moveFolderPath.length === 0 ? "location" : undefined}
                  className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-md cursor-pointer ${moveFolderPath.length === 0 ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
                  <Home size={13} className="shrink-0" />
                  Root
                </button>
                {moveFolderPath.map((segment, i) => (
                  <span key={i} className="flex items-center gap-1 min-w-0">
                    <ChevronRight size={13} className="text-muted-foreground/70 shrink-0" />
                    <button onClick={() => setMoveFolderPath(moveFolderPath.slice(0, i + 1))}
                      aria-current={i === moveFolderPath.length - 1 ? "location" : undefined}
                      className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-md min-w-0 cursor-pointer ${i === moveFolderPath.length - 1 ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
                      <span className={`truncate ${autoDirFont}`} dir="auto">{segment}</span>
                      {i >= existingDepth && <span className="badge tone-primary">new</span>}
                    </button>
                  </span>
                ))}
              </nav>

              {/* Subfolders at this level */}
              <div className="px-5 pt-2 pb-1 max-h-56 overflow-y-auto">
                {childFolders.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3">No subfolders here yet.</p>
                ) : (
                  <div className="space-y-0.5">
                    {childFolders.map(child => (
                      <button key={child.name} onClick={() => setMoveFolderPath([...moveFolderPath, child.name])}
                        className="w-full flex items-center gap-2 px-3 h-9 rounded-lg text-sm text-start hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06] cursor-pointer">
                        <Folder size={14} className="text-muted-foreground shrink-0" />
                        <span className={`min-w-0 truncate ${autoDirFont}`} dir="auto">{child.name}</span>
                        <span className="count-pill ms-auto">{countSessions(child)}</span>
                        <ChevronRight size={13} className="text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Create subfolder at this level */}
              <div className="px-5 py-3 flex items-center gap-2 border-t border-border">
                <input type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && newFolderName.trim()) {
                      setMoveFolderPath([...moveFolderPath, newFolderName.trim()]);
                      setNewFolderName("");
                    }
                  }}
                  placeholder="New subfolder name…"
                  dir="auto"
                  autoFocus
                  className={`field flex-1 min-w-0 ${autoDirFont}`} />
                <button
                  onClick={() => { if (newFolderName.trim()) { setMoveFolderPath([...moveFolderPath, newFolderName.trim()]); setNewFolderName(""); } }}
                  disabled={!newFolderName.trim()}
                  title="Create and enter subfolder"
                  aria-label="Create and enter subfolder"
                  className="btn btn-outline btn-icon size-10 shrink-0">
                  <FolderPlus size={15} />
                </button>
              </div>

              <div className="modal-footer">
                <button onClick={() => setMoveFolderSessionId(null)} disabled={isMovingFolder} className="btn btn-outline flex-1">Cancel</button>
                <button onClick={() => handleMoveFolder(moveFolderPath)} disabled={isMovingFolder} aria-busy={isMovingFolder} className="btn btn-primary flex-1 min-w-0">
                  {isMovingFolder ? <Loader2 size={14} className="shrink-0 animate-spin" /> : <FolderInput size={14} className="shrink-0" />}
                  {isMovingFolder ? "Moving…" : moveFolderPath.length === 0 ? "Move to Root" : `Move Here`}
                  {!isMovingFolder && moveFolderPath.length > 0 && (
                    <span className={`min-w-0 truncate text-xs font-normal ${autoDirFont}`} dir="auto">/{moveFolderPath.join("/")}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Empty state */}
      {sessions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <BookOpen size={24} />
          </div>
          <div>
            <p className="empty-state-title">No sessions saved yet</p>
            <p className="empty-state-text mt-1">Start tagging a video and save your session to see it here.</p>
          </div>
          <Link
            href="/tagging"
            className="btn btn-primary mt-1"
          >
            <Plus size={15} /> Start Tagging
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
              <div className="segmented" role="group" aria-label="View mode">
                <button onClick={() => setViewMode("flat")}
                  aria-pressed={viewMode === "flat"}
                  className="segmented-item">
                  <List size={14} /> Flat
                </button>
                <button onClick={() => setViewMode("folders")}
                  aria-pressed={viewMode === "folders"}
                  className="segmented-item">
                  <FolderTreeIcon size={14} /> Folders
                </button>
              </div>
              <span className="text-xs text-muted-foreground">
                {sessions.length} {sessions.length === 1 ? "session" : "sessions"} · {viewMode === "flat" ? "Newest first" : "A–Z"}
              </span>
            </div>
            <button
              onClick={handleExportAll}
              disabled={isExportingAll}
              aria-busy={isExportingAll}
              title="Download a full JSON backup of every session, tag, and TDS reasoning in the system"
              className="btn btn-outline btn-sm"
            >
              {isExportingAll ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {isExportingAll ? "Exporting…" : "Backup All (JSON)"}
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
