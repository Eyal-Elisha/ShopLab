import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  difficultyOptions,
  subjectOptions,
  type DifficultyFilter,
  type SubjectFilter,
} from "./challengeFilterUtils";

interface ChallengeFiltersProps {
  subject: SubjectFilter;
  difficulty: DifficultyFilter;
  visibleCount: number;
  totalCount: number;
  onSubjectChange: (subject: SubjectFilter) => void;
  onDifficultyChange: (difficulty: DifficultyFilter) => void;
}

export function ChallengeFilters({
  subject,
  difficulty,
  visibleCount,
  totalCount,
  onSubjectChange,
  onDifficultyChange,
}: ChallengeFiltersProps) {
  return (
    <section className="rounded-lg border bg-card px-4 py-4 space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-medium">Filter challenges</h2>
        <p className="text-sm text-muted-foreground">
          Showing {visibleCount} of {totalCount}
        </p>
      </div>
      <FilterGroup label="Subject">
        {subjectOptions.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={subject === option.value ? "default" : "outline"}
            size="sm"
            onClick={() => onSubjectChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </FilterGroup>
      <FilterGroup label="Difficulty">
        {difficultyOptions.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={difficulty === option.value ? "default" : "outline"}
            size="sm"
            onClick={() => onDifficultyChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </FilterGroup>
    </section>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="grid gap-2">{children}</div>
    </div>
  );
}
