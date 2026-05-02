import type { Challenge } from "@/lib/api";

export type SubjectFilter = "all" | "llm" | "api" | "web";
export type DifficultyFilter = "all" | Challenge["difficulty"];

export const subjectOptions: Array<{ value: SubjectFilter; label: string }> = [
  { value: "all", label: "All Subjects" },
  { value: "llm", label: "LLM" },
  { value: "api", label: "API Security" },
  { value: "web", label: "Web Challenges" },
];

export const difficultyOptions: Array<{ value: DifficultyFilter; label: string }> = [
  { value: "all", label: "All Levels" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

export function getChallengeSubject(category: string): Exclude<SubjectFilter, "all"> {
  if (category.startsWith("LLM")) return "llm";
  if (category.startsWith("API")) return "api";
  return "web";
}

export function filterChallenges(
  challenges: Challenge[],
  subject: SubjectFilter,
  difficulty: DifficultyFilter,
) {
  return challenges.filter((challenge) => {
    const matchesSubject = subject === "all" || getChallengeSubject(challenge.category) === subject;
    const matchesDifficulty = difficulty === "all" || challenge.difficulty === difficulty;
    return matchesSubject && matchesDifficulty;
  });
}
