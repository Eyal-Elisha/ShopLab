import { useEffect, useMemo, useState } from "react";
import { ChallengeFilters } from "@/components/challenges/ChallengeFilters";
import { ChallengeList } from "@/components/challenges/ChallengeList";
import {
  filterChallenges,
  type DifficultyFilter,
  type SubjectFilter,
} from "@/components/challenges/challengeFilterUtils";
import {
  AuthNotice,
  EmptyChallengeState,
  SignedOutNotice,
} from "@/components/challenges/ChallengeNotices";
import { ChallengePageHeader } from "@/components/challenges/ChallengePageHeader";
import { useChallengeInteractions } from "@/components/challenges/useChallengeInteractions";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Challenge } from "@/lib/api";

export default function Challenges() {
  const { user, isReady } = useAuth();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [subject, setSubject] = useState<SubjectFilter>("all");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");

  async function refreshChallenges() {
    const data = await api.getChallenges();
    setChallenges(data.challenges);
  }

  const interactions = useChallengeInteractions({
    hasUser: Boolean(user),
    onSolved: refreshChallenges,
    onAuthNotice: setAuthNotice,
  });

  useEffect(() => {
    if (!isReady) return;

    refreshChallenges()
      .catch(() => setLoadError("Unable to load the challenge list from the API."))
      .finally(() => setLoading(false));
  }, [isReady, user?.id]);

  const totals = useMemo(() => {
    const solved = challenges.filter((challenge) => challenge.solved).length;
    return { solved, total: challenges.length };
  }, [challenges]);

  const visibleChallenges = useMemo(
    () => filterChallenges(challenges, subject, difficulty),
    [challenges, subject, difficulty],
  );

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <ChallengePageHeader solved={totals.solved} total={totals.total} />
      {!user && <SignedOutNotice />}
      {authNotice && <AuthNotice message={authNotice} />}
      {loading && <p className="text-sm text-muted-foreground">Loading challenges...</p>}
      {loadError && <p className="text-sm text-destructive">{loadError}</p>}
      {!loading && !loadError && visibleChallenges.length === 0 && (
        <EmptyChallengeState hasFilters={challenges.length > 0} />
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
        <ChallengeList
          challenges={visibleChallenges}
          userCanSubmit={Boolean(user)}
          interactions={interactions}
        />
        {!loading && !loadError && challenges.length > 0 && (
          <aside className="lg:sticky lg:top-6">
            <ChallengeFilters
              subject={subject}
              difficulty={difficulty}
              visibleCount={visibleChallenges.length}
              totalCount={challenges.length}
              onSubjectChange={setSubject}
              onDifficultyChange={setDifficulty}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
