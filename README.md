# NST LC Grind

**Live app:** [nst-lc-grind.vercel.app](https://nst-lc-grind.vercel.app)

A portal for running a **weekly Saturday coding contest** for college placement prep. Students solve real LeetCode problems, paste their submission links, and are ranked on a live leaderboard. Cheating is policed by the community through reports with proof, reviewed by admins.

The interface uses a persistent workspace, responsive navigation, and page-specific skeletons. See [UI and navigation notes](docs/ui-performance.md) for the design, performance changes, and measured results.

> **Status: v1 implemented and locally verified.**
> Deployed on **Vercel Hobby with no cron jobs**. Production Google sign-in and the database-backed admin session are verified. Accepted records are saved when a student submits a link. Owner-only Google access is retained for initial testing. See the [connected environment](docs/environment-setup.md), [Setup](#setup), and the [implementation report](HANDOFF.implementation-report.md).

## How a contest works

- **Open to everyone**, once a week (Saturday), **3 hours** long.
- **3 batches** unlock at 0:00, 1:00 and 2:00. Each batch has **2 Easy, 1 Medium and 1 Hard** problem and stays open for **1 hour**.
- **Points:** Easy 2, Medium 5, Hard 12. The Hard is worth more than the rest of its batch combined, so students are pushed to aim for it.
- **Early-solve multiplier:** a solve accepted within the first **15 minutes** of its batch earns **1.5×** (configurable per contest).
- **Ranking:** total points, then number of Hards solved, then earliest last solve.
- **Submitting:** the student pastes a LeetCode submission link. The portal reads only the submission ID from it, finds that ID in the student's public LeetCode accepted list, and uses LeetCode's own timestamp. Links can be submitted until 10 minutes after the contest ends, but the solve must have been accepted inside its own batch window.
- **Cheating:** after the contest, anyone can report a user with proof. Admins uphold (revoke solves or disqualify) or dismiss. There is no automated detection.
- **Admin grants:** if LeetCode is down or a student has proof, an admin can grant a solve manually. Every admin action is audited.

| Difficulty | Base | Early (≤ 15 min) |
|---|---|---|
| Easy | 2 | 3 |
| Medium | 5 | 7.5 |
| Hard | 12 | 18 |

Maximum score is 63 base, or 94.5 if every solve earns the bonus.

## Documentation

| Document | What it is |
|---|---|
| [`docs/superpowers/specs/2026-10-15-weekly-contest-portal-design.md`](docs/superpowers/specs/2026-10-15-weekly-contest-portal-design.md) | The design spec: decisions, scoring rules, architecture, data model, flows, risks |
| [`docs/superpowers/plans/2026-10-15-weekly-contest-portal.md`](docs/superpowers/plans/2026-10-15-weekly-contest-portal.md) | The implementation plan: 16 tasks, test-first, with code and commit steps |
| [`HANDOFF.md`](HANDOFF.md) | Original approved handoff: settled decisions and pitfalls; its pre-implementation status is historical |
| [`HANDOFF.implementation-report.md`](HANDOFF.implementation-report.md) | Current implementation status, verification evidence, deviations, and remaining launch work |
| [`docs/runbook.md`](docs/runbook.md) | Environment setup, deployment, contest operations, moderation, load check, and dry run |
| [`docs/environment-setup.md`](docs/environment-setup.md) | Connected Neon/Google resources, verified login, owner-only access, and deployment follow-up |

## Tech stack

- **Next.js 16 / React 19** (App Router, TypeScript), ready for **Vercel**
- **Postgres** with **Drizzle ORM** (in-memory **PGlite** for tests)
- **Auth.js** with verified Google login, an exact college-domain restriction, and optional explicit-email access; currently configured for the owner only
- **Vitest** for rules, integration, and route tests; **Playwright** for desktop/mobile browser smoke tests
- **Zod** for request and upstream response validation

## Architecture in one paragraph

Business rules are small pure modules (`link`, `scoring`, `ranking`) plus database-backed services (`contest`, `submission-checker`, `grants`, `reports`, `leaderboard`). `leetcode-client` isolates LeetCode's API shape. When a student submits a link, the checker searches their saved accepted records first. If absent, it fetches that student's latest 20 accepted submissions once, archives the list, and verifies the submitted ID. Later links can reuse those records. **There is no recurring scheduler or background polling of students.**

## Setup

Use **Node 24** (`nvm use` if you use nvm).

```bash
npm ci
npm run dev
```

Open **http://localhost:3000**. This workspace now has a private `.env.local` connected to Neon and Google OAuth. For a fresh checkout or another environment, supply these settings; without credentials the public landing page displays setup guidance:

| Variable | Value to supply |
|---|---|
| `DATABASE_URL` | Your Postgres connection URL |
| `AUTH_SECRET` | A securely generated random secret |
| `AUTH_URL` | Canonical app URL; `http://localhost:3000` locally, the HTTPS app URL when self-hosted publicly |
| `AUTH_GOOGLE_ID` | Google OAuth web-client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth web-client secret |
| `ALLOWED_EMAIL_DOMAIN` | Your exact college domain, e.g. `college.edu`; empty for owner-only access |
| `ALLOWED_EMAILS` | Optional comma-separated exact email allowlist; currently just the owner |
| `ADMIN_EMAILS` | Comma-separated administrator emails that also satisfy the access policy |

Generate secrets with `openssl rand -base64 32`. No `.env*` files belong in Git.

Configure Google's callback URL as `http://localhost:3000/api/auth/callback/google` locally, and `https://YOUR_HOST/api/auth/callback/google` for deployment. Then apply the migration and restart the app:

```bash
npm run db:migrate
npm run dev
```

1. Sign in with an allowed Google account. This workspace currently admits only the owner.
2. Visit `/account`, put the verification code in your LeetCode bio, and confirm ownership **before the contest starts**.
3. As an administrator, visit `/admin` to schedule or draft a contest, manage grants, review reports, and inspect the audit trail.
4. Students use `/` during a contest and `/results` afterward.

**Editing:** In `/admin`, expand an existing contest, select **Edit contest**, make changes, and select **Save changes**. Drafts and future scheduled contests are editable; started contests are locked. The editor displays the start time in your local timezone and records changes in the audit log.

`vercel.json` uses the Next.js preset and the `iad1` region near the Neon database. It defines **zero cron jobs** and works on Vercel Hobby. See the [runbook](docs/runbook.md) for deployment details.

### Fast local preview

For normal use, run the optimized build instead of the development compiler:

```bash
npm run build
npm run start -- --hostname localhost
```

The current workspace is already serving this optimized build at **http://localhost:3000**. Use `npm run dev` when editing source; stop the existing server before switching modes. Production mode also enables Next.js route prefetching.

## Verification

```bash
npm test                    # rules, access policy, and a 50-student contest simulation
npm run typecheck
npm run lint
npm run build
npm audit --omit=dev
npx playwright install chromium
npm run test:browser         # build first; public desktop/mobile tests on port 3100
npm run leetcode:smoke -- lee215
```

If Chrome is already installed, use `PLAYWRIGHT_CHANNEL=chrome npm run test:browser` instead of downloading Chromium. Tests use an in-memory database and fake LeetCode clients; the smoke script alone calls the live LeetCode endpoint.

GitHub Actions runs the automated checks in `.github/workflows/ci.yml`. For an authenticated preview load check, configure the variables described in the runbook and run `npm run load:preview`.

## Implementation layout

- `src/lib/`: pure scoring, parsing, ranking, defaults, and validation
- `src/db/`, `drizzle/`: Postgres schema, migrations, production/test database adapters
- `src/leetcode/`: timeout-bounded LeetCode adapter
- `src/services/`: account linking, contests, submission-triggered archiving/verification, leaderboard, grants, reports, and audit
- `src/app/`: responsive student/admin pages and authenticated API routes
- `tests/`: rule, database, service, route, simulation, and browser tests

For further development, read the [implementation report](HANDOFF.implementation-report.md) first, then the original handoff's settled decisions and the design spec. The original plan's unchecked boxes are historical; do not re-scaffold the project.

## Known risks

- **LeetCode's GraphQL endpoint is unofficial.** It may change or throttle. It is isolated in one module, and admin grants are the fallback. Run `npm run leetcode:smoke -- USERNAME` before each contest.
- **The recent-accepted list is capped at 20.** Submit links promptly. Without periodic snapshots, an acceptance that has already scrolled off the public list and was never saved cannot be verified automatically; an admin grant with evidence is the fallback. The link deadline and acceptance-window rules are unchanged.
- **Run the preview load check and volunteer dry run before opening student access.** Normal HTTP/function/database usage still counts toward the hosting plan's limits.
- **Google access is initially owner-only.** Supply the college domain and adjust the Google audience before opening it to students.

## Contributing

- Keep changes small and test-first; use the implementation report as the current-state reference.
- Do not change a decision listed in `HANDOFF.md` without discussing it first. The spec explains the reasoning behind each.
- Never commit secrets. `.env*` files are git-ignored.
- Open an issue or pull request for anything that changes scoring rules, since those affect fairness.

## License

No license has been chosen yet. Until one is added, the default is all rights reserved. Add a `LICENSE` file before accepting outside contributions.
