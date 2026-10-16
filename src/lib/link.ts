export function parseSubmissionId(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (!["leetcode.com", "www.leetcode.com"].includes(url.hostname)) return null;
    return (url.pathname.match(/^\/submissions\/detail\/(\d+)\/?$/) ?? url.pathname.match(/^\/problems\/[^/]+\/submissions\/(\d+)\/?$/))?.[1] ?? null;
  } catch { return null; }
}
