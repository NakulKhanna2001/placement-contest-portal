import type { Difficulty } from "./types";

export type ProblemColumn = {
  id: number; label: string; batchPosition: number;
  problem: { title: string; slug: string; difficulty: Difficulty; points: number } | null;
};
export type ProblemSolve = {
  problemId: number; points: number; multiplier: number;
  acceptedAt: string; verifiedAt: string; source: "auto" | "manual";
};
export type BoardDetails = { problems: ProblemColumn[]; startsAt: string };

export function elapsedSolveTime(acceptedAt: string, startsAt: string) {
  const seconds = Math.max(0, Math.floor((+new Date(acceptedAt) - +new Date(startsAt)) / 1000));
  return `+${[Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, "0")).join(":")}`;
}
