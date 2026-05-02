import type { Challenge } from "@/lib/api";

export function ChallengeLearningObjectives({ challenge }: { challenge: Challenge }) {
  if (!challenge.learningObjectives?.length) return null;

  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
      <p className="mb-2 font-medium">Learning Objectives</p>
      <ul className="space-y-1 text-muted-foreground">
        {challenge.learningObjectives.map((objective) => (
          <li key={objective}>- {objective}</li>
        ))}
      </ul>
    </div>
  );
}
