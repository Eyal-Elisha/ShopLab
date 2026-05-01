import { useEffect, useRef, useState } from "react";
import { MessageCircle, Maximize2, Minimize2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { api, extractApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Role = "user" | "assistant";

export type ChatLine = { id: string; role: Role; text: string };

function nextId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function SupportChatPanel({
  className,
  title = "ShopLab support",
  subtitle = "Orders, shipping, and returns — we’re here to help.",
  initialLines,
}: {
  className?: string;
  title?: string;
  subtitle?: string;
  initialLines?: ChatLine[];
}) {
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
      const { reply } = await api.sendSupportConciergeMessage(text);
      setLines((prev) => [...prev, { id: nextId(), role: "assistant", text: reply }]);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cn("flex flex-col min-h-0", className)}>
      <div className="px-1 pb-2 border-b border-border/60">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>

      <ScrollArea className="flex-1 min-h-[200px] pr-2">
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

      {error && (
        <p className="text-xs text-destructive mb-2" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-2 border-t border-border/60">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          className="min-h-[72px] resize-none text-sm"
          disabled={pending}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button type="button" className="self-end shrink-0" disabled={pending} onClick={() => void send()}>
          <Send className="w-4 h-4" />
          <span className="sr-only">Send</span>
        </Button>
      </div>
    </div>
  );
}

/** Floating help chat on the home page. */
export function SupportChatDock() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!open) {
      setExpanded(false);
    }
  }, [open]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none">
      {open && (
        <Card
          className={cn(
            "pointer-events-auto shadow-xl border-primary/20 flex flex-col transition-[width,height,max-width,max-height] duration-200 ease-out",
            expanded
              ? "w-[min(100vw-1.5rem,28rem)] sm:w-[min(100vw-2rem,40rem)] h-[min(92vh,44rem)] max-h-[92vh]"
              : "w-[min(100vw-2rem,22rem)] h-[min(70vh,28rem)]"
          )}
        >
          <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2 pt-4 px-4">
            <CardTitle className="text-base font-display pr-2 leading-tight">Help &amp; support</CardTitle>
            <div className="flex shrink-0 gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setExpanded((v) => !v)}
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
                aria-label="Close support chat"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col min-h-0 px-4 pb-4 pt-0">
            <SupportChatPanel className="flex-1" title="Online support" subtitle="Typical questions: order status, delivery, returns." />
          </CardContent>
        </Card>
      )}

      <Button
        type="button"
        size="lg"
        className="pointer-events-auto h-14 w-14 rounded-full shadow-lg gap-0 p-0"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Hide support chat" : "Open support chat"}
      >
        <MessageCircle className="h-6 w-6" />
      </Button>
    </div>
  );
}
