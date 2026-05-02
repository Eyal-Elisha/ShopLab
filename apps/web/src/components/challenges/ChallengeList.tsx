import { ChallengeCard } from "./ChallengeCard";
import type { useChallengeInteractions } from "./useChallengeInteractions";
import type { Challenge } from "@/lib/api";

interface ChallengeListProps {
  challenges: Challenge[];
  userCanSubmit: boolean;
  interactions: ReturnType<typeof useChallengeInteractions>;
}

export function ChallengeList({
  challenges,
  userCanSubmit,
  interactions,
}: ChallengeListProps) {
  return (
    <div className="grid gap-4">
      {challenges.map((challenge) => (
        <ChallengeCard
          key={challenge.id}
          challenge={challenge}
          flagValue={interactions.flagInputs[challenge.slug] || ""}
          userCanSubmit={userCanSubmit}
          message={interactions.messages[challenge.slug]}
          surfaceResult={interactions.surfaceResults[challenge.slug]}
          hintsOpen={interactions.hintsPanelOpen[challenge.slug] ?? false}
          hints={interactions.hintsBySlug[challenge.slug]}
          hintsLoading={interactions.hintsLoading[challenge.slug]}
          hintExpandedByLevel={interactions.hintExpandedBySlug[challenge.slug]}
          onFlagChange={interactions.setFlagInput}
          onSolve={interactions.solve}
          onCallSurfaceApi={interactions.callSurfaceApi}
          onToggleHints={interactions.toggleHintsPanel}
          onExpandHint={interactions.setHintExpanded}
          onExpandAllHints={interactions.expandAllHints}
          onCollapseAllHints={interactions.collapseAllHints}
        />
      ))}
    </div>
  );
}
