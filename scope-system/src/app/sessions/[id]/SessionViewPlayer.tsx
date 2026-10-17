"use client";

import { useState, type CSSProperties } from "react";
import { VideoPlayer, type VideoMarker, type Caption } from "@/components/video/VideoPlayer";
import { Video, Play, Tag } from "lucide-react";
import { CODE_COLORS } from "@/lib/codeColors";

type TagRow = {
  id: string; code_id: string; start_time: number; end_time: number;
  evidence_text: string | null; reasoning: string | null; confidence_score: number | null;
};
type EventGroup = TagRow[];

function fmtTime(s: number) {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `${m}:${ss < 10 ? "0" : ""}${ss}`;
}

// dir="auto" prose (globals.css applies --font-hebrew only to dir="rtl" /
// :lang(he) blocks). The bare "Geist" face has no Hebrew in its unicode-range,
// so Latin renders in Geist and Hebrew falls through to Heebo, matching the
// rtl reasoning line. var(--font-geist-sans) is not first because it ends in the
// Arial-based "Geist Fallback", which would catch Hebrew before Heebo.
const autoDirFont = "font-[family-name:Geist,var(--font-hebrew),var(--font-geist-sans),system-ui,sans-serif]";

interface Props {
  videoUrl: string | null;
  markers: VideoMarker[];
  events: EventGroup[];
  captions?: Caption[];
}

export function SessionViewPlayer({ videoUrl, markers, events, captions = [] }: Props) {
  const [seekRequest, setSeekRequest] = useState<{ time: number; seq: number } | null>(null);

  const seekTo = (time: number) => {
    setSeekRequest(prev => ({ time, seq: (prev?.seq ?? 0) + 1 }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Video */}
      <div className="lg:col-span-2 min-w-0">
        {videoUrl ? (
          <VideoPlayer url={videoUrl} markers={markers} seekRequest={seekRequest} captions={captions} />
        ) : (
          <div className="empty-state aspect-video rounded-xl py-6">
            <div className="empty-state-icon" aria-hidden="true">
              <Video size={22} />
            </div>
            <p className="text-sm">No video linked to this session.</p>
          </div>
        )}
      </div>

      {/* Event list: one card with a fixed header and timeline rows
          (time column + content), like the tagging workspace */}
      <div className="card flex flex-col min-w-0 overflow-hidden max-h-[560px] lg:max-h-[min(72vh,640px)]">
        <div className="panel-header">
          <p className="eyebrow">
            Events ({events.length})
          </p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {events.length === 0 ? (
            <div className="empty-state empty-state-compact">
              <div className="empty-state-icon" aria-hidden="true">
                <Tag size={20} />
              </div>
              <p className="text-sm">No tags in this session.</p>
            </div>
          ) : (
            events.map(group => {
              const first = group[0];
              const codes = Array.from(new Set(group.map(t => t.code_id)));
              const strengthLabel =
                first.confidence_score == null ? null :
                first.confidence_score >= 0.8 ? { text: "חזק", cls: "tone-success" } :
                first.confidence_score >= 0.5 ? { text: "בינוני", cls: "tone-warning" } :
                { text: "חלש", cls: "tone-danger" };

              return (
                <div
                  key={first.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Seek to ${fmtTime(first.start_time)}`}
                  className="timeline-row last:border-b-0 cursor-pointer group/event active:bg-secondary outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  onClick={() => seekTo(first.start_time)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      seekTo(first.start_time);
                    }
                  }}
                  title={`Seek to ${fmtTime(first.start_time)}`}
                >
                  {/* Time column: start (+ play hint) and "→ end", like the
                      tagging timeline (a group shares one start/end) */}
                  <div className="flex flex-col gap-0.5 self-start pt-px">
                    <div className="flex items-center gap-1.5">
                      <span className="timeline-time">
                        {fmtTime(first.start_time)}
                      </span>
                      <Play size={12} className="text-muted-foreground/70 group-hover/event:text-primary group-focus-visible/event:text-primary transition-colors shrink-0" />
                    </div>
                    {first.end_time > first.start_time && (
                      <span className="timeline-time-end">→ {fmtTime(first.end_time)}</span>
                    )}
                  </div>

                  {/* Content column */}
                  <div className="min-w-0 flex flex-col gap-2">
                    {/* Code chips + strength */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {codes.map((code, i) => {
                        const c = CODE_COLORS[code] ?? "#6b7280";
                        return (
                          <span
                            key={`${code}-${i}`}
                            className="code-chip font-mono font-medium"
                            style={{ "--code": c } as CSSProperties}
                          >
                            <span className="code-dot" />
                            {code}
                          </span>
                        );
                      })}
                      {strengthLabel && (
                        <span dir="rtl" className={`badge ${strengthLabel.cls}`}>
                          {strengthLabel.text}
                        </span>
                      )}
                    </div>

                    {(first.evidence_text || first.reasoning) && (
                      <div className="flex flex-col gap-1.5">
                        {first.evidence_text && (
                          /* dir=auto: English evidence stays LTR */
                          <p className={`reading text-start text-foreground ${autoDirFont}`} dir="auto">
                            {first.evidence_text}
                          </p>
                        )}
                        {first.reasoning && (
                          /* Always opens with the Hebrew label, so dir=auto would resolve to rtl anyway; rtl also applies the Hebrew face */
                          <p className="reasoning-quote text-start text-[0.8125rem] leading-relaxed" dir="rtl">
                            <span className="font-semibold text-foreground/70">נימוק: </span>{first.reasoning}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
