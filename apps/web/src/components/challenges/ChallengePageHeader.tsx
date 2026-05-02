import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface ChallengePageHeaderProps {
  solved: number;
  total: number;
}

export function ChallengePageHeader({ solved, total }: ChallengePageHeaderProps) {
  return (
    <section className="space-y-3">
      <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5">
        Course Challenge Template
      </Badge>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2 lg:max-w-2xl">
          <h1 className="font-display text-3xl font-bold">Challenges</h1>
          <p className="text-muted-foreground">
            ShopLab treats challenges as reusable course modules. Real exploit surfaces live in
            normal site workflows, while this page tracks progress, gives hints, and lets you
            submit recovered flags.
          </p>
        </div>
        <Card className="w-full xl:w-auto xl:shrink-0">
          <CardContent className="px-6 py-4">
            <p className="text-sm text-muted-foreground">Progress</p>
            <p className="font-display text-2xl font-bold">
              {solved}/{total || 0}
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
