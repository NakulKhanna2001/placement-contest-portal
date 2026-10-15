# Placement Contest Portal

A portal for running a **weekly Saturday coding contest** for college placement prep. Students solve real LeetCode problems, paste their submission links, and are ranked on a live leaderboard. Cheating is policed by the community through reports with proof, reviewed by admins.

> **Status: design and plan complete, no application code yet.**
> The spec and a 16-task implementation plan are written and reviewed. Implementation starts at Task 1 of the plan. See [Where to start](#where-to-start).

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
| [`HANDOFF.md`](HANDOFF.md) | Handoff notes for the next person or AI agent: state, decisions, pitfalls, next step |

## Tech stack (planned)

- **Next.js** (App Router, TypeScript), deployed on **Vercel**
- **Postgres** with **Drizzle ORM** (in-memory **PGlite** for tests)
- **Auth.js** with Google login restricted to the college email domain
- **Vitest** for tests

## Architecture in one paragraph

Business rules are small pure modules (`link`, `scoring`, `ranking`) plus database-backed services (`contest`, `snapshotter`, `submission-checker`, `grants`, `reports`, `leaderboard`). `leetcode-client` is the only module that knows LeetCode's API shape, so a change on their side touches one file. A background **snapshot** job saves each linked student's recent accepted submission IDs every ~5 minutes, because LeetCode only returns the last 20; a submitted link is checked against that archive first, then a live fetch.

## Where to start

1. Read the spec (10 minutes), then skim the plan.
2. Read [`HANDOFF.md`](HANDOFF.md) for decisions you should not change without asking and known pitfalls.
3. Start at **Task 1** of the plan and work in order. Each task is test-first and ends with a commit.

```bash
# once the app is scaffolded (Task 1)
npm install
npm test            # runs Vitest
cp .env.example .env.local   # then fill in the values
npm run dev
```

Environment variables (names only; never commit values):

```
DATABASE_URL, AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET,
ALLOWED_EMAIL_DOMAIN, ADMIN_EMAILS, CRON_SECRET
```

## Known risks

- **LeetCode's GraphQL endpoint is unofficial.** It may change or throttle. It is isolated in one module, and admin grants are the fallback. A live smoke script is in the plan (Task 6).
- **The recent-accepted list is capped at 20.** The snapshot archive exists for this reason. Students must link their account before the contest starts.
- **The load test at unlock spikes is manual** and needs a deployed preview.

## Contributing

- Follow the plan's task order and keep tasks small and test-first.
- Do not change a decision listed in `HANDOFF.md` without discussing it first. The spec explains the reasoning behind each.
- Never commit secrets. `.env*` files are git-ignored.
- Open an issue or pull request for anything that changes scoring rules, since those affect fairness.

## License

No license has been chosen yet. Until one is added, the default is all rights reserved. Add a `LICENSE` file before accepting outside contributions.
