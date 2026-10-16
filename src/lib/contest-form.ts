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

export function localDateTimeInput(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  const seconds = date.getSeconds() ? `:${pad(date.getSeconds())}` : "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}${seconds}`;
}
