# Weekly Contest Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a portal that runs a weekly 3-hour contest on real LeetCode problems, verifies students' submission links against LeetCode's public accepted list, scores them with an early-solve multiplier, and ranks them live.

**Architecture:** A Next.js (App Router, TypeScript) app on Vercel backed by Postgres via Drizzle. Business rules live in small pure modules (`link`, `scoring`, `ranking`) and in database-taking services (`contest`, `snapshotter`, `submission-checker`, `reports`). `leetcode-client` is the only module that knows LeetCode's API shape. Tests use Vitest and an in-memory Postgres (PGlite), so no external services are needed to run them.

**Tech Stack:** Next.js, TypeScript, Drizzle ORM + drizzle-kit, `postgres` (production driver), `@electric-sql/pglite` (tests), Auth.js (`next-auth@beta`) with Google OAuth, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-15-weekly-contest-portal-design.md`

## Global Constraints

- Contest is 3 hours with 3 batches unlocking at 0:00, 1:00, 2:00; the batch count is configurable (spec §2).
- Each batch has 2 Easy + 1 Medium + 1 Hard and a 1-hour window (`3600` seconds).
- Base points: Easy 2, Medium 5, Hard 12.
- Early-solve multiplier: 1.5 if `acceptedAt - unlockAt <= 15 minutes` (`900` seconds), otherwise 1.0; both values stored per contest. Points stored with one decimal.
- A solve counts only if `unlockAt <= acceptedAt <= unlockAt + 1 hour`, using LeetCode's timestamp, never our clock.
- Ranking: total points desc, then Hards solved desc, then time of last counted solve asc.
- A link may be submitted until `contest_end + 10 minutes` grace (`600` seconds, configurable).
- Verification matches the submission ID against `seen_submissions` first, then a live fetch. LeetCode returns at most 20 recent accepted entries; the snapshot job runs about every 5 minutes (`300` seconds) with jitter.
- The submission link itself is never fetched (LeetCode keeps it private); only its numeric ID is used.
- Login is Google OAuth restricted to the college email domain, set via env `ALLOWED_EMAIL_DOMAIN`.
- Source code of submissions is never stored or shown.
- One LeetCode account maps to one portal account.
- Disqualified users are excluded from the leaderboard; their solves stay in the data, flagged.
- Every admin action (grant, revoke, report decision, disqualification) writes an `audit_log` row.

---

## File Structure

```
src/
  lib/
    config.ts                 defaults for windows, points, multiplier, grace
    types.ts                  shared types
    link.ts                   parseSubmissionId
    scoring.ts                scoreSolve (pure)
    ranking.ts                rankLeaderboard (pure)
    auth-rules.ts             isAllowedEmail (pure)
  db/
    schema.ts                 Drizzle tables
    index.ts                  Db type + getDb()
    test-db.ts                in-memory PGlite for tests
  leetcode/
    client.ts                 LeetCodeClient
  services/
    audit.ts                  writeAudit
    verification.ts           beginLink, confirmLink
    contest.ts                createContest, findLiveContest, findContestForSubmission, visibleProblems
    snapshotter.ts            snapshotAll
    submission-checker.ts     checkSubmission
    leaderboard.ts            getLeaderboard
    grants.ts                 grantSolve, revokeSolve
    reports.ts                fileReport, reviewReport
  auth.ts                     Auth.js config
  app/
    api/auth/[...nextauth]/route.ts
    api/cron/snapshot/route.ts
    api/link/route.ts
    api/submit/route.ts
    api/leaderboard/route.ts
    api/report/route.ts
    api/admin/contests/route.ts
    api/admin/grants/route.ts
    api/admin/reports/route.ts
    page.tsx                  contest home (problems + submit + leaderboard)
    account/page.tsx          link LeetCode account
    results/[contestId]/page.tsx
    admin/page.tsx
tests/                        mirrors src/
drizzle/                      generated migrations
vercel.json                   cron schedule
```

---

### Task 1: Project scaffold, test runner and defaults

**Files:**
- Create: project via `create-next-app`, `vitest.config.ts`, `src/lib/config.ts`, `src/lib/types.ts`, `tests/config.test.ts`

**Interfaces:**
- Produces: `DEFAULTS`, `Difficulty`, `AcceptedSubmission` used by every later task.

- [ ] **Step 1: Scaffold and install**

If `create-next-app` refuses because the directory already has `docs/` and `.git`, scaffold into a new empty directory outside the project, then move everything except its `.git` into the project root.

```bash
cd /Users/nx/placement-contest-portal
npx create-next-app@latest . --ts --app --src-dir --eslint --no-tailwind --import-alias "@/*" --use-npm
npm i drizzle-orm postgres next-auth@beta
npm i -D vitest drizzle-kit @electric-sql/pglite
```

- [ ] **Step 2: Add Vitest config**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 3: Write the failing test**

```ts
// tests/config.test.ts
import { describe, it, expect } from "vitest";
import { DEFAULTS } from "@/lib/config";

