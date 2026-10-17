# NST LC Grind — implementation report

Date: 2026-10-15

## Contract and status

- Handoff: [`HANDOFF.md`](HANDOFF.md)
- Implementation plan: [`docs/superpowers/plans/2026-10-15-weekly-contest-portal.md`](docs/superpowers/plans/2026-10-15-weekly-contest-portal.md)
- Source of truth: [`docs/superpowers/specs/2026-10-15-weekly-contest-portal-design.md`](docs/superpowers/specs/2026-10-15-weekly-contest-portal-design.md)
- **Status:** deployed on Vercel Hobby with **zero cron jobs**, at **https://nst-lc-grind.vercel.app**. Google signup is public, with students by default and explicit admin emails. Verified LeetCode profiles are required for participant-facing contest access; displayed/input times use IST. The latest update adds a screenshot verification guide and unverified-member welcome popup. **113 automated tests, 14 browser checks, type checking, lint, and the production build pass locally**.

## Screenshot verification onboarding

Unverified signed-in members receive an accessible native welcome dialog explaining the mandatory ownership step. It uses the owner's three annotated screenshots, optimized to approximately 104 KB total in local WebP assets, with descriptive alternatives and full-size links. The five steps cover generating a personal code, opening Edit Profile, locating ReadMe, pasting/saving, and returning to verify the username. A persistent action opens `/account#leetcode-verification`; the Account form has a reopenable guide and a copy-code button with manual-copy fallback.

Dismissal is stored per member in `sessionStorage` for that browser tab. Closing or pressing Escape leaves all existing server verification gates in place. Anonymous and verified members receive no popup; a fresh verified session removes it after the existing form refresh. The async shell reuses request-cached session resolution, so onboarding adds no separate authentication endpoint or blocking shell fetch.

Ten UI cases cover visibility, dismissal/remount and different-user isolation, storage restrictions, verification completion/sign-out, guide reopening, copying, and failed verification feedback. Desktop/mobile browser checks cover actual native dialog focus isolation/restoration, Escape, image loading, scrolling, viewport fit, and the Account destination using isolated presentation markup. No real user's verification state is changed for testing.

## Visibility and standings follow-up

The owner reported missing problems while viewing the results of the finished, one-batch contest 1. Four problems were present in the database, but the results page only displayed solve records, of which there were none. Completed results now show the full problem set for practice; future/live results provide an Open contest link without exposing locked questions. Displayed times are localized with a deterministic UTC fallback.

Leaderboard tests also exposed stale rows and error state when changing contest IDs; both are now scoped to their originating contest. An isolated one-hour, three-student demo produces the expected 18 / 15 / 9.5 standings, and the existing 50-student simulation remains green. **80 unit/integration tests pass.**

At the owner's request, live demo contest 2 was created for 17:24–18:24 IST on 16 October, with links accepted until 18:34. Its four links and submission form were checked after unlock. The hosted checker correctly rejected a nonexistent ID without scoring. No synthetic production scores or users were added. See `docs/demo-verification.md` for the distinction between live and simulated tests.

## Public Google access update

The owner subsequently approved sign-in for **all verified Google accounts**, superseding the earlier owner-only launch setting. Ordinary users are assigned `student` and only exact `ADMIN_EMAILS` entries are assigned `admin`. `ALLOW_ALL_GOOGLE_ACCOUNTS=true` explicitly enables this mode; restricted domain/email modes still fail closed when the flag is off. Future admins can be added by editing the comma-separated list, redeploying, and signing in again. Public mode does not elevate anyone based on a domain, profile field, or merely registering.

Tests cover arbitrary Google/Workspace email domains, invalid/unverified emails, multiple configured admins, lookalikes, real database user creation, rejection of a profile-supplied admin role, and role synchronization on subsequent sign-ins. **69 unit/integration tests pass**. Public `/privacy` and `/terms` pages and a support contact complete Google Branding. The OAuth app was published and reloaded to confirm External/In production; a live sign-in request uses only `openid profile email` and the correct callback. Anonymous admin requests remain blocked. See the connected-environment notes for details.

