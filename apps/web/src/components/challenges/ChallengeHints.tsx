import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Hint } from "@/lib/api";

interface ChallengeHintsProps {
  slug: string;
  open: boolean;
  hints?: Hint[];
  loading?: boolean;
  expandedByLevel?: Record<number, boolean>;
  onExpandHint: (slug: string, level: number, open: boolean) => void;
  onExpandAll: (slug: string, levels: number[]) => void;
  onCollapseAll: (slug: string) => void;
}

export function ChallengeHints({
  slug,
  open,
  hints = [],
  loading,
  expandedByLevel,
  onExpandHint,
  onExpandAll,
  onCollapseAll,
}: ChallengeHintsProps) {
  if (!open) return null;

  const levels = hints.map((hint) => hint.level);

  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">Hints</p>
        {hints.length > 0 && (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onExpandAll(slug, levels)}>
              Show all
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onCollapseAll(slug)}>
              Hide all
            </Button>
          </div>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading hints...</p>}
      {!loading && hints.length === 0 && (
        <p className="text-sm text-muted-foreground">No hints for this challenge.</p>
      )}
      {!loading &&
        hints.map((hint) => (
          <HintDisclosure
            key={`${slug}-${hint.level}`}
            hint={hint}
            open={Boolean(expandedByLevel?.[hint.level])}
            onOpenChange={(next) => onExpandHint(slug, hint.level, next)}
          />
        ))}
    </div>
  );
}

function HintDisclosure({
  hint,
  open,
  onOpenChange,
}: {
  hint: Hint;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className="rounded-md border bg-background">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium hover:bg-muted/50 [&[data-state=open]>svg]:rotate-180">
          <span>Hint {hint.level}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t px-3 py-3 text-sm leading-relaxed text-muted-foreground">{hint.hint}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
