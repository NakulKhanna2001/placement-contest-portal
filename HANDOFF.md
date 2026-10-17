# Handoff

For the next developer or AI agent picking this project up. Read this first, then the spec, then the plan.

## One-line summary

A weekly 3-hour LeetCode-based contest portal for college placement prep: time-gated batches, link-based submission verification, early-solve multiplier, live leaderboard, community cheater reports with admin review.

## Current state (2026-10-15)

**Owner update (2026-10-17):** The application is now implemented; the original status table below is historical. Students may complete LeetCode verification during a live contest and participate immediately. Do not restore a verification-before-start requirement. Existing solve records and points are preserved; normal batch windows, bonuses and link deadlines still apply. This eligibility change requires no database migration.

**Early-batch update (2026-10-17):** Verifying all four valid solves in a batch unlocks the immediately following batch for that student. This can chain through the remaining batches. The earliest eligible acceptance is the preceding batch’s last required LeetCode acceptance (never before contest start); all four prerequisite solves must be verified in the portal. Scheduled opening still applies for everyone else. Bonus cutoff remains the original scheduled opening + configured bonus window, inclusive; eligible early solves get the bonus. Access is derived from saved solves, with no migration or automatic rescoring of existing records. Submission checks, manual grants and explicit rescoring share this rule. The later contest-wide deadline update below supersedes the old per-batch closing times.

**Contest-wide deadline (2026-10-17):** All unlocked problems now accept LeetCode solves through `contest.endsAt + 60 seconds`, inclusive (3:01:00 for a three-hour contest). Hourly batch closing times no longer restrict scoring. Bonus cutoffs and personal early openings remain unchanged; later eligible solves earn base points. Links remain open through `endsAt + max(graceSeconds, 60)`. Reports/results open after the final scoring minute. `src/lib/contest-timing.ts` owns these derived deadlines; the stored schedule and old `batches.closesAt` values are retained, with no migration or automatic rescore. Previously rejected links can be resubmitted under the new rule.

**Detailed leaderboard (2026-10-17):** `/leaderboard` provides a per-problem standings grid with acceptance times (IST and elapsed), counted points, bonus multipliers, campus/year filters and 12-second refresh. Optional `contestId` selects an archived/scheduled contest. The detailed API mode is private and verifies profile access; locked problem titles/slugs are redacted server-side for the current viewer. Rankings and saved scores use the existing logic. No database migration is required.

**Admin preview (2026-10-17):** Owner-approved admins can view all contest problems and standings without LeetCode verification. Draft/future problem links are also available in Admin. Preview is read-only and separate from personal opening/scoring eligibility. `ADDITIONAL_ADMIN_EMAILS` is merged with `ADMIN_EMAILS` on verified Google sign-in, permitting new appointments without overwriting a write-only existing admin list. Unregistered listed accounts become admins on first login. Do not put configured email values in source files.

**Admin submissions (2026-10-17):** `/admin/submissions` is a read-only, admin-guarded saved-solve browser, linked from Admin and the admin leaderboard view. It includes counted submission links, accepted/verified times, points/bonuses, valid/revoked status, disqualifications and manual-grant evidence. Filter by contest/student/status; 50 rows per page and 30-second refresh. This is saved solve metadata, not LeetCode source code or a log of all rejected link attempts. No migration or changes to scores are required.

| Item | State |
|---|---|
| Design spec (rev 3) | Done, approved by the project owner |
| Implementation plan (16 tasks) | Done, self-reviewed, **never executed** |
| Application code | **None.** The repo has only `docs/`, `README.md` and this file |
| Tests | None yet. All test code in the plan is unrun |
| Deployment | None |

The code blocks in the plan are written but untested. Expect small fixes while executing (for example Auth.js beta typings, Drizzle `onConflictDoNothing` usage, create-next-app prompts). Fix them in place and keep the plan's task order.

## Next step

Execute the plan from **Task 1** in `docs/superpowers/plans/2026-10-15-weekly-contest-portal.md`. Tasks are ordered so each one builds on tested earlier work. Pure logic comes first (Tasks 2 to 4), then the database (5), then external integrations (6 to 8), then services and UI (9 to 15), then hardening (16).

## Decisions that are settled (do not change without asking the owner)