The original handoff and plan have been preserved as approved historical documents. Their “no application code” state and unchecked tasks no longer describe the current repository. Begin future work by inspecting this report and the actual code, rather than re-running the scaffold steps.

## Verified contest entry and IST-only follow-up

The owner requested mandatory LeetCode verification before entering contests, and Indian time only. Signed-in users without a verified LeetCode profile now see a verification gate on the contest home and direct result URLs. Standings, submission, and report APIs reject unverified participants with HTTP 403. A username alone is insufficient: the database must contain a valid verification timestamp. Auth.js derives the session flag from fresh database state; a supplied/stale JWT flag cannot bypass it. Account/linking endpoints remain usable for unverified users, and administrative management remains role-controlled.

All displayed times, tooltips, date/time inputs, manual grants, and audit timestamp views use IST. Server rendering no longer displays a UTC fallback. Form parsing explicitly applies India time rather than the browser's timezone, preserving stored instants and scoring rules. Verification instructions now correctly name LeetCode's **ReadMe** field.

Regression coverage includes page/API bypass attempts, verification completion from an unverified account, stale verification claims, IST conversion across multiple device timezones, invalid calendar dates, and scheduling/manual grants outside India. **103 unit/integration tests pass** after this update.

## Vercel Hobby / no-cron update (owner-approved 2026-10-16)

The owner explicitly requested removal of scheduled polling to use Vercel Hobby. This supersedes the original plan's five-minute snapshot decision. `vercel.json` now has no cron entries; `/api/cron/snapshot` and the background snapshot worker are removed. `CRON_SECRET` is not required.

The existing checker already fetches and archives the submitting student's entire recent accepted list on an archive miss. Tests now exercise that behavior directly, including the 50-student simulation: a student submits one link per batch, which saves other records for later verification. There are no scheduled requests for other users. Earlier archives, acceptance-time scoring, cooldowns, and the contest-end grace deadline still apply. Students must submit promptly; an acceptance that disappeared before it was ever archived needs admin review.

The existing Vercel `nst-lc-grind` project is on Hobby, with Node 24, Next.js, and `iad1` near Neon. Production environment values are stored privately in Vercel, the canonical auth URL is `https://nst-lc-grind.vercel.app`, and the Google client includes that origin/callback alongside localhost. The unused legacy `next_snapshot_at` column is retained, so no new migration is needed. See `docs/environment-setup.md` for the current hosting configuration.

Production verification completed: Vercel reports Ready/Hobby and no cron definitions; public pages return 200; the old cron endpoint returns 404; anonymous admin requests return 401; the real owner Google login yields an admin session and an authenticated admin API response of 200. The no-cron source update is published to `stalin670/NST-LC-GRIND` and its GitHub Actions run passed. The volunteer contest and load check remain prerequisites for opening broad student access.

## Contest-editing follow-up

The owner requested editing for already drafted or scheduled contests. Admin rows now provide **Edit contest**, a pre-filled form, **Save changes**, and **Cancel editing**. Local timestamps are displayed correctly, and unchanged instants survive browser normalization, fractional seconds, and daylight-saving ambiguity. Temporarily reducing/restoring the batch count preserves unsaved problem input.

`updateContest` validates the complete configuration, requires an admin, serializes scheduling checks, rejects stale revisions and started contests, prevents overlap through grace, preserves remaining problem IDs, and audits changes atomically. Contests with solve records are protected. Publishing also advances the revision, preventing an older editor from silently undoing publication. Unknown API actions cannot fall through to contest creation.

Migration `0001_married_professor_monster.sql` adds only `contests.revision integer DEFAULT 0 NOT NULL`; it does not modify existing contest titles, times, problems, or scores. A private database backup was taken and the migration was applied before publishing the code. The test suite includes 11 database edit cases, 7 interactive form cases, and the API contract regression. Production verification opens the existing editor without saving changes to the owner's contest.

## Environment setup follow-up

The owner requested that existing authenticated access be used to finish Postgres and Google OAuth setup. Authenticated Google Cloud and Neon sessions were available in Chrome.

