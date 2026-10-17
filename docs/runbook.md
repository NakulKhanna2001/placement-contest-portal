# Setup and contest-day runbook

The current workspace already has working Neon and Google OAuth settings. See [Connected environment](environment-setup.md) for resources and real-service verification. The owner subsequently approved public Google sign-in, with students as the default role and explicit email-based admin access.

## Initial setup

1. Use Node 24 (`nvm use`) and install with `npm ci`.
2. Provision a Postgres database. Put its connection URL and the authentication settings listed in the README in `.env.local` for local development, or the deployment's secret environment settings.
3. Run `npm run db:migrate` against the intended database. The migrations are also exercised on a clean PGlite database by the test suite. Back up an existing database before applying migrations to it.
4. Configure a Google OAuth **Web application** client with redirect URI `http://localhost:3000/api/auth/callback/google` locally and `https://YOUR_HOST/api/auth/callback/google` in the deployment. Set `ALLOW_ALL_GOOGLE_ACCOUNTS=true` for public sign-in. With that flag disabled, `ALLOWED_EMAIL_DOMAIN` and `ALLOWED_EMAILS` provide restricted access. Google must return `email_verified: true`. Complete Google Branding with the app home page, `/privacy`, and `/terms`, then publish the External OAuth app for public access.
5. Add administrator email addresses to `ADMIN_EMAILS` (comma separated; they must also satisfy the current sign-in policy). On Google sign-in, the matching user is created/upserted and the role is synchronized with this list. Changes to this list take effect when that user signs in again. Existing sessions read roles from the database on each request.
6. Generate a high-entropy `AUTH_SECRET` (for example, `openssl rand -base64 32`). Keep its value out of Git. No cron secret is needed.
7. Run `npm run dev`, sign in, and verify a LeetCode account in `/account` using the code in **ReadMe** under LeetCode profile settings. Username, campus, and year of study are mandatory in the confirmation request. The account becomes permanently linked. Contest pages, standings, submissions, and reports require a verified profile. Students can finish verification during a live contest and participate immediately, within the original problem windows and submission deadline.

No real credentials are needed for `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, or the public browser smoke tests.

### Adding two or three administrators later

In Vercel → project **Settings → Environment Variables**, edit `ADMIN_EMAILS` to contain the owner's address and the additional exact Google email addresses, separated by commas. Redeploy, then have those users sign out and sign in again. Public registration does not itself grant admin privileges. Removing an address demotes it on its next sign-in; for immediate revocation of an active admin, update the existing database role as well through a controlled administrative operation.

If `ADMIN_EMAILS` is a write-only secret, preserve it and use `ADDITIONAL_ADMIN_EMAILS` for new addresses. Both lists are combined on Google sign-in; a new account receives its admin role on its first verified Google login. Removal requires checking both lists. Admins can preview all problems without linking LeetCode, including drafts through **Admin → contest → View all contest problems**. The preview exception applies only to read access; submitting solves still requires verification and the normal scoring windows.

## Deployment

- Import this Next.js application into Vercel, supply the environment settings, and apply migrations from a trusted environment. Do not run migrations on every request.
- `vercel.json` defines **no cron jobs**. The previous `/api/cron/snapshot` endpoint and snapshot worker have been removed, making the app compatible with Vercel Hobby's cron limits.
- Accepted submissions are archived only when a user submits a link. Keep compute in `iad1`, near the existing Neon database. `.vercelignore` excludes local secrets and generated artifacts from CLI uploads.
- Verify that the deployment can reach both Postgres and `https://leetcode.com/graphql`. Production uses a small connection pool and disables prepared statements for compatibility with transaction poolers.
- Run the authenticated preview load check below before the first public contest. Production OAuth and database connectivity need real-environment checks; local tests cannot validate provider settings.
- Apply migration `0002_noisy_sunset_bain.sql` before deploying campus/year collection. It adds nullable `users.campus` and `users.study_year` with database checks for the four campuses and years 1–4. Existing accounts retain their verified usernames/timestamps and scores; do not invent campus/year values for them. A persistent reminder directs already-verified members to Account to complete their details.

## Before each contest

1. Run `npm run leetcode:smoke -- REAL_USERNAME`. Expect at most 20 records with numeric IDs, slugs, valid dates, and an available profile. This makes two public API requests.
2. In `/admin`, schedule three batches by default. Each batch requires **2 Easy, 1 Medium, 1 Hard**, with unique problem slugs across the contest. Prefer less familiar problems. Enter and read all times in **India Standard Time (IST)**, regardless of browser timezone. The application converts inputs to absolute timestamps for storage and scoring.
3. Confirm the start, end, link deadline, and per-contest bonus/grace settings. Scheduling rejects overlap with another published contest **including its grace period**.
4. Save as a draft while preparing; publish before the start. Draft problems are never exposed by student endpoints.
5. Encourage students to verify early, but allow verification during the live contest. Remind them to paste links promptly even though linking stays open through grace.

