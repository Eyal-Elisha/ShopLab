import type { ChallengeActionResult } from "@/lib/api";

export function ChallengeMessage({ message }: { message?: ChallengeActionResult }) {
  if (!message) return null;

  const className = message.success
    ? "border-green-200 bg-green-50 text-green-800"
    : "border-red-200 bg-red-50 text-red-800";

  return <div className={`rounded-lg border px-4 py-3 text-sm ${className}`}>{message.message}</div>;
}
