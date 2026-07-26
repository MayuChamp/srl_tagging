"use client";

import { useState, useMemo } from "react";
import {
  BookOpen, Tag, Calendar, Video, ArrowRight, Plus, X,
  FolderInput, Folder, FolderOpen, ChevronRight, ChevronDown, List, FolderTree as FolderTreeIcon, FolderPlus,
  Download,
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
              onClick={() => {
                setMoveFolderSessionId(session.id);
                setMoveFolderPath((session.summary_metrics?.folder_path || "").split("/").map(s => s.trim()).filter(Boolean));
                setNewFolderName("");
              }}
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
      {moveFolderSessionId && (() => {
        const childFolders = Array.from(pickerNode.children.values()).sort((a, b) => a.name.localeCompare(b.name));
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isMovingFolder && setMoveFolderSessionId(null)} />
            <div className="relative z-10 w-full max-w-md mx-4 bg-card border border-border rounded-2xl shadow-[var(--shadow-lg)] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="font-semibold text-base flex items-center gap-2"><FolderInput size={16} className="text-primary" /> Move to Folder</h2>
                <button onClick={() => setMoveFolderSessionId(null)} disabled={isMovingFolder} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-secondary text-muted-foreground transition-all"><X size={16} /></button>
              </div>

              {/* Breadcrumb */}
              <div className="flex items-center gap-1 flex-wrap px-5 pt-4 text-sm">
                <button onClick={() => setMoveFolderPath([])}
                  className={`px-2 py-1 rounded-md transition-colors ${moveFolderPath.length === 0 ? "text-primary font-semibold" : "text-muted-foreground hover:bg-secondary"}`}>
                  Root
                </button>
                {moveFolderPath.map((segment, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <ChevronRight size={13} className="text-muted-foreground/50" />
                    <button onClick={() => setMoveFolderPath(moveFolderPath.slice(0, i + 1))}
                      className={`px-2 py-1 rounded-md transition-colors ${i === moveFolderPath.length - 1 ? "text-primary font-semibold" : "text-muted-foreground hover:bg-secondary"}`}>
                      {segment}
                    </button>
                  </span>
                ))}
              </div>

              {/* Subfolders at this level */}
              <div className="px-5 pt-2 pb-1 max-h-56 overflow-y-auto">
                {childFolders.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60 py-3">No subfolders here yet.</p>
                ) : (
                  <div className="space-y-1">
                    {childFolders.map(child => (
                      <button key={child.name} onClick={() => setMoveFolderPath([...moveFolderPath, child.name])}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-secondary/60 transition-colors text-left text-sm">
                        <Folder size={14} className="text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate">{child.name}</span>
                        <span className="text-xs text-muted-foreground">{countSessions(child)}</span>
                        <ChevronRight size={13} className="text-muted-foreground/50 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Create subfolder at this level */}
              <div className="px-5 py-3 flex gap-2 border-t border-border">
                <input type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && newFolderName.trim()) {
                      setMoveFolderPath([...moveFolderPath, newFolderName.trim()]);
                      setNewFolderName("");
                    }
                  }}
                  placeholder="New subfolder name…"
                  className="flex-1 bg-secondary/60 border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30" />
                <button
                  onClick={() => { if (newFolderName.trim()) { setMoveFolderPath([...moveFolderPath, newFolderName.trim()]); setNewFolderName(""); } }}
                  disabled={!newFolderName.trim()}
                  title="Create and enter subfolder"
                  className="px-3 rounded-xl border border-border hover:bg-secondary transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  <FolderPlus size={15} />
                </button>
              </div>

              <div className="flex gap-2 px-5 pb-5">
                <button onClick={() => setMoveFolderSessionId(null)} disabled={isMovingFolder} className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-border hover:bg-secondary transition-all disabled:opacity-50">Cancel</button>
                <button onClick={() => handleMoveFolder(moveFolderPath)} disabled={isMovingFolder} className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-primary text-white hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-50">
                  <FolderInput size={14} />{isMovingFolder ? "Moving…" : moveFolderPath.length === 0 ? "Move to Root" : `Move Here`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
          <div className="flex items-center justify-between gap-3">
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
            <button
              onClick={handleExportAll}
              disabled={isExportingAll}
              title="Download a full JSON backup of every session, tag, and TDS reasoning in the system"
              className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-secondary hover:bg-secondary/80 px-3 py-2 rounded-xl transition-all border border-border disabled:opacity-50"
            >
              <Download size={14} /> {isExportingAll ? "Exporting…" : "Backup All (JSON)"}
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