## Editing an existing contest

In `/admin`, expand the contest under **Scheduled & draft contests**, then choose **Edit contest**. The form is pre-filled with its title, IST start time, status, scoring settings, batch count, and problems. Change the fields and select **Save changes**, or use **Cancel editing** to discard local edits.

- Drafts can be edited even if their old start time has passed, but a future start is required when saving.
- Published/scheduled contests can be edited only before their original start. Live, grace-period, and finished contests are locked; changing the requested start does not bypass that rule.
- A future scheduled contest can be returned to draft using the Status field.
- Edits keep the contest ID and retain problem IDs for existing difficulty slots. Batch unlock/close times and contest end are recalculated.
- Overlaps (including grace), duplicate slugs, invalid batch mixes, and edits to contests with solve records are rejected.
- If another admin/tab changed or published the contest since the editor opened, the save is rejected. Refresh and reopen rather than overwriting newer changes.
- Every successful edit writes an `update_contest` audit record containing the prior configuration and the new configuration, in the same transaction as the changes.

The `0001` migration adds a `revision` counter to existing contests with a default of zero. Apply `npm run db:migrate` before deploying this editing feature to an existing database.

## During the contest

- The leaderboard fetches its small API response about every 12 seconds while the page is visible. It does not refresh the entire page. Successful submissions trigger a prompt board update.
- Campus and year filters work independently or together on live and completed standings. They filter the full cached board locally and assign ranks within the selected group, retaining exact ties and showing overall rank for context. Existing profiles without campus/year stay in overall standings; they are not assigned to a cohort. Profile corrections on Account are reflected after the next cache/poll refresh. Both live and historical filters use **current** profile details, not a contest-time snapshot.
- Problem-page refreshes occur at the next server-calculated batch/end/grace boundary, with at most once-a-minute background reconciliation. Hidden tabs pause work and refresh when visible again. Client time never authorizes unlocks or scores.
- Verifying all four valid solves in a batch immediately reveals the next batch for that student after the submission refresh. This can chain through Batch 3. Others retain scheduled access. The server derives access from existing solves, so deployment needs no migration or rescore and students who already completed a batch qualify immediately.
- A batch’s earliest eligible time is its scheduled opening or, for early access, the last required acceptance in the preceding completed batch, whichever is earlier (never before contest start). All four prerequisite solves must be verified and valid. **All problems share an inclusive acceptance deadline of scheduled contest end + 60 seconds.** The old hourly closing times no longer restrict scoring. The default bonus ends at scheduled opening + 15:00, inclusive, even when a student starts early. Later eligible acceptances get base points. LeetCode's timestamp is authoritative.
- The checker verifies the pasted ID belongs to that student's archive/live accepted list. It counts the earliest known valid acceptance for that problem, even if the later link arrived first. A revoked solve cannot be restored by resubmitting.
- Links remain valid through the inclusive `contest end + max(grace, 60 seconds)` deadline. A late **link** is fine; an acceptance after the contest-wide solve deadline is not. Scheduling prevents overlaps through this effective link deadline. Previously rejected batch-window links may be resubmitted; deployment does not automatically award or rescore any records.
- On a live lookup, the checker saves the student's whole recent accepted list, so another submitted ID from that list can be verified from the archive without another LeetCode call. Other students are not fetched automatically.
- Remind students to submit promptly: LeetCode exposes only the latest 20 acceptances. A record lost before any on-submit archive captured it requires evidence-backed admin review. Monitor `check_log` outcomes and request failures; there is no scheduled worker to monitor.
- If LeetCode fails, students see a retryable error. Use manual grants with proof for confirmed exceptions. Do not ask students for LeetCode cookies or source code.

## Grants, revokes, and rescoring

- `/admin` supports individual/bulk grants: select students, problem, accepted-at time, reason, and an HTTP(S) evidence URL. The same acceptance-window and bonus rules apply.
- A grant can restore a revoked solve. A valid existing solve is not silently overwritten by a grant; revoke it with a reason first if a correction is needed.
- Revoke from the solve selector with a reason. The original solve remains stored.
- Rescore recalculates valid solves using the recorded acceptance times and contest configuration; revoked solves remain revoked.
- Mutations and audit records commit in one transaction. The audit view shows the latest 100 actions; the complete history remains in `audit_log`. Before-state details are retained for grants, revokes, rescoring, and report-based revokes.

