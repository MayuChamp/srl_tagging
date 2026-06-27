"use client";

import React, { useState, useRef, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { VideoPlayer, type VideoMarker, type Caption } from "@/components/video/VideoPlayer";
import {
  Save, Tag, Clock, AlignLeft, ShieldCheck,
  FolderOpen, Info, Download, Upload, Trash2, Library, X, Video,
  Search, RotateCcw, ChevronDown, PlayCircle, Captions, FileSpreadsheet,
  Pencil, Check, Play, Bot, Sparkles, CheckCheck, Mic, FileText,
  SkipBack, SkipForward,
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase/client";

interface LibraryVideo {
  id: string;
  title: string | null;
  storage_path: string;
  duration_seconds: number | null;
  created_at: string | null;
}

interface AiTag {
  id: string;
  code_id: string;
  start_time: number;
  end_time: number;
  evidence_text: string | null;
  reasoning: string | null;
  confidence_score: number | null;
}

const PRISMS = {
  // ── SCOPE / SRL Codebook ────────────────────────────────────────────────────
  SCOPE: [
    // TDS: Teacher Direct Strategy Instruction
    { id: "TDS_COG",  label: "TDS_COG",  color: "#0891b2", description: "הוראת אסטרטגיה קוגניטיבית: השוואה, ייצוג, תמצות, ניתוח נתונים או מודלים" },
    { id: "TDS_META", label: "TDS_META", color: "#0e7490", description: "הוראת אסטרטגיה מטה-קוגניטיבית: תכנון, בדיקה, בחירת אסטרטגיה, חשיבה על תהליך" },
    { id: "TDS_MOT",  label: "TDS_MOT",  color: "#155e75", description: "הוראת אסטרטגיות ויסות מוטיבציוני/רגשי ללמידה: מאמץ, התמדה או משמעות" },
    { id: "TDS_NONE", label: "TDS_NONE", color: "#475569", description: "אין הוראת אסטרטגיה ישירה" },
    // EX: Explicitness of instruction
    { id: "EX_IMPL",  label: "EX_IMPL",  color: "#6366f1", description: "האסטרטגיה מופעלת אך המורה לא מדגים אותה במפורש כאסטרטגיה" },
    { id: "EX_PART",  label: "EX_PART",  color: "#7c3aed", description: "הוראת אסטרטגיה חצי-מפורשת: יש התייחסות לאסטרטגיה, אך ללא הסבר ברור איך/מתי/למה להשתמש בה" },
    { id: "EX_EXPL",  label: "EX_EXPL",  color: "#4f46e5", description: "הוראת אסטרטגיה מפורשת: הדגמה ברורה של מה, מתי, למה ואיך להשתמש באסטרטגיה" },
    { id: "EX_NA",    label: "EX_NA",    color: "#64748b", description: "לא רלוונטי (כאשר אין הוראת אסטרטגיה ישירה)" },
    // SRL: SRL Process Codes
    { id: "SRL_GOAL",    label: "SRL_GOAL",    color: "#0ea5e9", description: "הצבת יעד או קריטריון להצלחה" },
    { id: "SRL_PLAN",    label: "SRL_PLAN",    color: "#0284c7", description: "תכנון דרך פעולה או בחירת אסטרטגיה מתאימה" },
    { id: "SRL_COG",     label: "SRL_COG",     color: "#0369a1", description: "שימוש באסטרטגיה קוגניטיבית לעיבוד התוכן" },
    { id: "SRL_MON",     label: "SRL_MON",     color: "#075985", description: "ניטור הבנה ודיוק, זיהוי בעיות וקשיים בתהליך הלמידה" },
    { id: "SRL_CTRL",    label: "SRL_CTRL",    color: "#0c4a6e", description: "התאמה ושינוי של האסטרטגיה או דרך הפעולה בעת הצורך" },
    { id: "SRL_REFL",    label: "SRL_REFL",    color: "#164e63", description: "רפלקציה על תהליך הלמידה, הפקת לקחים והבנות חדשות" },
    { id: "SRL_HELP",    label: "SRL_HELP",    color: "#155e75", description: "בקשת עזרה ממוקדת מתוך מודעות למגבלות האסטרטגיה או הידע" },
    { id: "SRL_CONTEXT", label: "SRL_CONTEXT", color: "#312e81", description: "ויסות הקשרי/סביבתי: ניהול זמן, ארגון סביבת הלמידה ותנאים פיזיים" },
    // ST: Student SRL Uptake
    { id: "ST_PLAN",  label: "ST_PLAN",  color: "#9333ea", description: "התלמידים מתכננים או מגדירים דרך פעולה" },
    { id: "ST_MON",   label: "ST_MON",   color: "#7e22ce", description: "התלמידים מנטרים את הבנתם, מזהים בעיות ומנמקים החלטות" },
    { id: "ST_HELP",  label: "ST_HELP",  color: "#a855f7", description: "התלמידים מבקשים עזרה ממוקדת ויעילה" },
    // SCI: Science-Specific SRL
    { id: "SCI_DATA",     label: "SCI_DATA",     color: "#92400e", description: "אסטרטגיית ניתוח נתונים, סיווגים, זיהוי מגמות ושימוש בייצוגים מדעיים" },
    { id: "SCI_TRANSFER", label: "SCI_TRANSFER", color: "#6ee7b7", description: "העברת ידע, הכללה ויצירת הקשרים לתחומים מדעיים וטכנולוגיים" },
    { id: "SCI_ARG",      label: "SCI_ARG",      color: "#ea580c", description: "טיעון מדעי: הצגת טענה, ביסוס, הוכחה ושיפוט מדעי" },
    // TA: Teacher Adaptation
    { id: "TA0", label: "TA0", color: "#94a3b8", description: "ללא התאמת ההוראה (ללא תמיכה ב-SRL)" },
    { id: "TA1", label: "TA1", color: "#f87171", description: "התאמת הוראה מוגבלת (התמקדות בתוכן בלבד)" },
    { id: "TA2", label: "TA2", color: "#fb923c", description: "התאמת הוראה ברורה ומפורשת" },
    { id: "TA3", label: "TA3", color: "#4ade80", description: "התאמת הוראה מוכוונת לתמיכה בוויסות הלמידה (SRL)" },
    // MO: Missed Opportunity
    { id: "MO_EXPL",   label: "MO_EXPL",   color: "#ef4444", description: "החמצת הזדמנות: הרחבה והסבר מפורש של האסטרטגיה" },
    { id: "MO_MON",    label: "MO_MON",    color: "#f97316", description: "החמצת הזדמנות: עידוד התלמידים לניטור עצמי או בדיקת הבנה" },
    { id: "MO_EVID",   label: "MO_EVID",   color: "#eab308", description: "החמצת הזדמנות: בקשת ראיות, הצדקות או הוכחות מהתלמידים" },
    { id: "MO_REFL",   label: "MO_REFL",   color: "#a78bfa", description: "החמצת הזדמנות: עידוד רפלקציה על התהליך או האסטרטגיה" },
    { id: "MO_AGENCY", label: "MO_AGENCY", color: "#ec4899", description: "החמצת הזדמנות: מתן אחריות, בחירה או אוטונומיה לתלמידים" },
    { id: "MO_HELP",   label: "MO_HELP",   color: "#f43f5e", description: "החמצת הזדמנות: הנחיה או תמיכה בבקשת עזרה יעילה" },
    // Q: Episode Quality
    { id: "Q0", label: "Q0", color: "#94a3b8", description: "איכות ויסות הלמידה: לא נצפה SRL" },
    { id: "Q1", label: "Q1", color: "#fca5a5", description: "איכות ויסות הלמידה: נמוכה" },
    { id: "Q2", label: "Q2", color: "#fcd34d", description: "איכות ויסות הלמידה: בינונית" },
    { id: "Q3", label: "Q3", color: "#86efac", description: "איכות ויסות הלמידה: גבוהה" },
    // EV: Evidence Strength
    { id: "EV0", label: "EV0", color: "#94a3b8", description: "עוצמת העדות: אין" },
    { id: "EV1", label: "EV1", color: "#fca5a5", description: "עוצמת העדות: חלש" },
    { id: "EV2", label: "EV2", color: "#fcd34d", description: "עוצמת העדות: בינוני" },
    { id: "EV3", label: "EV3", color: "#86efac", description: "עוצמת העדות: חזק" },
  ],
  // ── Nonverbal & Prosodic ─────────────────────────────────────────────────────
  NONVERBAL: [
    { id: "N_MODELING",             label: "N_MODELING",             color: "#d97706", description: "Nonverbal Strategy Modeling" },
    { id: "N_ATTENTION_GUIDING",    label: "N_ATTENTION_GUIDING",    color: "#b45309", description: "Guiding Visual Attention" },
    { id: "N_COLLAB_STRUCTURE",     label: "N_COLLAB_STRUCTURE",     color: "#92400e", description: "Collaborative Structure Cues" },
    { id: "N_EMOTION_DISPLAY",      label: "N_EMOTION_DISPLAY",      color: "#78350f", description: "Emotional Cues / Climate" },
    { id: "N_ATTENTION",            label: "N_ATTENTION",            color: "#f59e0b", description: "Nonverbal Attention" },
    { id: "N_GESTURE_FOCUS",        label: "N_GESTURE_FOCUS",        color: "#ea580c", description: "Focus Gesture" },
    { id: "P_INTONATION_ENCOURAGE", label: "P_INTONATION_ENCOURAGE", color: "#ec4899", description: "Encouraging Intonation" },
    { id: "P_INTONATION_QUESTION",  label: "P_INTONATION_QUESTION",  color: "#db2777", description: "Questioning Intonation" },
  ],
};

type PrismKey = keyof typeof PRISMS;

const CODE_COLORS: Record<string, string> = Object.fromEntries(
  Object.values(PRISMS).flat().map(c => [c.id, c.color])
);

const PRISM_CATEGORIES: Record<PrismKey, { category: string; ids: string[] }[]> = {
  SCOPE: [
    { category: "TDS – Teacher Direct Strategy", ids: ["TDS_COG","TDS_META","TDS_MOT","TDS_NONE"] },
    { category: "EX – Explicitness",             ids: ["EX_IMPL","EX_PART","EX_EXPL","EX_NA"] },
    { category: "SRL – Process Codes",           ids: ["SRL_GOAL","SRL_PLAN","SRL_COG","SRL_MON","SRL_CTRL","SRL_REFL","SRL_HELP","SRL_CONTEXT"] },
    { category: "ST – Student Uptake",           ids: ["ST_PLAN","ST_MON","ST_HELP"] },
    { category: "SCI – Science SRL",             ids: ["SCI_DATA","SCI_TRANSFER","SCI_ARG"] },
    { category: "TA – Teacher Adaptation",       ids: ["TA0","TA1","TA2","TA3"] },
    { category: "MO – Missed Opportunity",       ids: ["MO_EXPL","MO_MON","MO_EVID","MO_REFL","MO_AGENCY","MO_HELP"] },
    { category: "Q – Episode Quality",           ids: ["Q0","Q1","Q2","Q3"] },
    { category: "EV – Evidence Strength",        ids: ["EV0","EV1","EV2","EV3"] },
  ],
  NONVERBAL: [
    { category: "Nonverbal Cues",  ids: ["N_MODELING","N_ATTENTION_GUIDING","N_COLLAB_STRUCTURE","N_EMOTION_DISPLAY","N_ATTENTION","N_GESTURE_FOCUS"] },
    { category: "Prosodic Cues",   ids: ["P_INTONATION_ENCOURAGE","P_INTONATION_QUESTION"] },
  ],
};

const PRISM_CODE_LOOKUP = Object.fromEntries(
  Object.values(PRISMS).flat().map(c => [c.id, c])
);

const PRISM_LABELS: Record<PrismKey, string> = {
  SCOPE: "SCOPE",
  NONVERBAL: "Nonverbal",
};

function TaggingModeInner() {
  const searchParams = useSearchParams();
  const [videoInputUrl, setVideoInputUrl] = useState("");
  const [loadedUrl, setLoadedUrl] = useState("");
  const [loadedVideoId, setLoadedVideoId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isEmbedMode, setIsEmbedMode] = useState(false);
  const [markers, setMarkers] = useState<VideoMarker[]>([]);
  const [sessionName, setSessionName] = useState("");
  const [sessionSaved, setSessionSaved] = useState(false);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [resumedSessionId, setResumedSessionId] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);

  // Video browser modal
  const [showVideoBrowser, setShowVideoBrowser] = useState(false);
  const [libraryVideos, setLibraryVideos] = useState<LibraryVideo[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");

  const [captions, setCaptions] = useState<Caption[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const captionInputRef = useRef<HTMLInputElement>(null);
  const sessionImportRef = useRef<HTMLInputElement>(null);
  const videoCardRef = useRef<HTMLDivElement>(null);

  // Tagging form state
  const [selectedPrism, setSelectedPrism] = useState<PrismKey>("SCOPE");
  const [startTime, setStartTime] = useState<number | "">("");
  const [endTime, setEndTime] = useState<number | "">("");
  const [startTimeText, setStartTimeText] = useState("");
  const [endTimeText, setEndTimeText] = useState("");
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(() => new Set());
  const [evidenceText, setEvidenceText] = useState("");
  const [reasoningText, setReasoningText] = useState("");
  const [confidenceScore, setConfidenceScore] = useState<number>(0.66);

  // Code browser state
  const [codeSearch, setCodeSearch] = useState("");
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    () => new Set([PRISM_CATEGORIES.SCOPE[0].category])
  );

  // Tooltip state — fixed-position to escape overflow containers
  const [tooltip, setTooltip] = useState<{ id: string; description: string; x: number; y: number } | null>(null);

  // Resize state
  const [rightWidth, setRightWidth] = useState(440);
  const [videoHeight, setVideoHeight] = useState<number | null>(null);
  const [activeDrag, setActiveDrag] = useState<"h" | "v" | null>(null);

  // Tag editing state
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ startTime: number | ""; endTime: number | ""; evidence: string; reasoning: string } | null>(null);

  // Video seek state
  const [seekRequest, setSeekRequest] = useState<{ time: number; seq: number } | null>(null);

  // Audio transcript state
  type TranscriptEntry = {
    start: number; end: number; type: "speech" | "ambient";
    speaker?: string; text?: string; description?: string;
  };
  const [audioTranscript, setAudioTranscript] = useState<TranscriptEntry[] | null>(null);

  // AI Analysis state
  type RightTab = PrismKey | "AI";
  const [rightTab, setRightTab] = useState<RightTab>("SCOPE");
  const [aiStatus, setAiStatus] = useState<"idle" | "processing" | "completed" | "failed">("idle");
  const [aiTags, setAiTags] = useState<AiTag[]>([]);
  const [acceptedAiIds, setAcceptedAiIds] = useState<Set<string>>(() => new Set());
  const [processingStartedAt, setProcessingStartedAt] = useState<number | null>(null);

  const seekToTime = (time: number) => {
    setSeekRequest(prev => ({ time, seq: (prev?.seq ?? 0) + 1 }));
  };

  // Load existing AI analysis when a library video is selected
  useEffect(() => {
    if (!loadedVideoId) {
      setAiStatus("idle");
      setAiTags([]);
      setAcceptedAiIds(new Set());
      setAudioTranscript(null);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/analyze?videoId=${loadedVideoId}`);
        const data = await res.json();
        if (data.status === "completed" && data.tags?.length) {
          setAiStatus("completed");
          setAiTags(data.tags);
        } else if (data.status === "processing" || data.status === "pending") {
          setAiStatus("processing");
        }
      } catch {
        // network error — keep idle
      }
    })();
  }, [loadedVideoId]);

  // Poll for status while processing
  useEffect(() => {
    if (aiStatus !== "processing" || !loadedVideoId) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/analyze?videoId=${loadedVideoId}`);
        const data = await res.json();
        if (data.status === "completed") {
          setAiStatus("completed");
          setAiTags(data.tags ?? []);
          setRightTab("AI");
        } else if (data.status === "failed") {
          setAiStatus("failed");
        }
      } catch { /* keep polling */ }
    }, 5000);
    return () => clearInterval(id);
  }, [aiStatus, loadedVideoId]);

  const handleTriggerAnalysis = async () => {
    if (!loadedVideoId) return;
    setAiStatus("processing");
    setAiTags([]);
    setAcceptedAiIds(new Set());
    setProcessingStartedAt(Date.now());
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: loadedVideoId }),
      });
      if (!res.ok) {
        setAiStatus("failed");
      }
    } catch {
      setAiStatus("failed");
    }
  };

  const handleForceReset = async () => {
    if (!loadedVideoId) return;
    await fetch(`/api/analyze?videoId=${loadedVideoId}`, { method: "DELETE" });
    setAiStatus("idle");
    setProcessingStartedAt(null);
  };

  const handleAcceptAiTag = (tag: AiTag) => {
    const newMarker: VideoMarker = {
      id: crypto.randomUUID(),
      startTime: tag.start_time,
      endTime: tag.end_time,
      label: tag.code_id,
      labels: [tag.code_id],
      color: CODE_COLORS[tag.code_id] ?? "#6366f1",
      colors: [CODE_COLORS[tag.code_id] ?? "#6366f1"],
      evidence: tag.evidence_text ?? undefined,
      reasoning: tag.reasoning ?? undefined,
      confidence: tag.confidence_score ?? undefined,
    };
    setMarkers(prev => [...prev, newMarker]);
    setAcceptedAiIds(prev => new Set([...prev, tag.id]));
  };

  const handleAcceptAllAiTags = () => {
    const pending = aiTags.filter(t => !acceptedAiIds.has(t.id));
    const newMarkers: VideoMarker[] = pending.map(tag => ({
      id: crypto.randomUUID(),
      startTime: tag.start_time,
      endTime: tag.end_time,
      label: tag.code_id,
      labels: [tag.code_id],
      color: CODE_COLORS[tag.code_id] ?? "#6366f1",
      colors: [CODE_COLORS[tag.code_id] ?? "#6366f1"],
      evidence: tag.evidence_text ?? undefined,
      reasoning: tag.reasoning ?? undefined,
      confidence: tag.confidence_score ?? undefined,
    }));
    setMarkers(prev => [...prev, ...newMarkers]);
    setAcceptedAiIds(prev => new Set([...prev, ...pending.map(t => t.id)]));
  };

  const handleEditStart = (m: VideoMarker) => {
    setEditingMarkerId(m.id);
    setEditForm({
      startTime: m.startTime,
      endTime: m.endTime ?? m.startTime,
      evidence: m.evidence ?? "",
      reasoning: m.reasoning ?? "",
    });
  };

  const handleEditSave = (id: string) => {
    if (!editForm) return;
    setMarkers(prev => prev.map(m => m.id !== id ? m : {
      ...m,
      startTime: Number(editForm.startTime),
      endTime: Number(editForm.endTime),
      evidence: editForm.evidence,
      reasoning: editForm.reasoning || undefined,
    }));
    setEditingMarkerId(null);
    setEditForm(null);
  };

  const handleRemoveMarker = (id: string) => {
    setMarkers(prev => prev.filter(m => m.id !== id));
    if (editingMarkerId === id) { setEditingMarkerId(null); setEditForm(null); }
  };

  const startHDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    setActiveDrag("h");
    const startX = e.clientX;
    const startW = rightWidth;

    const onMove = (ev: MouseEvent) => {
      setRightWidth(Math.min(Math.max(startW - (ev.clientX - startX), 300), 680));
    };
    const onUp = () => {
      setActiveDrag(null);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const startVDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    setActiveDrag("v");
    const startY = e.clientY;
    const startH = videoCardRef.current?.getBoundingClientRect().height ?? 320;

    const onMove = (ev: MouseEvent) => {
      setVideoHeight(Math.min(Math.max(startH + (ev.clientY - startY), 120), 560));
    };
    const onUp = () => {
      setActiveDrag(null);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // Restore session from ?session=<id> URL param
  useEffect(() => {
    const sessionId = searchParams.get("session");
    if (!sessionId) return;
    setIsLoadingSession(true);
    (async () => {
      const { data: analysis } = await supabase
        .from("analyses")
        .select("*, videos(title, storage_path)")
        .eq("id", sessionId)
        .maybeSingle();

      if (!analysis) { setIsLoadingSession(false); return; }

      const { data: tagData } = await supabase
        .from("tags")
        .select("id, code_id, start_time, end_time, evidence_text, reasoning, confidence_score, created_at")
        .eq("analysis_id", sessionId)
        .order("start_time", { ascending: true })
        .order("created_at", { ascending: true });

      // Group rows belonging to the same multi-code event. Rows from the same event were
      // inserted consecutively and share identical time+evidence, so we use a run-length
      // approach: a new group starts whenever the key changes from the previous row.
      type TagRow = { id: string; code_id: string; start_time: number; end_time: number; evidence_text: string | null; reasoning: string | null; confidence_score: number | null; created_at: string | null };
      const grouped = new Map<string, TagRow[]>();
      let prevKey = "";
      let groupSeq = 0;
      for (const t of (tagData || []) as TagRow[]) {
        const baseKey = `${t.start_time}|${t.end_time}|${t.evidence_text ?? ""}|${t.confidence_score ?? ""}`;
        if (baseKey !== prevKey) groupSeq++;
        const key = `${baseKey}::${groupSeq}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(t);
        prevKey = baseKey;
      }
      const restoredMarkers: VideoMarker[] = [...grouped.values()].map(group => {
        const first = group[0];
        const codes = Array.from(new Set(group.map(t => t.code_id)));
        return {
          id: first.id,
          startTime: first.start_time,
          endTime: first.end_time,
          label: codes[0],
          color: CODE_COLORS[codes[0]] ?? "#6b7280",
          labels: codes,
          colors: codes.map(id => CODE_COLORS[id] ?? "#6b7280"),
          evidence: first.evidence_text ?? undefined,
          reasoning: first.reasoning ?? undefined,
          confidence: first.confidence_score ?? undefined,
        };
      });

      const videoUrl: string | null =
        (analysis.videos as { storage_path: string } | null)?.storage_path ||
        analysis.summary_metrics?.video_url || null;
      const videoId: string | null = analysis.video_id || null;

      setMarkers(restoredMarkers);
      setSessionName(analysis.summary_metrics?.session_name || "");
      if (Array.isArray(analysis.summary_metrics?.captions)) {
        setCaptions(analysis.summary_metrics.captions);
      }
      setResumedSessionId(sessionId);
      if (videoUrl) {
        setLoadedUrl(videoUrl);
        setVideoInputUrl((analysis.videos as { title: string } | null)?.title || videoUrl);
        setIsEmbedMode(false);
        setLoadedVideoId(videoId);
      }
      setIsLoadingSession(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePrismChange = (prism: PrismKey) => {
    setSelectedPrism(prism);
    setSelectedCodes(new Set());
    setCodeSearch("");
    setOpenCategories(new Set([PRISM_CATEGORIES[prism][0].category]));
  };

  const toggleCategory = (category: string) => {
    setOpenCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const formatTime = (time: number | string) => {
    if (time === "") return "--:--";
    const t = Number(time);
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const parseTimeString = (val: string): number | "" => {
    const trimmed = val.trim();
    if (!trimmed) return "";
    if (trimmed.includes(":")) {
      const parts = trimmed.split(":").map(Number);
      if (parts.some((p) => isNaN(p) || p < 0)) return "";
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      return "";
    }
    const n = Number(trimmed);
    return isNaN(n) ? "" : Math.round(n);
  };

  const handleLoadUrl = () => {
    const trimmed = videoInputUrl.trim();
    if (!trimmed) return;
    const isEmbed = trimmed.includes("youtube.com") || trimmed.includes("youtu.be") ||
                    trimmed.includes("vimeo.com") || trimmed.includes("drive.google.com");
    setIsEmbedMode(isEmbed);
    setLoadedUrl(trimmed);
    setLoadedVideoId(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setVideoInputUrl(file.name);
    setIsEmbedMode(false);
    setLoadedUrl(objectUrl);
    setLoadedVideoId(null);
  };

  const parseCaptionTime = (s: string) => {
    const parts = s.replace(",", ".").split(":");
    if (parts.length === 3) return +parts[0] * 3600 + +parts[1] * 60 + parseFloat(parts[2]);
    if (parts.length === 2) return +parts[0] * 60 + parseFloat(parts[1]);
    return parseFloat(s);
  };

  const handleCaptionFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const blocks = normalized.split(/\n\n+/);
      const parsed: Caption[] = [];
      for (const block of blocks) {
        const lines = block.trim().split("\n");
        if (!lines.length) continue;
        if (lines[0].startsWith("WEBVTT")) continue;
        let timeIdx = lines.findIndex(l => l.includes("-->"));
        if (timeIdx === -1) continue;
        const [startStr, endStr] = lines[timeIdx].split("-->").map(s => s.trim().split(/\s/)[0]);
        const bodyLines = lines.slice(timeIdx + 1).join("\n").trim();
        if (!bodyLines) continue;
        parsed.push({
          startTime: parseCaptionTime(startStr),
          endTime: parseCaptionTime(endStr),
          text: bodyLines,
        });
      }
      setCaptions(parsed);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleSetStartTime = () => setStartTime(currentTime);
  const handleSetEndTime = () => setEndTime(currentTime);

  const handleSaveTag = () => {
    if (startTime === "" || endTime === "") return alert("Please set start and end time");
    if (selectedCodes.size === 0) return alert("Please select at least one code");
    const codes = [...selectedCodes];
    const firstCode = PRISM_CODE_LOOKUP[codes[0]];
    const newMarker: VideoMarker = {
      id: Math.random().toString(36).substr(2, 9),
      startTime: Number(startTime),
      endTime: Number(endTime),
      label: firstCode?.id || codes[0],
      color: firstCode?.color || "#6b7280",
      labels: codes,
      colors: codes.map(id => PRISM_CODE_LOOKUP[id]?.color || "#6b7280"),
      evidence: evidenceText,
      reasoning: reasoningText || undefined,
      confidence: confidenceScore,
    };
    setMarkers(prev => {
      const newMarkers = [...prev, newMarker];
      // Auto-save when a new tag is made
      setTimeout(() => handleSaveSessionToSupabase(newMarkers), 0);
      return newMarkers;
    });
    setStartTime("");
    setEndTime("");
    setStartTimeText("");
    setEndTimeText("");
    setEvidenceText("");
    setReasoningText("");
    setConfidenceScore(0.66);
    setSelectedCodes(new Set());
  };

  const handleSaveSessionToSupabase = async (overrideMarkers?: VideoMarker[]) => {
    const markersToSave = overrideMarkers || markers;
    if (markersToSave.length === 0) return alert("No tags to save in this session.");
    setIsSavingSession(true);
    try {
      const name = sessionName.trim() || `session_${new Date().toISOString().slice(0, 10)}`;
      let analysisId: string;

      const captionPayload = captions.length > 0 ? captions : undefined;

      if (resumedSessionId) {
        const { error } = await supabase
          .from("analyses")
          .update({ summary_metrics: { session_name: name, video_url: loadedUrl, captions: captionPayload } })
          .eq("id", resumedSessionId);
        if (error) throw error;
        await supabase.from("tags").delete().eq("analysis_id", resumedSessionId);
        analysisId = resumedSessionId;
      } else {
        const { data: analysis, error } = await supabase
          .from("analyses")
          .insert({
            is_ai_generated: false,
            video_id: loadedVideoId || null,
            summary_metrics: { session_name: name, video_url: loadedUrl, captions: captionPayload },
          })
          .select()
          .single();
        if (error) throw error;
        analysisId = analysis.id;
        setResumedSessionId(analysisId);
      }

      const tagRows = markersToSave.flatMap(m =>
        (m.labels ?? [m.label]).map(codeId => ({
          analysis_id: analysisId,
          code_id: codeId,
          start_time: m.startTime,
          end_time: m.endTime ?? m.startTime,
          evidence_text: m.evidence || null,
          reasoning: m.reasoning || null,
          confidence_score: m.confidence ?? null,
        }))
      );
      const { error: tagsError } = await supabase.from("tags").insert(tagRows);
      if (tagsError) throw tagsError;

      setSessionSaved(true);
      setTimeout(() => setSessionSaved(false), 3000);
    } catch (err) {
      console.error("Error saving session:", err);
      alert("Failed to save session. Please try again.");
    } finally {
      setIsSavingSession(false);
    }
  };

  const formatTimestamp = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const hh = h > 0 ? `${h}:` : "";
    return `${hh}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const handleExportTranscript = async () => {
    if (!loadedVideoId) {
      return alert("ייצוא תמלול שמיעתי זמין רק לסרטונים מהספרייה שנותחו ב-AI.");
    }

    let entries = audioTranscript;

    if (!entries) {
      try {
        const res = await fetch(`/api/transcript?videoId=${loadedVideoId}`);
        const data = await res.json();
        entries = data.transcript ?? null;
        setAudioTranscript(entries);
      } catch {
        return alert("שגיאה בטעינת התמלול.");
      }
    }

    if (!entries || entries.length === 0) {
      return alert("לא נמצא תמלול שמיעתי לסרטון זה.\nהרץ ניתוח AI תחילה.");
    }

    const title = videoInputUrl || "סרטון";
    const dateStr = new Date().toLocaleDateString("he-IL");
    const lines: string[] = [
      "תמלול קולי עם תיאורים שמיעתיים",
      "=".repeat(50),
      `סרטון: ${title}`,
      `תאריך יצוא: ${dateStr}`,
      "=".repeat(50),
      "",
    ];

    for (const e of entries) {
      const ts = `[${formatTimestamp(e.start)} - ${formatTimestamp(e.end)}]`;
      if (e.type === "speech") {
        const speaker = e.speaker ?? "דובר";
        lines.push(`${ts} ${speaker}: ${e.text ?? ""}`);
      } else {
        lines.push(`${ts} *תיאור שמיעתי: ${e.description ?? ""}*`);
      }
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `תמלול_${title.replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    if (markers.length === 0) return alert("No tags to export.");
    const name = sessionName.trim() || `session_${new Date().toISOString().slice(0, 10)}`;
    const session = { sessionName: name, videoUrl: loadedUrl, savedAt: new Date().toISOString(), tags: markers, captions: captions.length > 0 ? captions : undefined };
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    if (markers.length === 0) return alert("No tags to export.");
    const name = sessionName.trim() || `session_${new Date().toISOString().slice(0, 10)}`;

    const rows = markers.map((m, i) => ({
      "#": i + 1,
      "Start": formatTime(m.startTime),
      "End": formatTime(m.endTime || m.startTime),
      "Start (s)": m.startTime,
      "End (s)": m.endTime || m.startTime,
      "Codes": (m.labels ?? [m.label]).join(", "),
      "Strength":
        m.confidence === undefined ? "" :
        m.confidence >= 0.8 ? "חזק" :
        m.confidence >= 0.5 ? "בינוני" : "חלש",
      "Evidence": m.evidence || "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 4 },   // #
      { wch: 8 },   // Start
      { wch: 8 },   // End
      { wch: 10 },  // Start (s)
      { wch: 10 },  // End (s)
      { wch: 36 },  // Codes
      { wch: 10 },  // Strength
      { wch: 50 },  // Evidence
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tags");
    XLSX.writeFile(wb, `${name.replace(/\s+/g, "_")}.xlsx`);
  };

  const handleImportSession = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const session = JSON.parse(ev.target?.result as string);
        if (!Array.isArray(session.tags)) throw new Error("Invalid session file");
        setMarkers(session.tags);
        if (Array.isArray(session.captions)) setCaptions(session.captions);
        if (session.sessionName) setSessionName(session.sessionName);
        if (session.videoUrl) {
          setVideoInputUrl(session.videoUrl);
          const isEmbed = session.videoUrl.includes("youtube.com") || session.videoUrl.includes("youtu.be") ||
                          session.videoUrl.includes("vimeo.com") || session.videoUrl.includes("drive.google.com");
          setIsEmbedMode(isEmbed);
          setLoadedUrl(session.videoUrl);
          setLoadedVideoId(null);
        }
      } catch {
        alert("Failed to load session: invalid file format.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleClearSession = () => {
    if (markers.length === 0) return;
    if (!confirm("Clear all tags in this session?")) return;
    setMarkers([]);
    setSessionName("");
  };

  const handleOpenVideoBrowser = async () => {
    setShowVideoBrowser(true);
    setLoadingLibrary(true);
    const { data } = await supabase
      .from("videos")
      .select("id, title, storage_path, duration_seconds, created_at")
      .order("created_at", { ascending: false });
    setLibraryVideos((data as LibraryVideo[]) || []);
    setLoadingLibrary(false);
  };

  const handleSelectLibraryVideo = (video: LibraryVideo) => {
    setLoadedUrl(video.storage_path);
    setVideoInputUrl(video.title || video.storage_path);
    setIsEmbedMode(false);
    setLoadedVideoId(video.id);
    setShowVideoBrowser(false);
    setLibrarySearch("");
  };

  const filteredLibrary = librarySearch.trim()
    ? libraryVideos.filter(v => (v.title || "").toLowerCase().includes(librarySearch.toLowerCase()))
    : libraryVideos;

  // Build visible categories with resolved code objects, applying search filter
  const visibleCategories = useMemo(() => {
    const cats = PRISM_CATEGORIES[selectedPrism].map(({ category, ids }) => ({
      category,
      codes: ids.map(id => PRISM_CODE_LOOKUP[id]).filter(Boolean),
    }));
    if (!codeSearch.trim()) return cats;
    const q = codeSearch.toLowerCase();
    const flat = cats.flatMap(c => c.codes).filter(
      code => code.id.toLowerCase().includes(q) || code.label.toLowerCase().includes(q)
    );
    return [{ category: `Results (${flat.length})`, codes: flat }];
  }, [selectedPrism, codeSearch]);

  // When search is active, auto-open the single "Results" category
  useEffect(() => {
    if (codeSearch.trim()) {
      setOpenCategories(new Set([`Results (${visibleCategories[0]?.codes.length ?? 0})`]));
    }
  }, [codeSearch, visibleCategories]);

  const toggleCode = (codeId: string) => {
    setSelectedCodes(prev => {
      const next = new Set(prev);
      if (next.has(codeId)) next.delete(codeId);
      else next.add(codeId);
      return next;
    });
  };

  return (
    <div className="p-6 max-w-full h-[calc(100vh-2rem)] flex gap-0 overflow-hidden animate-in fade-in duration-300">

      {/* Code tooltip — fixed position to escape overflow containers */}
      {tooltip && tooltip.description && (
        <div
          className="fixed z-[999] pointer-events-none"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
        >
          <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl px-4 py-3 shadow-2xl w-64 text-sm" dir="rtl">
            <p className="font-bold text-slate-100 mb-1 text-left" dir="ltr">{tooltip.id}</p>
            <p className="text-slate-300 leading-relaxed">{tooltip.description}</p>
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-slate-900/95" />
        </div>
      )}

      {/* Full-screen drag overlay — prevents mouse events from being captured by video/iframe */}
      {activeDrag && (
        <div
          className="fixed inset-0 z-[200]"
          style={{ cursor: activeDrag === "h" ? "col-resize" : "row-resize" }}
        />
      )}

      {/* ── Video Browser Modal ─────────────────────────────────────────────── */}
      {showVideoBrowser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowVideoBrowser(false)} />
          <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl mx-4 z-10 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="font-semibold text-lg flex items-center gap-2">
                <Library size={18} className="text-primary" /> Browse Video Library
              </h2>
              <button onClick={() => setShowVideoBrowser(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 border-b border-border">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text" value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  placeholder="Search videos..."
                  className="w-full bg-background border border-border rounded-md pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              {loadingLibrary ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Loading...</div>
              ) : filteredLibrary.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                  <Video size={36} className="opacity-30" />
                  <p className="text-sm">{librarySearch ? "No videos match your search." : "No videos in library yet."}</p>
                </div>
              ) : (
                filteredLibrary.map(video => (
                  <button key={video.id} onClick={() => handleSelectLibraryVideo(video)}
                    className="w-full flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/40 transition-colors text-left"
                  >
                    <div className="w-10 h-10 bg-primary/10 rounded-md flex items-center justify-center shrink-0">
                      <Video size={18} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{video.title || "Untitled Video"}</p>
                      <p className="text-xs text-muted-foreground">
                        {video.duration_seconds ? `${Math.floor(video.duration_seconds / 60)}:${String(video.duration_seconds % 60).padStart(2, "0")}` : "—"}
                        {video.created_at ? ` · ${new Date(video.created_at).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <span className="text-xs text-primary font-medium shrink-0">Load</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Loading overlay ─────────────────────────────────────────────────── */}
      {isLoadingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl px-8 py-6 shadow-xl text-center space-y-2">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-medium">Loading session…</p>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          LEFT COLUMN — Video + Session Tags
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden mr-1.5">

        {/* Header */}
        <header className="flex items-center justify-between gap-3 shrink-0">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Tagging Workspace</h1>
            {resumedSessionId && (
              <span className="inline-flex items-center gap-1 text-xs text-primary mt-0.5">
                <RotateCcw size={11} /> Resumed session
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="text" value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="Session name..."
              className="bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-primary w-36"
            />
            <input ref={sessionImportRef} type="file" accept=".json" className="hidden" onChange={handleImportSession} />
            <button onClick={() => sessionImportRef.current?.click()} title="Load session from JSON"
              className="flex items-center gap-1.5 bg-secondary text-secondary-foreground px-3 py-1.5 rounded-md hover:bg-secondary/80 transition-colors text-sm">
              <Upload size={13} /> Load
            </button>
            <button onClick={() => handleSaveSessionToSupabase()} disabled={isSavingSession || markers.length === 0}
              title="Save session to library"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                sessionSaved ? "bg-green-600 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}>
              <Save size={13} />
              {isSavingSession ? "Saving..." : sessionSaved ? "Saved!" : "Save"}
            </button>
            <button onClick={handleExportJson} disabled={markers.length === 0} title="Export as JSON"
              className="bg-secondary text-secondary-foreground px-2.5 py-1.5 rounded-md hover:bg-secondary/80 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed">
              <Download size={13} />
            </button>
            <button onClick={handleExportExcel} disabled={markers.length === 0} title="Export as Excel"
              className="bg-secondary text-secondary-foreground px-2.5 py-1.5 rounded-md hover:bg-secondary/80 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed">
              <FileSpreadsheet size={13} />
            </button>
            <button
              onClick={handleExportTranscript}
              disabled={aiStatus === "processing"}
              title="ייצא תמלול עם תיאורים שמיעתיים (.txt)"
              className="flex items-center gap-1.5 bg-secondary text-secondary-foreground px-3 py-1.5 rounded-md hover:bg-secondary/80 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Mic size={13} />
              תמלול שמיעתי
            </button>
            <button onClick={handleClearSession} disabled={markers.length === 0} title="Clear all tags"
              className="bg-destructive/10 text-destructive border border-destructive/20 px-2.5 py-1.5 rounded-md hover:bg-destructive/20 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed">
              <Trash2 size={13} />
            </button>
          </div>
        </header>

        {/* Video Card — vertically resizable */}
        <div
          ref={videoCardRef}
          className="bg-card border border-border rounded-xl overflow-hidden shadow-sm shrink-0 mt-3 flex flex-col"
          style={videoHeight ? { height: videoHeight } : undefined}
        >
          {/* URL input row */}
          <div className="flex gap-2 p-3 border-b border-border shrink-0">
            <input
              type="text" value={videoInputUrl}
              onChange={(e) => setVideoInputUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLoadUrl()}
              className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
              placeholder="Paste video URL or choose a file..."
            />
            <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelect} />
            <input ref={captionInputRef} type="file" accept=".vtt,.srt" className="hidden" onChange={handleCaptionFileSelect} />
            <button onClick={() => fileInputRef.current?.click()} title="Choose local file"
              className="bg-secondary text-secondary-foreground px-2.5 py-1.5 rounded-md hover:bg-secondary/80 transition-colors">
              <FolderOpen size={15} />
            </button>
            <button
              onClick={() => captionInputRef.current?.click()}
              title={captions.length > 0 ? `Captions loaded (${captions.length} cues) — click to replace` : "Load captions (.vtt or .srt)"}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md hover:bg-secondary/80 transition-colors text-sm border ${
                captions.length > 0
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-secondary text-secondary-foreground border-transparent"
              }`}
            >
              <Captions size={15} />
              {captions.length > 0 && <span className="text-xs font-medium">{captions.length}</span>}
            </button>
            <button onClick={handleOpenVideoBrowser} title="Browse video library"
              className="bg-secondary text-secondary-foreground px-2.5 py-1.5 rounded-md hover:bg-secondary/80 transition-colors flex items-center gap-1.5 text-sm">
              <Library size={15} /> Library
            </button>
            <button onClick={handleLoadUrl} disabled={!videoInputUrl.trim()}
              className="bg-primary text-primary-foreground px-4 py-1.5 rounded-md hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium">
              Load
            </button>
          </div>

          {/* Player — fills remaining height; VideoPlayer uses h-full to anchor controls correctly */}
          <div className="flex-1 min-h-[260px]">
            {loadedUrl ? (
              <VideoPlayer key={loadedUrl} url={loadedUrl} markers={markers} onTimeUpdate={(t) => setCurrentTime(t)} captions={captions} seekRequest={seekRequest} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[100px] text-muted-foreground text-sm gap-2">
                <Video size={28} className="opacity-20" />
                <span>Paste a URL, choose a file, or browse the library to begin</span>
              </div>
            )}
          </div>

          {/* Status bar */}
          <div className="flex items-center gap-4 px-4 py-1.5 border-t border-border bg-secondary/10 text-xs text-muted-foreground shrink-0">
            <span className="flex items-center gap-1.5">
              <Tag size={11} className="text-primary" />
              <span className="font-medium text-foreground">{markers.length}</span> tag{markers.length !== 1 ? "s" : ""}
            </span>
            {(startTime !== "" || endTime !== "") && (
              <span className="flex items-center gap-1.5 text-primary font-mono">
                <Clock size={11} />
                {formatTime(startTime === "" ? 0 : startTime as number)} – {formatTime(endTime === "" ? 0 : endTime as number)}
              </span>
            )}
            {loadedVideoId && (
              <span className="ml-auto flex items-center gap-1 text-primary">
                <Library size={11} /> From library
              </span>
            )}
          </div>
        </div>

        {/* Vertical resize handle — video vs tags */}
        <div
          className="h-5 shrink-0 flex items-center justify-center cursor-row-resize group"
          onMouseDown={startVDrag}
          title="Drag to resize"
        >
          <div className="h-5 w-16 bg-secondary border border-border rounded-full flex flex-col items-center justify-center gap-1 group-hover:bg-primary/20 group-hover:border-primary transition-all shadow-sm">
            <span className="h-px w-8 bg-muted-foreground rounded-full group-hover:bg-primary transition-colors" />
            <span className="h-px w-8 bg-muted-foreground rounded-full group-hover:bg-primary transition-colors" />
          </div>
        </div>

        {/* Session Tag List */}
        <div className="bg-card border border-border rounded-xl flex-1 min-h-0 flex flex-col overflow-hidden shadow-sm mb-3">
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Tag size={14} className="text-primary" /> Session Tags
            </h3>
            {markers.length > 0 && (
              <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">{markers.length}</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {markers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-6 text-muted-foreground gap-2">
                <Tag size={22} className="opacity-20" />
                <p className="text-xs">No tags yet — pick a code and press Add Tag.</p>
              </div>
            ) : (
              markers.map(m => {
                const isEditing = editingMarkerId === m.id;
                const strengthLabel =
                  m.confidence === undefined ? null :
                  m.confidence >= 0.8 ? { text: "חזק",   cls: "bg-green-500/15 text-green-400 border-green-500/25" } :
                  m.confidence >= 0.5 ? { text: "בינוני", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25" } :
                  { text: "חלש", cls: "bg-red-500/15 text-red-400 border-red-500/25" };
                return (
                  <div key={m.id} className={`bg-secondary/20 border rounded-lg overflow-hidden transition-colors ${isEditing ? "border-primary/40" : "border-border/60 hover:border-primary/25"}`}>
                    {/* Header row — click to seek */}
                    <div
                      className="flex items-start gap-2 p-2.5 cursor-pointer hover:bg-secondary/30 transition-colors"
                      onClick={() => { if (!isEditing) seekToTime(m.startTime); }}
                      title={isEditing ? undefined : `Seek to ${formatTime(m.startTime)}`}
                    >
                      <div className="flex flex-wrap gap-1 min-w-0 flex-1 pt-0.5">
                        {(m.labels ?? [m.label]).map((lbl, i) => (
                          <span
                            key={`${lbl}-${i}`}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold border"
                            style={{
                              borderColor: ((m.colors ?? [m.color])[i] || m.color) + "50",
                              backgroundColor: ((m.colors ?? [m.color])[i] || m.color) + "18",
                              color: (m.colors ?? [m.color])[i] || m.color,
                            }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: (m.colors ?? [m.color])[i] || m.color }} />
                            {lbl}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {strengthLabel && (
                          <span className={`text-xs px-1.5 py-0.5 rounded border ${strengthLabel.cls}`}>{strengthLabel.text}</span>
                        )}
                        <span className="text-xs font-mono text-muted-foreground bg-background px-1.5 py-0.5 rounded">
                          {formatTime(m.startTime)}–{formatTime(m.endTime || m.startTime)}
                        </span>
                        {/* Play hint */}
                        {!isEditing && (
                          <Play size={11} className="text-muted-foreground/50 shrink-0" />
                        )}
                        {/* Edit button */}
                        <button
                          onClick={e => { e.stopPropagation(); isEditing ? setEditingMarkerId(null) : handleEditStart(m); }}
                          title={isEditing ? "Cancel edit" : "Edit tag"}
                          className={`shrink-0 transition-colors ${isEditing ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                        >
                          {isEditing ? <X size={13} /> : <Pencil size={11} />}
                        </button>
                        {/* Delete button */}
                        <button
                          onClick={e => { e.stopPropagation(); handleRemoveMarker(m.id); }}
                          title="Delete tag"
                          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>

                    {/* Evidence + reasoning preview when not editing */}
                    {!isEditing && (m.evidence || m.reasoning || m.interpretation) && (
                      <div className="px-2.5 pb-2 border-t border-border/30 space-y-1 pt-1.5">
                        {m.evidence && <p className="text-xs text-muted-foreground leading-relaxed" dir="rtl">{m.evidence}</p>}
                        {m.reasoning && (
                          <p className="text-xs text-foreground/50 italic leading-relaxed border-t border-border/20 pt-1" dir="rtl">
                            <span className="not-italic font-medium text-muted-foreground/70">נימוק: </span>{m.reasoning}
                          </p>
                        )}
                        {m.interpretation && <p className="text-xs text-foreground/60 leading-relaxed line-clamp-1" dir="rtl">{m.interpretation}</p>}
                      </div>
                    )}

                    {/* Inline edit form */}
                    {isEditing && editForm && (
                      <div className="px-2.5 pb-2.5 pt-2 border-t border-primary/20 bg-primary/5 space-y-2">
                        {/* Time range */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Start (s)</label>
                            <input
                              type="number" min={0} step={1}
                              value={editForm.startTime}
                              onChange={e => setEditForm(f => f && { ...f, startTime: e.target.value === "" ? "" : Number(e.target.value) })}
                              className="w-full bg-background border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-primary mt-0.5"
                            />
                          </div>
                          <span className="text-muted-foreground text-xs mt-4">–</span>
                          <div className="flex-1">
                            <label className="text-[10px] text-muted-foreground uppercase tracking-wide">End (s)</label>
                            <input
                              type="number" min={0} step={1}
                              value={editForm.endTime}
                              onChange={e => setEditForm(f => f && { ...f, endTime: e.target.value === "" ? "" : Number(e.target.value) })}
                              className="w-full bg-background border border-border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:border-primary mt-0.5"
                            />
                          </div>
                        </div>
                        {/* Evidence textarea */}
                        <div>
                          <label className="text-[10px] text-muted-foreground uppercase tracking-wide">עדות</label>
                          <textarea
                            value={editForm.evidence}
                            onChange={e => setEditForm(f => f && { ...f, evidence: e.target.value })}
                            rows={2}
                            dir="rtl"
                            placeholder='למשל: "המורה שואלת: בואו נחשוב..."'
                            className="w-full bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:border-primary resize-none mt-0.5"
                          />
                        </div>
                        {/* Reasoning textarea */}
                        <div>
                          <label className="text-[10px] text-muted-foreground uppercase tracking-wide">נימוק</label>
                          <textarea
                            value={editForm.reasoning}
                            onChange={e => setEditForm(f => f && { ...f, reasoning: e.target.value })}
                            rows={2}
                            dir="rtl"
                            placeholder='למה בחרת קוד זה? אילו קריטריונים הנחו אותך?'
                            className="w-full bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:border-primary resize-none mt-0.5"
                          />
                        </div>
                        {/* Save button */}
                        <button
                          onClick={() => handleEditSave(m.id)}
                          className="w-full flex items-center justify-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold py-1.5 rounded hover:bg-primary/90 transition-colors"
                        >
                          <Check size={12} /> Save Changes
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Horizontal resize handle — left vs right column */}
      <div
        className="w-5 shrink-0 self-stretch flex items-center justify-center cursor-col-resize group"
        onMouseDown={startHDrag}
        title="Drag to resize"
      >
        <div className="w-5 h-16 bg-secondary border border-border rounded-full flex items-center justify-center gap-1 group-hover:bg-primary/20 group-hover:border-primary transition-all shadow-sm">
          <span className="w-px h-8 bg-muted-foreground rounded-full group-hover:bg-primary transition-colors" />
          <span className="w-px h-8 bg-muted-foreground rounded-full group-hover:bg-primary transition-colors" />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          RIGHT COLUMN — Code Selection + Annotation Form
      ══════════════════════════════════════════════════════════════════════ */}
      <div
        className="shrink-0 bg-card border border-border rounded-xl flex flex-col overflow-hidden shadow-sm my-3"
        style={{ width: rightWidth }}
      >

        {/* Sticky top: framework tabs + filter */}
        <div className="shrink-0 border-b border-border">
          {/* Framework tabs */}
          <div className="flex">
            {(["SCOPE", "NONVERBAL"] as PrismKey[]).map(fw => (
              <button key={fw}
                onClick={() => { setRightTab(fw); handlePrismChange(fw); }}
                className={`flex-1 py-2.5 text-sm font-semibold transition-all border-b-2 ${
                  rightTab === fw
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {PRISM_LABELS[fw]}
                <span className="ml-1 text-xs font-normal opacity-50">{PRISMS[fw].length}</span>
              </button>
            ))}
            {/* AI Analysis tab */}
            <button
              onClick={() => setRightTab("AI")}
              className={`flex-1 py-2.5 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-1.5 ${
                rightTab === "AI"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Bot size={13} />
              AI
              {aiStatus === "processing" && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              )}
              {aiStatus === "completed" && aiTags.length > 0 && (
                <span className="text-[10px] bg-primary/15 text-primary rounded-full px-1.5 py-0.5 font-bold leading-none">
                  {aiTags.length}
                </span>
              )}
            </button>
          </div>
          {/* Filter input — only for code tabs */}
          {rightTab !== "AI" && (
          <div className="px-3 py-2">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={codeSearch}
                onChange={e => setCodeSearch(e.target.value)}
                placeholder="Filter codes…"
                className="w-full bg-background border border-border rounded-md pl-8 pr-7 py-1.5 text-sm focus:outline-none focus:border-primary"
              />
              {codeSearch && (
                <button onClick={() => setCodeSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
          )}
        </div>

        {/* ── AI Analysis panel (shown when AI tab is active) ─────────────── */}
        {rightTab === "AI" && (
          <div className="flex-1 overflow-y-auto flex flex-col">
            {/* No video from library */}
            {!loadedVideoId && (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-4">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot size={26} className="text-primary opacity-60" />
                </div>
                <div>
                  <p className="font-semibold text-sm">AI Analysis</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Load a video from the <strong>Library</strong> to enable AI analysis.
                  </p>
                </div>
              </div>
            )}

            {/* Idle — video loaded, no analysis yet */}
            {loadedVideoId && aiStatus === "idle" && (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-5">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles size={26} className="text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-sm">Analyze with AI</p>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-[220px]">
                    Automatically tag SRL events using Whisper transcription
                    and Praat prosodic/intonation analysis.
                  </p>
                </div>
                <div className="flex flex-col gap-2 w-full text-xs text-muted-foreground bg-secondary/20 rounded-lg p-3 text-right">
                  <span className="flex items-center gap-2"><Mic size={11} className="text-primary shrink-0" /> תמלול בעברית (Whisper)</span>
                  <span className="flex items-center gap-2"><Sparkles size={11} className="text-pink-400 shrink-0" /> ניתוח פיץ׳ ואינטונציה (Praat)</span>
                  <span className="flex items-center gap-2"><Bot size={11} className="text-blue-400 shrink-0" /> קידוד SRL אוטומטי (GPT-4o)</span>
                </div>
                <button
                  onClick={handleTriggerAnalysis}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-md font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-md shadow-primary/20"
                >
                  <Bot size={15} /> התחל ניתוח AI
                </button>
              </div>
            )}

            {/* Processing */}
            {aiStatus === "processing" && (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-4">
                <div className="relative w-14 h-14">
                  <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Bot size={20} className="text-primary" />
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-sm">מנתח סרטון…</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    תמלול + ניתוח פרוסודי + קידוד SCOPE.<br />
                    תהליך זה אורך 2–5 דקות.
                  </p>
                </div>
                <div className="w-full bg-secondary/30 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full bg-primary/60 rounded-full shimmer" style={{ width: "60%" }} />
                </div>
                <p className="text-[10px] text-muted-foreground">בודק כל 5 שניות…</p>
                {/* Show reset button if stuck for more than 5 minutes */}
                {processingStartedAt && Date.now() - processingStartedAt > 5 * 60 * 1000 && (
                  <div className="mt-2 space-y-1 text-center">
                    <p className="text-[10px] text-amber-400">לוקח יותר מדי זמן?</p>
                    <button onClick={handleForceReset}
                      className="text-[10px] text-muted-foreground hover:text-destructive underline transition-colors">
                      אפס ונסה שוב
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Failed */}
            {aiStatus === "failed" && (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-4">
                <p className="text-sm font-semibold text-destructive">הניתוח נכשל</p>
                <p className="text-xs text-muted-foreground">בדוק שה-Python worker מותקן ושה-.env.local מכיל את המפתחות.</p>
                <button onClick={handleTriggerAnalysis}
                  className="text-xs text-primary hover:underline">
                  נסה שוב
                </button>
              </div>
            )}

            {/* Completed — show AI tags */}
            {aiStatus === "completed" && aiTags.length > 0 && (
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Sparkles size={11} className="text-primary" />
                    {aiTags.length} הצעות AI
                    {acceptedAiIds.size > 0 && (
                      <span className="text-primary">· {acceptedAiIds.size} אושרו</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <button onClick={handleTriggerAnalysis}
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                      הרץ שוב
                    </button>
                    {aiTags.some(t => !acceptedAiIds.has(t.id)) && (
                      <button onClick={handleAcceptAllAiTags}
                        className="flex items-center gap-1 text-[10px] bg-primary/10 text-primary hover:bg-primary/20 px-2 py-1 rounded transition-colors font-medium">
                        <CheckCheck size={10} /> קבל הכל
                      </button>
                    )}
                  </div>
                </div>

                {/* Tag list */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                  {aiTags.map(tag => {
                    const codeColor = CODE_COLORS[tag.code_id] ?? "#6366f1";
                    const accepted = acceptedAiIds.has(tag.id);
                    const isProsodic = tag.evidence_text?.startsWith("[PROSODIC]");
                    const evidence = isProsodic
                      ? tag.evidence_text?.replace("[PROSODIC]", "").trim()
                      : tag.evidence_text;
                    const conf = tag.confidence_score ?? 0;
                    const confLabel = conf >= 0.8 ? "חזק" : conf >= 0.5 ? "בינוני" : "חלש";
                    const confCls = conf >= 0.8
                      ? "text-emerald-400 border-emerald-400/30"
                      : conf >= 0.5
                        ? "text-amber-400 border-amber-400/30"
                        : "text-red-400 border-red-400/30";

                    return (
                      <div
                        key={tag.id}
                        onClick={() => seekToTime(tag.start_time)}
                        className={`rounded-lg border transition-all cursor-pointer ${
                          accepted
                            ? "border-primary/20 bg-primary/5 opacity-60"
                            : "border-border hover:border-primary/30 hover:bg-secondary/30"
                        }`}
                      >
                        <div className="flex items-center gap-2 px-2.5 py-2">
                          {/* Code dot + label */}
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: codeColor }} />
                          <span className="text-xs font-bold" style={{ color: codeColor }}>{tag.code_id}</span>

                          {/* Badges */}
                          <div className="flex items-center gap-1 ml-0.5">
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold leading-none">AI</span>
                            {isProsodic && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-400 font-semibold leading-none flex items-center gap-0.5">
                                <Mic size={7} /> פרוסודי
                              </span>
                            )}
                          </div>

                          <div className="ml-auto flex items-center gap-2">
                            {/* Confidence */}
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border ${confCls} leading-none`}>
                              {confLabel} {Math.round(conf * 100)}%
                            </span>
                            {/* Time */}
                            <span className="text-[10px] font-mono text-muted-foreground bg-background px-1.5 py-0.5 rounded">
                              {formatTime(tag.start_time)}
                            </span>
                          </div>
                        </div>

                        {/* Evidence + reasoning */}
                        {(evidence || tag.reasoning) && (
                          <div className="px-2.5 pb-1 space-y-1">
                            {evidence && (
                              <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2" dir="rtl">
                                {evidence}
                              </p>
                            )}
                            {tag.reasoning && (
                              <p className="text-[10px] text-foreground/40 italic leading-relaxed line-clamp-2 border-t border-border/20 pt-1" dir="rtl">
                                <span className="not-italic font-medium text-muted-foreground/50">נימוק: </span>{tag.reasoning}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Accept button */}
                        {!accepted && (
                          <div className="px-2.5 pb-2">
                            <button
                              onClick={e => { e.stopPropagation(); handleAcceptAiTag(tag); }}
                              className="flex items-center gap-1 text-[10px] bg-primary/10 hover:bg-primary/20 text-primary px-2.5 py-1 rounded transition-colors font-medium w-full justify-center"
                            >
                              <Check size={10} /> קבל תגית
                            </button>
                          </div>
                        )}
                        {accepted && (
                          <div className="px-2.5 pb-2 flex items-center gap-1 text-[10px] text-primary/60">
                            <Check size={10} /> נוסף לסשן
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {aiStatus === "completed" && aiTags.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-3">
                <p className="text-sm font-semibold">לא זוהו אירועי SRL</p>
                <p className="text-xs text-muted-foreground">נסה שוב עם סרטון אחר.</p>
              </div>
            )}
          </div>
        )}

        {/* Scrollable body: chips → divider → form */}
        {rightTab !== "AI" && (
        <div className="flex-1 overflow-y-auto">

          {/* Code chips — all visible, grouped by thin category labels */}
          <div className="pb-2">
            {visibleCategories.map(({ category, codes }) => {
              if (codes.length === 0) return null;
              return (
                <div key={category}>
                  <p className="px-4 pt-3 pb-1.5 text-xs font-semibold text-muted-foreground/60 uppercase tracking-widest">
                    {category}
                  </p>
                  <div className="px-3 pb-1 flex flex-wrap gap-1.5">
                    {codes.map(code => (
                      <button
                        key={code.id}
                        onClick={() => toggleCode(code.id)}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setTooltip({ id: code.id, description: (code as typeof code & { description?: string }).description ?? "", x: rect.left + rect.width / 2, y: rect.top - 6 });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all border ${
                          selectedCodes.has(code.id)
                            ? "border-primary/50 bg-primary/10 text-primary ring-1 ring-primary/20"
                            : "border-border bg-secondary/20 text-muted-foreground hover:border-primary/30 hover:text-foreground hover:bg-secondary/40"
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: code.color }} />
                        {code.id}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Divider */}
          <div className="mx-4 my-3 border-t border-border" />

          {/* Annotation form fields */}
          <div className="px-4 pb-4 space-y-4">

            {/* Selected codes badges */}
            {selectedCodes.size > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {[...selectedCodes].map(codeId => {
                  const codeData = PRISM_CODE_LOOKUP[codeId];
                  if (!codeData) return null;
                  return (
                    <div
                      key={codeId}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium"
                      style={{ borderColor: codeData.color + "40", backgroundColor: codeData.color + "15" }}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: codeData.color }} />
                      <span className="font-bold">{codeData.id}</span>
                      <button
                        onClick={() => toggleCode(codeId)}
                        className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors"
                        title="Remove"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">לחץ על קוד למעלה כדי לבחור</p>
            )}

            {/* Time range */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Clock size={12} /> Time Range
              </label>
              {isEmbedMode ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/30 rounded px-2 py-1.5">
                    <Info size={11} className="shrink-0" /> הכנס זמן בפורמט <span className="font-mono mx-0.5">דק:שנ</span> — לדוגמה <span className="font-mono mx-0.5">1:30</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={startTimeText}
                      onChange={(e) => {
                        setStartTimeText(e.target.value);
                        const parsed = parseTimeString(e.target.value);
                        if (parsed !== "") setStartTime(parsed);
                        else if (e.target.value === "") setStartTime("");
                      }}
                      onBlur={() => {
                        if (startTime !== "") setStartTimeText(formatTime(startTime as number));
                      }}
                      placeholder="0:00"
                      className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 font-mono text-sm focus:outline-none focus:border-primary text-center"
                    />
                    <span className="text-muted-foreground text-xs">–</span>
                    <input
                      type="text"
                      value={endTimeText}
                      onChange={(e) => {
                        setEndTimeText(e.target.value);
                        const parsed = parseTimeString(e.target.value);
                        if (parsed !== "") setEndTime(parsed);
                        else if (e.target.value === "") setEndTime("");
                      }}
                      onBlur={() => {
                        if (endTime !== "") setEndTimeText(formatTime(endTime as number));
                      }}
                      placeholder="0:00"
                      className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 font-mono text-sm focus:outline-none focus:border-primary text-center"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={handleSetStartTime}
                    className={`flex-1 py-2 rounded-md font-mono text-sm transition-all border ${
                      startTime !== "" ? "bg-primary/10 border-primary/40 text-primary font-semibold" : "bg-secondary hover:bg-secondary/80 border-border text-muted-foreground"
                    }`}>
                    {startTime === "" ? "Set Start" : formatTime(startTime as number)}
                  </button>
                  <span className="text-muted-foreground text-xs">–</span>
                  <button onClick={handleSetEndTime}
                    className={`flex-1 py-2 rounded-md font-mono text-sm transition-all border ${
                      endTime !== "" ? "bg-primary/10 border-primary/40 text-primary font-semibold" : "bg-secondary hover:bg-secondary/80 border-border text-muted-foreground"
                    }`}>
                    {endTime === "" ? "Set End" : formatTime(endTime as number)}
                  </button>
                </div>
              )}
            </div>

            {/* Confidence */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <ShieldCheck size={12} /> עוצמת התיוג
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: "חלש",   value: 0.33, active: "border-red-500/60 text-red-400 bg-red-500/10" },
                  { label: "בינוני", value: 0.66, active: "border-yellow-500/60 text-yellow-400 bg-yellow-500/10" },
                  { label: "חזק",   value: 1.0,  active: "border-green-500/60 text-green-400 bg-green-500/10" },
                ].map(opt => (
                  <button key={opt.value} type="button" onClick={() => setConfidenceScore(opt.value)}
                    className={`py-2 rounded-md text-sm font-semibold border transition-all ${
                      confidenceScore === opt.value ? `${opt.active} shadow-sm` : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Evidence */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <AlignLeft size={12} /> עדות מהטקסט
              </label>
              <textarea
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
                rows={2}
                placeholder='למשל: "המורה שואלת: בואו נחשוב מה למדנו היום..."'
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
                dir="rtl"
              />
            </div>

            {/* Reasoning */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <AlignLeft size={12} /> נימוק
              </label>
              <textarea
                value={reasoningText}
                onChange={(e) => setReasoningText(e.target.value)}
                rows={3}
                placeholder='למה בחרת בקוד זה? אילו קריטריוני הכרעה הנחו אותך? למשל: "המורה נתנה שם לאסטרטגיה והסבירה מתי להשתמש בה — לכן TDS_META ולא TDS_COG."'
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
                dir="rtl"
              />
            </div>

          </div>
        </div>
        )}

        {/* Sticky bottom: Add Tag button — hidden on AI tab */}
        {rightTab !== "AI" && (
        <div className="shrink-0 p-4 border-t border-border bg-secondary/5">
          <button
            onClick={handleSaveTag}
            disabled={startTime === "" || endTime === "" || selectedCodes.size === 0}
            className="w-full bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground py-2.5 rounded-md font-semibold transition-colors flex justify-center items-center gap-2 text-sm shadow-md shadow-primary/20"
          >
            <Tag size={15} /> Add Tag{selectedCodes.size > 1 ? ` (${selectedCodes.size})` : ""}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}

export default function TaggingMode() {
  return (
    <Suspense>
      <TaggingModeInner />
    </Suspense>
  );
}
