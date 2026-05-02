import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { api, extractApiError, type Challenge, type ChallengeActionResult, type Hint } from "@/lib/api";

const difficultyClasses: Record<Challenge["difficulty"], string> = {
  easy: "bg-green-100 text-green-800 border-green-200 hover:bg-green-100 hover:text-green-800",
  medium: "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 hover:text-amber-800",
  hard: "bg-red-100 text-red-800 border-red-200 hover:bg-red-100 hover:text-red-800",
};

export default function Challenges() {
  const { user, isReady } = useAuth();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [flagInputs, setFlagInputs] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, ChallengeActionResult | undefined>>({});
  const [hintsBySlug, setHintsBySlug] = useState<Record<string, Hint[]>>({});
  const [surfaceResults, setSurfaceResults] = useState<Record<string, { data?: any; error?: string; loading?: boolean }>>({});
  const [hintsPanelOpen, setHintsPanelOpen] = useState<Record<string, boolean>>({});
  const [hintsLoading, setHintsLoading] = useState<Record<string, boolean>>({});
  /** Per-challenge, per hint level: whether that hint's body is expanded */
  const [hintExpandedBySlug, setHintExpandedBySlug] = useState<Record<string, Record<number, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  async function refreshChallenges() {
    const data = await api.getChallenges();
    setChallenges(data.challenges);
  }

  useEffect(() => {
    if (!isReady) {
      return;
    }

    refreshChallenges()
      .catch(() => setLoadError("Unable to load the challenge list from the API."))
      .finally(() => setLoading(false));
  }, [isReady, user?.id]);

  const totals = useMemo(() => {
    const solved = challenges.filter((challenge) => challenge.solved).length;
    return { solved, total: challenges.length };
  }, [challenges]);

  async function solve(slug: string) {
    if (!user) {
      setAuthNotice("Sign in to submit flags and track your own challenge progress.");
      return;
    }

    try {
      const result = await api.solveChallenge(slug, flagInputs[slug] || "");
      setMessages((current) => ({ ...current, [slug]: result }));
      if (result.success) {
        await refreshChallenges();
      }
    } catch (error) {
      const result = error as ChallengeActionResult;
      setMessages((current) => ({
        ...current,
        [slug]: {
          success: false,
          message: extractApiError(result),
        },
      }));
    }
  }

  async function callSurfaceApi(slug: string, route: string) {
    setSurfaceResults((current) => ({
      ...current,
      [slug]: { loading: true },
    }));

    try {
      const data = await api.callAnyApi(route);
      setSurfaceResults((current) => ({
        ...current,
        [slug]: { data, loading: false },
      }));
    } catch (error) {
      setSurfaceResults((current) => ({
        ...current,
        [slug]: { error: extractApiError(error), loading: false },
      }));
    }
  }

  async function ensureHintsLoaded(slug: string) {
    if (hintsBySlug[slug] !== undefined) return;

    setHintsLoading((current) => ({ ...current, [slug]: true }));
    try {
      const result = await api.getHints(slug);
      const sorted = [...(result.hints || [])].sort((a, b) => a.level - b.level);
      setHintsBySlug((current) => ({ ...current, [slug]: sorted }));
    } catch {
      setHintsBySlug((current) => ({ ...current, [slug]: [] }));
    } finally {
      setHintsLoading((current) => ({ ...current, [slug]: false }));
    }
  }

  function toggleHintsPanel(slug: string) {
    const next = !hintsPanelOpen[slug];
    setHintsPanelOpen((current) => ({ ...current, [slug]: next }));
    if (next) {
      void ensureHintsLoaded(slug);
    } else {
      setHintExpandedBySlug((current) => ({ ...current, [slug]: {} }));
    }
  }

  function setHintExpanded(slug: string, level: number, open: boolean) {
    setHintExpandedBySlug((current) => ({
      ...current,
      [slug]: { ...current[slug], [level]: open },
    }));
  }

  function expandAllHints(slug: string, levels: number[]) {
    const next: Record<number, boolean> = {};
    for (const level of levels) next[level] = true;
    setHintExpandedBySlug((current) => ({ ...current, [slug]: next }));
  }

  function collapseAllHints(slug: string) {
    setHintExpandedBySlug((current) => ({ ...current, [slug]: {} }));
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <section className="space-y-3">
        <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5">
          Course Challenge Template
        </Badge>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <h1 className="font-display text-3xl font-bold">Challenges</h1>
            <p className="max-w-2xl text-muted-foreground">
              ShopLab treats challenges as reusable course modules. Real exploit surfaces live in normal site workflows, while this page tracks progress, gives hints, and lets you submit recovered flags.
            </p>
          </div>
          <Card className="w-full md:w-auto">
            <CardContent className="px-6 py-4">
              <p className="text-sm text-muted-foreground">Progress</p>
              <p className="font-display text-2xl font-bold">
                {totals.solved}/{totals.total || 0}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {!user && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium">Sign in to track progress per user</p>
              <p className="text-sm text-muted-foreground">
                You can browse the template and read hints without logging in, but submitting flags and running authenticated challenge interactions requires an account.
              </p>
            </div>
            <Button asChild>
              <Link to="/login">Sign In</Link>
            </Button>
          </CardContent>
        </Card>
      )}
      {authNotice && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {authNotice}
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading challenges...</p>}
      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      {!loading && !loadError && challenges.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="px-6 py-8 text-center text-muted-foreground text-sm">
            No challenges are registered yet. Add a definition under{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-foreground">apps/api/src/challenges/definitions/</code> and
            register it in{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-foreground">registry.js</code>.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {challenges.map((challenge) => (
          <Card key={challenge.id} className={challenge.solved ? "opacity-80" : ""}>
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
                  {challenge.summary && (
                    <p className="text-sm font-medium text-foreground/80">{challenge.summary}</p>
                  )}
                  <CardDescription>{challenge.description}</CardDescription>
                </div>
              </div>
              {challenge.learningObjectives && challenge.learningObjectives.length > 0 && (
                <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                  <p className="mb-2 font-medium">Learning Objectives</p>
                  <ul className="space-y-1 text-muted-foreground">
                    {challenge.learningObjectives.map((objective) => (
                      <li key={objective}>- {objective}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {challenge.surface && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <ArrowRight className="w-4 h-4 text-primary" />
                        {challenge.surface.title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {challenge.surface.description}
                      </p>
                    </div>
                    {challenge.surface.route.startsWith("/api") ? (
                      <Button
                        variant="secondary"
                        onClick={() => callSurfaceApi(challenge.slug, challenge.surface!.route)}
                        disabled={surfaceResults[challenge.slug]?.loading}
                      >
                        {surfaceResults[challenge.slug]?.loading ? "Calling..." : challenge.surface.label}
                      </Button>
                    ) : (
                      <Button asChild variant="secondary">
                        <Link to={challenge.surface.route}>{challenge.surface.label}</Link>
                      </Button>
                    )}
                  </div>
                  {surfaceResults[challenge.slug] && (
                    <div className="mt-3 rounded border bg-background p-3 text-xs font-mono overflow-auto max-h-48">
                      {surfaceResults[challenge.slug].loading && <p className="text-muted-foreground italic">Fetching result...</p>}
                      {surfaceResults[challenge.slug].error && <p className="text-destructive">Error: {surfaceResults[challenge.slug].error}</p>}
                      {surfaceResults[challenge.slug].data && (
                        <pre className="text-foreground">{JSON.stringify(surfaceResults[challenge.slug].data, null, 2)}</pre>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  placeholder="Enter flag"
                  value={flagInputs[challenge.slug] || ""}
                  onChange={(event) =>
                    setFlagInputs((current) => ({
                      ...current,
                      [challenge.slug]: event.target.value,
                    }))
                  }
                  disabled={challenge.solved}
                />
                <Button onClick={() => solve(challenge.slug)} disabled={challenge.solved || !user}>
                  Submit Flag
                </Button>
                <Button
                  variant="outline"
                  onClick={() => toggleHintsPanel(challenge.slug)}
                  aria-expanded={hintsPanelOpen[challenge.slug] ?? false}
                >
                  {hintsPanelOpen[challenge.slug] ? "Hide hints" : "Hints"}
                </Button>
              </div>

              {hintsPanelOpen[challenge.slug] && (
                <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">Hints</p>
                    {(() => {
                      const all = hintsBySlug[challenge.slug];
                      if (!all || all.length === 0) return null;
                      const levels = all.map((h) => h.level);
                      return (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => expandAllHints(challenge.slug, levels)}
                          >
                            Show all
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => collapseAllHints(challenge.slug)}
                          >
                            Hide all
                          </Button>
                        </div>
                      );
                    })()}
                  </div>

                  {hintsLoading[challenge.slug] && (
                    <p className="text-sm text-muted-foreground">Loading hints…</p>
                  )}

                  {!hintsLoading[challenge.slug] && hintsBySlug[challenge.slug]?.length === 0 && (
                    <p className="text-sm text-muted-foreground">No hints for this challenge.</p>
                  )}

                  {!hintsLoading[challenge.slug] &&
                    (hintsBySlug[challenge.slug] || []).map((hint) => {
                      const open = Boolean(hintExpandedBySlug[challenge.slug]?.[hint.level]);
                      return (
                        <Collapsible
                          key={`${challenge.slug}-${hint.level}`}
                          open={open}
                          onOpenChange={(next) => setHintExpanded(challenge.slug, hint.level, next)}
                        >
                          <div className="rounded-md border bg-background">
                            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium hover:bg-muted/50 [&[data-state=open]>svg]:rotate-180">
                              <span>Hint {hint.level}</span>
                              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="border-t px-3 py-3 text-sm text-muted-foreground leading-relaxed">
                                {hint.hint}
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      );
                    })}
                </div>
              )}

              {messages[challenge.slug] && (
                <div
                  className={`rounded-lg border px-4 py-3 text-sm ${
                    messages[challenge.slug]?.success
                      ? "border-green-200 bg-green-50 text-green-800"
                      : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  {messages[challenge.slug]?.message}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
