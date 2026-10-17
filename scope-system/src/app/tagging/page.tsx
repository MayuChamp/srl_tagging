"use client";

import React, { useState, useRef, useEffect, useMemo, useId, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { VideoPlayer, type VideoMarker, type Caption } from "@/components/video/VideoPlayer";
import {
  Save, Tag, Clock, AlertTriangle, SearchX,
  FolderOpen, Download, Upload, Trash2, Library, X, Video,
  Search, RotateCcw, ChevronDown, PlayCircle, Captions, FileSpreadsheet,
  Pencil, Check, Play, Bot, Sparkles, CheckCheck, Mic, FileText,
  SkipBack, SkipForward, Loader2, ArrowUpRight,
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase/client";

interface LibraryVideo {
  id: string;
  title: string | null;
  storage_path: string;
  duration_seconds: number | null;
  created_at: string | null;
  folder_path: string | null;
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

interface AiEvent {
  key: string;
  ids: string[];
  code_ids: string[];
  start_time: number;
  end_time: number;
  evidence_text: string | null;
  reasoning: string | null;
  confidence_score: number | null;
  tdsMeta?: StoredTdsMeta;
}

interface AiTdsMetaRow {
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
  mo_score: number | null;
  mo_components: string[] | null;
  tds_reasoning: string | null;
}

// ── TDS Meta-Coding layer ────────────────────────────────────────────────────

const META_INTRO_TYPES = [
  'עצירה לחשיבה',
  'שיום אסטרטגיה',
  'הזמנה לבדיקה',
  'הזמנה לבחירה',
  'רפלקציה',
  'אחר',
] as const;
type MetaIntroType = typeof META_INTRO_TYPES[number] | '';

interface TdsMetaForm {
  basicClass: 'COG' | 'OVERLAP' | 'META' | null;
  metaIntro: boolean;
  metaIntroType: MetaIntroType;
  stgNaming: boolean;
  stgWhen: boolean;
  stgHow: boolean;
  stgWhy: boolean;
  stgWhenNot: boolean;
  tdReasoning: string;
}

interface StoredTdsMeta extends TdsMetaForm {
  metaStgScore: number;
  missedMeta: 'none' | 'partial' | 'full';
  moScore: number;
  moComponents: string[];
}

const EMPTY_TDS_META: TdsMetaForm = {
  basicClass: null,
  metaIntro: false,
  metaIntroType: '',
  stgNaming: false,
  stgWhen: false,
  stgHow: false,
  stgWhy: false,
  stgWhenNot: false,
  tdReasoning: '',
};

function computeTdsMeta(f: TdsMetaForm): StoredTdsMeta {
  const score =
    (f.stgNaming ? 1 : 0) +
    (f.stgWhen ? 1 : 0) +
    (f.stgHow ? 1 : 0) +
    (f.stgWhy ? 1 : 0) +
    (f.stgWhenNot ? 1 : 0);

  let missedMeta: 'none' | 'partial' | 'full' = 'none';
  let moScore = 0;
  const moComponents: string[] = [];

  if (f.metaIntro) {
    if (score === 0) {
      missedMeta = 'full';
      moScore = 5;
      moComponents.push('שיום', 'מתי להשתמש', 'איך להשתמש', 'למה להשתמש', 'מתי לא להשתמש');
    } else if (score < 5) {
      missedMeta = 'partial';
      moScore = 5 - score;
      if (!f.stgNaming) moComponents.push('שיום');
      if (!f.stgWhen) moComponents.push('מתי להשתמש');
      if (!f.stgHow) moComponents.push('איך להשתמש');
      if (!f.stgWhy) moComponents.push('למה להשתמש');
      if (!f.stgWhenNot) moComponents.push('מתי לא להשתמש');
    }
  }

  return { ...f, metaStgScore: score, missedMeta, moScore, moComponents };
}

// True if the user entered anything meaningful, even without clicking a COG/OVERLAP/META button
function hasTdsMetaContent(f: TdsMetaForm): boolean {
  return !!f.basicClass || f.metaIntro || f.stgNaming || f.stgWhen || f.stgHow || f.stgWhy || f.stgWhenNot || f.tdReasoning.trim().length > 0;
}

function aiTdsRowToStoredMeta(row: AiTdsMetaRow): StoredTdsMeta {
  const score = row.stg_naming + row.stg_when + row.stg_how + row.stg_why + row.stg_when_not;
  return {
    basicClass: (row.basic_class as 'COG' | 'OVERLAP' | 'META' | null) ?? null,
    metaIntro: row.meta_intro,
    metaIntroType: (row.meta_intro_type ?? '') as MetaIntroType,
    stgNaming: !!row.stg_naming,
    stgWhen: !!row.stg_when,
    stgHow: !!row.stg_how,
    stgWhy: !!row.stg_why,
    stgWhenNot: !!row.stg_when_not,
    tdReasoning: row.tds_reasoning ?? '',
    metaStgScore: score,
    missedMeta: (row.missed_meta as 'none' | 'partial' | 'full') ?? 'none',
    moScore: row.mo_score ?? 0,
    moComponents: row.mo_components ?? [],
  };
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

// ── STG item definitions ────────────────────────────────────────────────────
const STG_ITEMS = [
  { key: 'stgNaming'  as keyof TdsMetaForm, label: 'שיום',           shortcut: '1', tip: '"זו אסטרטגיה של השוואה" / "עכשיו השתמשנו בשיטת הצבה"' },
  { key: 'stgWhen'    as keyof TdsMetaForm, label: 'מתי להשתמש',    shortcut: '2', tip: '"כדאי להשתמש כשיש שני מקרים ורוצים להבין מה שונה ביניהם"' },
  { key: 'stgHow'     as keyof TdsMetaForm, label: 'איך להשתמש',    shortcut: '3', tip: '"קודם מזהים מטרה, אח״כ בוחרים דרך, ובסוף בודקים"' },
  { key: 'stgWhy'     as keyof TdsMetaForm, label: 'למה להשתמש',    shortcut: '4', tip: '"עוזרת לא להתבלבל בין פרטים חשובים לפחות חשובים"' },
  { key: 'stgWhenNot' as keyof TdsMetaForm, label: 'מתי לא להשתמש', shortcut: '5', tip: '"אם אין שני דברים להשוות — לא מתאים"' },
] as const;

// ── Presentational tone helpers (class names only — no data logic) ─────────
// Tinted text that stays readable on its own tone tint; pair with a tone-* class.
const TONE_TEXT = "text-[color:color-mix(in_oklab,var(--tone)_80%,var(--foreground))]";

// Strength / confidence → tone. Same 0.8 / 0.5 thresholds as the labels and the Excel export.
function strengthTone(conf: number): string {
  return conf >= 0.8 ? "tone-success" : conf >= 0.5 ? "tone-warning" : "tone-danger";
}

// TDS basic class → tone: META success · OVERLAP warning · otherwise (COG) info.
function basicClassTone(cls: string | null | undefined): string {
  return cls === "META" ? "tone-success" : cls === "OVERLAP" ? "tone-warning" : "tone-info";
}

// META_STG score → tone: 0 neutral · 1 danger · 2–3 warning · 4–5 success.
function scoreTone(n: number): string {
  return n >= 4 ? "tone-success" : n >= 2 ? "tone-warning" : n >= 1 ? "tone-danger" : "tone-neutral";
}

// Sub-labels inside the TDS box (Hebrew: never uppercase / tracked).
const TDS_SUBLABEL = "text-xs font-semibold text-secondary-foreground";

// Numbered form-step labels in the new-tag form (a .step-num precedes the existing label text).
// Same size/weight as the TdsMetaPanel step-5 title so the five steps read as one series.
const STEP_LABEL = "flex items-center gap-2 text-sm font-semibold text-foreground";

// ── TdsMetaPanel ────────────────────────────────────────────────────────────
function TdsMetaPanel({
  form,
  onChange,
  shortcutsActive = false,
  step,
}: {
  form: TdsMetaForm;
  onChange: React.Dispatch<React.SetStateAction<TdsMetaForm>>;
  /** Presentational: true for the panel the c/o/m + 1–5 keyboard listener currently targets. */
  shortcutsActive?: boolean;
  /** Presentational: form step number drawn before the title (new-tag form only). */
  step?: number;
}) {
  const computed = computeTdsMeta(form);
  const [hoveredTip, setHoveredTip] = useState<string | null>(null);
  const reasoningId = useId();
  const introTypeId = useId();

  // Suggest (never force) a basicClass from the STG pattern — naming-only implies OVERLAP,
  // any other component present implies META. The user must click to accept.
  const suggestedBasicClass = useMemo((): 'COG' | 'OVERLAP' | 'META' | null => {
    const { stgNaming, stgWhen, stgHow, stgWhy, stgWhenNot } = form;
    const hasNonNaming = stgWhen || stgHow || stgWhy || stgWhenNot;
    if (stgNaming && !hasNonNaming) return 'OVERLAP';
    if (hasNonNaming) return 'META';
    return null;
  }, [form]);

  return (
    <div dir="rtl" lang="he" className="space-y-2.5">

      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 min-h-7">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground min-w-0">
          {step !== undefined
            ? <span className="step-num" aria-hidden="true">{step}</span>
            : <span className="size-2 rounded-full bg-primary shrink-0" aria-hidden="true" />}
          <bdi>TDS Meta-Coding</bdi>
        </h4>
        {shortcutsActive && (
          <span className="badge tone-primary">⌨ פעיל</span>
        )}
        {suggestedBasicClass && form.basicClass !== suggestedBasicClass && (
          <button
            onClick={() => onChange(f => ({ ...f, basicClass: suggestedBasicClass }))}
            title="החילי סיווג מוצע לפי רכיבי STG"
            className="btn btn-soft btn-sm rounded-full ms-auto shrink-0"
          >
            <Sparkles size={12} aria-hidden="true" />
            הצעה: <bdi className="font-mono">{suggestedBasicClass}</bdi>
          </button>
        )}
      </div>

      {/* Body — tinted box with a hairline; the border turns terracotta while the shortcuts target this panel */}
      <div className={`space-y-4 rounded-2xl border bg-accent p-3.5 transition-colors ${shortcutsActive ? "border-primary/45" : "border-border"}`}>

        {/* META_INTRO */}
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <label htmlFor={form.metaIntro ? introTypeId : undefined} className="font-mono text-xs font-semibold text-secondary-foreground">
              <bdi>META_INTRO</bdi>
            </label>
            <div role="group" aria-label="META_INTRO" className="segmented w-36">
              {([true, false] as const).map(val => (
                <button key={String(val)} type="button"
                  aria-pressed={form.metaIntro === val}
                  onClick={() => onChange(f => ({ ...f, metaIntro: val, metaIntroType: val ? f.metaIntroType : '' }))}
                  className="segmented-item flex-1"
                >
                  {val ? 'כן' : 'לא'}
                </button>
              ))}
            </div>
          </div>
          {form.metaIntro && (
            <select
              id={introTypeId}
              value={form.metaIntroType}
              onChange={e => onChange(f => ({ ...f, metaIntroType: e.target.value as MetaIntroType }))}
              className="field field-sm"
              dir="rtl"
            >
              <option value="">בחרי סוג META_INTRO</option>
              {META_INTRO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>

        {/* META_STG components */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className={TDS_SUBLABEL}>
              רכיבי META_STG
            </label>
            <span className="kbd"><bdi>1–5</bdi></span>
            <span className={`badge font-mono ms-auto ${scoreTone(computed.metaStgScore)}`}>
              <bdi>{computed.metaStgScore}/5</bdi>
            </span>
          </div>

          {/* Progress bar */}
          <div dir="ltr" className="grid grid-cols-5 gap-1" aria-hidden="true">
            {[0,1,2,3,4].map(i => (
              <div key={i} className={`h-1.5 rounded-full transition-colors ${
                i < computed.metaStgScore
                  ? `${scoreTone(computed.metaStgScore)} bg-[var(--tone)]`
                  : 'bg-secondary'
              }`} />
            ))}
          </div>

          {/* STG rows + tip: the tip is absolutely positioned so hovering never shifts the blocks below */}
          <div className="relative">
            <div className="space-y-0.5">
              {STG_ITEMS.map((item, idx) => {
                const checked = !!form[item.key];
                const isNamingOnly = item.key === 'stgNaming' && form.stgNaming && !form.stgWhen && !form.stgHow && !form.stgWhy && !form.stgWhenNot;
                return (
                  <React.Fragment key={item.key}>
                    {idx === 1 && (
                      <div className="flex items-center gap-2 px-1 pt-1.5 pb-0.5">
                        <span className="text-2xs font-semibold text-muted-foreground">הסבר</span>
                        <div className="flex-1 border-t border-border" />
                      </div>
                    )}
                    <label
                      className={`flex items-center gap-2.5 min-h-9 px-2.5 rounded-lg cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/40 ${
                        checked ? 'bg-primary/8' : 'hover:bg-secondary/70'
                      }`}
                    >
                      <input type="checkbox" checked={checked}
                        onChange={e => onChange(f => ({ ...f, [item.key]: e.target.checked }))}
                        className="size-4 shrink-0 cursor-pointer"
                      />
                      <span className={`text-sm min-w-0 ${checked ? 'text-foreground font-medium' : 'text-secondary-foreground'}`}>
                        {item.label}
                      </span>
                      <kbd className="kbd shrink-0" aria-hidden="true">{item.shortcut}</kbd>
                      {isNamingOnly && (
                        <span className="badge tone-warning shrink-0"> ← בלעדי = OVERLAP</span>
                      )}
                      <span className="flex-1" aria-hidden="true" />
                      <button type="button"
                        aria-label={`דוגמה: ${item.label}`}
                        onMouseEnter={() => setHoveredTip(item.tip)}
                        onMouseLeave={() => setHoveredTip(null)}
                        onFocus={() => setHoveredTip(item.tip)}
                        onBlur={() => setHoveredTip(null)}
                        onClick={e => e.preventDefault()}
                        className="icon-btn icon-btn-sm text-sm leading-none"
                      >ⓘ</button>
                      <span className={`w-3.5 shrink-0 text-center font-mono text-xs tabular-nums ${checked ? 'text-success font-semibold' : 'text-muted-foreground'}`}>
                        {checked ? '1' : '0'}
                      </span>
                    </label>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Tooltip */}
            {hoveredTip && (
              <div role="tooltip" dir="rtl" className="tooltip absolute inset-x-0 top-full mt-1 z-20">
                {hoveredTip}
              </div>
            )}
          </div>
        </div>

        {/* Basic Classification */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className={TDS_SUBLABEL}>סיווג בסיסי</label>
            <span className="kbd"><bdi>c/o/m</bdi></span>
          </div>
          <div dir="ltr" role="group" aria-label="סיווג בסיסי" className="grid grid-cols-3 gap-1.5">
            {(['COG', 'OVERLAP', 'META'] as const).map(cls => {
              const active = form.basicClass === cls;
              return (
                <button key={cls} type="button"
                  aria-pressed={active}
                  onClick={() => onChange(f => ({ ...f, basicClass: cls }))}
                  className={`inline-flex h-10 items-center justify-center gap-2 rounded-[.625rem] font-mono text-xs font-semibold transition-colors ${
                    active
                      ? `${basicClassTone(cls)} ${TONE_TEXT} bg-[color:color-mix(in_oklab,var(--tone)_12%,var(--card))] shadow-[inset_0_0_0_1.5px_var(--tone)]`
                      : 'bg-card text-secondary-foreground shadow-[inset_0_0_0_1px_var(--input)] hover:bg-secondary/60 hover:text-foreground'
                  }`}
                >
                  {cls}
                  <kbd className="kbd" aria-hidden="true">{cls[0]}</kbd>
                </button>
              );
            })}
          </div>
        </div>

        {/* Computed result */}
        {(form.basicClass || computed.missedMeta !== 'none') && (
          <div className="rounded-xl border border-border bg-card p-3 space-y-2 text-[13px]" dir="rtl">
            {form.basicClass && (
              <div className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-muted-foreground">סיווג:</span>
                <span className={`badge font-mono ${basicClassTone(form.basicClass)}`}><bdi>{form.basicClass}</bdi></span>
              </div>
            )}
            {computed.missedMeta !== 'none' && (
              <>
                <div className="flex items-center gap-2">
                  <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground"><bdi>MISSED_META:</bdi></span>
                  <span className={`badge ${computed.missedMeta === 'full' ? 'tone-danger' : 'tone-warning'}`}>{computed.missedMeta === 'full' ? 'מלא' : 'חלקי'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground"><bdi>MO_SCORE:</bdi></span>
                  <span className={`tone-mo ${TONE_TEXT} font-mono font-semibold tabular-nums`}>{computed.moScore}</span>
                </div>
                {computed.moComponents.length > 0 && (
                  <div className="flex items-baseline gap-2">
                    <span className="w-28 shrink-0 text-muted-foreground">רכיבים מוחמצים:</span>
                    <div className="flex flex-wrap gap-1">
                      {computed.moComponents.map(c => (
                        <span key={c} className="badge tone-mo">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* TDS Reasoning */}
        <div className="space-y-1.5">
          <label htmlFor={reasoningId} className={`${TDS_SUBLABEL} block`}>נימוק TDS</label>
          <textarea
            id={reasoningId}
            value={form.tdReasoning}
            onChange={e => onChange(f => ({ ...f, tdReasoning: e.target.value }))}
            rows={2}
            dir="rtl"
            placeholder="למה בחרת בסיווג זה? מה הצדיק (או לא הצדיק) META מלא?"
            className="field text-[13px] resize-none"
          />
        </div>

      </div>
    </div>
  );
}

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
  const [libraryViewMode, setLibraryViewMode] = useState<"recent" | "folders">("recent");

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
  const [editTdsMeta, setEditTdsMeta] = useState<TdsMetaForm | null>(null);

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
  const [acceptedAiKeys, setAcceptedAiKeys] = useState<Set<string>>(() => new Set());
  const [aiTdsMeta, setAiTdsMeta] = useState<Map<string, StoredTdsMeta>>(new Map());

  // Group flat tag rows into events (one card per timestamp)
  const aiEvents = useMemo<AiEvent[]>(() => {
    const map = new Map<string, AiEvent>();
    for (const tag of aiTags) {
      const key = `${tag.start_time}|${tag.end_time}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          ids: [],
          code_ids: [],
          start_time: tag.start_time,
          end_time: tag.end_time,
          evidence_text: tag.evidence_text,
          reasoning: tag.reasoning,
          confidence_score: tag.confidence_score,
          tdsMeta: aiTdsMeta.get(key),
        });
      }
      const ev = map.get(key)!;
      ev.ids.push(tag.id);
      ev.code_ids.push(tag.code_id);
    }
    return [...map.values()];
  }, [aiTags, aiTdsMeta]);
  const [processingStartedAt, setProcessingStartedAt] = useState<number | null>(null);

  // TDS Meta-Coding state

  const [tdsMetaForm, setTdsMetaForm] = useState<TdsMetaForm>({ ...EMPTY_TDS_META });
  const [markerTdsMeta, setMarkerTdsMeta] = useState<Map<string, StoredTdsMeta>>(new Map());

  const hasTdsCode = useMemo(
    () => [...selectedCodes].some(c => c.startsWith('TDS_')),
    [selectedCodes]
  );

  const seekToTime = (time: number) => {
    setSeekRequest(prev => ({ time, seq: (prev?.seq ?? 0) + 1 }));
  };

  const applyAiTdsMeta = (rows: AiTdsMetaRow[]) => {
    const m = new Map<string, StoredTdsMeta>();
    for (const row of rows) {
      m.set(`${row.start_time}|${row.end_time}`, aiTdsRowToStoredMeta(row));
    }
    setAiTdsMeta(m);
  };

  // Load existing AI analysis when a library video is selected
  useEffect(() => {
    if (!loadedVideoId) {
      setAiStatus("idle");
      setAiTags([]);
      setAiTdsMeta(new Map());
      setAcceptedAiKeys(new Set());
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
          applyAiTdsMeta(data.tds_meta ?? []);
        } else if (data.status === "processing" || data.status === "pending") {
          setAiStatus("processing");
        }
      } catch {
        // network error — keep idle
      }
    })();
  }, [loadedVideoId]); // eslint-disable-line react-hooks/exhaustive-deps

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
          applyAiTdsMeta(data.tds_meta ?? []);
          setRightTab("AI");
        } else if (data.status === "failed") {
          setAiStatus("failed");
        }
      } catch { /* keep polling */ }
    }, 5000);
    return () => clearInterval(id);
  }, [aiStatus, loadedVideoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts for TDS meta coding — target whichever TDS form is actually
  // open: the marker being edited (editTdsMeta) takes precedence over the new-tag draft.
  const isEditingTdsMeta = editingMarkerId !== null && editTdsMeta !== null;
  useEffect(() => {
    if (rightTab === 'AI' || (!hasTdsCode && !isEditingTdsMeta)) return;
    const setter = isEditingTdsMeta
      ? (setEditTdsMeta as React.Dispatch<React.SetStateAction<TdsMetaForm>>)
      : setTdsMetaForm;
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      switch (e.key) {
        case 'c': case 'C': setter(f => ({ ...f, basicClass: 'COG' }));     break;
        case 'o': case 'O': setter(f => ({ ...f, basicClass: 'OVERLAP' })); break;
        case 'm': case 'M': setter(f => ({ ...f, basicClass: 'META' }));    break;
        case '1': setter(f => ({ ...f, stgNaming:  !f.stgNaming }));  break;
        case '2': setter(f => ({ ...f, stgWhen:    !f.stgWhen }));    break;
        case '3': setter(f => ({ ...f, stgHow:     !f.stgHow }));     break;
        case '4': setter(f => ({ ...f, stgWhy:     !f.stgWhy }));     break;
        case '5': setter(f => ({ ...f, stgWhenNot: !f.stgWhenNot })); break;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [hasTdsCode, rightTab, isEditingTdsMeta]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTriggerAnalysis = async () => {
    if (!loadedVideoId) return;
    setAiStatus("processing");
    setAiTags([]);
    setAcceptedAiKeys(new Set());
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

  const handleAcceptAiEvent = (event: AiEvent) => {
    const newMarker: VideoMarker = {
      id: crypto.randomUUID(),
      startTime: event.start_time,
      endTime: event.end_time,
      label: event.code_ids[0],
      labels: event.code_ids,
      color: CODE_COLORS[event.code_ids[0]] ?? "#6366f1",
      colors: event.code_ids.map(id => CODE_COLORS[id] ?? "#6366f1"),
      evidence: event.evidence_text ?? undefined,
      reasoning: event.reasoning ?? undefined,
      confidence: event.confidence_score ?? undefined,
    };
    setMarkers(prev => [...prev, newMarker]);
    setAcceptedAiKeys(prev => new Set([...prev, event.key]));
    if (event.tdsMeta) {
      setMarkerTdsMeta(prev => { const n = new Map(prev); n.set(newMarker.id, event.tdsMeta!); return n; });
    }
  };

  const handleAcceptAllAiEvents = () => {
    const pending = aiEvents.filter(e => !acceptedAiKeys.has(e.key));
    const newMarkers: VideoMarker[] = pending.map(event => ({
      id: crypto.randomUUID(),
      startTime: event.start_time,
      endTime: event.end_time,
      label: event.code_ids[0],
      labels: event.code_ids,
      color: CODE_COLORS[event.code_ids[0]] ?? "#6366f1",
      colors: event.code_ids.map(id => CODE_COLORS[id] ?? "#6366f1"),
      evidence: event.evidence_text ?? undefined,
      reasoning: event.reasoning ?? undefined,
      confidence: event.confidence_score ?? undefined,
    }));
    setMarkers(prev => [...prev, ...newMarkers]);
    setAcceptedAiKeys(prev => new Set([...prev, ...pending.map(e => e.key)]));
    if (pending.some(e => e.tdsMeta)) {
      setMarkerTdsMeta(prev => {
        const n = new Map(prev);
        pending.forEach((event, i) => { if (event.tdsMeta) n.set(newMarkers[i].id, event.tdsMeta!); });
        return n;
      });
    }
  };

  const handleEditStart = (m: VideoMarker) => {
    setEditingMarkerId(m.id);
    setEditForm({
      startTime: m.startTime,
      endTime: m.endTime ?? m.startTime,
      evidence: m.evidence ?? "",
      reasoning: m.reasoning ?? "",
    });
    const existingMeta = markerTdsMeta.get(m.id);
    const isTdsMarker = (m.labels ?? [m.label]).some(l => l.startsWith('TDS_'));
    setEditTdsMeta(existingMeta ? { ...existingMeta } : isTdsMarker ? { ...EMPTY_TDS_META } : null);
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
    if (editTdsMeta) {
      setMarkerTdsMeta(prev => {
        const n = new Map(prev);
        n.set(id, computeTdsMeta(editTdsMeta));
        return n;
      });
    }
    setEditTdsMeta(null);
    setEditingMarkerId(null);
    setEditForm(null);
  };

  const handleRemoveMarker = (id: string) => {
    setMarkers(prev => prev.filter(m => m.id !== id));
    setMarkerTdsMeta(prev => { const n = new Map(prev); n.delete(id); return n; });
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

  // Restore session from ?session=<id> or video from ?video=<id> URL param
  useEffect(() => {
    const sessionId = searchParams.get("session");
    const videoParam = searchParams.get("video") || searchParams.get("videoId");

    if (sessionId) {
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

        // Load tds_meta records and map them to restored markers by (start, end)
        const { data: tdsMetaData } = await supabase
          .from("tds_meta")
          .select("*")
          .eq("analysis_id", sessionId);

        const tdsMetaByTime = new Map<string, StoredTdsMeta>();
        for (const row of (tdsMetaData || [])) {
          tdsMetaByTime.set(`${row.start_time}|${row.end_time}`, {
            basicClass: row.basic_class,
            metaIntro: row.meta_intro,
            metaIntroType: row.meta_intro_type ?? '',
            stgNaming: row.stg_naming === 1,
            stgWhen: row.stg_when === 1,
            stgHow: row.stg_how === 1,
            stgWhy: row.stg_why === 1,
            stgWhenNot: row.stg_when_not === 1,
            tdReasoning: row.tds_reasoning ?? '',
            metaStgScore: (row.stg_naming + row.stg_when + row.stg_how + row.stg_why + row.stg_when_not),
            missedMeta: row.missed_meta ?? 'none',
            moScore: row.mo_score ?? 0,
            moComponents: row.mo_components ?? [],
          });
        }
        const restoredTdsMeta = new Map<string, StoredTdsMeta>();
        for (const m of restoredMarkers) {
          const meta = tdsMetaByTime.get(`${m.startTime}|${m.endTime}`);
          if (meta) restoredTdsMeta.set(m.id, meta);
        }
        setMarkerTdsMeta(restoredTdsMeta);

        setMarkers(restoredMarkers);
        setSessionName(analysis.summary_metrics?.session_name || "");
        if (Array.isArray(analysis.summary_metrics?.captions)) {
          setCaptions(analysis.summary_metrics.captions);
        }
        setResumedSessionId(sessionId);
        if (videoUrl) {
          const videoTitle: string | null = (analysis.videos as { title: string } | null)?.title || null;
          setVideoInputUrl(videoTitle || videoUrl);
          setIsEmbedMode(false);
          setLoadedVideoId(videoId);
          setLoadedUrl(videoUrl);
        }
        setIsLoadingSession(false);
      })();
    } else if (videoParam) {
      setIsLoadingSession(true);
      (async () => {
        const { data: video } = await supabase
          .from("videos")
          .select("*")
          .eq("id", videoParam)
          .maybeSingle();

        if (video) {
          setLoadedVideoId(video.id);
          setVideoInputUrl(video.title || video.storage_path);
          setIsEmbedMode(false);
          setLoadedUrl(video.storage_path);
          setSessionName(video.title ? `${video.title}` : "");
        }
        setIsLoadingSession(false);
      })();
    }
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

  const handleSetStartTime = () => { setStartTime(currentTime); setStartTimeText(formatTime(currentTime)); };
  const handleSetEndTime = () => { setEndTime(currentTime); setEndTimeText(formatTime(currentTime)); };

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
    // Capture tds_meta for this marker before state resets
    const newTdsMeta = new Map(markerTdsMeta);
    if (hasTdsCode && hasTdsMetaContent(tdsMetaForm)) {
      newTdsMeta.set(newMarker.id, computeTdsMeta(tdsMetaForm));
    }
    setMarkerTdsMeta(newTdsMeta);

    setMarkers(prev => {
      const newMarkers = [...prev, newMarker];
      // Auto-save when a new tag is made
      setTimeout(() => handleSaveSessionToSupabase(newMarkers, newTdsMeta), 0);
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
    setTdsMetaForm({ ...EMPTY_TDS_META });
  };

  const handleSaveSessionToSupabase = async (
    overrideMarkers?: VideoMarker[],
    overrideTdsMeta?: Map<string, StoredTdsMeta>
  ) => {
    const markersToSave = overrideMarkers || markers;
    const tdsMetaToUse = overrideTdsMeta ?? markerTdsMeta;
    if (markersToSave.length === 0) return alert("No tags to save in this session.");
    setIsSavingSession(true);
    try {
      const name = sessionName.trim() || `session_${new Date().toISOString().slice(0, 10)}`;
      let analysisId: string;

      const captionPayload = captions.length > 0 ? captions : undefined;

      if (resumedSessionId) {
        const { error } = await supabase
          .from("analyses")
          .update({
            video_id: loadedVideoId || null,
            summary_metrics: { session_name: name, video_url: loadedVideoId ? null : loadedUrl, captions: captionPayload },
          })
          .eq("id", resumedSessionId);
        if (error) throw error;
        await supabase.from("tags").delete().eq("analysis_id", resumedSessionId);
        await supabase.from("tds_meta").delete().eq("analysis_id", resumedSessionId);
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

      // Save TDS meta rows
      const tdsRows = markersToSave.flatMap(m => {
        const meta = tdsMetaToUse.get(m.id);
        if (!meta) return [];
        return [{
          analysis_id: analysisId,
          start_time: m.startTime,
          end_time: m.endTime ?? m.startTime,
          basic_class: meta.basicClass,
          meta_intro: meta.metaIntro,
          meta_intro_type: meta.metaIntroType || null,
          stg_naming: meta.stgNaming ? 1 : 0,
          stg_when: meta.stgWhen ? 1 : 0,
          stg_how: meta.stgHow ? 1 : 0,
          stg_why: meta.stgWhy ? 1 : 0,
          stg_when_not: meta.stgWhenNot ? 1 : 0,
          missed_meta: meta.missedMeta,
          mo_score: meta.moScore,
          mo_components: meta.moComponents,
          tds_reasoning: meta.tdReasoning || null,
        }];
      });
      if (tdsRows.length > 0) {
        const { error: tdsError } = await supabase.from("tds_meta").insert(tdsRows);
        if (tdsError) throw tdsError;
      }

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
    const tagsWithTdsMeta = markers.map(m => {
      const tdsMeta = markerTdsMeta.get(m.id);
      return tdsMeta ? { ...m, tdsMeta } : m;
    });
    const session = { sessionName: name, videoUrl: loadedUrl, savedAt: new Date().toISOString(), tags: tagsWithTdsMeta, captions: captions.length > 0 ? captions : undefined };
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

    const rows = markers.map((m, i) => {
      const tds = markerTdsMeta.get(m.id);
      return {
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
        "Reasoning (נימוק)": m.reasoning || "",
        // TDS Meta columns
        "TDS Class":          tds?.basicClass ?? "",
        "META_INTRO":         tds ? (tds.metaIntro ? "כן" : "לא") : "",
        "META_INTRO Type":    tds?.metaIntroType ?? "",
        "שיום":               tds !== undefined ? (tds.stgNaming ? 1 : 0) : "",
        "מתי להשתמש":        tds !== undefined ? (tds.stgWhen ? 1 : 0) : "",
        "איך להשתמש":        tds !== undefined ? (tds.stgHow ? 1 : 0) : "",
        "למה להשתמש":        tds !== undefined ? (tds.stgWhy ? 1 : 0) : "",
        "מתי לא להשתמש":    tds !== undefined ? (tds.stgWhenNot ? 1 : 0) : "",
        "META_STG Score":     tds?.metaStgScore ?? "",
        "MISSED_META":        tds ? (tds.missedMeta === 'none' ? 'לא' : tds.missedMeta === 'partial' ? 'חלקי' : 'כן') : "",
        "MO_SCORE":           tds?.moScore ?? "",
        "MO Components":      tds?.moComponents?.join(", ") ?? "",
        "TDS Reasoning":      tds?.tdReasoning ?? "",
      };
    });

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
      { wch: 50 },  // Reasoning (נימוק)
      { wch: 10 },  // TDS Class
      { wch: 12 },  // META_INTRO
      { wch: 18 },  // META_INTRO Type
      { wch: 8 },   // שיום
      { wch: 14 },  // מתי להשתמש
      { wch: 14 },  // איך להשתמש
      { wch: 14 },  // למה להשתמש
      { wch: 16 },  // מתי לא להשתמש
      { wch: 14 },  // META_STG Score
      { wch: 14 },  // MISSED_META
      { wch: 10 },  // MO_SCORE
      { wch: 40 },  // MO Components
      { wch: 50 },  // TDS Reasoning
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
        const importedTdsMeta = new Map<string, StoredTdsMeta>();
        for (const tag of session.tags) {
          if (tag?.tdsMeta) importedTdsMeta.set(tag.id, tag.tdsMeta as StoredTdsMeta);
        }
        setMarkerTdsMeta(importedTdsMeta);
        setResumedSessionId(null);
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
    setMarkerTdsMeta(new Map());
    setSessionName("");
  };

  const handleOpenVideoBrowser = async () => {
    setShowVideoBrowser(true);
    setLoadingLibrary(true);
    const { data, error } = await supabase
      .from("videos")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Failed to load video library:", error);
    }
    setLibraryVideos((data as LibraryVideo[]) || []);
    setLoadingLibrary(false);
  };

  const handleSelectLibraryVideo = (video: LibraryVideo) => {
    setShowVideoBrowser(false);
    setLibrarySearch("");
    setLoadedVideoId(video.id);
    setVideoInputUrl(video.title || video.storage_path);
    setIsEmbedMode(false);
    setLoadedUrl(video.storage_path);
    if (!sessionName) {
      setSessionName(video.title || "");
    }
  };

  const filteredLibrary = librarySearch.trim()
    ? libraryVideos.filter(v => (v.title || "").toLowerCase().includes(librarySearch.toLowerCase()))
    : libraryVideos;

  const groupedLibrary = useMemo(() => {
    const groups = new Map<string, LibraryVideo[]>();
    for (const video of filteredLibrary) {
      const folder = video.folder_path || "";
      if (!groups.has(folder)) groups.set(folder, []);
      groups.get(folder)!.push(video);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        if (!a) return 1;
        if (!b) return -1;
        return a.localeCompare(b);
      })
      .map(([folder, vids]) => ({
        folder,
        videos: vids.slice().sort((a, b) => (a.title || "").localeCompare(b.title || "")),
      }));
  }, [filteredLibrary]);

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
      {tooltip && tooltip.description && (() => {
        // Display-only clamp so a 16rem tooltip never leaves the viewport; the arrow keeps pointing at the chip.
        const left = Math.min(Math.max(tooltip.x, 136), window.innerWidth - 136);
        return (
          <div
            className="fixed z-[999] pointer-events-none"
            style={{ left, top: tooltip.y, transform: "translate(-50%, -100%)" }}
          >
            <div role="tooltip" className="tooltip w-64">
              <p className="font-mono text-xs font-semibold text-popover-foreground mb-1" dir="ltr">{tooltip.id}</p>
              <p dir="auto" className="text-secondary-foreground leading-relaxed">{tooltip.description}</p>
            </div>
            <div
              className="tooltip-arrow absolute -bottom-1.5 -translate-x-1/2"
              style={{ left: `calc(50% + ${tooltip.x - left}px)` }}
            />
          </div>
        );
      })()}

      {/* Full-screen drag overlay — prevents mouse events from being captured by video/iframe */}
      {activeDrag && (
        <div
          className="fixed inset-0 z-[200]"
          style={{ cursor: activeDrag === "h" ? "col-resize" : "row-resize" }}
        />
      )}

      {/* ── Video Browser Modal ─────────────────────────────────────────────── */}
      {showVideoBrowser && (
        <div className="modal-root">
          <div className="modal-backdrop" onClick={() => setShowVideoBrowser(false)} />
          <div
            role="dialog" aria-modal="true" aria-labelledby="library-title"
            className="modal-panel modal-panel-lg flex flex-col max-h-[80vh] overflow-hidden"
          >
            <div className="modal-header">
              <h2 id="library-title" className="modal-title">
                <Library size={18} className="text-primary" /> Browse Video Library
              </h2>
              <button onClick={() => setShowVideoBrowser(false)} aria-label="Close" className="icon-btn">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 border-b border-border space-y-3">
              <div className="relative">
                <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text" value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  placeholder="Search videos..."
                  aria-label="Search videos"
                  className="field field-sm ps-8"
                />
              </div>
              <div className="segmented">
                <button onClick={() => setLibraryViewMode("recent")}
                  aria-pressed={libraryViewMode === "recent"}
                  className="segmented-item">
                  Recent
                </button>
                <button onClick={() => setLibraryViewMode("folders")}
                  aria-pressed={libraryViewMode === "folders"}
                  className="segmented-item">
                  <FolderOpen size={12} /> By Folder
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-2">
              {loadingLibrary ? (
                <div role="status" aria-busy="true" className="space-y-2 p-1">
                  <p className="px-1 text-xs text-muted-foreground">Loading...</p>
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="h-14 rounded-lg shimmer" />
                  ))}
                </div>
              ) : filteredLibrary.length === 0 ? (
                <div className="empty-state empty-state-compact py-14">
                  <div className="empty-state-icon">
                    <Video size={22} />
                  </div>
                  <p className="text-sm text-muted-foreground">{librarySearch ? "No videos match your search." : "No videos in library yet."}</p>
                </div>
              ) : libraryViewMode === "folders" ? (
                groupedLibrary.map(({ folder, videos }) => (
                  <div key={folder || "__uncategorized__"} className="mb-3">
                    <p className="sticky top-0 z-10 bg-card/95 section-label flex items-center gap-1.5 px-2 py-1.5">
                      <FolderOpen size={12} /> <bdi>{folder || "Uncategorized"}</bdi>
                    </p>
                    {videos.map(video => (
                      <button key={video.id} onClick={() => handleSelectLibraryVideo(video)}
                        className="group w-full flex items-center gap-4 p-3 rounded-lg hover:bg-secondary transition-colors text-start"
                      >
                        <div className="icon-tile icon-tile-md">
                          <Video size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p dir="auto" className="font-medium text-sm truncate">{video.title || "Untitled Video"}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {video.duration_seconds ? `${Math.floor(video.duration_seconds / 60)}:${String(video.duration_seconds % 60).padStart(2, "0")}` : "—"}
                            {video.created_at ? ` · ${new Date(video.created_at).toLocaleDateString()}` : ""}
                          </p>
                        </div>
                        <span className="badge badge-pill tone-primary shrink-0 group-hover:border-primary/50">Load</span>
                      </button>
                    ))}
                  </div>
                ))
              ) : (
                filteredLibrary.map(video => (
                  <button key={video.id} onClick={() => handleSelectLibraryVideo(video)}
                    className="group w-full flex items-center gap-4 p-3 rounded-lg hover:bg-secondary transition-colors text-start"
                  >
                    <div className="icon-tile icon-tile-md">
                      <Video size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p dir="auto" className="font-medium text-sm truncate">{video.title || "Untitled Video"}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {video.duration_seconds ? `${Math.floor(video.duration_seconds / 60)}:${String(video.duration_seconds % 60).padStart(2, "0")}` : "—"}
                        {video.created_at ? ` · ${new Date(video.created_at).toLocaleDateString()}` : ""}
                        {video.folder_path ? ` · ${video.folder_path}` : ""}
                      </p>
                    </div>
                    <span className="badge badge-pill tone-primary shrink-0 group-hover:border-primary/50">Load</span>
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
          <div role="status" className="card shadow-lg px-8 py-6 text-center space-y-2">
            <Loader2 className="size-8 animate-spin text-primary mx-auto" aria-hidden="true" />
            <p className="text-sm font-medium">Loading session…</p>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          LEFT COLUMN — Video + Session Tags
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden mr-1.5">

        {/* Header */}
        {/* One-row top bar (wraps on narrow widths): title · session · export · clear */}
        <header className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">Tagging Workspace</h1>
            {resumedSessionId && (
              <span className="badge tone-primary">
                <RotateCcw size={11} aria-hidden="true" /> Resumed session
              </span>
            )}
          </div>

          <div className="ms-auto flex flex-wrap items-center gap-2 min-w-0">
            {/* Session */}
            <input
              type="text" value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="Session name..."
              aria-label="Session name"
              dir="auto"
              className="field h-9 w-52 min-w-0"
            />
            <input ref={sessionImportRef} type="file" accept=".json" className="hidden" onChange={handleImportSession} />
            <button onClick={() => sessionImportRef.current?.click()} title="Load session from JSON"
              aria-label="Load session from JSON"
              className="btn btn-secondary">
              <Upload size={14} aria-hidden="true" /> Load
            </button>
            <button onClick={() => handleSaveSessionToSupabase()} disabled={isSavingSession || markers.length === 0}
              title="Save session to library"
              className={`btn min-w-[5.75rem] ${sessionSaved ? "btn-success" : "btn-primary"}`}>
              {isSavingSession
                ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                : <Save size={14} aria-hidden="true" />}
              <span aria-live="polite">{isSavingSession ? "Saving..." : sessionSaved ? "Saved!" : "Save"}</span>
            </button>

            <span aria-hidden="true" className="toolbar-sep h-6 mx-1" />

            {/* Export — one segmented group */}
            <div role="group" aria-label="Export" className="segmented">
              <button onClick={handleExportJson} disabled={markers.length === 0} title="Export as JSON"
                aria-label="Export as JSON"
                className="segmented-item px-2.5">
                <Download size={13} aria-hidden="true" /> JSON
              </button>
              <button onClick={handleExportExcel} disabled={markers.length === 0} title="Export as Excel"
                aria-label="Export as Excel"
                className="segmented-item px-2.5">
                <FileSpreadsheet size={13} aria-hidden="true" /> Excel
              </button>
              <button
                onClick={handleExportTranscript}
                disabled={aiStatus === "processing"}
                title="ייצא תמלול עם תיאורים שמיעתיים (.txt)"
                className="segmented-item px-2.5"
              >
                <Mic size={13} aria-hidden="true" />
                <span dir="rtl">תמלול שמיעתי</span>
              </button>
            </div>

            {/* Clear — ghost icon button, red on hover */}
            <button onClick={handleClearSession} disabled={markers.length === 0} title="Clear all tags"
              aria-label="Clear all tags"
              className="icon-btn icon-btn-danger size-9">
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Video stage — always dark (cinema frame), vertically resizable.
            .stage has no transform/filter, so the fixed tooltip and drag overlay are unaffected. */}
        <div
          ref={videoCardRef}
          className="stage surface-dark shrink-0 mt-3 flex flex-col"
          style={videoHeight ? { height: videoHeight } : undefined}
        >
          {/* URL input row */}
          <div className="flex flex-wrap gap-2 p-3 shrink-0">
            <input
              type="text" value={videoInputUrl}
              onChange={(e) => setVideoInputUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLoadUrl()}
              className="field h-9 flex-1 basis-56 min-w-0"
              placeholder="Paste video URL or choose a file..."
              aria-label="Video URL"
            />
            <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelect} />
            <input ref={captionInputRef} type="file" accept=".vtt,.srt" className="hidden" onChange={handleCaptionFileSelect} />
            <button onClick={() => fileInputRef.current?.click()} title="Choose local file"
              aria-label="Choose local file"
              className="btn btn-secondary btn-icon">
              <FolderOpen size={15} aria-hidden="true" />
            </button>
            <button
              onClick={() => captionInputRef.current?.click()}
              title={captions.length > 0 ? `Captions loaded (${captions.length} cues) — click to replace` : "Load captions (.vtt or .srt)"}
              aria-label={captions.length > 0 ? `Captions loaded (${captions.length} cues) — click to replace` : "Load captions (.vtt or .srt)"}
              className={`btn ${captions.length > 0 ? "btn-soft px-3" : "btn-secondary btn-icon"}`}
            >
              <Captions size={15} aria-hidden="true" />
              {captions.length > 0 && <span className="font-mono text-xs font-medium tabular-nums">{captions.length}</span>}
            </button>
            <button onClick={handleOpenVideoBrowser} title="Browse video library"
              className="btn btn-secondary">
              <Library size={15} aria-hidden="true" /> Library
            </button>
            <button onClick={handleLoadUrl} disabled={!videoInputUrl.trim()}
              aria-label="Load video URL"
              className="btn btn-primary px-4">
              Load
            </button>
          </div>

          {/* Player — takes the remaining stage height; the black player frame sits inset in the stage */}
          <div className="flex-1 min-h-0 px-3">
            {loadedUrl ? (
              <VideoPlayer key={loadedUrl} url={loadedUrl} markers={markers} onTimeUpdate={(t) => setCurrentTime(t)} captions={captions} seekRequest={seekRequest} />
            ) : (
              <div dir="rtl" lang="he" className="empty-state empty-state-compact h-full min-h-[260px] rounded-xl bg-accent">
                <div className="icon-tile icon-tile-lg">
                  <Video size={22} aria-hidden="true" />
                </div>
                <div className="space-y-1 max-w-sm">
                  <p className="empty-state-title text-base">טרם נבחר וידאו לתיוג</p>
                  <p className="empty-state-text">בחר סרטון מספריית הוידאו של המערכת, הדבק קישור חיצוני, או העלה קובץ וידאו מקומי.</p>
                </div>
                <button
                  onClick={handleOpenVideoBrowser}
                  className="btn btn-soft mt-1"
                >
                  <Library size={16} aria-hidden="true" /> עיון בספריית הוידאו (Browse Library)
                </button>
              </div>
            )}
          </div>

          {/* Status line — neutral pills, then the learning-environment link at the end */}
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground tabular-nums shrink-0">
            <span className="badge tone-neutral">
              <Tag size={11} aria-hidden="true" />
              <span className="font-medium text-foreground">{markers.length}</span> tag{markers.length !== 1 ? "s" : ""}
            </span>
            {(startTime !== "" || endTime !== "") && (
              <span className="badge tone-neutral font-mono">
                <Clock size={11} aria-hidden="true" />
                {formatTime(startTime === "" ? 0 : startTime as number)} – {formatTime(endTime === "" ? 0 : endTime as number)}
              </span>
            )}
            {loadedVideoId && (
              <span className="badge tone-neutral">
                <Library size={11} aria-hidden="true" /> From library
              </span>
            )}
            {loadedVideoId && <Link href={`/videos/${loadedVideoId}/environment`} className="ms-auto inline-flex items-center gap-1 rounded font-medium text-primary hover:underline underline-offset-2">סביבת הלמידה · Indirect SRL<ArrowUpRight size={12} aria-hidden="true" /></Link>}
          </div>
        </div>

        {/* Vertical resize handle — video vs tags (same 20px hit area; slim grip) */}
        <div
          className="h-5 shrink-0 flex items-center justify-center cursor-row-resize group select-none touch-none"
          onMouseDown={startVDrag}
          title="Drag to resize"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Drag to resize"
        >
          <span
            aria-hidden="true"
            className={`h-1 w-11 rounded-full transition-colors ${activeDrag === "v" ? "bg-primary" : "bg-input group-hover:bg-primary"}`}
          />
        </div>

        {/* Session Tag List — a timeline: time column + content column per tag */}
        <div className="card flex-1 min-h-0 flex flex-col overflow-hidden mb-3">
          <div className="flex items-center gap-2 px-[1.125rem] py-3 border-b border-border shrink-0">
            <h3 className="card-title flex items-center gap-2">
              <Tag size={14} className="text-primary" aria-hidden="true" /> Session Tags
            </h3>
            {markers.length > 0 && (
              <span className="count-pill">{markers.length}</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {markers.length === 0 ? (
              <div className="empty-state empty-state-compact h-full py-6">
                <div className="empty-state-icon size-10">
                  <Tag size={18} aria-hidden="true" />
                </div>
                <p className="empty-state-text">No tags yet — pick a code and press Add Tag.</p>
              </div>
            ) : (
              markers.map(m => {
                const isEditing = editingMarkerId === m.id;
                const strengthLabel =
                  m.confidence === undefined ? null :
                  m.confidence >= 0.8 ? { text: "חזק",   cls: strengthTone(m.confidence) } :
                  m.confidence >= 0.5 ? { text: "בינוני", cls: strengthTone(m.confidence) } :
                  { text: "חלש", cls: strengthTone(m.confidence) };
                return (
                  <div
                    key={m.id}
                    className={`timeline-row gap-y-0 last:border-b-0 ${isEditing ? "bg-primary/5 shadow-[inset_3px_0_0_var(--primary)]" : ""}`}
                  >
                    {/* Header (time column + codes line) — click to seek. `contents` lets its two
                        children sit in the row grid while the click, title and cursor stay here. */}
                    <div
                      className="contents cursor-pointer"
                      onClick={() => { if (!isEditing) seekToTime(m.startTime); }}
                      title={isEditing ? undefined : `Seek to ${formatTime(m.startTime)}`}
                    >
                      <div className="col-start-1 row-start-1 row-span-3 flex flex-col gap-0.5 pt-px">
                        <span className="timeline-time">{formatTime(m.startTime)}</span>
                        <span className="timeline-time-end">→ {formatTime(m.endTime || m.startTime)}</span>
                      </div>
                      <div className="col-start-2 row-start-1 flex flex-wrap items-center gap-1.5 min-w-0 min-h-6">
                        {(m.labels ?? [m.label]).map((lbl, i) => (
                          <span
                            key={`${lbl}-${i}`}
                            className="code-chip font-mono font-medium"
                            style={{ "--code": (m.colors ?? [m.color])[i] || m.color } as React.CSSProperties}
                          >
                            <span className="code-dot" aria-hidden="true" />
                            {lbl}
                          </span>
                        ))}
                        {strengthLabel && (
                          <span className={`badge ${strengthLabel.cls}`}>{strengthLabel.text}</span>
                        )}
                        <div className="ms-auto flex items-center gap-1 shrink-0">
                          {/* Play hint */}
                          {!isEditing && (
                            <Play size={11} className="me-1 text-muted-foreground shrink-0" aria-hidden="true" />
                          )}
                          {/* Edit button */}
                          <button
                            onClick={e => { e.stopPropagation(); if (isEditing) { setEditingMarkerId(null); setEditTdsMeta(null); } else { handleEditStart(m); } }}
                            title={isEditing ? "Cancel edit" : "Edit tag"}
                            aria-label={isEditing ? "Cancel edit" : "Edit tag"}
                            className={`icon-btn icon-btn-sm ${isEditing ? "text-primary" : ""}`}
                          >
                            {isEditing ? <X size={14} aria-hidden="true" /> : <Pencil size={12} aria-hidden="true" />}
                          </button>
                          {/* Delete button */}
                          <button
                            onClick={e => { e.stopPropagation(); handleRemoveMarker(m.id); }}
                            title="Delete tag"
                            aria-label="Delete tag"
                            className="icon-btn icon-btn-sm icon-btn-danger"
                          >
                            <Trash2 size={12} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Evidence + reasoning preview when not editing */}
                    {!isEditing && (m.evidence || m.reasoning || m.interpretation) && (
                      <div className="col-start-2 mt-2 space-y-1.5">
                        {m.evidence && <p className="reading text-foreground line-clamp-3" dir="rtl" title={m.evidence}>{m.evidence}</p>}
                        {m.reasoning && (
                          <p className="reasoning-quote text-[13px] leading-relaxed" dir="rtl">
                            <span className="font-semibold text-foreground/80">נימוק: </span>{m.reasoning}
                          </p>
                        )}
                        {m.interpretation && <p className="text-xs text-muted-foreground leading-relaxed line-clamp-1" dir="rtl">{m.interpretation}</p>}
                      </div>
                    )}

                    {/* TDS Meta badges */}
                    {!isEditing && (() => {
                      const tds = markerTdsMeta.get(m.id);
                      if (!tds) return null;
                      return (
                        <div className="col-start-2 mt-2 flex flex-wrap items-center gap-1.5">
                          {tds.basicClass && (
                            <span className={`badge font-mono ${basicClassTone(tds.basicClass)}`}>{tds.basicClass}</span>
                          )}
                          <span className="badge tone-primary font-mono">
                            STG {tds.metaStgScore}/5
                          </span>
                          {tds.metaIntro && (
                            <span className="badge tone-info font-mono">
                              META_INTRO
                            </span>
                          )}
                          {tds.missedMeta !== 'none' && (
                            <span className={`badge ${tds.missedMeta === 'full' ? 'tone-danger' : 'tone-warning'}`}>MO <bdi>{tds.missedMeta === 'full' ? 'מלא' : 'חלקי'}</bdi> ({tds.moScore})</span>
                          )}
                          {tds.tdReasoning && (
                            <p className="w-full reasoning-quote text-[13px] leading-relaxed mt-0.5" dir="rtl">
                              <span className="font-semibold text-foreground/80">נימוק TDS: </span>{tds.tdReasoning}
                            </p>
                          )}
                        </div>
                      );
                    })()}

                    {/* Inline edit form */}
                    {isEditing && editForm && (
                      <div className="col-start-2 mt-3 space-y-3">
                        {/* Time range */}
                        <div className="flex items-end gap-2">
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <label htmlFor={`edit-start-${m.id}`} className="eyebrow">Start (s)</label>
                              <span className="font-mono text-2xs text-muted-foreground tabular-nums">{formatTime(editForm.startTime)}</span>
                            </div>
                            <input
                              id={`edit-start-${m.id}`}
                              type="number" min={0} step={1}
                              value={editForm.startTime}
                              onChange={e => setEditForm(f => f && { ...f, startTime: e.target.value === "" ? "" : Number(e.target.value) })}
                              className="field field-sm font-mono tabular-nums"
                            />
                          </div>
                          <span className="pb-1.5 text-muted-foreground text-xs">–</span>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <label htmlFor={`edit-end-${m.id}`} className="eyebrow">End (s)</label>
                              <span className="font-mono text-2xs text-muted-foreground tabular-nums">{formatTime(editForm.endTime)}</span>
                            </div>
                            <input
                              id={`edit-end-${m.id}`}
                              type="number" min={0} step={1}
                              value={editForm.endTime}
                              onChange={e => setEditForm(f => f && { ...f, endTime: e.target.value === "" ? "" : Number(e.target.value) })}
                              className="field field-sm font-mono tabular-nums"
                            />
                          </div>
                        </div>
                        {/* Evidence textarea */}
                        <div dir="rtl" className="space-y-1">
                          <label htmlFor={`edit-evidence-${m.id}`} className="section-label block">עדות</label>
                          <textarea
                            id={`edit-evidence-${m.id}`}
                            value={editForm.evidence}
                            onChange={e => setEditForm(f => f && { ...f, evidence: e.target.value })}
                            rows={2}
                            dir="rtl"
                            placeholder='למשל: "המורה שואלת: בואו נחשוב..."'
                            className="field text-[13px] resize-none"
                          />
                        </div>
                        {/* Reasoning textarea */}
                        <div dir="rtl" className="space-y-1">
                          <label htmlFor={`edit-reasoning-${m.id}`} className="section-label block">נימוק</label>
                          <textarea
                            id={`edit-reasoning-${m.id}`}
                            value={editForm.reasoning}
                            onChange={e => setEditForm(f => f && { ...f, reasoning: e.target.value })}
                            rows={2}
                            dir="rtl"
                            placeholder='למה בחרת קוד זה? אילו קריטריונים הנחו אותך?'
                            className="field text-[13px] resize-none"
                          />
                        </div>
                        {/* TDS Meta panel in edit form */}
                        {((m.labels ?? [m.label]).some(l => l.startsWith('TDS_'))) && (
                          <TdsMetaPanel
                            form={editTdsMeta ?? EMPTY_TDS_META}
                            onChange={setEditTdsMeta as React.Dispatch<React.SetStateAction<TdsMetaForm>>}
                            shortcutsActive={isEditingTdsMeta && rightTab !== 'AI'}
                          />
                        )}
                        {/* Save button */}
                        <button
                          onClick={() => handleEditSave(m.id)}
                          className="btn btn-primary btn-sm btn-block h-8"
                        >
                          <Check size={13} aria-hidden="true" /> Save Changes
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

      {/* Horizontal resize handle — left vs right column (same 20px hit area; slim grip) */}
      <div
        className="w-5 shrink-0 self-stretch flex items-center justify-center cursor-col-resize group select-none touch-none"
        onMouseDown={startHDrag}
        title="Drag to resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Drag to resize"
      >
        <span
          aria-hidden="true"
          className={`w-1 h-11 rounded-full transition-colors ${activeDrag === "h" ? "bg-primary" : "bg-input group-hover:bg-primary"}`}
        />
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          RIGHT COLUMN — Code Selection + Annotation Form
      ══════════════════════════════════════════════════════════════════════ */}
      <div
        className="card shrink-0 flex flex-col overflow-hidden mb-3"
        style={{ width: rightWidth }}
      >

        {/* Sticky top: framework tabs + filter */}
        <div className="shrink-0">
          {/* Framework tabs — underline tabs in a hairline-bordered tablist */}
          <div role="tablist" className="flex items-end gap-5 px-4 border-b border-border">
            {(["SCOPE", "NONVERBAL"] as PrismKey[]).map(fw => (
              <button key={fw}
                role="tab"
                aria-selected={rightTab === fw}
                onClick={() => { setRightTab(fw); handlePrismChange(fw); }}
                className="tab-underline px-0.5 focus-visible:-outline-offset-2"
              >
                {PRISM_LABELS[fw]}
                <span className="count-pill font-mono" data-active={rightTab === fw}>{PRISMS[fw].length}</span>
              </button>
            ))}
            {/* AI Analysis tab */}
            <button
              role="tab"
              aria-selected={rightTab === "AI"}
              onClick={() => setRightTab("AI")}
              className="tab-underline px-0.5 focus-visible:-outline-offset-2"
            >
              <Bot size={14} aria-hidden="true" />
              AI
              {aiStatus === "processing" && (
                <span className="status-dot tone-warning size-2 animate-pulse" aria-hidden="true" />
              )}
              {aiStatus === "completed" && aiEvents.length > 0 && (
                <span className="count-pill font-mono" data-active="true">
                  {aiEvents.length}
                </span>
              )}
            </button>
          </div>
          {/* Filter input — only for code tabs */}
          {rightTab !== "AI" && (
          <div className="px-4 pt-3 pb-1">
            <div className="relative">
              <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                value={codeSearch}
                onChange={e => setCodeSearch(e.target.value)}
                placeholder="Filter codes…"
                aria-label="Filter codes"
                className="field field-sm ps-8 pe-8"
              />
              {codeSearch && (
                <button onClick={() => setCodeSearch("")} aria-label="Clear filter"
                  className="icon-btn icon-btn-sm absolute end-1.5 top-1/2 -translate-y-1/2">
                  <X size={13} aria-hidden="true" />
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
              <div className="flex-1 empty-state empty-state-compact px-6">
                <div className="icon-tile icon-tile-lg tone-primary">
                  <Bot size={22} aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <p className="empty-state-title">AI Analysis</p>
                  <p className="empty-state-text max-w-[240px]">
                    Load a video from the <strong className="font-semibold text-foreground">Library</strong> to enable AI analysis.
                  </p>
                </div>
              </div>
            )}

            {/* Idle — video loaded, no analysis yet */}
            {loadedVideoId && aiStatus === "idle" && (
              <div className="flex-1 empty-state empty-state-compact gap-4 px-6">
                <div className="icon-tile icon-tile-lg tone-primary">
                  <Sparkles size={22} aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <p className="empty-state-title">Analyze with AI</p>
                  <p className="empty-state-text max-w-[240px]">
                    Automatically tag SRL events using Whisper transcription
                    and Praat prosodic/intonation analysis.
                  </p>
                </div>
                <div dir="rtl" lang="he" className="panel-inset w-full flex flex-col gap-2 text-xs text-secondary-foreground text-start">
                  <span className="flex items-center gap-2"><Mic size={12} className="text-primary shrink-0" aria-hidden="true" /> תמלול בעברית (Whisper)</span>
                  <span className="flex items-center gap-2"><Sparkles size={12} className="text-mo shrink-0" aria-hidden="true" /> ניתוח פיץ׳ ואינטונציה (Praat)</span>
                  <span className="flex items-center gap-2"><Bot size={12} className="text-info shrink-0" aria-hidden="true" /> קידוד SRL אוטומטי (GPT-4o)</span>
                </div>
                <button
                  onClick={handleTriggerAnalysis}
                  dir="rtl"
                  className="btn btn-primary btn-lg btn-block"
                >
                  <Bot size={15} aria-hidden="true" /> התחל ניתוח AI
                </button>
              </div>
            )}

            {/* Processing */}
            {aiStatus === "processing" && (
              <div dir="rtl" lang="he" className="flex-1 empty-state empty-state-compact gap-4 px-6">
                <div className="relative size-14 grid place-items-center">
                  <Loader2 className="absolute inset-0 size-14 text-primary/80 animate-spin" strokeWidth={1.5} aria-hidden="true" />
                  <Bot size={20} className="text-primary" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <p className="empty-state-title">מנתח סרטון…</p>
                  <p className="empty-state-text">
                    תמלול + ניתוח פרוסודי + קידוד SCOPE.<br />
                    תהליך זה אורך 2–5 דקות.
                  </p>
                </div>
                <div className="meter w-full bg-primary/15" aria-hidden="true">
                  <div className="meter-fill meter-indeterminate" />
                </div>
                <p className="text-2xs text-muted-foreground">בודק כל 5 שניות…</p>
                {/* Show reset button if stuck for more than 5 minutes */}
                {processingStartedAt && Date.now() - processingStartedAt > 5 * 60 * 1000 && (
                  <div className="mt-1 space-y-1 text-center">
                    <p className="text-xs font-medium text-warning">לוקח יותר מדי זמן?</p>
                    <button onClick={handleForceReset}
                      className="btn btn-link text-xs text-destructive">
                      אפס ונסה שוב
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Failed */}
            {aiStatus === "failed" && (
              <div dir="rtl" lang="he" className="flex-1 empty-state empty-state-compact gap-3 px-6">
                <div className="icon-tile icon-tile-lg tone-danger">
                  <AlertTriangle size={22} aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <p className="empty-state-title text-destructive">הניתוח נכשל</p>
                  <p className="empty-state-text">בדוק שה-Python worker מותקן ושה-.env.local מכיל את המפתחות.</p>
                </div>
                <button onClick={handleTriggerAnalysis}
                  className="btn btn-secondary btn-sm">
                  נסה שוב
                </button>
              </div>
            )}

            {/* Completed — show AI events (grouped by timestamp) */}
            {aiStatus === "completed" && aiEvents.length > 0 && (
              <div dir="rtl" lang="he" className="flex flex-col h-full">
                {/* Header */}
                <div className="panel-header gap-2">
                  <span className="flex items-center gap-1.5 min-w-0 text-[13px] font-semibold">
                    <Sparkles size={13} className="text-primary shrink-0" aria-hidden="true" />
                    {aiEvents.length} אירועי AI
                    {acceptedAiKeys.size > 0 && (
                      <span className="font-normal text-muted-foreground">· {acceptedAiKeys.size} אושרו</span>
                    )}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={handleTriggerAnalysis}
                      className="btn btn-ghost btn-sm">
                      <RotateCcw size={12} aria-hidden="true" /> הרץ שוב
                    </button>
                    {aiEvents.some(e => !acceptedAiKeys.has(e.key)) && (
                      <button onClick={handleAcceptAllAiEvents}
                        className="btn btn-soft btn-sm">
                        <CheckCheck size={13} aria-hidden="true" /> קבל הכל
                      </button>
                    )}
                  </div>
                </div>

                {/* Event list — rows separated by hairlines (no boxes) */}
                <div className="flex-1 overflow-y-auto">
                  {aiEvents.map(event => {
                    const accepted = acceptedAiKeys.has(event.key);
                    const isProsodic = event.evidence_text?.startsWith("[PROSODIC]");
                    const evidence = isProsodic
                      ? event.evidence_text?.replace("[PROSODIC]", "").trim()
                      : event.evidence_text;
                    const conf = event.confidence_score ?? 0;
                    const confLabel = conf >= 0.8 ? "חזק" : conf >= 0.5 ? "בינוני" : "חלש";
                    const confCls = strengthTone(conf);

                    return (
                      <div
                        key={event.key}
                        onClick={() => seekToTime(event.start_time)}
                        className={`flex flex-col gap-2 px-4 py-3.5 border-b border-border cursor-pointer transition-colors ${
                          accepted
                            ? "bg-success/6"
                            : "hover:bg-accent"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* Time */}
                          <span dir="ltr" className="font-mono text-sm font-semibold tabular-nums text-foreground me-0.5">
                            {formatTime(event.start_time)}
                          </span>

                          {/* Code chips */}
                          {event.code_ids.map((codeId, i) => {
                            const c = CODE_COLORS[codeId] ?? "#6366f1";
                            return (
                              <span key={`${codeId}-${i}`} dir="ltr"
                                className="code-chip font-mono font-medium"
                                style={{ "--code": c } as React.CSSProperties}>
                                <span className="code-dot" aria-hidden="true" />
                                {codeId}
                              </span>
                            );
                          })}

                          <span className="flex-1" aria-hidden="true" />
                          <span dir="ltr" className="badge tone-primary">AI</span>
                          {isProsodic && (
                            <span className="badge tone-prosodic">
                              <Mic size={10} aria-hidden="true" /> פרוסודי
                            </span>
                          )}
                          <span className={`badge ${confCls}`}>
                            {confLabel} {Math.round(conf * 100)}%
                          </span>
                        </div>

                        {/* Evidence + reasoning */}
                        {(evidence || event.reasoning) && (
                          <div className="space-y-1.5">
                            {evidence && (
                              <p className="reading text-foreground line-clamp-3" dir="rtl" title={evidence}>
                                {evidence}
                              </p>
                            )}
                            {event.reasoning && (
                              <p className="reasoning-quote text-[13px] leading-relaxed line-clamp-3" dir="rtl">
                                <span className="font-semibold text-foreground/80">נימוק: </span>{event.reasoning}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Accept button */}
                        {!accepted ? (
                          <div className="flex">
                            <button
                              onClick={e => { e.stopPropagation(); handleAcceptAiEvent(event); }}
                              className="btn btn-soft btn-sm"
                            >
                              <Check size={13} aria-hidden="true" /> קבל אירוע
                            </button>
                          </div>
                        ) : (
                          <div className="flex">
                            <span className="badge badge-lg tone-success">
                              <Check size={12} aria-hidden="true" /> נוסף לסשן
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {aiStatus === "completed" && aiEvents.length === 0 && (
              <div dir="rtl" lang="he" className="flex-1 empty-state empty-state-compact gap-3 px-6">
                <div className="icon-tile icon-tile-lg tone-neutral">
                  <SearchX size={22} aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <p className="empty-state-title">לא זוהו אירועי SRL</p>
                  <p className="empty-state-text">נסה שוב עם סרטון אחר.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Scrollable body: chips → sticky selected-codes bar → numbered form */}
        {rightTab !== "AI" && (
        <div className="flex-1 overflow-y-auto">

          {/* Code chips — all visible, grouped by sticky category labels */}
          <div className="pb-3">
            {visibleCategories.map(({ category, codes }) => {
              if (codes.length === 0) return null;
              return (
                <div key={category}>
                  <p className="sticky top-0 z-10 bg-card/95 px-4 pt-3 pb-2 eyebrow flex items-baseline gap-2">
                    <span>{category}</span>
                    {!codeSearch.trim() && (
                      <span className="font-mono font-medium normal-case tracking-normal tabular-nums text-muted-foreground/80">{codes.length}</span>
                    )}
                  </p>
                  <div className="px-4 pb-1.5 flex flex-wrap gap-1.5">
                    {codes.map(code => {
                      const selected = selectedCodes.has(code.id);
                      return (
                        <button
                          key={code.id}
                          onClick={() => toggleCode(code.id)}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltip({ id: code.id, description: (code as typeof code & { description?: string }).description ?? "", x: rect.left + rect.width / 2, y: rect.top - 6 });
                          }}
                          onMouseLeave={() => setTooltip(null)}
                          onFocus={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltip({ id: code.id, description: (code as typeof code & { description?: string }).description ?? "", x: rect.left + rect.width / 2, y: rect.top - 6 });
                          }}
                          onBlur={() => setTooltip(null)}
                          aria-pressed={selected}
                          className="chip-toggle font-mono"
                          style={{ "--code": code.color } as React.CSSProperties}
                        >
                          {selected
                            ? <Check size={12} strokeWidth={3} className="shrink-0" aria-hidden="true" />
                            : <span className="code-dot size-2" aria-hidden="true" />}
                          {code.id}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Annotation form fields */}
          <div className="px-4 pb-5 space-y-5">

            {/* Selected codes — sticky bar (also the divider between the codebook and the form) */}
            <div className="sticky top-0 z-10 -mx-4 px-4 py-2.5 bg-card/95 border-y border-border">
              {selectedCodes.size > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {[...selectedCodes].map(codeId => {
                    const codeData = PRISM_CODE_LOOKUP[codeId];
                    if (!codeData) return null;
                    return (
                      <div
                        key={codeId}
                        className="code-chip code-chip-md font-mono pe-1"
                        style={{ "--code": codeData.color } as React.CSSProperties}
                      >
                        <span className="code-dot size-2" aria-hidden="true" />
                        <span className="font-semibold">{codeData.id}</span>
                        <button
                          onClick={() => toggleCode(codeId)}
                          className="icon-btn icon-btn-sm size-5 rounded-full"
                          title="Remove"
                          aria-label="Remove"
                        >
                          <X size={11} aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p dir="rtl" className="text-[13px] leading-7 text-muted-foreground">לחץ על קוד למעלה כדי לבחור</p>
              )}
            </div>

            {/* 1 · Time range — larger m:ss fields, set-in/out buttons under them */}
            <div className="space-y-2.5">
              <label className={STEP_LABEL}>
                <span className="step-num" aria-hidden="true">1</span> Time Range
              </label>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
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
                    aria-label="Start time"
                    dir="ltr"
                    className={`field h-10 text-md font-mono tabular-nums text-center ${startTime !== "" ? "border-primary/40 focus:border-ring" : ""}`}
                  />
                  {!isEmbedMode && (
                    <button onClick={handleSetStartTime}
                      className="btn btn-secondary btn-sm">
                      ← הגדר כניסה
                    </button>
                  )}
                </div>
                <span className="h-10 inline-flex items-center text-muted-foreground text-xs" aria-hidden="true">–</span>
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
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
                    aria-label="End time"
                    dir="ltr"
                    className={`field h-10 text-md font-mono tabular-nums text-center ${endTime !== "" ? "border-primary/40 focus:border-ring" : ""}`}
                  />
                  {!isEmbedMode && (
                    <button onClick={handleSetEndTime}
                      className="btn btn-secondary btn-sm">
                      הגדר יציאה →
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 2 · Confidence — segmented, Hebrew group */}
            <div dir="rtl" className="space-y-2.5">
              <label className={STEP_LABEL}>
                <span className="step-num" aria-hidden="true">2</span> עוצמת התיוג
              </label>
              <div role="group" aria-label="עוצמת התיוג" className="segmented flex w-full">
                {[
                  { label: "חלש",   value: 0.33 },
                  { label: "בינוני", value: 0.66 },
                  { label: "חזק",   value: 1.0 },
                ].map(opt => (
                  <button key={opt.value} type="button" onClick={() => setConfidenceScore(opt.value)}
                    aria-pressed={confidenceScore === opt.value}
                    className="segmented-item flex-1 h-8 text-[13px]">
                    <span className={`status-dot size-2 ${strengthTone(opt.value)}`} aria-hidden="true" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3 · Evidence */}
            <div dir="rtl" className="space-y-2.5">
              <label htmlFor="new-tag-evidence" className={STEP_LABEL}>
                <span className="step-num" aria-hidden="true">3</span> עדות מהטקסט
              </label>
              <textarea
                id="new-tag-evidence"
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
                rows={2}
                placeholder='למשל: "המורה שואלת: בואו נחשוב מה למדנו היום..."'
                className="field resize-none"
                dir="rtl"
              />
            </div>

            {/* 4 · Reasoning */}
            <div dir="rtl" className="space-y-2.5">
              <label htmlFor="new-tag-reasoning" className={STEP_LABEL}>
                <span className="step-num" aria-hidden="true">4</span> נימוק
              </label>
              <textarea
                id="new-tag-reasoning"
                value={reasoningText}
                onChange={(e) => setReasoningText(e.target.value)}
                rows={3}
                placeholder='למה בחרת בקוד זה? אילו קריטריוני הכרעה הנחו אותך? למשל: "המורה נתנה שם לאסטרטגיה והסבירה מתי להשתמש בה — לכן TDS_META ולא TDS_COG."'
                className="field resize-none"
                dir="rtl"
              />
            </div>

            {/* ── 5 · TDS Meta-Coding panel ─────────────────────────────── */}
            {hasTdsCode && (
              <TdsMetaPanel
                form={tdsMetaForm}
                onChange={setTdsMetaForm}
                step={5}
                shortcutsActive={!isEditingTdsMeta}
              />
            )}

          </div>
        </div>
        )}

        {/* Sticky bottom: Add Tag button — hidden on AI tab */}
        {rightTab !== "AI" && (
        <div className="shrink-0 px-4 pt-3 pb-4 border-t border-border bg-card">
          <button
            onClick={handleSaveTag}
            disabled={startTime === "" || endTime === "" || selectedCodes.size === 0}
            className="btn btn-primary btn-lg btn-block h-11 rounded-xl text-[15px]"
          >
            <Tag size={16} aria-hidden="true" /> Add Tag{selectedCodes.size > 1 ? ` (${selectedCodes.size})` : ""}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}

// Forces TaggingModeInner to fully remount (resetting all its state) whenever the
// session/video identity in the URL changes — otherwise client-side navigation between
// e.g. /tagging?session=X and /tagging ("New Session") reuses the same component instance
// and leaves the previous session's tags/state on screen.
function TaggingModeKeyed() {
  const searchParams = useSearchParams();
  const key = searchParams.get("session") ?? searchParams.get("video") ?? searchParams.get("videoId") ?? "blank";
  return <TaggingModeInner key={key} />;
}

export default function TaggingMode() {
  return (
    <Suspense>
      <TaggingModeKeyed />
    </Suspense>
  );
}