describe("DEFAULTS", () => {
  it("matches the spec", () => {
    expect(DEFAULTS.windowSeconds).toBe(3600);
    expect(DEFAULTS.bonusWindowSeconds).toBe(900);
    expect(DEFAULTS.bonusMultiplier).toBe(1.5);
    expect(DEFAULTS.graceSeconds).toBe(600);
    expect(DEFAULTS.points).toEqual({ easy: 2, medium: 5, hard: 12 });
    expect(DEFAULTS.batchesPerContest).toBe(3);
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL, cannot resolve `@/lib/config`.

- [ ] **Step 5: Implement**

```ts
// src/lib/config.ts
export const DEFAULTS = {
  batchesPerContest: 3,
  batchSpacingSeconds: 3600,
  windowSeconds: 3600,
  bonusWindowSeconds: 900,
  bonusMultiplier: 1.5,
  graceSeconds: 600,
  snapshotIntervalSeconds: 300,
  attemptCooldownSeconds: 5,
  points: { easy: 2, medium: 5, hard: 12 },
} as const;
```

```ts
// src/lib/types.ts
export type Difficulty = "easy" | "medium" | "hard";

export interface AcceptedSubmission {
  id: string;        // LeetCode submission id (numeric string)
  slug: string;      // LeetCode titleSlug
  acceptedAt: Date;  // LeetCode timestamp
}
```

- [ ] **Step 6: Run to see it pass, then commit**

Run: `npx vitest run`
Expected: PASS.

```bash
git add -A
git commit -m "chore: scaffold Next.js app, Vitest and contest defaults

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Submission link parser

**Files:**
- Create: `src/lib/link.ts`, `tests/lib/link.test.ts`

**Interfaces:**
- Produces: `parseSubmissionId(input: string): string | null`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/link.test.ts
import { describe, it, expect } from "vitest";
import { parseSubmissionId } from "@/lib/link";

describe("parseSubmissionId", () => {
  it("parses the detail URL", () => {
    expect(parseSubmissionId("https://leetcode.com/submissions/detail/2161702491/")).toBe("2161702491");
  });
  it("parses the problem-scoped URL", () => {
    expect(parseSubmissionId("https://leetcode.com/problems/two-sum/submissions/2161702491/")).toBe("2161702491");
  });
  it("accepts no trailing slash, query string and surrounding spaces", () => {
    expect(parseSubmissionId("  https://leetcode.com/submissions/detail/55?envType=daily  ")).toBe("55");
  });
  it("rejects other hosts, non-numeric ids and junk", () => {
    expect(parseSubmissionId("https://evil.example/submissions/detail/55/")).toBeNull();
    expect(parseSubmissionId("https://leetcode.com/submissions/detail/abc/")).toBeNull();
    expect(parseSubmissionId("hello")).toBeNull();
    expect(parseSubmissionId("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/lib/link.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/link.ts
export function parseSubmissionId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== "leetcode.com" && host !== "www.leetcode.com") return null;
  const m =
    url.pathname.match(/^\/submissions\/detail\/(\d+)\/?$/) ??
    url.pathname.match(/^\/problems\/[^/]+\/submissions\/(\d+)\/?$/);
  return m ? m[1] : null;
}
```

- [ ] **Step 4: Run to see it pass, then commit**

Run: `npx vitest run tests/lib/link.test.ts`
Expected: PASS.

```bash
git add src/lib/link.ts tests/lib/link.test.ts
git commit -m "feat: parse LeetCode submission ids from links

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Scoring (window rule and multiplier)

**Files:**
- Create: `src/lib/scoring.ts`, `tests/lib/scoring.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ScoreInput {
    basePoints: number; unlockAt: Date; closesAt: Date; acceptedAt: Date;
    bonusWindowSeconds: number; bonusMultiplier: number;
  }
  export type ScoreResult =
    | { ok: true; points: number; multiplier: number }
    | { ok: false; reason: "before_unlock" | "after_close" };
  export function scoreSolve(input: ScoreInput): ScoreResult
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/scoring.test.ts
import { describe, it, expect } from "vitest";
import { scoreSolve } from "@/lib/scoring";

const unlockAt = new Date("2026-10-17T10:00:00Z");
const closesAt = new Date("2026-10-17T11:00:00Z");
const base = { unlockAt, closesAt, bonusWindowSeconds: 900, bonusMultiplier: 1.5 };
const at = (s: number) => new Date(unlockAt.getTime() + s * 1000);

describe("scoreSolve", () => {
  it("applies the multiplier at exactly 15 minutes", () => {
    expect(scoreSolve({ ...base, basePoints: 12, acceptedAt: at(900) })).toEqual({ ok: true, points: 18, multiplier: 1.5 });
  });
  it("gives base points one second after the bonus window", () => {
    expect(scoreSolve({ ...base, basePoints: 12, acceptedAt: at(901) })).toEqual({ ok: true, points: 12, multiplier: 1 });
  });
  it("accepts the exact unlock instant and the exact close instant", () => {
    expect(scoreSolve({ ...base, basePoints: 2, acceptedAt: at(0) }).ok).toBe(true);
    expect(scoreSolve({ ...base, basePoints: 2, acceptedAt: at(3600) })).toEqual({ ok: true, points: 2, multiplier: 1 });
  });
  it("rejects before unlock and after close", () => {
    expect(scoreSolve({ ...base, basePoints: 2, acceptedAt: at(-1) })).toEqual({ ok: false, reason: "before_unlock" });
    expect(scoreSolve({ ...base, basePoints: 2, acceptedAt: at(3601) })).toEqual({ ok: false, reason: "after_close" });
  });
  it("keeps one decimal", () => {
    expect(scoreSolve({ ...base, basePoints: 5, acceptedAt: at(60) })).toEqual({ ok: true, points: 7.5, multiplier: 1.5 });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/lib/scoring.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/scoring.ts
export interface ScoreInput {
  basePoints: number;
  unlockAt: Date;
  closesAt: Date;
  acceptedAt: Date;
  bonusWindowSeconds: number;
  bonusMultiplier: number;
}

export type ScoreResult =
  | { ok: true; points: number; multiplier: number }
  | { ok: false; reason: "before_unlock" | "after_close" };

export function scoreSolve(i: ScoreInput): ScoreResult {
  const t = i.acceptedAt.getTime();
  if (t < i.unlockAt.getTime()) return { ok: false, reason: "before_unlock" };
  if (t > i.closesAt.getTime()) return { ok: false, reason: "after_close" };
  const early = (t - i.unlockAt.getTime()) / 1000 <= i.bonusWindowSeconds;
  const multiplier = early ? i.bonusMultiplier : 1;
  const points = Math.round(i.basePoints * multiplier * 10) / 10;
  return { ok: true, points, multiplier };
}
```

- [ ] **Step 4: Run to see it pass, then commit**

Run: `npx vitest run tests/lib/scoring.test.ts`
Expected: PASS.

```bash
git add src/lib/scoring.ts tests/lib/scoring.test.ts
git commit -m "feat: scoring with window rule and early-solve multiplier

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Leaderboard ranking

**Files:**
- Create: `src/lib/ranking.ts`, `tests/lib/ranking.test.ts`

**Interfaces:**
- Consumes: `Difficulty` from `src/lib/types.ts`
- Produces:
  ```ts
  export interface SolveRow { userId: number; points: number; difficulty: Difficulty; acceptedAt: Date }
  export interface RankedRow { rank: number; userId: number; points: number; hardsSolved: number; lastSolveAt: Date }
  export function rankLeaderboard(solves: SolveRow[], disqualified: Set<number>): RankedRow[]
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/ranking.test.ts
import { describe, it, expect } from "vitest";
import { rankLeaderboard, SolveRow } from "@/lib/ranking";

const d = (m: number) => new Date(Date.UTC(2026, 9, 17, 10, m));
const s = (userId: number, points: number, difficulty: SolveRow["difficulty"], m: number): SolveRow =>
  ({ userId, points, difficulty, acceptedAt: d(m) });

describe("rankLeaderboard", () => {
  it("orders by points, then hards, then earliest last solve", () => {
    const rows = rankLeaderboard([
      s(1, 12, "hard", 50),
      s(2, 5, "medium", 10), s(2, 5, "medium", 20), s(2, 2, "easy", 30),   // 12 points, 0 hards
      s(3, 12, "hard", 40),                                                  // same as user 1 but earlier
      s(4, 2, "easy", 5),
    ], new Set());
    expect(rows.map((r) => r.userId)).toEqual([3, 1, 2, 4]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });
  it("breaks equal points with more hards", () => {
    const rows = rankLeaderboard([s(1, 12, "hard", 10), s(2, 5, "medium", 1), s(2, 5, "medium", 2), s(2, 2, "easy", 3)], new Set());
    expect(rows[0].userId).toBe(1);
  });
  it("gives full ties the same rank", () => {
    const rows = rankLeaderboard([s(1, 2, "easy", 5), s(2, 2, "easy", 5)], new Set());
    expect(rows.map((r) => r.rank)).toEqual([1, 1]);
  });
  it("excludes disqualified users", () => {
    const rows = rankLeaderboard([s(1, 12, "hard", 1), s(2, 2, "easy", 1)], new Set([1]));
    expect(rows.map((r) => r.userId)).toEqual([2]);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/lib/ranking.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/ranking.ts
import type { Difficulty } from "./types";

export interface SolveRow { userId: number; points: number; difficulty: Difficulty; acceptedAt: Date }
export interface RankedRow { rank: number; userId: number; points: number; hardsSolved: number; lastSolveAt: Date }

export function rankLeaderboard(solves: SolveRow[], disqualified: Set<number>): RankedRow[] {
  const byUser = new Map<number, Omit<RankedRow, "rank">>();
  for (const s of solves) {
    if (disqualified.has(s.userId)) continue;
    const cur = byUser.get(s.userId) ?? { userId: s.userId, points: 0, hardsSolved: 0, lastSolveAt: s.acceptedAt };
    cur.points = Math.round((cur.points + s.points) * 10) / 10;
    if (s.difficulty === "hard") cur.hardsSolved += 1;
    if (s.acceptedAt > cur.lastSolveAt) cur.lastSolveAt = s.acceptedAt;
    byUser.set(s.userId, cur);
  }
  const sorted = [...byUser.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.hardsSolved - a.hardsSolved ||
      a.lastSolveAt.getTime() - b.lastSolveAt.getTime(),
  );
  const out: RankedRow[] = [];
  sorted.forEach((row, i) => {
    const prev = out[i - 1];
    const tied =
      prev &&
      prev.points === row.points &&
      prev.hardsSolved === row.hardsSolved &&
      prev.lastSolveAt.getTime() === row.lastSolveAt.getTime();
    out.push({ ...row, rank: tied ? prev.rank : i + 1 });
  });
  return out;
}
```

- [ ] **Step 4: Run to see it pass, then commit**

Run: `npx vitest run tests/lib/ranking.test.ts`
Expected: PASS.

```bash
git add src/lib/ranking.ts tests/lib/ranking.test.ts
git commit -m "feat: leaderboard ranking with hards and time tie-breaks

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Database schema and test database

**Files:**
- Create: `src/db/schema.ts`, `src/db/index.ts`, `src/db/test-db.ts`, `drizzle.config.ts`, `tests/db/schema.test.ts`
- Generated: `drizzle/` migrations

**Interfaces:**
- Produces: tables `users, contests, batches, problems, solves, seenSubmissions, checkLog, reports, disqualifications, auditLog`; `type Db`; `getDb(): Db`; `createTestDb(): Promise<Db>`.

- [ ] **Step 1: Write the schema**

```ts
// src/db/schema.ts
import { pgTable, serial, text, timestamp, integer, real, uniqueIndex, index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),
  role: text("role").$type<"student" | "admin">().notNull().default("student"),
  leetcodeUsername: text("leetcode_username").unique(),
  leetcodeVerifiedAt: timestamp("leetcode_verified_at", { withTimezone: true }),
  verifyToken: text("verify_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contests = pgTable("contests", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  graceSeconds: integer("grace_seconds").notNull(),
  bonusWindowSeconds: integer("bonus_window_seconds").notNull(),
  bonusMultiplier: real("bonus_multiplier").notNull(),
});

export const batches = pgTable("batches", {
  id: serial("id").primaryKey(),
  contestId: integer("contest_id").notNull().references(() => contests.id),
  position: integer("position").notNull(),
  unlockAt: timestamp("unlock_at", { withTimezone: true }).notNull(),
  closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
});

export const problems = pgTable("problems", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => batches.id),
  difficulty: text("difficulty").$type<"easy" | "medium" | "hard">().notNull(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  points: integer("points").notNull(),
});

export const solves = pgTable(
  "solves",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    problemId: integer("problem_id").notNull().references(() => problems.id),
    submissionId: text("submission_id"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
    multiplier: real("multiplier").notNull(),
    points: real("points").notNull(),
    source: text("source").$type<"auto" | "manual">().notNull(),
    grantedBy: integer("granted_by").references(() => users.id),
    evidence: text("evidence"),
    status: text("status").$type<"valid" | "revoked">().notNull().default("valid"),
  },
  (t) => [uniqueIndex("solves_user_problem").on(t.userId, t.problemId)],
);

export const seenSubmissions = pgTable(
  "seen_submissions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    submissionId: text("submission_id").notNull(),
    slug: text("slug").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("seen_user_submission").on(t.userId, t.submissionId)],
);

export const checkLog = pgTable(
  "check_log",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    submittedLink: text("submitted_link").notNull(),
    outcome: text("outcome").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("check_log_user_time").on(t.userId, t.createdAt)],
);

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  contestId: integer("contest_id").notNull().references(() => contests.id),
  reporterId: integer("reporter_id").notNull().references(() => users.id),
  targetUserId: integer("target_user_id").notNull().references(() => users.id),
  problemId: integer("problem_id").references(() => problems.id),
  proofUrl: text("proof_url").notNull(),
  description: text("description").notNull(),
  status: text("status").$type<"pending" | "upheld" | "dismissed">().notNull().default("pending"),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const disqualifications = pgTable(
  "disqualifications",
  {
    id: serial("id").primaryKey(),
    contestId: integer("contest_id").notNull().references(() => contests.id),
    userId: integer("user_id").notNull().references(() => users.id),
    reportId: integer("report_id").references(() => reports.id),
    reason: text("reason").notNull(),
    createdBy: integer("created_by").notNull().references(() => users.id),
  },
  (t) => [uniqueIndex("dq_contest_user").on(t.contestId, t.userId)],
);

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id").references(() => users.id),
  action: text("action").notNull(),
  target: text("target").notNull(),
  details: text("details").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Add DB entry points and Drizzle config**

```ts
// src/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PgDatabase<any, typeof schema>;

let cached: Db | undefined;
export function getDb(): Db {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    cached = drizzle(postgres(url), { schema }) as unknown as Db;
  }
  return cached;
}
```

```ts
// src/db/test-db.ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "path";
import * as schema from "./schema";
import type { Db } from "./index";

export async function createTestDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  return db as unknown as Db;
}
```

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
```

- [ ] **Step 3: Generate the migration**

Run: `npx drizzle-kit generate`
Expected: a `drizzle/0000_*.sql` file creating all ten tables.

- [ ] **Step 4: Write the test**

```ts
// tests/db/schema.test.ts
import { describe, it, expect } from "vitest";
import { createTestDb } from "@/db/test-db";
import { users, solves, contests, batches, problems } from "@/db/schema";

describe("schema", () => {
  it("rejects a second solve for the same user and problem", async () => {
    const db = await createTestDb();
    const [u] = await db.insert(users).values({ email: "a@college.edu" }).returning();
    const [c] = await db.insert(contests).values({
      title: "W1", startsAt: new Date(), endsAt: new Date(), graceSeconds: 600, bonusWindowSeconds: 900, bonusMultiplier: 1.5,
    }).returning();
    const [b] = await db.insert(batches).values({ contestId: c.id, position: 0, unlockAt: new Date(), closesAt: new Date() }).returning();
    const [p] = await db.insert(problems).values({ batchId: b.id, difficulty: "easy", slug: "two-sum", title: "Two Sum", points: 2 }).returning();
    const row = { userId: u.id, problemId: p.id, acceptedAt: new Date(), multiplier: 1, points: 2, source: "auto" as const };
    await db.insert(solves).values(row);
    await expect(db.insert(solves).values(row)).rejects.toThrow();
  });
});
```

- [ ] **Step 5: Run, then commit**

Run: `npx vitest run tests/db/schema.test.ts`
Expected: PASS.

```bash
git add src/db drizzle drizzle.config.ts tests/db
git commit -m "feat: database schema, migrations and in-memory test database

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: LeetCode client

**Files:**
- Create: `src/leetcode/client.ts`, `tests/leetcode/client.test.ts`, `scripts/leetcode-smoke.ts`

**Interfaces:**
- Consumes: `AcceptedSubmission` from `src/lib/types.ts`
- Produces:
  ```ts
  export interface LeetCodeClient {
    recentAccepted(username: string): Promise<AcceptedSubmission[]>;
    profileBio(username: string): Promise<string | null>; // null when the user does not exist
  }
  export function createLeetCodeClient(fetchImpl?: typeof fetch): LeetCodeClient
  ```
  Verified against the live endpoint on 2026-10-15: `recentAcSubmissionList` returns `id`, `title`, `titleSlug`, `timestamp` (seconds, as strings), capped at 20; `matchedUser.profile.aboutMe` holds the bio; a missing user returns `data.matchedUser = null` with an error entry.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/leetcode/client.test.ts
import { describe, it, expect } from "vitest";
import { createLeetCodeClient } from "@/leetcode/client";

const respond = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("leetcode client", () => {
  it("maps recent accepted submissions", async () => {
    const client = createLeetCodeClient(respond({
      data: { recentAcSubmissionList: [
        { id: "2161702491", title: "Two Sum", titleSlug: "two-sum", timestamp: "1791086655" },
      ] },
    }));
    const list = await client.recentAccepted("lee215");
    expect(list).toEqual([{ id: "2161702491", slug: "two-sum", acceptedAt: new Date(1791086655 * 1000) }]);
  });
  it("returns an empty list when the user has none", async () => {
    const client = createLeetCodeClient(respond({ data: { recentAcSubmissionList: null } }));
    expect(await client.recentAccepted("nobody")).toEqual([]);
  });
  it("returns the bio, and null for a missing user", async () => {
    const ok = createLeetCodeClient(respond({ data: { matchedUser: { profile: { aboutMe: "hello" } } } }));
    expect(await ok.profileBio("a")).toBe("hello");
    const missing = createLeetCodeClient(respond({ data: { matchedUser: null }, errors: [{ message: "That user does not exist." }] }));
    expect(await missing.profileBio("zzz")).toBeNull();
  });
  it("throws on HTTP errors so callers can log and retry", async () => {
    const client = createLeetCodeClient(respond({}, 503));
    await expect(client.recentAccepted("a")).rejects.toThrow(/503/);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/leetcode/client.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/leetcode/client.ts
import type { AcceptedSubmission } from "@/lib/types";

export interface LeetCodeClient {
  recentAccepted(username: string): Promise<AcceptedSubmission[]>;
  profileBio(username: string): Promise<string | null>;
}

const ENDPOINT = "https://leetcode.com/graphql";

export function createLeetCodeClient(fetchImpl: typeof fetch = fetch): LeetCodeClient {
  async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Referer: "https://leetcode.com" },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`LeetCode responded ${res.status}`);
    return (await res.json()) as T;
  }

  return {
    async recentAccepted(username) {
      const body = await gql<{ data?: { recentAcSubmissionList?: { id: string; titleSlug: string; timestamp: string }[] | null } }>(
        "query r($u:String!,$l:Int){recentAcSubmissionList(username:$u,limit:$l){id title titleSlug timestamp}}",
        { u: username, l: 20 },
      );
      const list = body.data?.recentAcSubmissionList ?? [];
      return list.map((s) => ({
        id: String(s.id),
        slug: s.titleSlug,
        acceptedAt: new Date(Number(s.timestamp) * 1000),
      }));
    },
    async profileBio(username) {
      const body = await gql<{ data?: { matchedUser?: { profile?: { aboutMe?: string | null } } | null } }>(
        "query p($u:String!){matchedUser(username:$u){username profile{aboutMe}}}",
        { u: username },
      );
      const user = body.data?.matchedUser;
      if (!user) return null;
      return user.profile?.aboutMe ?? "";
    },
  };
}
```

- [ ] **Step 4: Add a live smoke script (run manually, not part of the test suite)**

```ts
// scripts/leetcode-smoke.ts
import { createLeetCodeClient } from "../src/leetcode/client";

const username = process.argv[2] ?? "lee215";
const client = createLeetCodeClient();
const list = await client.recentAccepted(username);
console.log(`recent accepted: ${list.length} (max 20)`);
console.log(list[0]);
console.log("bio:", await client.profileBio(username));
```

Run: `npx tsx scripts/leetcode-smoke.ts lee215`
Expected: prints up to 20 entries with `id`, `slug`, `acceptedAt`, and the bio. If the shape changed, update the client and its fixtures.

- [ ] **Step 5: Run tests, then commit**

Run: `npx vitest run tests/leetcode/client.test.ts`
Expected: PASS.

```bash
git add src/leetcode tests/leetcode scripts
git commit -m "feat: LeetCode client for recent accepted list and profile bio

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Auth with college-domain restriction

**Files:**
- Create: `src/lib/auth-rules.ts`, `tests/lib/auth-rules.test.ts`, `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `.env.example`

**Interfaces:**
- Produces: `isAllowedEmail(email: string | null | undefined, domain: string): boolean`; `auth()`, `signIn`, `signOut`, `handlers` from `src/auth.ts`; `session.user.id: number` and `session.user.role`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/auth-rules.test.ts
import { describe, it, expect } from "vitest";
import { isAllowedEmail } from "@/lib/auth-rules";

describe("isAllowedEmail", () => {
  it("accepts the college domain, case-insensitively", () => {
    expect(isAllowedEmail("Asha@College.edu", "college.edu")).toBe(true);
  });
  it("rejects other domains, look-alikes and empty input", () => {
    expect(isAllowedEmail("a@gmail.com", "college.edu")).toBe(false);
    expect(isAllowedEmail("a@college.edu.evil.com", "college.edu")).toBe(false);
    expect(isAllowedEmail("a@evilcollege.edu", "college.edu")).toBe(false);
    expect(isAllowedEmail(null, "college.edu")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see it fail, then implement**

Run: `npx vitest run tests/lib/auth-rules.test.ts` → FAIL.

```ts
// src/lib/auth-rules.ts
export function isAllowedEmail(email: string | null | undefined, domain: string): boolean {
  if (!email) return false;
  const at = email.lastIndexOf("@");
  if (at < 1) return false;
  return email.slice(at + 1).toLowerCase() === domain.toLowerCase();
}
```

Run again → PASS.

- [ ] **Step 3: Wire Auth.js (JWT sessions, upsert user on sign-in)**

```ts
// src/auth.ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { isAllowedEmail } from "@/lib/auth-rules";

const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email ?? null;
      if (!isAllowedEmail(email, process.env.ALLOWED_EMAIL_DOMAIN ?? "")) return false;
      const db = getDb();
      const role = adminEmails.includes(email!.toLowerCase()) ? "admin" : "student";
      await db.insert(users).values({ email: email!, name: profile?.name ?? "", role })
        .onConflictDoUpdate({ target: users.email, set: { name: profile?.name ?? "", role } });
      return true;
    },
    async jwt({ token }) {
      if (token.email && !token.uid) {
        const [u] = await getDb().select().from(users).where(eq(users.email, token.email)).limit(1);
        if (u) { token.uid = u.id; token.role = u.role; }
      }
      return token;
    },
    async session({ session, token }) {
      (session.user as any).id = token.uid;
      (session.user as any).role = token.role;
      return session;
    },
  },
});
```

```ts
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

```bash
# .env.example
DATABASE_URL=postgres://...
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
ALLOWED_EMAIL_DOMAIN=college.edu
ADMIN_EMAILS=admin@college.edu
CRON_SECRET=
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth-rules.ts src/auth.ts src/app/api/auth tests/lib/auth-rules.test.ts .env.example
git commit -m "feat: Google login restricted to the college domain

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Audit log helper and LeetCode account linking

**Files:**
- Create: `src/services/audit.ts`, `src/services/verification.ts`, `src/app/api/link/route.ts`, `src/app/account/page.tsx`, `tests/services/verification.test.ts`

**Interfaces:**
- Consumes: `Db`, `LeetCodeClient`, tables `users`, `auditLog`.
- Produces:
  ```ts
  export async function writeAudit(db: Db, e: { actorId: number | null; action: string; target: string; details?: string }): Promise<void>
  export async function beginLink(db: Db, userId: number): Promise<string>   // returns the token to put in the bio
  export type LinkResult =
    | { ok: true; username: string }
    | { ok: false; reason: "no_token" | "user_not_found" | "token_missing" | "username_taken" | "already_linked" };
  export async function confirmLink(db: Db, client: LeetCodeClient, userId: number, username: string): Promise<LinkResult>
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/services/verification.test.ts
import { describe, it, expect } from "vitest";
import { createTestDb } from "@/db/test-db";
import { users } from "@/db/schema";
import { beginLink, confirmLink } from "@/services/verification";
import type { LeetCodeClient } from "@/leetcode/client";

const clientWithBio = (bios: Record<string, string | null>): LeetCodeClient => ({
  recentAccepted: async () => [],
  profileBio: async (u) => (u in bios ? bios[u] : null),
});

async function seed() {
  const db = await createTestDb();
  const [a] = await db.insert(users).values({ email: "a@c.edu" }).returning();
  const [b] = await db.insert(users).values({ email: "b@c.edu" }).returning();
  return { db, a, b };
}

describe("account linking", () => {
  it("links when the token is in the bio", async () => {
    const { db, a } = await seed();
    const token = await beginLink(db, a.id);
    const r = await confirmLink(db, clientWithBio({ asha: `hi ${token}` }), a.id, "asha");
    expect(r).toEqual({ ok: true, username: "asha" });
  });
  it("fails when the token is missing from the bio", async () => {
    const { db, a } = await seed();
    await beginLink(db, a.id);
    expect(await confirmLink(db, clientWithBio({ asha: "no token" }), a.id, "asha")).toEqual({ ok: false, reason: "token_missing" });
  });
  it("fails for an unknown LeetCode user", async () => {
    const { db, a } = await seed();
    await beginLink(db, a.id);
    expect(await confirmLink(db, clientWithBio({}), a.id, "ghost")).toEqual({ ok: false, reason: "user_not_found" });
  });
  it("refuses a username already linked to another account", async () => {
    const { db, a, b } = await seed();
    const ta = await beginLink(db, a.id);
    await confirmLink(db, clientWithBio({ asha: ta }), a.id, "asha");
    const tb = await beginLink(db, b.id);
    expect(await confirmLink(db, clientWithBio({ asha: tb }), b.id, "asha")).toEqual({ ok: false, reason: "username_taken" });
  });
  it("fails without a started link", async () => {
    const { db, a } = await seed();
    expect(await confirmLink(db, clientWithBio({ asha: "x" }), a.id, "asha")).toEqual({ ok: false, reason: "no_token" });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/services/verification.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/services/audit.ts
import type { Db } from "@/db";
import { auditLog } from "@/db/schema";

export async function writeAudit(
  db: Db,
  e: { actorId: number | null; action: string; target: string; details?: string },
): Promise<void> {
  await db.insert(auditLog).values({ actorId: e.actorId, action: e.action, target: e.target, details: e.details ?? "" });
}
```

```ts
// src/services/verification.ts
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { users } from "@/db/schema";
import type { LeetCodeClient } from "@/leetcode/client";

export async function beginLink(db: Db, userId: number): Promise<string> {
  const token = `contest-${randomBytes(6).toString("hex")}`;
  await db.update(users).set({ verifyToken: token }).where(eq(users.id, userId));
  return token;
}

export type LinkResult =
  | { ok: true; username: string }
  | { ok: false; reason: "no_token" | "user_not_found" | "token_missing" | "username_taken" | "already_linked" };

export async function confirmLink(db: Db, client: LeetCodeClient, userId: number, username: string): Promise<LinkResult> {
  const name = username.trim();
  const [me] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (me.leetcodeUsername) return { ok: false, reason: "already_linked" };
  if (!me.verifyToken) return { ok: false, reason: "no_token" };

  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.leetcodeUsername, name)).limit(1);
  if (taken) return { ok: false, reason: "username_taken" };

  const bio = await client.profileBio(name);
  if (bio === null) return { ok: false, reason: "user_not_found" };
  if (!bio.includes(me.verifyToken)) return { ok: false, reason: "token_missing" };

  await db.update(users)
    .set({ leetcodeUsername: name, leetcodeVerifiedAt: new Date(), verifyToken: null })
    .where(eq(users.id, userId));
  return { ok: true, username: name };
}
```

- [ ] **Step 4: Add the route and page**

```ts
// src/app/api/link/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { createLeetCodeClient } from "@/leetcode/client";
import { beginLink, confirmLink } from "@/services/verification";

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id as number | undefined;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const db = getDb();
  if (body.action === "begin") {
    return NextResponse.json({ token: await beginLink(db, userId) });
  }
  const result = await confirmLink(db, createLeetCodeClient(), userId, String(body.username ?? ""));
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
```

```tsx
// src/app/account/page.tsx
"use client";
import { useState } from "react";

const messages: Record<string, string> = {
  token_missing: "We could not find the code in your LeetCode bio. Save the bio and try again.",
  user_not_found: "That LeetCode username does not exist.",
  username_taken: "That LeetCode account is already linked to another student.",
  already_linked: "Your account is already linked.",
  no_token: "Press 'Get my code' first.",
};

export default function AccountPage() {
  const [username, setUsername] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  async function begin() {
    const r = await fetch("/api/link", { method: "POST", body: JSON.stringify({ action: "begin" }) });
    setToken((await r.json()).token);
  }
  async function confirm() {
    const r = await fetch("/api/link", { method: "POST", body: JSON.stringify({ action: "confirm", username }) });
    const j = await r.json();
    setStatus(j.ok ? `Linked to ${j.username}.` : messages[j.reason] ?? "Something went wrong.");
  }

  return (
    <main>
      <h1>Link your LeetCode account</h1>
      <p>Link before the contest starts. Only linked accounts can submit.</p>
      <button onClick={begin}>Get my code</button>
      {token && <p>Put <code>{token}</code> anywhere in your LeetCode profile bio, then confirm below.</p>}
      <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="LeetCode username" />
      <button onClick={confirm}>Confirm</button>
      {status && <p role="status">{status}</p>}
    </main>
  );
}
```

- [ ] **Step 5: Run tests, then commit**

Run: `npx vitest run tests/services/verification.test.ts`
Expected: PASS.

```bash
git add src/services src/app/api/link src/app/account tests/services
git commit -m "feat: link LeetCode account with bio-token ownership proof

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Contest, batches and time-gated problems

**Files:**
- Create: `src/services/contest.ts`, `tests/services/contest.test.ts`

**Interfaces:**
- Consumes: `DEFAULTS`, `Difficulty`, tables `contests, batches, problems`.
- Produces:
  ```ts
  export interface ProblemInput { difficulty: Difficulty; slug: string; title: string }
  export interface ContestInput {
    title: string; startsAt: Date;
    batches: ProblemInput[][];           // one array of problems per batch
    graceSeconds?: number; bonusWindowSeconds?: number; bonusMultiplier?: number;
  }
  export async function createContest(db: Db, input: ContestInput): Promise<number>   // returns contest id
  export async function findLiveContest(db: Db, now: Date): Promise<ContestRow | null>              // startsAt <= now <= endsAt
  export async function findContestForSubmission(db: Db, now: Date): Promise<ContestRow | null>    // startsAt <= now <= endsAt + grace
  export interface VisibleProblem { id: number; batchPosition: number; difficulty: Difficulty; slug: string; title: string; points: number; unlockAt: Date; closesAt: Date }
  export async function visibleProblems(db: Db, contestId: number, now: Date): Promise<VisibleProblem[]>  // only batches with unlockAt <= now
  ```
  `ContestRow` is `typeof contests.$inferSelect`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/services/contest.test.ts
import { describe, it, expect } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createContest, findLiveContest, findContestForSubmission, visibleProblems } from "@/services/contest";

const start = new Date("2026-10-17T10:00:00Z");
const at = (min: number) => new Date(start.getTime() + min * 60_000);
const batch = (n: number) => [
  { difficulty: "easy" as const, slug: `e${n}a`, title: `E${n}A` },
  { difficulty: "easy" as const, slug: `e${n}b`, title: `E${n}B` },
  { difficulty: "medium" as const, slug: `m${n}`, title: `M${n}` },
  { difficulty: "hard" as const, slug: `h${n}`, title: `H${n}` },
];

async function setup() {
  const db = await createTestDb();
  const id = await createContest(db, { title: "W1", startsAt: start, batches: [batch(1), batch(2), batch(3)] });
  return { db, id };
}

describe("contest", () => {
  it("creates hourly batches, 1-hour windows, and default points", async () => {
    const { db, id } = await setup();
    const all = await visibleProblems(db, id, at(180));
    expect(all).toHaveLength(12);
    expect(all.filter((p) => p.batchPosition === 1).map((p) => p.unlockAt.toISOString())[0]).toBe(at(60).toISOString());
    expect(all[0].closesAt.toISOString()).toBe(at(60).toISOString());
    expect(all.find((p) => p.difficulty === "hard")!.points).toBe(12);
  });
  it("reveals only unlocked batches", async () => {
    const { db, id } = await setup();
    expect(await visibleProblems(db, id, at(-1))).toHaveLength(0);
    expect(await visibleProblems(db, id, at(0))).toHaveLength(4);
    expect(await visibleProblems(db, id, at(59))).toHaveLength(4);
    expect(await visibleProblems(db, id, at(60))).toHaveLength(8);
  });
  it("live = during contest; submission window extends by the grace", async () => {
    const { db } = await setup();
    expect(await findLiveContest(db, at(30))).not.toBeNull();
    expect(await findLiveContest(db, at(185))).toBeNull();
    expect(await findContestForSubmission(db, at(185))).not.toBeNull();
    expect(await findContestForSubmission(db, at(191))).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/services/contest.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/services/contest.ts
import { and, asc, eq, lte } from "drizzle-orm";
import type { Db } from "@/db";
import { batches, contests, problems } from "@/db/schema";
import { DEFAULTS } from "@/lib/config";
import type { Difficulty } from "@/lib/types";

export interface ProblemInput { difficulty: Difficulty; slug: string; title: string }
export interface ContestInput {
  title: string;
  startsAt: Date;
  batches: ProblemInput[][];
  graceSeconds?: number;
  bonusWindowSeconds?: number;
  bonusMultiplier?: number;
}
export type ContestRow = typeof contests.$inferSelect;

export async function createContest(db: Db, input: ContestInput): Promise<number> {
  const spacing = DEFAULTS.batchSpacingSeconds * 1000;
  const window = DEFAULTS.windowSeconds * 1000;
  const lastUnlock = input.startsAt.getTime() + (input.batches.length - 1) * spacing;
  const endsAt = new Date(lastUnlock + window);

  const [c] = await db.insert(contests).values({
    title: input.title,
    startsAt: input.startsAt,
    endsAt,
    graceSeconds: input.graceSeconds ?? DEFAULTS.graceSeconds,
    bonusWindowSeconds: input.bonusWindowSeconds ?? DEFAULTS.bonusWindowSeconds,
    bonusMultiplier: input.bonusMultiplier ?? DEFAULTS.bonusMultiplier,
  }).returning();

  for (const [position, list] of input.batches.entries()) {
    const unlockAt = new Date(input.startsAt.getTime() + position * spacing);
    const closesAt = new Date(unlockAt.getTime() + window);
    const [b] = await db.insert(batches).values({ contestId: c.id, position, unlockAt, closesAt }).returning();
    await db.insert(problems).values(
      list.map((p) => ({ batchId: b.id, difficulty: p.difficulty, slug: p.slug, title: p.title, points: DEFAULTS.points[p.difficulty] })),
    );
  }
  return c.id;
}

export async function findLiveContest(db: Db, now: Date): Promise<ContestRow | null> {
  const rows = await db.select().from(contests).where(lte(contests.startsAt, now)).orderBy(asc(contests.startsAt));
  return rows.find((c) => now <= c.endsAt) ?? null;
}

export async function findContestForSubmission(db: Db, now: Date): Promise<ContestRow | null> {
  const rows = await db.select().from(contests).where(lte(contests.startsAt, now)).orderBy(asc(contests.startsAt));
  return rows.find((c) => now.getTime() <= c.endsAt.getTime() + c.graceSeconds * 1000) ?? null;
}

export interface VisibleProblem {
  id: number; batchPosition: number; difficulty: Difficulty; slug: string; title: string;
  points: number; unlockAt: Date; closesAt: Date;
}

export async function visibleProblems(db: Db, contestId: number, now: Date): Promise<VisibleProblem[]> {
  const rows = await db
    .select({
      id: problems.id, batchPosition: batches.position, difficulty: problems.difficulty, slug: problems.slug,
      title: problems.title, points: problems.points, unlockAt: batches.unlockAt, closesAt: batches.closesAt,
    })
    .from(problems)
    .innerJoin(batches, eq(problems.batchId, batches.id))
    .where(and(eq(batches.contestId, contestId), lte(batches.unlockAt, now)))
    .orderBy(asc(batches.position), asc(problems.id));
  return rows;
}
```

- [ ] **Step 4: Run to see it pass, then commit**

Run: `npx vitest run tests/services/contest.test.ts`
Expected: PASS.

```bash
git add src/services/contest.ts tests/services/contest.test.ts
git commit -m "feat: contests, hourly batches and time-gated problem visibility

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Snapshot job

**Files:**
- Create: `src/services/snapshotter.ts`, `src/app/api/cron/snapshot/route.ts`, `vercel.json`, `tests/services/snapshotter.test.ts`

**Interfaces:**
- Consumes: `Db`, `LeetCodeClient`, `findLiveContest`, tables `users, seenSubmissions`.
- Produces: `snapshotAll(db: Db, client: LeetCodeClient, now: Date): Promise<{ users: number; stored: number; failed: number }>` (does nothing outside a live contest; returns zeros).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/services/snapshotter.test.ts
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import { users, seenSubmissions } from "@/db/schema";
import { createContest } from "@/services/contest";
import { snapshotAll } from "@/services/snapshotter";
import type { LeetCodeClient } from "@/leetcode/client";

const start = new Date("2026-10-17T10:00:00Z");
const fake = (lists: Record<string, { id: string; slug: string; acceptedAt: Date }[]>, failFor: string[] = []): LeetCodeClient => ({
  recentAccepted: async (u) => { if (failFor.includes(u)) throw new Error("boom"); return lists[u] ?? []; },
  profileBio: async () => "",
});

async function setup() {
  const db = await createTestDb();
  await createContest(db, { title: "W1", startsAt: start, batches: [[{ difficulty: "easy", slug: "two-sum", title: "Two Sum" }]] });
  const [a] = await db.insert(users).values({ email: "a@c.edu", leetcodeUsername: "asha" }).returning();
  const [b] = await db.insert(users).values({ email: "b@c.edu", leetcodeUsername: "bo" }).returning();
  await db.insert(users).values({ email: "c@c.edu" }); // not linked
  return { db, a, b };
}

describe("snapshotAll", () => {
  it("stores new accepted submissions for linked users only, idempotently", async () => {
    const { db, a } = await setup();
    const t = new Date(start.getTime() + 60_000);
    const client = fake({ asha: [{ id: "1", slug: "two-sum", acceptedAt: t }], bo: [] });
    const r1 = await snapshotAll(db, client, t);
    expect(r1).toEqual({ users: 2, stored: 1, failed: 0 });
    const r2 = await snapshotAll(db, client, t);
    expect(r2.stored).toBe(0);
    const rows = await db.select().from(seenSubmissions).where(eq(seenSubmissions.userId, a.id));
    expect(rows).toHaveLength(1);
  });
  it("keeps going when one user's fetch fails", async () => {
    const { db } = await setup();
    const t = new Date(start.getTime() + 60_000);
    const client = fake({ bo: [{ id: "9", slug: "x", acceptedAt: t }] }, ["asha"]);
    expect(await snapshotAll(db, client, t)).toEqual({ users: 2, stored: 1, failed: 1 });
  });
  it("does nothing when no contest is live", async () => {
    const { db } = await setup();
    const client = fake({ asha: [{ id: "1", slug: "a", acceptedAt: start }] });
    expect(await snapshotAll(db, client, new Date("2026-10-18T00:00:00Z"))).toEqual({ users: 0, stored: 0, failed: 0 });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/services/snapshotter.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the service**

```ts
// src/services/snapshotter.ts
import { isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import { seenSubmissions, users } from "@/db/schema";
import type { LeetCodeClient } from "@/leetcode/client";
import { findLiveContest } from "./contest";

export async function snapshotAll(db: Db, client: LeetCodeClient, now: Date) {
  const result = { users: 0, stored: 0, failed: 0 };
  if (!(await findLiveContest(db, now))) return result;

  const linked = await db.select({ id: users.id, username: users.leetcodeUsername })
    .from(users).where(isNotNull(users.leetcodeUsername));
  result.users = linked.length;

  for (const u of linked) {
    try {
      const list = await client.recentAccepted(u.username!);
      if (list.length === 0) continue;
      const inserted = await db.insert(seenSubmissions)
        .values(list.map((s) => ({ userId: u.id, submissionId: s.id, slug: s.slug, acceptedAt: s.acceptedAt })))
        .onConflictDoNothing()
        .returning({ id: seenSubmissions.id });
      result.stored += inserted.length;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}
```

- [ ] **Step 4: Add the cron route and schedule**

```ts
// src/app/api/cron/snapshot/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { createLeetCodeClient } from "@/leetcode/client";
import { snapshotAll } from "@/services/snapshotter";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await snapshotAll(getDb(), createLeetCodeClient(), new Date());
  return NextResponse.json(result);
}
```

```json
// vercel.json
{ "crons": [{ "path": "/api/cron/snapshot", "schedule": "*/5 * * * *" }] }
```

- [ ] **Step 5: Run tests, then commit**

Run: `npx vitest run tests/services/snapshotter.test.ts`
Expected: PASS.

```bash
git add src/services/snapshotter.ts src/app/api/cron vercel.json tests/services/snapshotter.test.ts
git commit -m "feat: snapshot job archives recent accepted IDs during live contests

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Submission checker and submit endpoint

**Files:**
- Create: `src/services/submission-checker.ts`, `src/app/api/submit/route.ts`, `tests/services/submission-checker.test.ts`

**Interfaces:**
- Consumes: `parseSubmissionId`, `scoreSolve`, `findContestForSubmission`, `LeetCodeClient`, `DEFAULTS`, tables `users, seenSubmissions, problems, batches, solves, checkLog`.
- Produces:
  ```ts
  export type CheckResult =
    | { ok: true; problemId: number; points: number; multiplier: number }
    | { ok: false; reason:
        "bad_link" | "no_contest" | "not_linked" | "cooldown" | "not_found"
      | "not_contest_problem" | "outside_window" | "already_solved" | "lookup_failed" };
  export async function checkSubmission(
    db: Db, client: LeetCodeClient,
    input: { userId: number; link: string; now: Date },
  ): Promise<CheckResult>
  ```
  Lookup order: `seen_submissions` for this user, then a live `recentAccepted` fetch (new entries are stored). Every attempt writes a `check_log` row; `cooldown` is returned if the previous attempt is under `DEFAULTS.attemptCooldownSeconds` old.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/services/submission-checker.test.ts
import { describe, it, expect } from "vitest";
import { createTestDb } from "@/db/test-db";
import { users, seenSubmissions } from "@/db/schema";
import { createContest } from "@/services/contest";
import { checkSubmission } from "@/services/submission-checker";
import type { LeetCodeClient } from "@/leetcode/client";

const start = new Date("2026-10-17T10:00:00Z");
const at = (min: number) => new Date(start.getTime() + min * 60_000);
const link = (id: string) => `https://leetcode.com/submissions/detail/${id}/`;

const live = (list: { id: string; slug: string; acceptedAt: Date }[], fail = false): LeetCodeClient => ({
  recentAccepted: async () => { if (fail) throw new Error("down"); return list; },
  profileBio: async () => "",
});

async function setup() {
  const db = await createTestDb();
  await createContest(db, {
    title: "W1", startsAt: start,
    batches: [
      [{ difficulty: "easy", slug: "two-sum", title: "Two Sum" }, { difficulty: "hard", slug: "hard-1", title: "Hard 1" }],
      [{ difficulty: "easy", slug: "valid-parens", title: "Valid Parens" }],
    ],
  });
  const [u] = await db.insert(users).values({ email: "a@c.edu", leetcodeUsername: "asha" }).returning();
  const [unlinked] = await db.insert(users).values({ email: "n@c.edu" }).returning();
  return { db, u, unlinked };
}

describe("checkSubmission", () => {
  it("scores an early solve with the multiplier", async () => {
    const { db, u } = await setup();
    const r = await checkSubmission(db, live([{ id: "1", slug: "two-sum", acceptedAt: at(10) }]), { userId: u.id, link: link("1"), now: at(12) });
    expect(r).toMatchObject({ ok: true, points: 3, multiplier: 1.5 });
  });
  it("scores base points after the bonus window", async () => {
    const { db, u } = await setup();
    const r = await checkSubmission(db, live([{ id: "1", slug: "two-sum", acceptedAt: at(30) }]), { userId: u.id, link: link("1"), now: at(31) });
    expect(r).toMatchObject({ ok: true, points: 2, multiplier: 1 });
  });
  it("accepts a late link when the ID is in the archive (LeetCode list has scrolled)", async () => {
    const { db, u } = await setup();
    await db.insert(seenSubmissions).values({ userId: u.id, submissionId: "7", slug: "hard-1", acceptedAt: at(20) });
    const r = await checkSubmission(db, live([], true), { userId: u.id, link: link("7"), now: at(125) }); // contest ended at 120, grace runs to 130
    expect(r).toMatchObject({ ok: true, points: 12, multiplier: 1 });
  });
  it("rejects a submission accepted outside its batch window", async () => {
    const { db, u } = await setup();
    const r = await checkSubmission(db, live([{ id: "2", slug: "valid-parens", acceptedAt: at(30) }]), { userId: u.id, link: link("2"), now: at(31) });
    expect(r).toEqual({ ok: false, reason: "outside_window" });
  });
  it("rejects problems that are not in the contest", async () => {
    const { db, u } = await setup();
    const r = await checkSubmission(db, live([{ id: "3", slug: "other", acceptedAt: at(10) }]), { userId: u.id, link: link("3"), now: at(11) });
    expect(r).toEqual({ ok: false, reason: "not_contest_problem" });
  });
  it("rejects an ID that is not in this student's list", async () => {
    const { db, u } = await setup();
    const r = await checkSubmission(db, live([]), { userId: u.id, link: link("99"), now: at(10) });
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });
  it("rejects a second solve of the same problem", async () => {
    const { db, u } = await setup();
    const client = live([
      { id: "1", slug: "two-sum", acceptedAt: at(10) },
      { id: "4", slug: "two-sum", acceptedAt: at(40) },
    ]);
    await checkSubmission(db, client, { userId: u.id, link: link("1"), now: at(12) });
    const r = await checkSubmission(db, client, { userId: u.id, link: link("4"), now: at(50) });
    expect(r).toEqual({ ok: false, reason: "already_solved" });
  });
  it("rejects bad links, unlinked users, no contest, and the link deadline", async () => {
    const { db, u, unlinked } = await setup();
    const client = live([]);
    expect(await checkSubmission(db, client, { userId: u.id, link: "nope", now: at(10) })).toEqual({ ok: false, reason: "bad_link" });
    expect(await checkSubmission(db, client, { userId: unlinked.id, link: link("1"), now: at(10) })).toEqual({ ok: false, reason: "not_linked" });
    expect(await checkSubmission(db, client, { userId: u.id, link: link("1"), now: at(-5) })).toEqual({ ok: false, reason: "no_contest" });
    expect(await checkSubmission(db, client, { userId: u.id, link: link("1"), now: at(200) })).toEqual({ ok: false, reason: "no_contest" });
  });
  it("enforces the attempt cooldown", async () => {
    const { db, u } = await setup();
    const client = live([]);
    await checkSubmission(db, client, { userId: u.id, link: link("1"), now: at(10) });
    const r = await checkSubmission(db, client, { userId: u.id, link: link("1"), now: new Date(at(10).getTime() + 2000) });
    expect(r).toEqual({ ok: false, reason: "cooldown" });
  });
  it("reports lookup_failed when LeetCode is down and the ID is not archived", async () => {
    const { db, u } = await setup();
    const r = await checkSubmission(db, live([], true), { userId: u.id, link: link("1"), now: at(10) });
    expect(r).toEqual({ ok: false, reason: "lookup_failed" });
  });
});
```

Note on the cooldown test: `check_log.createdAt` defaults to the database clock, so the implementation must write `createdAt: now` explicitly to make the injected clock authoritative.

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/services/submission-checker.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/services/submission-checker.ts
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { batches, checkLog, problems, seenSubmissions, solves, users } from "@/db/schema";
import { DEFAULTS } from "@/lib/config";
import { parseSubmissionId } from "@/lib/link";
import { scoreSolve } from "@/lib/scoring";
import type { LeetCodeClient } from "@/leetcode/client";
import { findContestForSubmission } from "./contest";

export type CheckResult =
  | { ok: true; problemId: number; points: number; multiplier: number }
  | { ok: false; reason:
      "bad_link" | "no_contest" | "not_linked" | "cooldown" | "not_found"
    | "not_contest_problem" | "outside_window" | "already_solved" | "lookup_failed" };

export async function checkSubmission(
  db: Db,
  client: LeetCodeClient,
  input: { userId: number; link: string; now: Date },
): Promise<CheckResult> {
  const { userId, link, now } = input;
  const log = async (outcome: string, error?: string) => {
    await db.insert(checkLog).values({ userId, submittedLink: link.slice(0, 500), outcome, error: error ?? null, createdAt: now });
  };
  const fail = async (reason: Extract<CheckResult, { ok: false }>["reason"], error?: string): Promise<CheckResult> => {
    await log(reason, error);
    return { ok: false, reason };
  };

  const [last] = await db.select({ createdAt: checkLog.createdAt }).from(checkLog)
    .where(eq(checkLog.userId, userId)).orderBy(desc(checkLog.createdAt)).limit(1);
  if (last) {
    const sinceLast = now.getTime() - last.createdAt.getTime();
    if (sinceLast >= 0 && sinceLast < DEFAULTS.attemptCooldownSeconds * 1000) {
      return { ok: false, reason: "cooldown" };
    }
  }

  const submissionId = parseSubmissionId(link);
  if (!submissionId) return fail("bad_link");

  const contest = await findContestForSubmission(db, now);
  if (!contest) return fail("no_contest");

  const [me] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!me?.leetcodeUsername) return fail("not_linked");

  // 1. archive, 2. live fetch
  let found: { slug: string; acceptedAt: Date } | undefined;
  const [archived] = await db.select().from(seenSubmissions)
    .where(and(eq(seenSubmissions.userId, userId), eq(seenSubmissions.submissionId, submissionId))).limit(1);
  if (archived) {
    found = { slug: archived.slug, acceptedAt: archived.acceptedAt };
  } else {
    try {
      const list = await client.recentAccepted(me.leetcodeUsername);
      if (list.length > 0) {
        await db.insert(seenSubmissions)
          .values(list.map((s) => ({ userId, submissionId: s.id, slug: s.slug, acceptedAt: s.acceptedAt })))
          .onConflictDoNothing();
      }
      const hit = list.find((s) => s.id === submissionId);
      if (hit) found = { slug: hit.slug, acceptedAt: hit.acceptedAt };
    } catch (e) {
      return fail("lookup_failed", e instanceof Error ? e.message : String(e));
    }
  }
  if (!found) return fail("not_found");

  // problem in this contest, by slug
  const candidates = await db
    .select({ problem: problems, batch: batches })
    .from(problems).innerJoin(batches, eq(problems.batchId, batches.id))
    .where(and(eq(batches.contestId, contest.id), eq(problems.slug, found.slug))).limit(1);
  if (candidates.length === 0) return fail("not_contest_problem");
  const { problem, batch } = candidates[0];

  const [existing] = await db.select({ id: solves.id }).from(solves)
    .where(and(eq(solves.userId, userId), eq(solves.problemId, problem.id))).limit(1);
  if (existing) return fail("already_solved");

  const scored = scoreSolve({
    basePoints: problem.points, unlockAt: batch.unlockAt, closesAt: batch.closesAt, acceptedAt: found.acceptedAt,
    bonusWindowSeconds: contest.bonusWindowSeconds, bonusMultiplier: contest.bonusMultiplier,
  });
  if (!scored.ok) return fail("outside_window");

  await db.insert(solves).values({
    userId, problemId: problem.id, submissionId, acceptedAt: found.acceptedAt, verifiedAt: now,
    multiplier: scored.multiplier, points: scored.points, source: "auto",
  });
  await log("accepted");
  return { ok: true, problemId: problem.id, points: scored.points, multiplier: scored.multiplier };
}
```

- [ ] **Step 4: Add the endpoint**

```ts
// src/app/api/submit/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { createLeetCodeClient } from "@/leetcode/client";
import { checkSubmission } from "@/services/submission-checker";

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id as number | undefined;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { link } = await req.json();
  const result = await checkSubmission(getDb(), createLeetCodeClient(), { userId, link: String(link ?? ""), now: new Date() });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
```

- [ ] **Step 5: Run tests, then commit**

Run: `npx vitest run tests/services/submission-checker.test.ts`
Expected: PASS.

```bash
git add src/services/submission-checker.ts src/app/api/submit tests/services/submission-checker.test.ts
git commit -m "feat: verify submission links against archive and LeetCode, score solves

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Leaderboard service, API and contest page

**Files:**
- Create: `src/services/leaderboard.ts`, `src/app/api/leaderboard/route.ts`, `src/app/page.tsx`, `tests/services/leaderboard.test.ts`

**Interfaces:**
- Consumes: `rankLeaderboard`, tables `solves, problems, users, disqualifications`, `findContestForSubmission`, `visibleProblems`.
- Produces: `getLeaderboard(db: Db, contestId: number): Promise<(RankedRow & { name: string })[]>` (only `status = 'valid'` solves of this contest; disqualified users excluded).

- [ ] **Step 1: Write the failing test**

```ts
// tests/services/leaderboard.test.ts
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import { users, solves, problems, disqualifications } from "@/db/schema";
import { createContest } from "@/services/contest";
import { getLeaderboard } from "@/services/leaderboard";

const start = new Date("2026-10-17T10:00:00Z");

async function setup() {
  const db = await createTestDb();
  const contestId = await createContest(db, {
    title: "W1", startsAt: start,
    batches: [[{ difficulty: "easy", slug: "a", title: "A" }, { difficulty: "hard", slug: "h", title: "H" }]],
  });
  const ps = await db.select().from(problems);
  const [u1] = await db.insert(users).values({ email: "1@c.edu", name: "One" }).returning();
  const [u2] = await db.insert(users).values({ email: "2@c.edu", name: "Two" }).returning();
  const [admin] = await db.insert(users).values({ email: "x@c.edu", role: "admin" }).returning();
  const row = (userId: number, p: (typeof ps)[number], points: number, status: "valid" | "revoked" = "valid") => ({
    userId, problemId: p.id, acceptedAt: new Date(start.getTime() + 60_000), multiplier: 1, points, source: "auto" as const, status,
  });
  return { db, contestId, ps, u1, u2, admin, row };
}

describe("getLeaderboard", () => {
  it("ranks valid solves only and names users", async () => {
    const { db, contestId, ps, u1, u2, row } = await setup();
    await db.insert(solves).values([row(u1.id, ps[0], 2), row(u2.id, ps[1], 12), row(u1.id, ps[1], 12, "revoked")]);
    const board = await getLeaderboard(db, contestId);
    expect(board.map((b) => [b.name, b.points])).toEqual([["Two", 12], ["One", 2]]);
  });
  it("excludes disqualified users", async () => {
    const { db, contestId, ps, u1, u2, admin, row } = await setup();
    await db.insert(solves).values([row(u1.id, ps[1], 12), row(u2.id, ps[0], 2)]);
    await db.insert(disqualifications).values({ contestId, userId: u1.id, reason: "cheating", createdBy: admin.id });
    const board = await getLeaderboard(db, contestId);
    expect(board.map((b) => b.name)).toEqual(["Two"]);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/services/leaderboard.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/services/leaderboard.ts
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { batches, disqualifications, problems, solves, users } from "@/db/schema";
import { rankLeaderboard, type RankedRow } from "@/lib/ranking";

export async function getLeaderboard(db: Db, contestId: number): Promise<(RankedRow & { name: string })[]> {
  const rows = await db
    .select({ userId: solves.userId, points: solves.points, difficulty: problems.difficulty, acceptedAt: solves.acceptedAt })
    .from(solves)
    .innerJoin(problems, eq(solves.problemId, problems.id))
    .innerJoin(batches, eq(problems.batchId, batches.id))
    .where(and(eq(batches.contestId, contestId), eq(solves.status, "valid")));

  const dq = await db.select({ userId: disqualifications.userId }).from(disqualifications)
    .where(eq(disqualifications.contestId, contestId));

  const ranked = rankLeaderboard(rows, new Set(dq.map((d) => d.userId)));
  if (ranked.length === 0) return [];
  const names = await db.select({ id: users.id, name: users.name }).from(users)
    .where(inArray(users.id, ranked.map((r) => r.userId)));
  const nameById = new Map(names.map((n) => [n.id, n.name]));
  return ranked.map((r) => ({ ...r, name: nameById.get(r.userId) ?? "" }));
}
```

- [ ] **Step 4: Add the API and the contest page**

```ts
// src/app/api/leaderboard/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { findContestForSubmission } from "@/services/contest";
import { getLeaderboard } from "@/services/leaderboard";

export const revalidate = 5;

export async function GET() {
  const db = getDb();
  const contest = await findContestForSubmission(db, new Date());
  if (!contest) return NextResponse.json({ contest: null, board: [] });
  return NextResponse.json({ contest: { id: contest.id, title: contest.title }, board: await getLeaderboard(db, contest.id) });
}
```

```tsx
// src/app/page.tsx
import { auth } from "@/auth";
import { getDb } from "@/db";
import { findContestForSubmission, visibleProblems } from "@/services/contest";
import { SubmitForm } from "./submit-form";
import { LiveBoard } from "./live-board";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (!session) return <main><a href="/api/auth/signin">Sign in with your college account</a></main>;
  const db = getDb();
  const contest = await findContestForSubmission(db, new Date());
  if (!contest) return <main><h1>No contest is running</h1><p>The next contest starts on Saturday.</p></main>;
  const list = await visibleProblems(db, contest.id, new Date());
  return (
    <main>
      <h1>{contest.title}</h1>
      <ul>
        {list.map((p) => (
          <li key={p.id}>
            Batch {p.batchPosition + 1} · {p.difficulty} · {p.points} pts ·{" "}
            <a href={`https://leetcode.com/problems/${p.slug}/`} target="_blank" rel="noreferrer">{p.title}</a>{" "}
            (closes {p.closesAt.toLocaleTimeString()})
          </li>
        ))}
      </ul>
      <SubmitForm />
      <LiveBoard />
    </main>
  );
}
```

```tsx
// src/app/submit-form.tsx
"use client";
import { useState } from "react";

const messages: Record<string, string> = {
  bad_link: "That does not look like a LeetCode submission link.",
  no_contest: "No contest is accepting submissions right now.",
  not_linked: "Link your LeetCode account first (Account page).",
  cooldown: "Wait a few seconds before trying again.",
  not_found: "We could not find that accepted submission on your LeetCode account.",
  not_contest_problem: "That problem is not part of this contest.",
  outside_window: "That submission was accepted outside the problem's one-hour window.",
  already_solved: "You already have points for that problem.",
  lookup_failed: "LeetCode did not respond. Try again in a minute.",
};

export function SubmitForm() {
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState("");
  async function submit() {
    const r = await fetch("/api/submit", { method: "POST", body: JSON.stringify({ link }) });
    const j = await r.json();
    setMsg(j.ok ? `Accepted: +${j.points} points${j.multiplier > 1 ? " (early bonus)" : ""}.` : messages[j.reason] ?? "Something went wrong.");
  }
  return (
    <section>
      <input id="link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://leetcode.com/submissions/detail/..." />
      <button onClick={submit}>Submit</button>
      {msg && <p role="status">{msg}</p>}
    </section>
  );
}
```

```tsx
// src/app/live-board.tsx
"use client";
import { useEffect, useState } from "react";

type Row = { rank: number; name: string; points: number; hardsSolved: number };

export function LiveBoard() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      const j = await (await fetch("/api/leaderboard")).json();
      if (!stop) setRows(j.board);
    };
    load();
    const t = setInterval(load, 12_000);
    return () => { stop = true; clearInterval(t); };
  }, []);
  return (
    <table>
      <thead><tr><th>#</th><th>Name</th><th>Points</th><th>Hards</th></tr></thead>
      <tbody>
        {rows.map((r) => (<tr key={r.rank + r.name}><td>{r.rank}</td><td>{r.name}</td><td>{r.points}</td><td>{r.hardsSolved}</td></tr>))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: Run tests, then commit**

Run: `npx vitest run tests/services/leaderboard.test.ts`
Expected: PASS.

```bash
git add src/services/leaderboard.ts src/app tests/services/leaderboard.test.ts
git commit -m "feat: live leaderboard and contest page with link submission

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Admin manual grants and revokes

**Files:**
- Create: `src/services/grants.ts`, `src/app/api/admin/grants/route.ts`, `tests/services/grants.test.ts`

**Interfaces:**
- Consumes: `scoreSolve`, `writeAudit`, tables `solves, problems, batches, contests, users`.
- Produces:
  ```ts
  export type GrantResult =
    | { ok: true; solveId: number; points: number; multiplier: number }
    | { ok: false; reason: "problem_not_found" | "outside_window" | "already_solved" };
  export async function grantSolve(db: Db, input: {
    adminId: number; userId: number; problemId: number; acceptedAt: Date; reason: string; evidence: string; now: Date;
  }): Promise<GrantResult>
  export async function revokeSolve(db: Db, input: { adminId: number; solveId: number; reason: string }): Promise<boolean>
  ```
  A revoked solve can be re-granted: `grantSolve` updates the existing revoked row instead of inserting.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/services/grants.test.ts
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import { users, problems, solves, auditLog } from "@/db/schema";
import { createContest } from "@/services/contest";
import { grantSolve, revokeSolve } from "@/services/grants";

const start = new Date("2026-10-17T10:00:00Z");
const at = (min: number) => new Date(start.getTime() + min * 60_000);

async function setup() {
  const db = await createTestDb();
  await createContest(db, { title: "W1", startsAt: start, batches: [[{ difficulty: "hard", slug: "h", title: "H" }]] });
  const [p] = await db.select().from(problems);
  const [student] = await db.insert(users).values({ email: "s@c.edu" }).returning();
  const [admin] = await db.insert(users).values({ email: "a@c.edu", role: "admin" }).returning();
  return { db, p, student, admin };
}

describe("grants", () => {
  it("grants a solve with the multiplier computed from the entered time, and audits it", async () => {
    const { db, p, student, admin } = await setup();
    const r = await grantSolve(db, { adminId: admin.id, userId: student.id, problemId: p.id, acceptedAt: at(5), reason: "LeetCode outage", evidence: "https://x/shot.png", now: at(100) });
    expect(r).toMatchObject({ ok: true, points: 18, multiplier: 1.5 });
    const [s] = await db.select().from(solves);
    expect(s).toMatchObject({ source: "manual", grantedBy: admin.id, evidence: "https://x/shot.png", status: "valid" });
    expect((await db.select().from(auditLog)).map((a) => a.action)).toContain("grant_solve");
  });
  it("rejects a time outside the window and duplicates", async () => {
    const { db, p, student, admin } = await setup();
    const base = { adminId: admin.id, userId: student.id, problemId: p.id, reason: "r", evidence: "e", now: at(100) };
    expect(await grantSolve(db, { ...base, acceptedAt: at(90) })).toEqual({ ok: false, reason: "outside_window" });
    await grantSolve(db, { ...base, acceptedAt: at(20) });
    expect(await grantSolve(db, { ...base, acceptedAt: at(21) })).toEqual({ ok: false, reason: "already_solved" });
  });
  it("revokes, audits, and allows a re-grant", async () => {
    const { db, p, student, admin } = await setup();
    const base = { adminId: admin.id, userId: student.id, problemId: p.id, reason: "r", evidence: "e", now: at(100) };
    const g = await grantSolve(db, { ...base, acceptedAt: at(20) });
    if (!g.ok) throw new Error("grant failed");
    expect(await revokeSolve(db, { adminId: admin.id, solveId: g.solveId, reason: "mistake" })).toBe(true);
    const [after] = await db.select().from(solves).where(eq(solves.id, g.solveId));
    expect(after.status).toBe("revoked");
    const again = await grantSolve(db, { ...base, acceptedAt: at(25) });
    expect(again).toMatchObject({ ok: true, solveId: g.solveId });
    const [back] = await db.select().from(solves).where(eq(solves.id, g.solveId));
    expect(back.status).toBe("valid");
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/services/grants.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/services/grants.ts
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { batches, contests, problems, solves } from "@/db/schema";
import { scoreSolve } from "@/lib/scoring";
import { writeAudit } from "./audit";

export type GrantResult =
  | { ok: true; solveId: number; points: number; multiplier: number }
  | { ok: false; reason: "problem_not_found" | "outside_window" | "already_solved" };

export async function grantSolve(db: Db, input: {
  adminId: number; userId: number; problemId: number; acceptedAt: Date; reason: string; evidence: string; now: Date;
}): Promise<GrantResult> {
  const [row] = await db
    .select({ problem: problems, batch: batches, contest: contests })
    .from(problems)
    .innerJoin(batches, eq(problems.batchId, batches.id))
    .innerJoin(contests, eq(batches.contestId, contests.id))
    .where(eq(problems.id, input.problemId)).limit(1);
  if (!row) return { ok: false, reason: "problem_not_found" };

  const scored = scoreSolve({
    basePoints: row.problem.points, unlockAt: row.batch.unlockAt, closesAt: row.batch.closesAt, acceptedAt: input.acceptedAt,
    bonusWindowSeconds: row.contest.bonusWindowSeconds, bonusMultiplier: row.contest.bonusMultiplier,
  });
  if (!scored.ok) return { ok: false, reason: "outside_window" };

  const [existing] = await db.select().from(solves)
    .where(and(eq(solves.userId, input.userId), eq(solves.problemId, input.problemId))).limit(1);
  if (existing && existing.status === "valid") return { ok: false, reason: "already_solved" };

  const values = {
    acceptedAt: input.acceptedAt, verifiedAt: input.now, multiplier: scored.multiplier, points: scored.points,
    source: "manual" as const, grantedBy: input.adminId, evidence: input.evidence, status: "valid" as const,
  };
  let solveId: number;
  if (existing) {
    await db.update(solves).set(values).where(eq(solves.id, existing.id));
    solveId = existing.id;
  } else {
    const [s] = await db.insert(solves).values({ userId: input.userId, problemId: input.problemId, ...values }).returning();
    solveId = s.id;
  }
  await writeAudit(db, {
    actorId: input.adminId, action: "grant_solve", target: `solve:${solveId}`,
    details: `user ${input.userId}, problem ${input.problemId}: ${input.reason}`,
  });
  return { ok: true, solveId, points: scored.points, multiplier: scored.multiplier };
}

export async function revokeSolve(db: Db, input: { adminId: number; solveId: number; reason: string }): Promise<boolean> {
  const updated = await db.update(solves).set({ status: "revoked" }).where(eq(solves.id, input.solveId)).returning({ id: solves.id });
  if (updated.length === 0) return false;
  await writeAudit(db, { actorId: input.adminId, action: "revoke_solve", target: `solve:${input.solveId}`, details: input.reason });
  return true;
}
```

- [ ] **Step 4: Add the admin endpoint (admin-only)**

```ts
// src/app/api/admin/grants/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { grantSolve, revokeSolve } from "@/services/grants";

export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as { id?: number; role?: string } | undefined;
  if (!user?.id || user.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json();
  const db = getDb();
  if (b.action === "revoke") {
    return NextResponse.json({ ok: await revokeSolve(db, { adminId: user.id, solveId: Number(b.solveId), reason: String(b.reason ?? "") }) });
  }
  // bulk: userIds array grants the same problem/time to each (LeetCode outage)
  const userIds: number[] = Array.isArray(b.userIds) ? b.userIds.map(Number) : [Number(b.userId)];
  const results = [];
  for (const userId of userIds) {
    results.push({ userId, ...(await grantSolve(db, {
      adminId: user.id, userId, problemId: Number(b.problemId), acceptedAt: new Date(b.acceptedAt),
      reason: String(b.reason ?? ""), evidence: String(b.evidence ?? ""), now: new Date(),
    })) });
  }
  return NextResponse.json({ results });
}
```

- [ ] **Step 5: Run tests, then commit**

Run: `npx vitest run tests/services/grants.test.ts`
Expected: PASS.

```bash
git add src/services/grants.ts src/app/api/admin/grants tests/services/grants.test.ts
git commit -m "feat: admin manual solve grants, bulk grants and revokes with audit

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Cheater reports and admin review

**Files:**
- Create: `src/services/reports.ts`, `src/app/api/report/route.ts`, `src/app/api/admin/reports/route.ts`, `tests/services/reports.test.ts`

**Interfaces:**
- Consumes: `writeAudit`, `findContestForSubmission`, tables `reports, disqualifications, solves, problems, batches, contests`.
- Produces:
  ```ts
  export type ReportResult =
    | { ok: true; reportId: number }
    | { ok: false; reason: "contest_not_ended" | "self_report" | "no_proof" | "duplicate" };
  export async function fileReport(db: Db, input: {
    contestId: number; reporterId: number; targetUserId: number; problemId: number | null;
    proofUrl: string; description: string; now: Date;
  }): Promise<ReportResult>
  export type Decision =
    | { kind: "dismiss" }
    | { kind: "revoke_solve"; solveId: number }
    | { kind: "disqualify"; reason: string };
  export async function reviewReport(db: Db, input: { adminId: number; reportId: number; decision: Decision; now: Date }): Promise<boolean>
  ```
  Reports open only after the contest ends (`now > contest.endsAt`). `revoke_solve` and `disqualify` mark the report `upheld`; `dismiss` marks it `dismissed`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/services/reports.test.ts
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import { users, problems, solves, reports, disqualifications, auditLog } from "@/db/schema";
import { createContest } from "@/services/contest";
import { fileReport, reviewReport } from "@/services/reports";
import { getLeaderboard } from "@/services/leaderboard";

const start = new Date("2026-10-17T10:00:00Z");
const at = (min: number) => new Date(start.getTime() + min * 60_000);

async function setup() {
  const db = await createTestDb();
  const contestId = await createContest(db, { title: "W1", startsAt: start, batches: [[{ difficulty: "easy", slug: "a", title: "A" }]] });
  const [p] = await db.select().from(problems);
  const [reporter] = await db.insert(users).values({ email: "r@c.edu", name: "R" }).returning();
  const [target] = await db.insert(users).values({ email: "t@c.edu", name: "T" }).returning();
  const [admin] = await db.insert(users).values({ email: "a@c.edu", role: "admin" }).returning();
  const [s] = await db.insert(solves).values({ userId: target.id, problemId: p.id, acceptedAt: at(5), multiplier: 1.5, points: 3, source: "auto" }).returning();
  return { db, contestId, p, reporter, target, admin, solveId: s.id };
}

const after = at(200);

describe("reports", () => {
  it("blocks reports while the contest is running, self-reports and empty proof", async () => {
    const { db, contestId, reporter, target } = await setup();
    const base = { contestId, reporterId: reporter.id, targetUserId: target.id, problemId: null, proofUrl: "https://x/p", description: "same code" };
    expect(await fileReport(db, { ...base, now: at(60) })).toEqual({ ok: false, reason: "contest_not_ended" });
    expect(await fileReport(db, { ...base, targetUserId: reporter.id, now: after })).toEqual({ ok: false, reason: "self_report" });
    expect(await fileReport(db, { ...base, proofUrl: " ", now: after })).toEqual({ ok: false, reason: "no_proof" });
  });
  it("files a report once per reporter and target", async () => {
    const { db, contestId, reporter, target } = await setup();
    const base = { contestId, reporterId: reporter.id, targetUserId: target.id, problemId: null, proofUrl: "https://x/p", description: "d", now: after };
    expect(await fileReport(db, base)).toMatchObject({ ok: true });
    expect(await fileReport(db, base)).toEqual({ ok: false, reason: "duplicate" });
  });
  it("revokes a solve when upheld and the leaderboard drops it", async () => {
    const { db, contestId, reporter, target, admin, solveId } = await setup();
    const r = await fileReport(db, { contestId, reporterId: reporter.id, targetUserId: target.id, problemId: null, proofUrl: "https://x/p", description: "d", now: after });
    if (!r.ok) throw new Error("file failed");
    expect(await reviewReport(db, { adminId: admin.id, reportId: r.reportId, decision: { kind: "revoke_solve", solveId }, now: after })).toBe(true);
    expect((await getLeaderboard(db, contestId))).toHaveLength(0);
    const [rep] = await db.select().from(reports).where(eq(reports.id, r.reportId));
    expect(rep).toMatchObject({ status: "upheld", reviewedBy: admin.id });
  });
  it("disqualifies and audits", async () => {
    const { db, contestId, reporter, target, admin } = await setup();
    const r = await fileReport(db, { contestId, reporterId: reporter.id, targetUserId: target.id, problemId: null, proofUrl: "https://x/p", description: "d", now: after });
    if (!r.ok) throw new Error("file failed");
    await reviewReport(db, { adminId: admin.id, reportId: r.reportId, decision: { kind: "disqualify", reason: "plagiarism" }, now: after });
    expect(await db.select().from(disqualifications)).toHaveLength(1);
    expect((await getLeaderboard(db, contestId))).toHaveLength(0);
    expect((await db.select().from(auditLog)).map((a) => a.action)).toContain("report_upheld_disqualify");
  });
  it("dismisses without changing scores", async () => {
    const { db, contestId, reporter, target, admin } = await setup();
    const r = await fileReport(db, { contestId, reporterId: reporter.id, targetUserId: target.id, problemId: null, proofUrl: "https://x/p", description: "d", now: after });
    if (!r.ok) throw new Error("file failed");
    await reviewReport(db, { adminId: admin.id, reportId: r.reportId, decision: { kind: "dismiss" }, now: after });
    expect((await getLeaderboard(db, contestId))).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/services/reports.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/services/reports.ts
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { contests, disqualifications, reports, solves } from "@/db/schema";
import { writeAudit } from "./audit";

export type ReportResult =
  | { ok: true; reportId: number }
  | { ok: false; reason: "contest_not_ended" | "self_report" | "no_proof" | "duplicate" };

export async function fileReport(db: Db, input: {
  contestId: number; reporterId: number; targetUserId: number; problemId: number | null;
  proofUrl: string; description: string; now: Date;
}): Promise<ReportResult> {
  const [contest] = await db.select().from(contests).where(eq(contests.id, input.contestId)).limit(1);
  if (!contest || input.now <= contest.endsAt) return { ok: false, reason: "contest_not_ended" };
  if (input.reporterId === input.targetUserId) return { ok: false, reason: "self_report" };
  if (!input.proofUrl.trim()) return { ok: false, reason: "no_proof" };

  const [dup] = await db.select({ id: reports.id }).from(reports).where(and(
    eq(reports.contestId, input.contestId), eq(reports.reporterId, input.reporterId), eq(reports.targetUserId, input.targetUserId),
  )).limit(1);
  if (dup) return { ok: false, reason: "duplicate" };

  const [r] = await db.insert(reports).values({
    contestId: input.contestId, reporterId: input.reporterId, targetUserId: input.targetUserId,
    problemId: input.problemId, proofUrl: input.proofUrl.trim(), description: input.description, createdAt: input.now,
  }).returning();
  return { ok: true, reportId: r.id };
}

export type Decision =
  | { kind: "dismiss" }
  | { kind: "revoke_solve"; solveId: number }
  | { kind: "disqualify"; reason: string };

export async function reviewReport(db: Db, input: {
  adminId: number; reportId: number; decision: Decision; now: Date;
}): Promise<boolean> {
  const [rep] = await db.select().from(reports).where(eq(reports.id, input.reportId)).limit(1);
  if (!rep || rep.status !== "pending") return false;
  const d = input.decision;

  if (d.kind === "dismiss") {
    await db.update(reports).set({ status: "dismissed", reviewedBy: input.adminId, reviewedAt: input.now }).where(eq(reports.id, rep.id));
    await writeAudit(db, { actorId: input.adminId, action: "report_dismissed", target: `report:${rep.id}` });
    return true;
  }
  if (d.kind === "revoke_solve") {
    const revoked = await db.update(solves).set({ status: "revoked" })
      .where(and(eq(solves.id, d.solveId), eq(solves.userId, rep.targetUserId)))
      .returning({ id: solves.id });
    if (revoked.length === 0) return false; // the solve must belong to the reported user
    await db.update(reports).set({ status: "upheld", reviewedBy: input.adminId, reviewedAt: input.now }).where(eq(reports.id, rep.id));
    await writeAudit(db, { actorId: input.adminId, action: "report_upheld_revoke", target: `report:${rep.id}`, details: `solve ${d.solveId}` });
    return true;
  }
  await db.insert(disqualifications).values({
    contestId: rep.contestId, userId: rep.targetUserId, reportId: rep.id, reason: d.reason, createdBy: input.adminId,
  }).onConflictDoNothing();
  await db.update(reports).set({ status: "upheld", reviewedBy: input.adminId, reviewedAt: input.now }).where(eq(reports.id, rep.id));
  await writeAudit(db, { actorId: input.adminId, action: "report_upheld_disqualify", target: `report:${rep.id}`, details: d.reason });
  return true;
}
```

- [ ] **Step 4: Add the endpoints**

```ts
// src/app/api/report/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { fileReport } from "@/services/reports";

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id as number | undefined;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const result = await fileReport(getDb(), {
    contestId: Number(b.contestId), reporterId: userId, targetUserId: Number(b.targetUserId),
    problemId: b.problemId ? Number(b.problemId) : null, proofUrl: String(b.proofUrl ?? ""),
    description: String(b.description ?? ""), now: new Date(),
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
```

```ts
// src/app/api/admin/reports/route.ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { reports } from "@/db/schema";
import { reviewReport } from "@/services/reports";

async function adminId() {
  const u = (await auth())?.user as { id?: number; role?: string } | undefined;
  return u?.role === "admin" ? u.id ?? null : null;
}

export async function GET() {
  if (!(await adminId())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await getDb().select().from(reports).where(eq(reports.status, "pending")));
}

export async function POST(req: Request) {
  const id = await adminId();
  if (!id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json();
  const ok = await reviewReport(getDb(), { adminId: id, reportId: Number(b.reportId), decision: b.decision, now: new Date() });
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
```

- [ ] **Step 5: Run tests, then commit**

Run: `npx vitest run tests/services/reports.test.ts`
Expected: PASS.

```bash
git add src/services/reports.ts src/app/api/report src/app/api/admin/reports tests/services/reports.test.ts
git commit -m "feat: cheater reports with proof and admin review

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Admin contest scheduling and post-contest results

**Files:**
- Create: `src/app/api/admin/contests/route.ts`, `src/app/admin/page.tsx`, `src/app/results/[contestId]/page.tsx`

**Interfaces:**
- Consumes: `createContest`, `ContestInput`, `getLeaderboard`, tables `solves, problems, users, batches`.
- Produces: `POST /api/admin/contests` accepts `{ title, startsAt, batches: ProblemInput[][] }` and returns `{ contestId }`.

- [ ] **Step 1: Add the admin contest endpoint (validate batch shape)**

```ts
// src/app/api/admin/contests/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { createContest, type ProblemInput } from "@/services/contest";
import { writeAudit } from "@/services/audit";

export async function POST(req: Request) {
  const user = (await auth())?.user as { id?: number; role?: string } | undefined;
  if (!user?.id || user.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json();
  const batches = b.batches as ProblemInput[][];
  const valid =
    typeof b.title === "string" && !Number.isNaN(Date.parse(b.startsAt)) && Array.isArray(batches) && batches.length > 0 &&
    batches.every((list) => Array.isArray(list) && list.every((p) =>
      ["easy", "medium", "hard"].includes(p.difficulty) && typeof p.slug === "string" && p.slug && typeof p.title === "string"));
  if (!valid) return NextResponse.json({ error: "invalid contest" }, { status: 400 });

  const db = getDb();
  const contestId = await createContest(db, { title: b.title, startsAt: new Date(b.startsAt), batches });
  await writeAudit(db, { actorId: user.id, action: "create_contest", target: `contest:${contestId}` });
  return NextResponse.json({ contestId });
}
```

- [ ] **Step 2: Add the admin page (JSON editor for one contest)**

```tsx
// src/app/admin/page.tsx
"use client";
import { useState } from "react";

const sample = JSON.stringify({
  title: "Saturday Contest",
  startsAt: "2026-10-17T10:00:00Z",
  batches: [[
    { difficulty: "easy", slug: "two-sum", title: "Two Sum" },
    { difficulty: "easy", slug: "valid-parentheses", title: "Valid Parentheses" },
    { difficulty: "medium", slug: "longest-substring-without-repeating-characters", title: "Longest Substring Without Repeating Characters" },
    { difficulty: "hard", slug: "median-of-two-sorted-arrays", title: "Median of Two Sorted Arrays" },
  ]],
}, null, 2);

export default function AdminPage() {
  const [text, setText] = useState(sample);
  const [msg, setMsg] = useState("");
  async function create() {
    const r = await fetch("/api/admin/contests", { method: "POST", body: text });
    const j = await r.json();
    setMsg(r.ok ? `Created contest ${j.contestId}.` : j.error ?? "Failed.");
  }
  return (
    <main>
      <h1>Schedule a contest</h1>
      <p>One array of problems per batch. Add two more batches for a full 3-hour contest.</p>
      <textarea id="contest-json" rows={20} cols={80} value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={create}>Create contest</button>
      {msg && <p role="status">{msg}</p>}
    </main>
  );
}
```

- [ ] **Step 3: Add the post-contest results page**

```tsx
// src/app/results/[contestId]/page.tsx
import { and, eq, asc } from "drizzle-orm";
import { getDb } from "@/db";
import { batches, contests, problems, solves, users } from "@/db/schema";
import { getLeaderboard } from "@/services/leaderboard";

export const dynamic = "force-dynamic";

export default async function Results({ params }: { params: Promise<{ contestId: string }> }) {
  const contestId = Number((await params).contestId);
  const db = getDb();
  const [contest] = await db.select().from(contests).where(eq(contests.id, contestId)).limit(1);
  if (!contest) return <main><h1>Contest not found</h1></main>;
  if (new Date() <= contest.endsAt) return <main><h1>Results open when the contest ends.</h1></main>;

  const board = await getLeaderboard(db, contestId);
  const rows = await db
    .select({ userId: solves.userId, title: problems.title, difficulty: problems.difficulty, acceptedAt: solves.acceptedAt, points: solves.points, source: solves.source })
    .from(solves)
    .innerJoin(problems, eq(solves.problemId, problems.id))
    .innerJoin(batches, eq(problems.batchId, batches.id))
    .where(and(eq(batches.contestId, contestId), eq(solves.status, "valid")))
    .orderBy(asc(solves.acceptedAt));

  return (
    <main>
      <h1>{contest.title}: results</h1>
      {board.map((b) => (
        <section key={b.userId}>
          <h2>#{b.rank} {b.name} · {b.points} pts</h2>
          <ul>
            {rows.filter((r) => r.userId === b.userId).map((r, i) => (
              <li key={i}>{r.title} ({r.difficulty}) · {r.points} pts · {r.acceptedAt.toISOString()}{r.source === "manual" ? " · granted by admin" : ""}</li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
```

- [ ] **Step 4: Type-check, then commit**

Run: `npx tsc --noEmit`
Expected: no errors. Fix any type errors in the files above before committing.

```bash
git add src/app
git commit -m "feat: admin contest scheduling and post-contest results page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Hardening and dry run

**Files:**
- Create: `tests/e2e/simulated-contest.test.ts`, `docs/runbook.md`

**Interfaces:**
- Consumes: every service above.

- [ ] **Step 1: Write the simulated-contest integration test**

```ts
// tests/e2e/simulated-contest.test.ts
import { describe, it, expect } from "vitest";
import { createTestDb } from "@/db/test-db";
import { users } from "@/db/schema";
import { createContest, visibleProblems } from "@/services/contest";
import { checkSubmission } from "@/services/submission-checker";
import { snapshotAll } from "@/services/snapshotter";
import { getLeaderboard } from "@/services/leaderboard";
import type { LeetCodeClient } from "@/leetcode/client";

const start = new Date("2026-10-17T10:00:00Z");
const at = (min: number) => new Date(start.getTime() + min * 60_000);
const link = (id: string) => `https://leetcode.com/submissions/detail/${id}/`;

describe("simulated contest", () => {
  it("runs 50 students through three batches", async () => {
    const db = await createTestDb();
    const mk = (n: number) => [
      { difficulty: "easy" as const, slug: `e${n}a`, title: `E${n}A` },
      { difficulty: "easy" as const, slug: `e${n}b`, title: `E${n}B` },
      { difficulty: "medium" as const, slug: `m${n}`, title: `M${n}` },
      { difficulty: "hard" as const, slug: `h${n}`, title: `H${n}` },
    ];
    const contestId = await createContest(db, { title: "W1", startsAt: start, batches: [mk(1), mk(2), mk(3)] });

    const subs = new Map<string, { id: string; slug: string; acceptedAt: Date }[]>();
    const ids: number[] = [];
    for (let i = 0; i < 50; i++) {
      const [u] = await db.insert(users).values({ email: `s${i}@c.edu`, name: `S${i}`, leetcodeUsername: `s${i}` }).returning();
      ids.push(u.id);
      // every student solves the batch-1 easy at minute 5 + i%10; every fifth also the batch-1 hard at minute 50
      const list = [{ id: `${i}-1`, slug: "e1a", acceptedAt: at(5 + (i % 10)) }];
      if (i % 5 === 0) list.push({ id: `${i}-2`, slug: "h1", acceptedAt: at(50) });
      subs.set(`s${i}`, list);
    }
    const client: LeetCodeClient = { recentAccepted: async (u) => subs.get(u) ?? [], profileBio: async () => "" };

    expect(await visibleProblems(db, contestId, at(0))).toHaveLength(4);
    expect(await snapshotAll(db, client, at(55))).toMatchObject({ users: 50, failed: 0 });

    let t = at(70);
    for (const [i, id] of ids.entries()) {
      t = new Date(t.getTime() + 10_000);
      expect((await checkSubmission(db, client, { userId: id, link: link(`${i}-1`), now: t })).ok).toBe(true);
      if (i % 5 === 0) {
        t = new Date(t.getTime() + 10_000);
        expect((await checkSubmission(db, client, { userId: id, link: link(`${i}-2`), now: t })).ok).toBe(true);
      }
    }

    const board = await getLeaderboard(db, contestId);
    expect(board).toHaveLength(50);
    expect(board[0].hardsSolved).toBe(1);
    // hard solvers are i % 5 == 0, so their easy lands at minute 5 or 10 (inside the 15-minute bonus): 3 + 12
    expect(board[0].points).toBe(15);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/e2e/simulated-contest.test.ts`
Expected: PASS. If the top score assertion differs, confirm by hand: a student solving `e1a` at minute 5 (≤15) gets 3 points, plus the hard at minute 50 (base 12) is 15.

- [ ] **Step 3: Write the runbook**

```markdown
# Contest-day runbook

## Before the week
- Create the contest in /admin with 3 batches (2 easy, 1 medium, 1 hard each). Prefer newer or less popular problems.
- Remind students to link their LeetCode account (Account page) before Saturday.
- Run `npx tsx scripts/leetcode-smoke.ts <a real username>` to confirm the LeetCode endpoint still returns id, slug and timestamp.

## Environment
DATABASE_URL, AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, ALLOWED_EMAIL_DOMAIN, ADMIN_EMAILS, CRON_SECRET

## During the contest
- Watch /api/cron/snapshot results (failed count) in the Vercel logs.
- If LeetCode is failing, use /api/admin/grants with `userIds` to grant solves from screenshots. Each needs a reason and evidence.

## After the contest
- Results open at contest end; reports open at the same time.
- Review pending reports at GET /api/admin/reports; decide via POST (dismiss, revoke_solve, disqualify).
- Every action is in audit_log.

## Dry run (before the first public contest)
1. Run with 10 volunteers on a test contest whose batches unlock 5 minutes apart.
2. Check: problems appear on time, links verify, multiplier applies only inside 15 minutes, the leaderboard updates within ~15 seconds.
3. Submit a link after its batch window closed and confirm "outside the window".
4. Try a late link after the contest ends but before the 10-minute grace.
5. File a report, uphold it, and confirm the leaderboard recalculates.
```

- [ ] **Step 4: Run the full suite and commit**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass and no type errors.

```bash
git add tests/e2e docs/runbook.md
git commit -m "test: simulated contest integration test and contest-day runbook

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review against the spec

| Spec requirement | Task |
|---|---|
| 3 hourly batches, 1-hour windows, 2E+1M+1H, configurable batch count | 1 (defaults), 9 |
| Points 2/5/12 | 1, 9 |
| Window rule using LeetCode timestamp | 3, 11 |
| Early-solve multiplier, configurable per contest, one decimal | 3, 5 (columns), 9, 11, 13 |
| Ranking: points, hards, earliest last solve | 4, 12 |
| Link deadline contest end + grace; solve still inside its window | 9, 11 |
| Archive-first verification, live fallback, snapshot job ~5 min | 10, 11 |
| Never fetch the link; only the ID | 2, 11 |
| Google login restricted to college domain | 7 |
| LeetCode ownership by bio token; one account per user | 8 |
| Time-gated problem release | 9, 12 |
| Live leaderboard, short-polled, cached | 12 |
| Post-contest results (solve records, never code) | 15 |
| Reports with proof, admin review, disqualify, audit | 14 |
| Admin manual grants, bulk, revoke, audit | 13 |
| Admin contest scheduling | 15 |
| Testing: scoring edges, link parsing, client contract, integration, dry run | 2, 3, 6, 16 |
| Load test at unlock spikes | Not covered by an automated task; see below |

**Gap:** the spec lists a load test of leaderboard and problem pages at unlock spikes. It is intentionally manual (the dry-run in the runbook, plus an `autocannon`/`k6` run against a preview deployment before launch), because it needs a deployed environment. Add it to the launch checklist when the first preview deployment exists.

**Type consistency:** `parseSubmissionId`, `scoreSolve`, `rankLeaderboard`, `LeetCodeClient`, `checkSubmission`, `grantSolve`, `revokeSolve`, `fileReport`, `reviewReport`, `snapshotAll`, `getLeaderboard`, `createContest`, `findLiveContest`, `findContestForSubmission` and `visibleProblems` use the same names and signatures wherever they appear. User ids are `number` everywhere.