- Created a dedicated Google Cloud project (`placement-contest-portal`), OAuth branding, and a local Web client with callback `http://localhost:3000/api/auth/callback/google`.
- Created a dedicated Neon Free-plan project and Postgres 18 database; applied the migration and verified all ten tables.
- Added the owner as a Google OAuth test user and completed the **real account chooser, consent, callback, and database-backed admin session**.
- The owner explicitly selected **“Only my account”**. Added `ALLOWED_EMAILS` for exact-email access and left `ALLOWED_EMAIL_DOMAIN` empty. Other Gmail addresses are not permitted. Existing college-domain support remains available.
- Stored credentials and independently generated auth/cron secrets in private, Git-ignored `.env.local` with permissions `0600`.
- Verified the signed-in account and admin screens, a numeric admin session ID, authenticated admin API HTTP 200, and anonymous HTTP 401.
- Left the local app running at `http://localhost:3000` and the browser signed in. No public deployment was created.

See [`docs/environment-setup.md`](docs/environment-setup.md) for resource identifiers, policy details, and deployment follow-up. Next.js added its standard agent-guidance block to `AGENTS.md` when the development server started; this generated change is retained as instructed.

## UI and performance follow-up

The owner requested faster tab navigation, loading skeletons/animation, a more cohesive visual identity, and NST LC Grind naming. The app and Google consent-screen display name now use **NST LC Grind**.

The shared shell no longer waits on auth; role/profile queries are deduplicated per server render; public scheduling metadata is cached with mutation invalidation; the admin overview uses one authorized SQL statement; live-board polling no longer rerenders the entire page. Page-specific skeletons, active/pending navigation states, intent prefetch, keyboard support, and reduced-motion behavior are implemented.

See [`docs/ui-performance.md`](docs/ui-performance.md) for before/after measurements and design details. In the measured authenticated production pass, Arena, Account, and Admin content completion improved materially; Results timing was approximately unchanged within network variability. The optimized build is running locally on port 3000, with `AUTH_URL` set privately to the canonical local origin.

The owner then requested a simpler, more user-friendly UI. The current design uses a compact top menu (Contests / Results / Account / Admin), direct wording, fewer panels, and larger supporting text. Rules, account-linking details, occasional admin tools, and activity logs expand only when needed. The decorative format poster and sidebar have been removed; live submission input now comes before the problem list. Existing loading and performance improvements remain in place. Browser coverage checks the rule disclosure as well as navigation and responsive behavior.

## Delivered behavior

- Responsive student home, account linking, live contest/problem display, leaderboard, results archive, and per-participant solve records/report forms.
- Google Auth.js login with verified-email and exact college-domain/explicit-email checks. User emails are normalized; roles are read from the database when resolving sessions. Environment-listed admins are synchronized on sign-in.
- Random bio-token ownership proof, case-insensitive unique LeetCode usernames, immutable linking, and a five-second verification-attempt gate.
- Draft/published contest scheduling, configurable batch count and bonus/grace, enforced 2E/1M/1H composition, duplicate-problem rejection, and transactionally serialized scheduling/overlap checks.
- Inclusive one-hour windows, 2/5/12 points, default inclusive 15-minute 1.5× bonus, one-decimal rounding, shared ranks for exact ties, and disqualification filtering.
- Archive-first numeric-ID verification, live fallback, earliest-known valid solve selection, correct out-of-order link handling, deadline/cooldown enforcement, and explicit logging with the injected clock.
- Submission-triggered archiving with no scheduled jobs; archived records can be reused during grace without another upstream request.
- Admin screens for individual/bulk evidence-backed grants, revokes, re-grants, rescoring, draft publication, report review, and audit inspection.
- Report deduplication, strict target/contest/problem scoping, transactional moderation/audit, and retained revoked/disqualified solve records.
- Production migrations, in-memory migration tests, full contest simulation, HTTP authorization tests, public browser smoke checks, CI, a preview load utility, and a contest-day runbook.

## Files by purpose

