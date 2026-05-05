import { useState, useEffect } from "react";
import { Crown, Lock, ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, extractApiError } from "@/lib/api";

interface VipResult {
  flag?: string;
  message?: string;
  error?: string;
  prefs?: Record<string, unknown>;
}

export default function AdminDashboard() {
  const [result, setResult] = useState<VipResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [accessed, setAccessed] = useState(false);

  async function checkAccess() {
    setLoading(true);
    setAccessed(false);
    try {
      const data = await api.callAnyApi("/api/auth/jwt-flag");
      setResult(data);
    } catch (err) {
      const msg = extractApiError(err);
      const raw = err as Record<string, unknown>;
      setResult({ error: msg, message: raw?.message as string | undefined });
    } finally {
      setLoading(false);
      setAccessed(true);
    }
  }

  useEffect(() => {
    checkAccess();
  }, []);

  const isGranted = !!result?.flag;

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${
            !accessed
              ? "bg-muted"
              : isGranted
              ? "bg-red-500/10 ring-2 ring-red-500/30"
              : "bg-destructive/10 ring-2 ring-destructive/20"
          }`}>
            {!accessed ? (
              <Crown className="w-8 h-8 text-muted-foreground" />
            ) : isGranted ? (
              <ShieldCheck className="w-8 h-8 text-red-500" />
            ) : (
              <Lock className="w-8 h-8 text-destructive" />
            )}
          </div>
          <h1 className="text-2xl font-display font-bold">Admin Control Panel</h1>
          <p className="text-sm text-muted-foreground">
            Strictly restricted to ShopLab system administrators.
          </p>
        </div>

        {/* Result card */}
        {accessed && (
          <div className={`rounded-xl border p-6 space-y-4 ${
            isGranted
              ? "border-red-500/30 bg-red-500/5"
              : "border-destructive/30 bg-destructive/5"
          }`}>
            {isGranted ? (
              <>
                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                  ⚡ Access Granted - Welcome, Root User.
                </p>
                <p className="text-sm text-muted-foreground">{result?.message}</p>
                <div className="rounded-lg bg-background border p-3 font-mono text-sm break-all select-all">
                  {result?.flag}
                </div>
                <p className="text-xs text-muted-foreground">
                  Submit this flag on the{" "}
                  <a href="/challenges" className="underline underline-offset-2 hover:text-foreground">
                    Challenges page
                  </a>.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-destructive">
                  🔒 Access Denied
                </p>
                <p className="text-sm text-muted-foreground">
                  {result?.message ||
                    "This area is restricted to system administrators only."}
                </p>

              </>
            )}
          </div>
        )}

        {/* Checking state */}
        {!accessed && (
          <div className="rounded-xl border p-6 text-center text-sm text-muted-foreground animate-pulse">
            Verifying access…
          </div>
        )}

        {/* Refresh button */}
        <Button
          variant="outline"
          className="w-full"
          onClick={checkAccess}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Re-check Access
        </Button>
      </div>
    </div>
  );
}
