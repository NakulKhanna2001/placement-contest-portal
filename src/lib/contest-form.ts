import type { Difficulty } from "./types";

export interface ContestEditorData {
  id: number;
  revision: number;
  title: string;
  startsAt: string;
  status: "draft" | "scheduled";
  graceSeconds: number;
  bonusWindowSeconds: number;
  bonusMultiplier: number;
  batches: { difficulty: Difficulty; title: string; slug: string }[][];
}
