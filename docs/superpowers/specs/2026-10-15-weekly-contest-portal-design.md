# Weekly Contest Portal: Design

Date: 2026-10-15
Status: Draft for review

## 1. Purpose

A portal for placement-prep: a weekly Saturday contest, open to every student, built on real LeetCode problems. Students are ranked on a live leaderboard. Cheating is policed by the community through reports with proof, reviewed by admins.

## 2. Decisions already made

| Area | Decision |
|---|---|
| Cadence | One contest per week (Saturday), open to everyone |
| Length | 3 hours; number of batches is configurable so 4 hours is a config change |
| Batches | 3 batches, unlocking at 0:00, 1:00, 2:00 |
| Batch content | 2 Easy + 1 Medium + 1 Hard, each with a 1-hour window |
| Points | Easy 2, Medium 5, Hard 12 (21 per batch, 63 maximum) |
| Verification | Poll each participant's public LeetCode accepted-submission list |
| Hacking | Community reports cheaters with proof; admins review. No automated cheat detection |

## 3. Scope

**In scope (v1)**
- Google login restricted to the college domain
- LeetCode username linking with ownership proof
- Contest, batch and problem scheduling (admin)
- Time-gated problem release
- Submission polling, validation and scoring
- Live leaderboard
- Post-contest results visibility
- Report flow and admin review (disqualify / dismiss)
- Admin manual rescoring and audit log

**Out of scope (v1)**
- Own code judge or test-case hacking
- Automated plagiarism detection
- Cumulative multi-week leaderboard (planned later)
- Time-decay or speed bonuses (planned later)

## 4. Scoring and ranking rules

1. A problem is **solved** if the student has an Accepted submission with timestamp `T` such that
   `batch.unlock_at <= T <= batch.unlock_at + 1 hour`.
2. A problem scores its base points once per student: the earliest valid accepted submission counts. Later ones are ignored.
3. Ranking: total points (desc), then number of Hard problems solved (desc), then time of the last counted solve (asc).
4. The timestamp always comes from LeetCode, never from our polling clock.
5. A solve is only recorded if its verification happens by `window_end + grace` (grace is 5 minutes, configurable). After that the window is closed for automatic scoring; admins can still add a solve manually.
6. Disqualified users are excluded from the leaderboard; their solves are kept in the data but flagged.

## 5. Architecture

- **Web app and API:** Next.js (App Router), hosted on Vercel.
- **Database:** Postgres.
- **Poller:** a scheduled background job that runs during contest hours. It iterates over verified participants, fetches each one's recent accepted submissions, validates them and writes solves.
- **Leaderboard:** computed from the `solves` table, cached for a few seconds, and short-polled by the client every 10–15 seconds.
- **Auth:** Google OAuth, accepting only the college email domain.

### Units and boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `auth` | Login, session, role (student/admin) | OAuth provider |
| `leetcode-client` | Fetch recent accepted submissions and profile bio for a username. Only unit that knows LeetCode's API shape | LeetCode public endpoint |
| `verification` | Link username to user and prove ownership via a token in the profile bio | `leetcode-client` |
| `contest` | Contests, batches, problems, unlock logic (`now` is a parameter, so it is testable) | database |
| `scoring` | Pure functions: given submissions and batches, produce solves and points | none |
| `poller` | Schedule polls, call `leetcode-client`, hand results to `scoring`, persist | the three above |
| `leaderboard` | Ranking and tie-breaks | `solves` table |
| `reports` | Create reports, admin review, disqualification, audit | database |
| `admin` | Contest management UI and manual overrides | all of the above |

`scoring` and the unlock logic are kept pure so they can be unit-tested without network or database.

## 6. Data model

- **users**: id, email, name, role, leetcode_username, leetcode_verified_at, verify_token, created_at
- **contests**: id, title, starts_at, ends_at, grace_seconds, status (draft/scheduled/live/ended)
- **batches**: id, contest_id, position, unlock_at, closes_at
- **problems**: id, batch_id, difficulty (easy/medium/hard), leetcode_slug, title, points
- **solves**: id, user_id, problem_id, accepted_at, verified_at, points, source (auto/manual), status (valid/revoked)
- **reports**: id, contest_id, reporter_id, target_user_id, problem_id (nullable), proof_url, description, status (pending/upheld/dismissed), reviewed_by, reviewed_at
- **disqualifications**: id, contest_id, user_id, report_id (nullable), reason, created_by
- **poll_log**: id, user_id, started_at, outcome, error (for debugging and rate monitoring)
- **audit_log**: id, actor_id, action, target, details, created_at

## 7. Key flows

### 7.1 Link LeetCode account
1. Student enters their LeetCode username.
2. Portal shows a token and asks them to put it in their LeetCode profile bio.
3. Student clicks verify; `verification` fetches the bio and checks for the token.
4. On success, the username is locked to this user. One LeetCode account maps to one portal account.

### 7.2 During the contest
1. At each `unlock_at`, that batch's problems become visible with links.
2. The poller runs every 60 seconds per verified participant (jittered, rate-limited).
3. New accepted submissions are matched to contest problems by slug and passed through `scoring`.
4. Valid solves are written; the leaderboard updates.
5. Students have a "Verify now" button with a cooldown to trigger an immediate poll.

### 7.3 After the contest
- The final leaderboard is frozen when the last grace period ends.
- Students can see, per participant, which problems were solved and when.
- Students can file a report with a proof URL and description.
- Admins review, then uphold (disqualify or revoke solves) or dismiss. The leaderboard recalculates; every action goes in `audit_log`.

## 8. Risks and failure handling

| Risk | Mitigation |
|---|---|
| LeetCode's endpoint is unofficial and may change, throttle or break | `leetcode-client` is isolated; poll failures are logged; admin can manually grant solves from proof; poll rate is conservative |
| Recent-accepted list is limited in length | Poll frequently; the contest has only 12 problems, so the limit should not be reached. Verify in a prototype before launch |
| Account sharing or someone else solving | Community reports with proof; bio-token ownership; one username per account |
| Traffic spikes at unlock times | Cached leaderboard, static problem pages after unlock, load test before launch |
| Clock issues | Server time is the only authority for unlocks; client shows a countdown only |
| Poller falls behind during a contest | Prioritize participants who clicked "Verify now"; alert admin; grace period absorbs short delays |
| Students already solved a problem earlier | Handled by the timestamp rule (must be accepted inside the window) |
| LeetCode submissions are private | We store only solve records (user, problem, time); no code is displayed. Proof for reports is a URL or screenshot supplied by the reporter |

## 9. Testing approach

- Unit tests for `scoring`: window edges (just before/after unlock and close), duplicate accepted submissions, earliest-wins, tie-breaks, disqualification.
- Unit tests for unlock logic with an injected `now`.
- Contract tests for `leetcode-client` against recorded responses, with a smoke test against the live endpoint.
- Integration test: simulated contest with fake participants and a fake `leetcode-client`.
- Load test of leaderboard and problem pages at unlock spikes.
- A dry-run contest with a small group before the first public one.

## 10. Build order

1. Foundation: project, database, auth, user profile
2. LeetCode client prototype and username verification (validates the biggest risk first)
3. Contest, batch and problem model; unlock logic; problem pages
4. Scoring and poller; leaderboard
5. Admin panel (scheduling, manual rescoring, audit log)
6. Post-contest views, reports and admin review
7. Hardening: load test, monitoring, dry-run contest

## 11. Open items

- Exact poll cadence and per-user rate limit, to be set after the prototype in step 2
- Whether report proof is stored by us (file upload) or only linked
- Retention period for poll logs
