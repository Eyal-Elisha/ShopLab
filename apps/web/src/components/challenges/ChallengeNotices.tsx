import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function SignedOutNotice() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-medium">Sign in to track progress per user</p>
          <p className="text-sm text-muted-foreground">
            You can browse the template and read hints without logging in, but submitting flags and
            running authenticated challenge interactions requires an account.
          </p>
        </div>
        <Button asChild>
          <Link to="/login">Sign In</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function AuthNotice({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {message}
    </div>
  );
}

export function EmptyChallengeState({ hasFilters }: { hasFilters: boolean }) {
  const message = hasFilters
    ? "No challenges match the selected filters."
    : "No challenges are registered yet.";

  return (
    <Card className="border-dashed">
      <CardContent className="px-6 py-8 text-center text-sm text-muted-foreground">
        {message}
      </CardContent>
    </Card>
  );
}
