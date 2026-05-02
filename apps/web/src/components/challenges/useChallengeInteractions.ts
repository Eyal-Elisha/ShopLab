import { useState } from "react";
import { api, extractApiError, type ChallengeActionResult, type Hint } from "@/lib/api";
interface UseChallengeInteractionsOptions {
  hasUser: boolean;
  onSolved: () => Promise<void>;
  onAuthNotice: (message: string) => void;
}
export function useChallengeInteractions({
  hasUser,
  onSolved,
  onAuthNotice,
}: UseChallengeInteractionsOptions) {
  const [flagInputs, setFlagInputs] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, ChallengeActionResult | undefined>>({});
  const [hintsBySlug, setHintsBySlug] = useState<Record<string, Hint[]>>({});
  const [surfaceResults, setSurfaceResults] = useState<Record<string, { data?: unknown; error?: string; loading?: boolean }>>({});
  const [hintsPanelOpen, setHintsPanelOpen] = useState<Record<string, boolean>>({});
  const [hintsLoading, setHintsLoading] = useState<Record<string, boolean>>({});
  const [hintExpandedBySlug, setHintExpandedBySlug] = useState<Record<string, Record<number, boolean>>>({});
  function setFlagInput(slug: string, value: string) {
    setFlagInputs((current) => ({ ...current, [slug]: value }));
  }
  async function solve(slug: string) {
    if (!hasUser) {
      onAuthNotice("Sign in to submit flags and track your own challenge progress.");
      return;
    }
    try {
      const result = await api.solveChallenge(slug, flagInputs[slug] || "");
      setMessages((current) => ({ ...current, [slug]: result }));
      if (result.success) await onSolved();
    } catch (error) {
      setMessages((current) => ({
        ...current,
        [slug]: { success: false, message: extractApiError(error as ChallengeActionResult) },
      }));
    }
  }
  async function callSurfaceApi(slug: string, route: string) {
    setSurfaceResults((current) => ({ ...current, [slug]: { loading: true } }));
    try {
      const data: unknown = await api.callAnyApi(route);
      setSurfaceResults((current) => ({ ...current, [slug]: { data, loading: false } }));
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
      setHintsBySlug((current) => ({
        ...current,
        [slug]: [...(result.hints || [])].sort((a, b) => a.level - b.level),
      }));
    } catch {
      setHintsBySlug((current) => ({ ...current, [slug]: [] }));
    } finally {
      setHintsLoading((current) => ({ ...current, [slug]: false }));
    }
  }
  function toggleHintsPanel(slug: string) {
    const next = !hintsPanelOpen[slug];
    setHintsPanelOpen((current) => ({ ...current, [slug]: next }));
    if (next) void ensureHintsLoaded(slug);
    else setHintExpandedBySlug((current) => ({ ...current, [slug]: {} }));
  }
  function setHintExpanded(slug: string, level: number, open: boolean) {
    setHintExpandedBySlug((current) => ({ ...current, [slug]: { ...current[slug], [level]: open } }));
  }
  function expandAllHints(slug: string, levels: number[]) {
    setHintExpandedBySlug((current) => ({ ...current, [slug]: Object.fromEntries(levels.map((level) => [level, true])) }));
  }
  function collapseAllHints(slug: string) {
    setHintExpandedBySlug((current) => ({ ...current, [slug]: {} }));
  }
  return { flagInputs, messages, hintsBySlug, surfaceResults, hintsPanelOpen, hintsLoading, hintExpandedBySlug, setFlagInput, solve, callSurfaceApi, toggleHintsPanel, setHintExpanded, expandAllHints, collapseAllHints };
}
