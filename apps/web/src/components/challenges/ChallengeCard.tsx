import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Challenge, ChallengeActionResult, Hint } from "@/lib/api";
import { ChallengeHints } from "./ChallengeHints";
import { ChallengeLearningObjectives } from "./ChallengeLearningObjectives";
import { ChallengeMessage } from "./ChallengeMessage";
import { ChallengeSubmitBar } from "./ChallengeSubmitBar";
import { ChallengeSurface } from "./ChallengeSurface";

const difficultyClasses: Record<Challenge["difficulty"], string> = {
  easy: "bg-green-100 text-green-800 border-green-200 hover:bg-green-100 hover:text-green-800",
  medium: "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 hover:text-amber-800",
  hard: "bg-red-100 text-red-800 border-red-200 hover:bg-red-100 hover:text-red-800",
};

interface ChallengeCardProps {
  challenge: Challenge;
  flagValue: string;
  userCanSubmit: boolean;
  message?: ChallengeActionResult;
  surfaceResult?: { data?: unknown; error?: string; loading?: boolean };
  hintsOpen: boolean;
  hints?: Hint[];
  hintsLoading?: boolean;
  hintExpandedByLevel?: Record<number, boolean>;
  onFlagChange: (slug: string, value: string) => void;
  onSolve: (slug: string) => void;
  onCallSurfaceApi: (slug: string, route: string) => void;
  onToggleHints: (slug: string) => void;
  onExpandHint: (slug: string, level: number, open: boolean) => void;
  onExpandAllHints: (slug: string, levels: number[]) => void;
  onCollapseAllHints: (slug: string) => void;
}

export function ChallengeCard(props: ChallengeCardProps) {
  const { challenge } = props;

  return (
    <Card className={challenge.solved ? "opacity-80" : ""}>
      <CardHeader className="space-y-3">
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <CardTitle className="text-xl">
              {challenge.solved ? "Solved" : "Open"}: {challenge.name}
            </CardTitle>
            <div className="flex gap-2 sm:justify-end sm:self-start">
              <Badge className={`${difficultyClasses[challenge.difficulty]} whitespace-nowrap`}>
                {challenge.difficulty}
              </Badge>
              <Badge variant="secondary" className="whitespace-nowrap">{challenge.category}</Badge>
            </div>
          </div>
          <div className="space-y-1">
            {challenge.summary && <p className="text-sm font-medium text-foreground/80">{challenge.summary}</p>}
            <CardDescription>{challenge.description}</CardDescription>
          </div>
        </div>
        <ChallengeLearningObjectives challenge={challenge} />
      </CardHeader>
      <CardContent className="space-y-4">
        <ChallengeSurface challenge={challenge} result={props.surfaceResult} onCallApi={props.onCallSurfaceApi} />
        <ChallengeSubmitBar
          challenge={challenge}
          flagValue={props.flagValue}
          userCanSubmit={props.userCanSubmit}
          hintsOpen={props.hintsOpen}
          onFlagChange={props.onFlagChange}
          onSolve={props.onSolve}
          onToggleHints={props.onToggleHints}
        />
        <ChallengeHints
          slug={challenge.slug}
          open={props.hintsOpen}
          hints={props.hints}
          loading={props.hintsLoading}
          expandedByLevel={props.hintExpandedByLevel}
          onExpandHint={props.onExpandHint}
          onExpandAll={props.onExpandAllHints}
          onCollapseAll={props.onCollapseAllHints}
        />
        <ChallengeMessage message={props.message} />
      </CardContent>
    </Card>
  );
}
