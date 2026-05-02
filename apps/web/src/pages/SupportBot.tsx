import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SupportChatPanel } from "@/components/SupportChatWidget";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function SupportBot() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Home
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/products">Shop</Link>
        </Button>
      </div>

      <div className="space-y-2">
        <h1 className="font-display text-3xl font-bold">Customer support</h1>
        <p className="text-muted-foreground text-sm max-w-xl">
          Questions about an order, delivery, or return? Chat with our team below — same live help as on the homepage.
        </p>
      </div>

      <Card className="border-primary/15 shadow-md min-h-[480px] flex flex-col">
        <CardHeader>
          <CardTitle className="font-display text-xl">Live chat</CardTitle>
          <CardDescription>
            For your security, don&apos;t send full card numbers or account passwords here. Have your order number ready if
            applicable.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-[420px]">
          <SupportChatPanel
            className="flex-1"
            title="Online support"
            subtitle="We’ll do our best to resolve your question quickly."
          />
        </CardContent>
      </Card>
    </div>
  );
}