| Purpose | Paths |
|---|---|
| Project/tooling | `package.json`, `package-lock.json`, `tsconfig.json`, `next-env.d.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.mjs`, `.nvmrc`, `.gitignore` |
| Pure rules/contracts | `src/lib/config.ts`, `types.ts`, `link.ts`, `scoring.ts`, `ranking.ts`, `auth-rules.ts` (including owner allowlist), `validation.ts`, `errors.ts`, `http.ts` |
| Database | `src/db/schema.ts`, `index.ts`, `test-db.ts`, `drizzle.config.ts`, `drizzle/0000_amused_brother_voodoo.sql`, migration metadata |
| Auth and external integration | `src/auth.ts`, `src/leetcode/client.ts`, `src/services/verification.ts`, `scripts/leetcode-smoke.ts` |
| Contest services | `src/services/contest.ts`, `submission-checker.ts`, `leaderboard.ts`, `cached-board.ts` |
| Moderation/admin services | `src/services/audit.ts`, `grants.ts`, `reports.ts` |
| HTTP and pages | `src/app/**`, including admin/account/results forms, student submission form, shared API form, live board, loading/error/not-found views, and global styles |
| Runtime/CI | `vercel.json`, `.github/workflows/ci.yml`, `scripts/load-preview.mjs` |
| Tests | `tests/lib/rules.test.ts`, `tests/lib/access-policy.test.ts`, `tests/integrations.test.ts`, `tests/db/schema.test.ts`, `tests/services/*.test.ts`, `tests/http.test.ts`, `tests/e2e/simulated-contest.test.ts`, `tests/browser/public.spec.ts`, `tests/helpers.ts` |
| Documentation | Updated `README.md`, `docs/runbook.md`, `docs/environment-setup.md`, this report |

## Deviations and reasons

