import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Maximize2, Minimize2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { api, extractApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Role = "user" | "assistant";

/** POST /api/support-chat `challengeMode` (LLM01 / LLM10 lab switch). */
export type SupportChallengeMode = "llm01" | "llm10";

export type ChatLine = { id: string; role: Role; text: string };

const MIN_PANEL = { w: 300, h: 320 };
const HANDLE = 8;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function compactDefaults() {
  if (typeof window === "undefined") {
    return { w: 352, h: 448 };
  }
  return {
    w: Math.min(window.innerWidth - 32, 352),
    h: Math.min(Math.round(window.innerHeight * 0.7), 448),
  };
}

function expandedDefaults() {
  if (typeof window === "undefined") {
    return { w: 640, h: 704 };
  }
  const wCap = window.innerWidth >= 640 ? Math.min(window.innerWidth - 32, 640) : Math.min(window.innerWidth - 24, 448);
  return {
    w: wCap,
    h: Math.min(Math.round(window.innerHeight * 0.92), 704),
  };
}

function maxPanel() {
  if (typeof window === "undefined") {
    return { w: 1200, h: 900 };
  }
  return {
    w: window.innerWidth - 16,
    h: window.innerHeight - 120,
  };
}

function nextId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function SupportChatPanel({
  className,
  title = "ShopLab support",
  subtitle = "Orders, shipping, and returns — we’re here to help.",
  initialLines,
  defaultChallengeMode = "llm01",
  showChallengeModeSelector = true,
}: {
  className?: string;
  title?: string;
  subtitle?: string;
  initialLines?: ChatLine[];
  /** Sent as JSON `challengeMode` on each Support Chat request. */
  defaultChallengeMode?: SupportChallengeMode;
  showChallengeModeSelector?: boolean;
}) {
  const [challengeMode, setChallengeMode] = useState<SupportChallengeMode>(defaultChallengeMode);
  const [lines, setLines] = useState<ChatLine[]>(
    () =>
      initialLines ?? [
        {
          id: nextId(),
          role: "assistant",
          text: "Hi — thanks for contacting ShopLab. How can we help you today?",
        },
      ]
  );
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, pending]);

  async function send() {
    const text = draft.trim();
    if (!text || pending) return;

    setError(null);
    setDraft("");
    const userLine: ChatLine = { id: nextId(), role: "user", text };
    setLines((prev) => [...prev, userLine]);
    setPending(true);

    try {
      const history = lines.map((line) => ({
        role: line.role,
        content: line.text,
      }));
      const { reply } = await api.sendSupportChatMessage(text, history, challengeMode);
      setLines((prev) => [...prev, { id: nextId(), role: "assistant", text: reply }]);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="shrink-0 border-b border-border/60 px-1 pb-2 space-y-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {showChallengeModeSelector && (
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <Label htmlFor="support-challenge-mode" className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
              Challenge mode
            </Label>
            <Select value={challengeMode} onValueChange={(v) => setChallengeMode(v as SupportChallengeMode)}>
              <SelectTrigger id="support-challenge-mode" className="h-8 text-xs sm:min-w-[200px]" aria-label="Challenge mode">
                <SelectValue placeholder="Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="llm01">LLM01 — Prompt injection</SelectItem>
                <SelectItem value="llm10">LLM10 — Unbounded consumption</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <ScrollArea className="h-full max-h-full min-h-[120px] pr-2">
        <ul className="space-y-3 py-3">
          {lines.map((line) => (
            <li
              key={line.id}
              className={cn(
                "max-w-[92%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                line.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "mr-auto bg-muted/80 text-foreground"
              )}
            >
              {line.text}
            </li>
          ))}
          {pending && (
            <li className="mr-auto rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground italic">
              Typing…
            </li>
          )}
          <div ref={listEndRef} />
        </ul>
        </ScrollArea>
      </div>

      {error && (
        <p className="mb-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="shrink-0 flex items-center gap-2 border-t border-border/60 pt-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          rows={1}
          className="!h-10 !min-h-10 !max-h-10 resize-none py-2 text-sm leading-snug"
          disabled={pending}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button type="button" variant="default" size="icon" className="h-10 w-10 shrink-0" disabled={pending} onClick={() => void send()}>
          <Send className="h-4 w-4" />
          <span className="sr-only">Send</span>
        </Button>
      </div>
    </div>
  );
}

type ResizeEdge = "e" | "n";

/** Floating help chat on the home page. */
export function SupportChatDock() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [panelSize, setPanelSize] = useState(compactDefaults);
  const panelSizeRef = useRef(panelSize);
  const preExpandSize = useRef<{ w: number; h: number }>(compactDefaults());

  useEffect(() => {
    panelSizeRef.current = panelSize;
  }, [panelSize]);

  useEffect(() => {
    if (!open) {
      setExpanded(false);
    }
  }, [open]);

  useEffect(() => {
    function onResize() {
      setPanelSize((s) => {
        const max = maxPanel();
        return {
          w: clamp(s.w, MIN_PANEL.w, max.w),
          h: clamp(s.h, MIN_PANEL.h, max.h),
        };
      });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const startResize = useCallback((edge: ResizeEdge) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const { w: sw, h: sh } = panelSizeRef.current;
    const start = { cx: e.clientX, cy: e.clientY, w: sw, h: sh };

    function onMove(ev: MouseEvent) {
      const m = maxPanel();
      if (edge === "e") {
        const dw = ev.clientX - start.cx;
        setPanelSize({
          w: clamp(start.w + dw, MIN_PANEL.w, m.w),
          h: clamp(start.h, MIN_PANEL.h, m.h),
        });
      } else {
        const dh = start.cy - ev.clientY;
        setPanelSize({
          w: clamp(start.w, MIN_PANEL.w, m.w),
          h: clamp(start.h + dh, MIN_PANEL.h, m.h),
        });
      }
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  function toggleExpanded() {
    setExpanded((was) => {
      if (!was) {
        preExpandSize.current = panelSizeRef.current;
        const d = expandedDefaults();
        const m = maxPanel();
        setPanelSize({ w: clamp(d.w, MIN_PANEL.w, m.w), h: clamp(d.h, MIN_PANEL.h, m.h) });
        return true;
      }
      const { w, h } = preExpandSize.current;
      const m = maxPanel();
      setPanelSize({ w: clamp(w, MIN_PANEL.w, m.w), h: clamp(h, MIN_PANEL.h, m.h) });
      return false;
    });
  }

  return (
    <div className="pointer-events-none fixed bottom-6 left-6 z-50 flex flex-col items-start gap-3">
      {open && (
        <div
          className="pointer-events-auto relative overflow-visible rounded-lg shadow-xl"
          style={{ width: panelSize.w, height: panelSize.h }}
        >
          <Card className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border-primary/20">
            {/* Top edge: drag up/down to resize height */}
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize chat height"
              className="absolute left-12 right-12 top-0 z-30 -translate-y-1/2 cursor-ns-resize touch-none"
              style={{ height: HANDLE }}
              onMouseDown={startResize("n")}
            />

            {/* Right edge: drag sideways to resize width */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize chat width"
              className="absolute bottom-28 right-0 top-14 z-30 w-3 translate-x-1/2 cursor-ew-resize touch-none"
              onMouseDown={startResize("e")}
            />

            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2 pt-4 px-4">
              <CardTitle className="pr-2 font-display text-base leading-tight">Help &amp; support</CardTitle>
              <div className="flex shrink-0 gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => toggleExpanded()}
                  aria-label={expanded ? "Use smaller chat panel" : "Enlarge chat panel"}
                  aria-pressed={expanded}
                >
                  {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setOpen(false)}
                  aria-label="Close Support Chat"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-0">
              <SupportChatPanel
                className="flex-1"
                title="Online support"
                subtitle="Typical questions: order status, delivery, returns."
              />
            </CardContent>
          </Card>
        </div>
      )}

      <Button
        type="button"
        size="lg"
        className="pointer-events-auto h-14 w-14 rounded-full p-0 shadow-lg"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Hide Support Chat" : "Open Support Chat"}
      >
        <MessageCircle className="h-6 w-6" />
      </Button>
    </div>
  );
}
