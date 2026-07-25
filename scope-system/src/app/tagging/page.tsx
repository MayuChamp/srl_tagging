"use client";

import React, { useState, useRef, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { VideoPlayer, type VideoMarker, type Caption } from "@/components/video/VideoPlayer";
import {
  Save, Tag, Clock, AlignLeft, ShieldCheck,
  FolderOpen, Download, Upload, Trash2, Library, X, Video,
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

// ── TdsMetaPanel ────────────────────────────────────────────────────────────
function TdsMetaPanel({
  form,
  onChange,
}: {
  form: TdsMetaForm;
  onChange: React.Dispatch<React.SetStateAction<TdsMetaForm>>;
}) {
  const computed = computeTdsMeta(form);
  const [hoveredTip, setHoveredTip] = useState<string | null>(null);

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
    <div className="space-y-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wide flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
          TDS Meta-Coding
        </h4>
        {suggestedBasicClass && form.basicClass !== suggestedBasicClass && (
          <button
            onClick={() => onChange(f => ({ ...f, basicClass: suggestedBasicClass }))}
            className="text-[10px] text-indigo-400 border border-indigo-400/30 px-2 py-0.5 rounded hover:bg-indigo-400/10 transition-colors"
          >
            הצעה: {suggestedBasicClass}
          </button>
        )}
      </div>

      {/* META_INTRO */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">META_INTRO</label>
        <div className="flex gap-2">
          {([true, false] as const).map(val => (
            <button key={String(val)} type="button"
              onClick={() => onChange(f => ({ ...f, metaIntro: val, metaIntroType: val ? f.metaIntroType : '' }))}
              className={`flex-1 py-1.5 rounded-md text-xs font-semibold border transition-all ${
                form.metaIntro === val
                  ? val
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border bg-secondary/40 text-muted-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/30'
              }`}
            >
              {val ? 'כן' : 'לא'}
            </button>
          ))}
        </div>
        {form.metaIntro && (
          <select
            value={form.metaIntroType}
            onChange={e => onChange(f => ({ ...f, metaIntroType: e.target.value as MetaIntroType }))}
            className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
            dir="rtl"
          >
            <option value="">בחרי סוג META_INTRO</option>
            {META_INTRO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      {/* META_STG components */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            רכיבי META_STG
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-muted-foreground/40 font-mono">1–5</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              computed.metaStgScore >= 4 ? 'bg-emerald-500/15 text-emerald-400' :
              computed.metaStgScore >= 2 ? 'bg-amber-500/15 text-amber-400' :
              'bg-secondary/50 text-muted-foreground'
            }`}>
              {computed.metaStgScore}/5
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex gap-0.5 h-1.5">
          {[0,1,2,3,4].map(i => (
            <div key={i} className={`flex-1 rounded-sm transition-colors ${
              i < computed.metaStgScore
                ? computed.metaStgScore >= 4 ? 'bg-emerald-400' :
                  computed.metaStgScore >= 2 ? 'bg-amber-400' : 'bg-red-400/80'
                : 'bg-secondary/40'
            }`} />
          ))}
        </div>

        <div className="space-y-0.5">
          {STG_ITEMS.map((item, idx) => {
            const checked = !!form[item.key];
            const isNamingOnly = item.key === 'stgNaming' && form.stgNaming && !form.stgWhen && !form.stgHow && !form.stgWhy && !form.stgWhenNot;
            return (
              <React.Fragment key={item.key}>
                {idx === 1 && (
                  <div className="flex items-center gap-2 my-0.5">
                    <div className="flex-1 border-t border-border/40" />
                    <span className="text-[9px] text-muted-foreground/40">הסבר</span>
                    <div className="flex-1 border-t border-border/40" />
                  </div>
                )}
                <label
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                    checked ? 'bg-primary/8 border border-primary/20' : 'border border-transparent hover:bg-secondary/30'
                  }`}
                >
                  <input type="checkbox" checked={checked}
                    onChange={e => onChange(f => ({ ...f, [item.key]: e.target.checked }))}
                    className="w-3.5 h-3.5 accent-primary shrink-0"
                  />
                  <span className={`text-xs flex-1 ${checked ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                    {item.label}
                    {isNamingOnly && (
                      <span className="text-[9px] text-amber-400/70 mr-1"> ← בלעדי = OVERLAP</span>
                    )}
                  </span>
                  <span className={`text-[10px] font-bold ${checked ? 'text-primary' : 'text-muted-foreground/30'}`}>
                    {checked ? '1' : '0'}
                  </span>
                  <button type="button"
                    onMouseEnter={() => setHoveredTip(item.tip)}
                    onMouseLeave={() => setHoveredTip(null)}
                    onClick={e => e.preventDefault()}
                    className="shrink-0 text-[11px] text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors leading-none"
                  >ⓘ</button>
                </label>
              </React.Fragment>
            );
          })}
        </div>

        {/* Tooltip */}
        {hoveredTip && (
          <div className="rounded-lg bg-slate-900/90 border border-slate-700/60 px-3 py-2 text-[11px] text-slate-300 leading-relaxed" dir="rtl">
            {hoveredTip}
          </div>
        )}
      </div>

      {/* Basic Classification */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">סיווג בסיסי</label>
          <span className="text-[9px] text-muted-foreground/40 font-mono">c/o/m</span>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {(['COG', 'OVERLAP', 'META'] as const).map(cls => {
            const activeStyle = {
              COG:     'border-blue-500/50 bg-blue-500/10 text-blue-400',
              OVERLAP: 'border-amber-500/50 bg-amber-500/10 text-amber-400',
              META:    'border-emerald-500/50 bg-emerald-500/10 text-emerald-400',
            }[cls];
            return (
              <button key={cls} type="button"
                onClick={() => onChange(f => ({ ...f, basicClass: cls }))}
                className={`py-1.5 rounded-md text-xs font-bold border transition-all ${
                  form.basicClass === cls
                    ? activeStyle
                    : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground'
                }`}
              >
                {cls}
              </button>
            );
          })}
        </div>
      </div>

      {/* Computed result */}
      {(form.basicClass || computed.missedMeta !== 'none') && (
        <div className="rounded-lg bg-secondary/30 border border-border/50 p-2.5 space-y-1.5 text-xs" dir="rtl">
          {form.basicClass && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">סיווג:</span>
              <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                form.basicClass === 'META'    ? 'bg-emerald-500/15 text-emerald-400' :
                form.basicClass === 'OVERLAP' ? 'bg-amber-500/15 text-amber-400' :
                                                'bg-blue-500/15 text-blue-400'
              }`}>{form.basicClass}</span>
            </div>
          )}
          {computed.missedMeta !== 'none' && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">MISSED_META:</span>
                <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                  computed.missedMeta === 'full' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'
                }`}>{computed.missedMeta === 'full' ? 'מלא' : 'חלקי'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">MO_SCORE:</span>
                <span className="font-bold text-orange-400">{computed.moScore}</span>
              </div>
              {computed.moComponents.length > 0 && (
                <div className="pt-1 border-t border-border/40 space-y-0.5">
                  <p className="text-muted-foreground text-[10px]">רכיבים מוחמצים:</p>
                  <p className="text-foreground/70 text-[11px] leading-relaxed">
                    {computed.moComponents.join('، ')}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TDS Reasoning */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">נימוק TDS</label>
        <textarea
          value={form.tdReasoning}
          onChange={e => onChange(f => ({ ...f, tdReasoning: e.target.value }))}
          rows={2}
          dir="rtl"
          placeholder="למה בחרת בסיווג זה? מה הצדיק (או לא הצדיק) META מלא?"
          className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-primary resize-none"
        />
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
            <div className="p-4 border-b border-border space-y-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text" value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  placeholder="Search videos..."
                  className="w-full bg-background border border-border rounded-md pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div className="flex rounded-md border border-border overflow-hidden w-fit text-xs font-medium">
                <button onClick={() => setLibraryViewMode("recent")}
                  className={`px-3 py-1.5 transition-colors ${libraryViewMode === "recent" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary/40"}`}>
                  Recent
                </button>
                <button onClick={() => setLibraryViewMode("folders")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${libraryViewMode === "folders" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary/40"}`}>
                  <FolderOpen size={12} /> By Folder
                </button>
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
              ) : libraryViewMode === "folders" ? (
                groupedLibrary.map(({ folder, videos }) => (
                  <div key={folder || "__uncategorized__"} className="mb-3">
                    <p className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      <FolderOpen size={12} /> {folder || "Uncategorized"}
                    </p>
                    {videos.map(video => (
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
                    ))}
                  </div>
                ))
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
                        {video.folder_path ? ` · ${video.folder_path}` : ""}
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
              <div className="flex flex-col items-center justify-center h-full min-h-[220px] text-muted-foreground text-sm gap-3 p-6 text-center bg-secondary/10">
                <Video size={36} className="opacity-30 text-primary" />
                <div className="space-y-1 max-w-sm">
                  <p className="font-semibold text-foreground text-base">טרם נבחר וידאו לתיוג</p>
                  <p className="text-xs text-muted-foreground">בחר סרטון מספריית הוידאו של המערכת, הדבק קישור חיצוני, או העלה קובץ וידאו מקומי.</p>
                </div>
                <button
                  onClick={handleOpenVideoBrowser}
                  className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all shadow-sm mt-1"
                >
                  <Library size={16} /> עיון בספריית הוידאו (Browse Library)
                </button>
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
                          onClick={e => { e.stopPropagation(); if (isEditing) { setEditingMarkerId(null); setEditTdsMeta(null); } else { handleEditStart(m); } }}
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

                    {/* TDS Meta badges */}
                    {!isEditing && (() => {
                      const tds = markerTdsMeta.get(m.id);
                      if (!tds) return null;
                      return (
                        <div className="px-2.5 pb-2 flex flex-wrap gap-1 border-t border-indigo-500/20 pt-1.5">
                          {tds.basicClass && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                              tds.basicClass === 'META'    ? 'bg-emerald-500/15 text-emerald-400' :
                              tds.basicClass === 'OVERLAP' ? 'bg-amber-500/15 text-amber-400' :
                                                             'bg-blue-500/15 text-blue-400'
                            }`}>{tds.basicClass}</span>
                          )}
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400 font-medium">
                            STG {tds.metaStgScore}/5
                          </span>
                          {tds.metaIntro && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                              META_INTRO
                            </span>
                          )}
                          {tds.missedMeta !== 'none' && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                              tds.missedMeta === 'full' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'
                            }`}>MO {tds.missedMeta === 'full' ? 'מלא' : 'חלקי'} ({tds.moScore})</span>
                          )}
                          {tds.tdReasoning && (
                            <p className="w-full text-xs text-foreground/50 italic leading-relaxed border-t border-indigo-500/20 pt-1 mt-0.5" dir="rtl">
                              <span className="not-italic font-medium text-indigo-400/70">נימוק TDS: </span>{tds.tdReasoning}
                            </p>
                          )}
                        </div>
                      );
                    })()}

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
                        {/* TDS Meta panel in edit form */}
                        {((m.labels ?? [m.label]).some(l => l.startsWith('TDS_'))) && (
                          <TdsMetaPanel
                            form={editTdsMeta ?? EMPTY_TDS_META}
                            onChange={setEditTdsMeta as React.Dispatch<React.SetStateAction<TdsMetaForm>>}
                          />
                        )}
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
              {aiStatus === "completed" && aiEvents.length > 0 && (
                <span className="text-[10px] bg-primary/15 text-primary rounded-full px-1.5 py-0.5 font-bold leading-none">
                  {aiEvents.length}
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

            {/* Completed — show AI events (grouped by timestamp) */}
            {aiStatus === "completed" && aiEvents.length > 0 && (
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Sparkles size={11} className="text-primary" />
                    {aiEvents.length} אירועי AI
                    {acceptedAiKeys.size > 0 && (
                      <span className="text-primary">· {acceptedAiKeys.size} אושרו</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <button onClick={handleTriggerAnalysis}
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                      הרץ שוב
                    </button>
                    {aiEvents.some(e => !acceptedAiKeys.has(e.key)) && (
                      <button onClick={handleAcceptAllAiEvents}
                        className="flex items-center gap-1 text-[10px] bg-primary/10 text-primary hover:bg-primary/20 px-2 py-1 rounded transition-colors font-medium">
                        <CheckCheck size={10} /> קבל הכל
                      </button>
                    )}
                  </div>
                </div>

                {/* Event list */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                  {aiEvents.map(event => {
                    const accepted = acceptedAiKeys.has(event.key);
                    const isProsodic = event.evidence_text?.startsWith("[PROSODIC]");
                    const evidence = isProsodic
                      ? event.evidence_text?.replace("[PROSODIC]", "").trim()
                      : event.evidence_text;
                    const conf = event.confidence_score ?? 0;
                    const confLabel = conf >= 0.8 ? "חזק" : conf >= 0.5 ? "בינוני" : "חלש";
                    const confCls = conf >= 0.8
                      ? "text-emerald-400 border-emerald-400/30"
                      : conf >= 0.5
                        ? "text-amber-400 border-amber-400/30"
                        : "text-red-400 border-red-400/30";

                    return (
                      <div
                        key={event.key}
                        onClick={() => seekToTime(event.start_time)}
                        className={`rounded-lg border transition-all cursor-pointer ${
                          accepted
                            ? "border-primary/20 bg-primary/5 opacity-60"
                            : "border-border hover:border-primary/30 hover:bg-secondary/30"
                        }`}
                      >
                        <div className="flex items-start gap-2 px-2.5 py-2">
                          {/* Code chips */}
                          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                            {event.code_ids.map((codeId, i) => {
                              const c = CODE_COLORS[codeId] ?? "#6366f1";
                              return (
                                <span key={`${codeId}-${i}`}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border"
                                  style={{ borderColor: c + "50", backgroundColor: c + "18", color: c }}>
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c }} />
                                  {codeId}
                                </span>
                              );
                            })}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold leading-none">AI</span>
                            {isProsodic && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-400 font-semibold leading-none flex items-center gap-0.5">
                                <Mic size={7} /> פרוסודי
                              </span>
                            )}
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border ${confCls} leading-none`}>
                              {confLabel} {Math.round(conf * 100)}%
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground bg-background px-1.5 py-0.5 rounded">
                              {formatTime(event.start_time)}
                            </span>
                          </div>
                        </div>

                        {/* Evidence + reasoning */}
                        {(evidence || event.reasoning) && (
                          <div className="px-2.5 pb-1 space-y-1">
                            {evidence && (
                              <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2" dir="rtl">
                                {evidence}
                              </p>
                            )}
                            {event.reasoning && (
                              <p className="text-[10px] text-foreground/40 italic leading-relaxed line-clamp-3 border-t border-border/20 pt-1" dir="rtl">
                                <span className="not-italic font-medium text-muted-foreground/50">נימוק: </span>{event.reasoning}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Accept button */}
                        {!accepted ? (
                          <div className="px-2.5 pb-2">
                            <button
                              onClick={e => { e.stopPropagation(); handleAcceptAiEvent(event); }}
                              className="flex items-center gap-1 text-[10px] bg-primary/10 hover:bg-primary/20 text-primary px-2.5 py-1 rounded transition-colors font-medium w-full justify-center"
                            >
                              <Check size={10} /> קבל אירוע
                            </button>
                          </div>
                        ) : (
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

            {aiStatus === "completed" && aiEvents.length === 0 && (
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
              <div className="space-y-1.5">
                {!isEmbedMode && (
                  <div className="flex items-center gap-2">
                    <button onClick={handleSetStartTime}
                      className="flex-1 py-1.5 rounded-md text-xs transition-all border bg-secondary hover:bg-secondary/80 border-border text-muted-foreground">
                      ← הגדר כניסה
                    </button>
                    <span className="text-muted-foreground text-xs">–</span>
                    <button onClick={handleSetEndTime}
                      className="flex-1 py-1.5 rounded-md text-xs transition-all border bg-secondary hover:bg-secondary/80 border-border text-muted-foreground">
                      הגדר יציאה →
                    </button>
                  </div>
                )}
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

            {/* ── TDS Meta-Coding panel ─────────────────────────────────── */}
            {hasTdsCode && (
              <TdsMetaPanel form={tdsMetaForm} onChange={setTdsMetaForm} />
            )}

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