1. **Scaffold created directly**, instead of copying create-next-app into an already populated repository. Uses the same approved Next.js/App Router/TypeScript stack and preserves existing documentation.
2. **Tests grouped around behavior**, rather than copying every illustrative plan snippet verbatim. Pure modules and service groups were tested red-first; regression cases were added for confirmed defects. Implementation initially remained uncommitted. The owner subsequently requested 10–20 focused commits and publication to the existing GitHub repository; the work is organized into 18 dependency-ordered groups.
3. **Schema additions:** `users.lastAttemptAt`, `lastLinkAttemptAt`, and `nextSnapshotAt` provide atomic database-backed claims. Case-insensitive username uniqueness, report uniqueness, batch-position uniqueness, scheduling checks, and query indexes enforce invariants.
4. **Contest status:** stored status is `draft | scheduled`; live/grace/ended are derived from server time. This avoids a separate status-changing cron and stale lifecycle values.
5. **Transactions and runtime validation** replace unchecked casts and independent writes in plan examples. Admin mutations audit atomically. Scheduling validates actual batch composition and rejects overlap through grace.
6. **`now` is required for linking, revoking, rescoring, and audit writes**, extending the plan's injected-clock convention. Auth/session typing avoids `any` casts; Auth.js's default string-ID intersection is handled when assigning the numeric portal ID.
7. **Earliest valid acceptance wins**, including archive/live records earlier than the pasted valid submission. Earlier links can improve an existing valid solve; later links do not double-score. Students cannot restore revoked solves.
8. **Accounts must be verified by contest start**, matching the spec's archive prerequisite. Late verification prepares the student for subsequent contests rather than retroactively changing the archive identity.
9. **Scheduled snapshots were originally implemented, then removed by owner request** for Vercel Hobby. On-submit lookups still archive all returned accepted records. No scheduled worker runs during the contest or grace.
10. **Reports are constrained to actual solve records** in the reported contest, and a problem-specific report cannot revoke another problem. Both target and contest are checked again during moderation.
11. **UI goes beyond minimal plan placeholders:** structured scheduling, working grant/revoke/rescore/report controls, audit viewer, results index, responsive styling, and explicit network/error states.
12. **No `.env.example` is created.** The repository instructions prohibit committing `.env*` files; the README documents every variable instead. Secrets are supplied privately by the operator.
13. **Plan dry-run errors corrected in the runbook:** settled one-hour windows are preserved, late links to timely acceptances are valid, and the simulation uses numeric submission IDs (the plan's `i-1` IDs would fail its own parser).

No settled point values, acceptance boundaries, bonus defaults, ranking order, linking model, or v1 non-goals were changed.

The subsequent exact-email access exception is an explicit owner-approved setup decision, documented above and covered by tests; it does not open the Gmail domain to other users.

## Verification evidence

| Command/check | Result |
|---|---|
| `npm test` | **PASS: 113 tests in 24 files.** Adds screenshot onboarding visibility/dismissal, guide reopening, copy/verification feedback to the existing verified-profile gates, fresh session flags, verification-route completion, IST, auth/contest/scoring/moderation coverage. |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS**, production Next.js build with all application/API routes |
| `npm run db:generate` | **PASS**, no schema drift after initial migration generation |
| `npm audit --omit=dev` | **PASS**, zero production dependency vulnerabilities reported |
| `npm run leetcode:smoke -- lee215` | **PASS**, real endpoint returned 20 accepted records with numeric IDs/slugs/dates and an available profile |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:browser` | **PASS: 14 browser checks**, including welcome-dialog keyboard behavior and responsive screenshots, verification-gate presentation/account navigation, public privacy/rules pages, desktop/mobile navigation, delayed feedback, keyboard access, reduced motion, skeletons, and overflow checks. |
| Default Playwright browser download | Initially **BLOCKED** by CDN timeout/DNS failure; browser execution succeeded using installed Chrome instead |
| `git diff --check` | **PASS** |
| Full `npm audit` | **9 development-only transitive advisories** in ESLint globbing and Drizzle CLI dependencies; compatible upstream remediation still pending. Breaking forced downgrades were not applied. |
| Managed Postgres `npm run db:migrate` | **PASS** on the new dedicated Neon database; independent SQL inspection confirmed ten tables and one applied migration. |
| Real Google OAuth callback and signed-in browser walkthrough | **PASS** locally and at `https://nst-lc-grind.vercel.app`: real Google login, database-backed admin session, authenticated admin API 200, and anonymous denial 401. |
| Hosted cron | **NOT APPLICABLE**: removed for Hobby. Preview load and the volunteer dry run remain operator launch checks. |
| GitHub Actions execution | **PASS** for public Google access: [run 38894153619](https://github.com/stalin670/NST-LC-GRIND/actions/runs/38894153619) |

### Acceptance-criteria traceability

| Requirement / plan tasks | Implementation | Evidence |
|---|---|---|
| Defaults, links, scoring, ranking (1–4) | `src/lib/{config,link,scoring,ranking}.ts` | `tests/lib/rules.test.ts`: exact edges, invalid dates/links, bonus, ties, DQ |
| Database and uniqueness (5) | `src/db/*`, `drizzle/*` | Clean migration in every integration fixture; `tests/db/schema.test.ts` checks duplicate solves and atomic audit rollback |
| LeetCode contract (6) | `src/leetcode/client.ts` | Response mapping/failure tests in `tests/integrations.test.ts`; live smoke passed |
| Domain/owner-restricted auth (7) | `src/auth.ts`, `src/lib/auth-rules.ts`, Auth.js route | Domain/allowlist tests, route auth guards, and successful real owner Google sign-in |
| Ownership (8) | `src/services/verification.ts`, `/account`, `/api/link` | Token, duplicate username/case, no token, immutable link tests |
| Time-gated scheduling (9) | `src/services/contest.ts`, student/admin pages | Before/exact unlock, draft privacy, batch validation, overlaps, inclusive grace tests |
| Archive capture (replaces task 10) | `src/services/submission-checker.ts` | One student's link saves their list; another archived link verifies during an outage without an extra request; 50-user simulation uses only submitted links |
| Submission verification (11) | `src/services/submission-checker.ts`, `/api/submit` | Archive-only grace, wrong ID/problem/window, future timestamp, upstream failure, earliest-wins, concurrency tests |
| Live rankings (12) | leaderboard services/API, `live-board.tsx` | Correct filtering/names/ranks; 5-second cache and 12-second client polling inspected |
| Manual/bulk grants, revoke, rescore/audit (13) | grants service/admin endpoint/forms | Grants, outside-window rejection, authorization, duplicate, re-grant, score repair, audit/rollback tests |
| Reports and review (14) | reports service/endpoints/forms | Timing/proof/duplicate checks; cross-contest prevention; revoke/DQ/dismiss; already-reviewed rejection; in-flight DQ race |
| Admin scheduling/results (15) | `/admin`, `/results`, `/results/[contestId]` | Publish/audit tests, gated queries, typecheck/build; authenticated admin page/forms/API verified against real services |
| Hardening/dry run (16) | tests, CI, `docs/runbook.md`, load script | 42 local tests after cron removal; browser regression coverage and public-launch steps documented |

## Self-review findings and repairs

- Fixed the plan's first-link-wins behavior to honor the earliest valid acceptance, including out-of-order links and available earlier archive records.
- Enforced the 2E/1M/1H batch rule, rejected duplicate slugs/overlapping contests, and preserved drafts as private.
- Replaced a racy read-then-check cooldown with an atomic update before network access.
- The 50-student simulation exposed a JavaScript `counter += await query` lost-update race across snapshot workers. Results are now awaited into a local variable before incrementing.
- Added a regression test showing a report can disqualify a student while their LeetCode lookup is in flight. The checker now rechecks DQ under the same user-row lock used by moderation before saving.
- Prevented case-variant username reuse and concurrent account swaps through a unique index and conditional update.
- Made LeetCode HTTP/GraphQL/malformed-response failures explicit and bounded calls to eight seconds.
- Corrected missing-secret cron authorization, arbitrary report decision input, cross-contest revokes, and malformed request handling.
- Demonstrated rollback when an audit insert fails; solve changes are not left unaudited.
- Added safe HTTP(S) proof URLs, bounded streamed JSON requests, origin checks, verified Google email enforcement, and database-backed role checks.
- Corrected Next/Auth typing and lint integration issues without disabling checks.
- Added automatic page refresh around contest start and batch release, plus error/empty/setup states and readable student error messages.

## Remaining launch requirements

1. Public Google sign-in and Google OAuth publication are complete. Manage the explicit admin email list as additional administrators are appointed.
2. Public deployment and its Google callback are verified. Repeat those checks whenever changing the deployment hostname or credentials.
3. Monitor submit-endpoint latency, LeetCode lookup failures, and free-plan usage. No scheduler setup is required.
4. Run the authenticated preview load tool and volunteer dry run described in `docs/runbook.md`, including real student LeetCode linking and contest participation.
5. Resolve owner choices for retention and license. No automatic pruning or license assumption was introduced.

The LeetCode endpoint is unofficial and capped at 20 entries. With on-submit archiving, submissions that disappear before any lookup saves them need an evidence-backed admin grant. Normal request and database usage still count toward hosting quotas. No production performance claim is made from the in-memory simulation.

## Working-tree notes

- The working tree was clean at session start; it contained documentation and no app.
- Existing spec/plan/handoff instructions were preserved. The README and `.gitignore` were updated; the app/tooling/report files are new.
- The initial implementation contained no credentials. The subsequent authorized setup created private `.env.local`; it is ignored, has permissions `0600`, and is not staged or committed. No secret values are in these documents.
- The owner subsequently authorized committing and pushing the implementation in 10–20 focused groups. The 18 groups cover tooling, rules, database, LeetCode, authentication, validation/audit, ownership, scheduling, snapshots, submissions, leaderboard, moderation, admin reads, shared UI, student UI, admin/results UI, checks/CI, and documentation. No public deployment or pull request is part of this publication.
- The authorized environment setup created dedicated Google/Neon resources, applied the app migration to the new database, and created the owner user through real Google login. Existing applications' resources were not modified.
- `node_modules/`, `.next/`, TypeScript build info, and browser artifacts are ignored. Browser screenshots/traces are local artifacts under `test-results/`.
