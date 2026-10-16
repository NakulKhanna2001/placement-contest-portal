// Read-only smoke load against a preview deployment you own.
import { performance } from "node:perf_hooks";
const base = process.env.LOAD_BASE_URL;
const cookie = process.env.LOAD_SESSION_COOKIE;
const contestId = Number(process.env.LOAD_CONTEST_ID);
if (!base || !cookie || !Number.isSafeInteger(contestId) || contestId < 1) {
  throw new Error("Set LOAD_BASE_URL, LOAD_SESSION_COOKIE, and LOAD_CONTEST_ID for your preview deployment.");
}
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 20);
const seconds = Number(process.env.LOAD_SECONDS ?? 15);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 200 || !Number.isFinite(seconds) || seconds < 1 || seconds > 300) throw new Error("Invalid load parameters.");
const durations = [];
const statuses = new Map();
const until = performance.now() + seconds * 1000;
await Promise.all(Array.from({ length: concurrency }, async (_, worker) => {
  let i = worker;
  while (performance.now() < until) {
    const started = performance.now();
    try {
      const response = await fetch(new URL(i++ % 2 ? `/api/leaderboard?contestId=${contestId}` : "/", base), {
        headers: { Cookie: cookie }, redirect: "manual", signal: AbortSignal.timeout(10000),
      });
      await response.arrayBuffer();
      statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
    } catch { statuses.set("network_error", (statuses.get("network_error") ?? 0) + 1); }
    durations.push(performance.now() - started);
  }
}));
durations.sort((a, b) => a - b);
const percentile = p => Math.round(durations[Math.min(durations.length - 1, Math.floor(durations.length * p))] ?? 0);
console.log({ requests: durations.length, statuses: Object.fromEntries(statuses), p50ms: percentile(.5), p95ms: percentile(.95), p99ms: percentile(.99) });
if ([...statuses.keys()].some(status => status !== 200)) process.exitCode = 1;
