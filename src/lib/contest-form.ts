import type { Difficulty } from "./types";

/** Accept a slug or a LeetCode problem-page URL; never fetch the supplied URL. */
export function parseLeetCodeProblemSlug(input: string): string | null {
  const value = input.trim();
  const validSlug = (slug: string) => slug.length <= 200 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
  if (validSlug(value)) return value;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || !["leetcode.com", "www.leetcode.com"].includes(url.hostname) || url.username || url.password || url.port) return null;
    const slug = url.pathname.match(/^\/(?:contest\/[a-z0-9-]+\/)?problems\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/)?.[1];
    return slug && validSlug(slug) ? slug : null;
  } catch { return null; }
}

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