| Decision | Why |
|---|---|
| 3 hours, 3 hourly batch releases, personal early access after completing the preceding batch; all problems score through contest end + 1 minute | Owner-approved contest-wide solve deadline replaces hourly closing times. Batch count remains configurable |
| 2 Easy + 1 Medium + 1 Hard per batch | Easies solve fast and mediums fill the middle; one Hard per batch is the aspiration |
| Points 2 / 5 / 12 | Chosen so students aim for Hards: one Hard outscores a whole batch of easies and the medium |
| 1.5× multiplier through scheduled opening + 15 minutes, including eligible early-access solves; per-contest configurable | Personal early access never shifts the bonus cutoff |
| Verification by pasted link, matched on **submission ID** against the student's public accepted list | LeetCode submission pages are private to the owner and there is no official API, so the link itself cannot be fetched |
| Background snapshot every ~5 minutes into `seen_submissions` | LeetCode returns only the last 20 accepted entries, so late links would otherwise fail |
| Link deadline is contest end plus configured grace (default 10 minutes, effective minimum 1 minute) | The acceptance itself must fall between personal opening and contest end + 1 minute |
| "Hacking" means community cheater reports with proof, not test-case hacks | No own judge in v1. Reports are reviewed by admins; no automated detection |
| No "Verify now" button | Submitting a link is the verification |
| One LeetCode account per portal account, proven with a token in the bio | Prevents account swapping; ownership cannot be faked |
| Own code judge, multi-week leaderboard, tiered time decay are out of scope for v1 | Listed as later work in the spec |

## Facts verified against LeetCode on 2026-10-15

LeetCode's GraphQL endpoint is `https://leetcode.com/graphql`. It is unofficial, so re-check before relying on it.

- `recentAcSubmissionList(username, limit)` returns `id`, `title`, `titleSlug`, `timestamp` (Unix seconds as a string).
- It returns **at most 20** entries even if you ask for 50 or 200.
- `matchedUser(username).profile.aboutMe` returns the bio. A missing user returns `matchedUser: null` plus an error entry.
- Wrong or not-accepted submissions are **not** visible, only Accepted ones.

Run the smoke script from Task 6 (`scripts/leetcode-smoke.ts`) before any contest.

## Pitfalls to watch for

- **Timestamps.** Always use LeetCode's timestamp for window and multiplier checks, never `new Date()`. The injected `now` is only for deadlines, cooldowns and unlocks.
- **Boundaries.** The window is inclusive at both ends (`personal opening <= T <= contest end + 1 minute`); the multiplier cutoff is inclusive at scheduled batch opening + 15:00. Early access never shifts the bonus anchor or contest-wide deadline.
- **Clock in tests.** Services take `now` as a parameter on purpose. Do not read the system clock inside services.
- **`check_log.createdAt`** must be set from the injected `now`, not the database default, or cooldown tests break.
- **Rate limiting LeetCode.** One request per submission plus one per linked student every ~5 minutes during a live contest. Do not add more polling. If throttled, increase the snapshot interval before adding workarounds.
- **Auth.js is `next-auth@beta`.** Session typing in `src/auth.ts` uses `as any` casts; tighten with module augmentation if time allows.
- **Reports** only open after the final scoring minute ends. Disqualified users are hidden from the leaderboard but their solves are kept for audit.
- **Source code is never stored or shown.** LeetCode keeps it private; the portal stores only solve records and submission IDs.

## Working conventions

- Test-first: write the failing test, watch it fail, implement, watch it pass, commit. One commit per task.
- Keep pure logic (`link`, `scoring`, `ranking`) free of I/O.
- All admin actions write an `audit_log` row.
- Never commit secrets. Environment variable names are in `README.md`; values live in `.env.local` and Vercel.
- If a requirement is unclear, the spec is the source of truth. If the spec and plan disagree, the spec wins; fix the plan.

## Open items (from the spec, section 11)

- Snapshot interval and per-user rate limit (default 5 minutes, 5-second attempt cooldown)
- Final multiplier window and value (defaults: 15 minutes, 1.5×)
- Whether report proof is uploaded to us or only linked (plan assumes a URL)
- Retention period for `check_log`
- Manual load test at unlock spikes against a preview deployment
- Choose a license before accepting outside contributions

## Suggested prompt for another AI agent

> Read `HANDOFF.md`, then `docs/superpowers/specs/2026-10-15-weekly-contest-portal-design.md`, then execute `docs/superpowers/plans/2026-10-15-weekly-contest-portal.md` from Task 1, test-first, one commit per task. Do not change settled decisions. Report anything in the plan that fails when run.
