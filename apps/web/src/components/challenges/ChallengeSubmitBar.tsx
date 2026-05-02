import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Challenge } from "@/lib/api";

interface ChallengeSubmitBarProps {
  challenge: Challenge;
  flagValue: string;
  userCanSubmit: boolean;
  hintsOpen: boolean;
  onFlagChange: (slug: string, value: string) => void;
  onSolve: (slug: string) => void;
  onToggleHints: (slug: string) => void;
}

export function ChallengeSubmitBar({
  challenge,
  flagValue,
  userCanSubmit,
  hintsOpen,
  onFlagChange,
  onSolve,
  onToggleHints,
}: ChallengeSubmitBarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Input
        placeholder="Enter flag"
        value={flagValue}
        onChange={(event) => onFlagChange(challenge.slug, event.target.value)}
        disabled={challenge.solved}
      />
      <Button onClick={() => onSolve(challenge.slug)} disabled={challenge.solved || !userCanSubmit}>
        Submit Flag
      </Button>
      <Button variant="outline" onClick={() => onToggleHints(challenge.slug)} aria-expanded={hintsOpen}>
        {hintsOpen ? "Hide hints" : "Hints"}
      </Button>
    </div>
  );
}