## After the contest

- `/results` lists completed published contests. Detailed results and reports require Google sign-in.
- Completed results include all contest problems for practice even when the leaderboard is empty. New acceptances after a batch closes cannot earn points. When a contest is still running, use **Open contest** to return to the live problem page.
- All displayed contest times and tooltips use IST immediately, including server rendering. Scheduling and manual-grant input values also mean IST. Server timestamps still control release and scoring.
- Results are provisional through grace. After the link deadline, student submissions close, while audited administrator corrections remain possible.
- Students can inspect each participant's solve times and manual/revoked status. Disqualified users are excluded from rankings; their solve records remain visible with a disqualification label. Source code is never stored or displayed.
- Reports require an evidence URL and description. One report per reporter/target/contest is allowed. Admins can dismiss, revoke a solve belonging to the reported participant and contest (and reported problem, when specified), or disqualify. A reviewed report cannot be decided a second time.

## Verification commands

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm audit --omit=dev
npx playwright install chromium
npm run test:browser
```

An installed Chrome can be used instead of downloading Chromium:

```bash
PLAYWRIGHT_CHANNEL=chrome npm run test:browser
```

The browser smoke suite uses port 3100 and deliberately clears database/authentication settings. It verifies public desktop/mobile pages, navigation, errors, and overflow. The database-backed suite runs a 50-student, three-batch simulation and validates server-side authorization, moderation, concurrency, and transaction rollback. Real Google login and the signed-in account/admin API checks have additionally been completed in the configured workspace; repeat them for a new deployment hostname.

The browser suite also checks delayed-navigation feedback, keyboard navigation, loading skeletons, reduced-motion behavior, and absence of external font requests. For navigation timings, use a production build: the development compiler does not represent normal prefetching or first-click performance. See [UI and navigation notes](ui-performance.md).

## Preview load check

On a preview deployment you control, sign in as a test student and obtain the session Cookie header from browser developer tools. Set `LOAD_BASE_URL`, `LOAD_SESSION_COOKIE`, and `LOAD_CONTEST_ID` privately in your shell. Do not store the cookie in source or paste it into shared logs.

```bash
# Defaults: 20 concurrent workers for 15 seconds.
npm run load:preview
```

Optional knobs: `LOAD_CONCURRENCY` (1–200), `LOAD_SECONDS` (1–300). The script makes only GET requests to the home page and leaderboard, prints response counts and p50/p95/p99 latency, and fails on non-200 statuses. Use a test contest actually accepting submissions to exercise its problem page. Run just before and after an unlock; inspect database and request latency. This is a smoke load tool, not evidence of a production capacity limit.

## Volunteer dry run before launch

Use ten students and a normal three-hour test contest with hourly releases and the common 3:01:00 solve deadline; automated tests use injected time to cover boundaries quickly.

1. Verify a new Google account can sign in as a student, an unverified email is rejected, and ordinary students cannot access admin APIs.
2. Verify ownership; confirm an account cannot be swapped or claimed by a second portal account.
3. Leave the page open across contest start and batch unlock. Confirm no future problem names/links are in the earlier HTML or student API responses.
4. Submit an accepted solve inside the window. Confirm its bonus and points, then watch leaderboard updates.
5. Submit a Batch 1 solve accepted during hour 2 or 3: it must earn base points. An acceptance at exactly 3:01:00 must count; 3:01:01 must fail. Paste an eligible archived link during link grace: it must still count.
6. Repeat during grace and after the deadline. Only the latter must fail.
7. Exercise an individual grant, bulk grant, revoke, re-grant, and rescore. Inspect audit details.
8. File reports; try dismiss, revoke, and disqualify. Verify standings update and records are preserved.
9. Confirm that submission-triggered lookups populate `seen_submissions`, that a second saved link verifies during an upstream outage, and that no cron jobs are configured.

## Outstanding owner decisions

- Choose log/archive retention before adding pruning. No automatic deletion is implemented.
- Choose a license before accepting outside contributions.
- Evidence is URL-only, as assumed by the approved plan; no file upload/storage service is configured.

Full `npm audit` currently reports transitive development-tool advisories in the ESLint globbing and Drizzle CLI dependencies; the production-only dependency audit passes. Upgrade upstream tooling when patched compatible versions become available rather than using the suggested breaking downgrades.
