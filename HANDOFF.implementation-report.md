# NST LC Grind — implementation report

Date: 2026-10-15

## Contract and status

- Handoff: [`HANDOFF.md`](HANDOFF.md)
- Implementation plan: [`docs/superpowers/plans/2026-10-15-weekly-contest-portal.md`](docs/superpowers/plans/2026-10-15-weekly-contest-portal.md)
- Source of truth: [`docs/superpowers/specs/2026-10-15-weekly-contest-portal-design.md`](docs/superpowers/specs/2026-10-15-weekly-contest-portal-design.md)
- **Status:** v1 implemented with the NST LC Grind interface and navigation update; managed Postgres and real Google OAuth are configured and verified locally. **43 automated tests and 8 browser checks pass.** Public deployment, hosted scheduler verification, preview load, and volunteer dry-run checks remain.

The original handoff and plan have been preserved as approved historical documents. Their “no application code” state and unchecked tasks no longer describe the current repository. Begin future work by inspecting this report and the actual code, rather than re-running the scaffold steps.

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
- Protected five-minute snapshot cron, four bounded upstream workers, atomic per-user scheduling claims, failure isolation, and a grace-period final capture.
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
| Contest services | `src/services/contest.ts`, `snapshotter.ts`, `submission-checker.ts`, `leaderboard.ts`, `cached-board.ts` |
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
9. **Snapshots continue through grace**, so final-minute acceptances have a final archive opportunity. Per-user claims include a small deterministic timing offset; four workers limit request fan-out. The five-minute cron remains the cadence.
10. **Reports are constrained to actual solve records** in the reported contest, and a problem-specific report cannot revoke another problem. Both target and contest are checked again during moderation.
11. **UI goes beyond minimal plan placeholders:** structured scheduling, working grant/revoke/rescore/report controls, audit viewer, results index, responsive styling, and explicit network/error states.
12. **No `.env.example` is created.** The repository instructions prohibit committing `.env*` files; the README documents every variable instead. Secrets are supplied privately by the operator.
13. **Plan dry-run errors corrected in the runbook:** settled one-hour windows are preserved, late links to timely acceptances are valid, and the simulation uses numeric submission IDs (the plan's `i-1` IDs would fail its own parser).

No settled point values, acceptance boundaries, bonus defaults, ranking order, linking model, or v1 non-goals were changed.

The subsequent exact-email access exception is an explicit owner-approved setup decision, documented above and covered by tests; it does not open the Gmail domain to other users.

## Verification evidence

| Command/check | Result |
|---|---|
| `npm test` | **PASS: 43 tests in 12 files.** Includes clean migrations, ownership, validation, owner-only allowlist, race cases, rollback, authorization, moderation, 50 students across all three batches, cached dates, admin overview reads, and skeleton semantics. |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS**, production Next.js build with all application/API routes |
| `npm run db:generate` | **PASS**, no schema drift after initial migration generation |
| `npm audit --omit=dev` | **PASS**, zero production dependency vulnerabilities reported |
| `npm run leetcode:smoke -- lee215` | **PASS**, real endpoint returned 20 accepted records with numeric IDs/slugs/dates and an available profile |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:browser` | **PASS: 8 browser checks**, desktop/mobile navigation, delayed-request feedback, keyboard access, reduced motion, skeletons, setup/error states, no external font requests, and no horizontal overflow. Screenshots were inspected. |
| Default Playwright browser download | Initially **BLOCKED** by CDN timeout/DNS failure; browser execution succeeded using installed Chrome instead |
| `git diff --check` | **PASS** |
| Full `npm audit` | **9 development-only transitive advisories** in ESLint globbing and Drizzle CLI dependencies; compatible upstream remediation still pending. Breaking forced downgrades were not applied. |
| Managed Postgres `npm run db:migrate` | **PASS** on the new dedicated Neon database; independent SQL inspection confirmed ten tables and one applied migration. |
| Real Google OAuth callback and signed-in browser walkthrough | **PASS** at `localhost:3000`: Google account selection/consent, callback, persisted admin user, account/admin pages, authenticated session/admin API, and anonymous denial. Repeat on the eventual public hostname. |
| Hosted cron, preview load, volunteer dry run | **NOT RUN**: needs a deployed environment and participants; procedure and load utility are supplied. |
| GitHub Actions execution | Workflow authored; **NOT RUN remotely** in this session |

### Acceptance-criteria traceability

| Requirement / plan tasks | Implementation | Evidence |
|---|---|---|
| Defaults, links, scoring, ranking (1–4) | `src/lib/{config,link,scoring,ranking}.ts` | `tests/lib/rules.test.ts`: exact edges, invalid dates/links, bonus, ties, DQ |
| Database and uniqueness (5) | `src/db/*`, `drizzle/*` | Clean migration in every integration fixture; `tests/db/schema.test.ts` checks duplicate solves and atomic audit rollback |
| LeetCode contract (6) | `src/leetcode/client.ts` | Response mapping/failure tests in `tests/integrations.test.ts`; live smoke passed |
| Domain/owner-restricted auth (7) | `src/auth.ts`, `src/lib/auth-rules.ts`, Auth.js route | Domain/allowlist tests, route auth guards, and successful real owner Google sign-in |
| Ownership (8) | `src/services/verification.ts`, `/account`, `/api/link` | Token, duplicate username/case, no token, immutable link tests |
| Time-gated scheduling (9) | `src/services/contest.ts`, student/admin pages | Before/exact unlock, draft privacy, batch validation, overlaps, inclusive grace tests |
| Snapshots (10) | `src/services/snapshotter.ts`, cron route/schedule | Idempotence, error isolation, idle time, 50-user capture; missing/wrong cron-secret tests |
| Submission verification (11) | `src/services/submission-checker.ts`, `/api/submit` | Archive-only grace, wrong ID/problem/window, future timestamp, upstream failure, earliest-wins, concurrency tests |
| Live rankings (12) | leaderboard services/API, `live-board.tsx` | Correct filtering/names/ranks; 5-second cache and 12-second client polling inspected |
| Manual/bulk grants, revoke, rescore/audit (13) | grants service/admin endpoint/forms | Grants, outside-window rejection, authorization, duplicate, re-grant, score repair, audit/rollback tests |
| Reports and review (14) | reports service/endpoints/forms | Timing/proof/duplicate checks; cross-contest prevention; revoke/DQ/dismiss; already-reviewed rejection; in-flight DQ race |
| Admin scheduling/results (15) | `/admin`, `/results`, `/results/[contestId]` | Publish/audit tests, gated queries, typecheck/build; authenticated admin page/forms/API verified against real services |
| Hardening/dry run (16) | tests, CI, `docs/runbook.md`, load script | 43 local tests and 8 browser checks pass; public-launch steps documented |

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

1. Supply the college domain and adjust the Google audience/publishing settings when opening student access; current access is intentionally owner-only.
2. Deploy publicly, supply private environment settings there, and register/verify the deployment's HTTPS Google callback. Local real login and managed Postgres are already verified.
3. Configure the five-minute hosted snapshot scheduler and inspect completion/failure counts at expected scale.
4. Run the authenticated preview load tool and volunteer dry run described in `docs/runbook.md`, including real student LeetCode linking and contest participation.
5. Resolve owner choices for retention and license. No automatic pruning or license assumption was introduced.

The LeetCode endpoint is unofficial and capped at 20 entries; submissions lost between snapshots still need an evidence-backed admin grant. The single cron's four workers need capacity validation for large cohorts. No production performance claim is made from the in-memory simulation.

## Working-tree notes

- The working tree was clean at session start; it contained documentation and no app.
- Existing spec/plan/handoff instructions were preserved. The README and `.gitignore` were updated; the app/tooling/report files are new.
- The initial implementation contained no credentials. The subsequent authorized setup created private `.env.local`; it is ignored, has permissions `0600`, and is not staged or committed. No secret values are in these documents.
- The owner subsequently authorized committing and pushing the implementation in 10–20 focused groups. The 18 groups cover tooling, rules, database, LeetCode, authentication, validation/audit, ownership, scheduling, snapshots, submissions, leaderboard, moderation, admin reads, shared UI, student UI, admin/results UI, checks/CI, and documentation. No public deployment or pull request is part of this publication.
- The authorized environment setup created dedicated Google/Neon resources, applied the app migration to the new database, and created the owner user through real Google login. Existing applications' resources were not modified.
- `node_modules/`, `.next/`, TypeScript build info, and browser artifacts are ignored. Browser screenshots/traces are local artifacts under `test-results/`.
