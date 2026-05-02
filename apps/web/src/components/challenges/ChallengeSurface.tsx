import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Challenge } from "@/lib/api";

interface ChallengeSurfaceProps {
  challenge: Challenge;
  result?: { data?: unknown; error?: string; loading?: boolean };
  onCallApi: (slug: string, route: string) => void;
}

export function ChallengeSurface({ challenge, result, onCallApi }: ChallengeSurfaceProps) {
  if (!challenge.surface) return null;

  const { route, label, title, description } = challenge.surface;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ArrowRight className="h-4 w-4 text-primary" />
            {title}
          </p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {route.startsWith("/api") ? (
          <Button
            variant="secondary"
            onClick={() => onCallApi(challenge.slug, route)}
            disabled={result?.loading}
          >
            {result?.loading ? "Calling..." : label}
          </Button>
        ) : (
          <Button asChild variant="secondary">
            <Link to={route}>{label}</Link>
          </Button>
        )}
      </div>
      {result && (
        <div className="mt-3 max-h-48 overflow-auto rounded border bg-background p-3 text-xs font-mono">
          {result.loading && <p className="text-muted-foreground italic">Fetching result...</p>}
          {result.error && <p className="text-destructive">Error: {result.error}</p>}
          {result.data && (
            <pre className="text-foreground">{JSON.stringify(result.data, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}
