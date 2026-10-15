# Weekly Contest Portal: Design

Date: 2026-10-15
Status: Draft for review (rev 3: snapshot archive, link deadline at contest end; rev 2: on-submit verification, early-solve multiplier, admin grants)

## 1. Purpose

A portal for placement-prep: a weekly Saturday contest, open to every student, built on real LeetCode problems. Students are ranked on a live leaderboard. Cheating is policed by the community through reports with proof, reviewed by admins.

## 2. Decisions already made

| Area | Decision |
|---|---|
| Cadence | One contest per week (Saturday), open to everyone |
| Length | 3 hours; number of batches is configurable so 4 hours is a config change |
| Batches | 3 batches, unlocking at 0:00, 1:00, 2:00 |
| Batch content | 2 Easy + 1 Medium + 1 Hard, each with a 1-hour window |
| Points | Easy 2, Medium 5, Hard 12 (21 per batch, 63 base maximum) |
| Multiplier | 1.5x if the submission was accepted within 15 minutes of the batch unlock (configurable) |
| Verification | Student submits a submission link; we match its ID against their public LeetCode accepted list and use LeetCode's timestamp. No "Verify now" button. A quiet background snapshot (every ~5 minutes) archives each participant's recent accepted IDs so late links still verify |
| Hacking | Community reports cheaters with proof; admins review. No automated detection |
| Admin grants | Admins can grant a solve manually when LeetCode fails or a student has proof |

## 3. Scope

**In scope (v1)**
- Google login restricted to the college domain
- LeetCode username linking with ownership proof
- Contest, batch and problem scheduling (admin)
- Time-gated problem release
- Submission-link checking on submit, scoring and the early-solve multiplier
- Live leaderboard
- Post-contest results visibility
- Report flow and admin review (disqualify / dismiss)
- Admin manual solve grants, manual rescoring and audit log

**Out of scope (v1)**
- Own code judge or test-case hacking
- Automated plagiarism detection
- Cumulative multi-week leaderboard (planned later)
- Multi-tier time decay (a single early-solve multiplier is included)

## 4. Scoring and ranking rules

1. A problem is **solved** if the student has an Accepted submission with LeetCode timestamp `T` such that
   `batch.unlock_at <= T <= batch.unlock_at + 1 hour`.
2. Points for a solve = `base points x multiplier`, where the multiplier is 1.5 if `T - unlock_at <= 15 minutes`, otherwise 1.0. Points are stored with one decimal.
3. A problem scores once per student: the earliest valid accepted submission counts. Later ones are ignored.
4. Ranking: total points (desc), then Hard problems solved (desc), then time of the last counted solve (asc).
5. The timestamp always comes from LeetCode, never from our own clock.
6. A link can be submitted any time until `contest_end + grace` (grace is 10 minutes, configurable). The solve itself must still fall inside its own problem's window, so linking late costs nothing. After the deadline only an admin can add the solve.
7. Disqualified users are excluded from the leaderboard; their solves are kept in the data but flagged.

Base maximum is 63. With every solve inside the multiplier window it would be 94.5.

## 5. Architecture

- **Web app and API:** Next.js (App Router), hosted on Vercel.
- **Database:** Postgres.
- **Verification:** the submission ID is looked up in `seen_submissions` first, then fetched live if absent. LeetCode returns at most 20 recent accepted entries (confirmed 15 Oct 2026), so a snapshot job archives each linked participant's list every ~5 minutes (jittered) during the contest. Students never see it.
- **Leaderboard:** computed from the `solves` table, cached for a few seconds, and short-polled by the client every 10-15 seconds.
- **Auth:** Google OAuth, accepting only the college email domain.

### Units and boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `auth` | Login, session, role (student/admin) | OAuth provider |
| `leetcode-client` | Fetch recent accepted submissions (ID, slug, timestamp) and profile bio for a username. Only unit that knows LeetCode's API shape | LeetCode public endpoint |
| `verification` | Link username to user and prove ownership via a token in the profile bio | `leetcode-client` |
| `contest` | Contests, batches, problems, unlock logic (`now` is a parameter, so it is testable) | database |
| `scoring` | Pure functions: submission, batch and config in, solve with points and multiplier out | none |
| `snapshotter` | During a live contest, every ~5 minutes fetch each linked participant's recent accepted list and store new entries in `seen_submissions` | `leetcode-client`, database |
| `submission-checker` | Parse a submitted link, look the ID up in `seen_submissions` (then live), hand the result to `scoring`, persist | the units above |
| `leaderboard` | Ranking and tie-breaks | `solves` table |
| `reports` | Create reports, admin review, disqualification, audit | database |
| `admin` | Contest management UI, manual grants and overrides | all of the above |

`scoring` and the unlock logic are kept pure so they can be unit-tested without network or database.

## 6. Data model

- **users**: id, email, name, role, leetcode_username, leetcode_verified_at, verify_token, created_at
- **contests**: id, title, starts_at, ends_at, grace_seconds, bonus_window_seconds, bonus_multiplier, status (draft/scheduled/live/ended)
- **batches**: id, contest_id, position, unlock_at, closes_at
- **problems**: id, batch_id, difficulty (easy/medium/hard), leetcode_slug, title, points
- **solves**: id, user_id, problem_id, submission_id, accepted_at, verified_at, multiplier, points, source (auto/manual), granted_by, evidence, status (valid/revoked)
- **reports**: id, contest_id, reporter_id, target_user_id, problem_id (nullable), proof_url, description, status (pending/upheld/dismissed), reviewed_by, reviewed_at
- **disqualifications**: id, contest_id, user_id, report_id (nullable), reason, created_by
- **seen_submissions**: id, user_id, submission_id, leetcode_slug, accepted_at, first_seen_at
- **check_log**: id, user_id, submitted_link, outcome, error, created_at
- **audit_log**: id, actor_id, action, target, details, created_at

## 7. Key flows

### 7.1 Link LeetCode account
1. Student enters their LeetCode username.
2. Portal shows a token and asks them to put it in their LeetCode profile bio.
3. Student clicks verify; `verification` fetches the bio and checks for the token.
4. On success, the username is locked to this user. One LeetCode account maps to one portal account.

### 7.2 Submitting a solve
1. At each `unlock_at`, that batch's problems become visible with links.
2. The student solves a problem on LeetCode and pastes the submission link into the portal.
3. The portal extracts the submission ID from the URL (it never fetches the link) and looks it up in the archived `seen_submissions`, then in a live fetch of the student's recent accepted list if it is absent.
4. If the ID is found, the portal checks that the problem belongs to an open batch, that LeetCode's timestamp is inside the window and that the problem is not already solved.
5. The solve is saved with its multiplier and points, and the leaderboard updates. The student sees the result immediately.
6. If the ID is not found (not accepted, not their account, or scrolled off the list), the student sees a clear message and may retry after a short cooldown.

### 7.3 After the contest
- The final leaderboard is frozen when the last grace period ends.
- Students can see, per participant, which problems were solved and when. Source code is never shown because LeetCode keeps it private.
- Students can file a report with a proof URL and description.
- Admins review, then uphold (disqualify or revoke solves) or dismiss. The leaderboard recalculates and every action goes into `audit_log`.

### 7.4 Admin grants a solve
1. Admin picks the student, problem, accepted-at time, reason and evidence (screenshot or URL).
2. The accepted-at time must fall inside the problem's window; the multiplier is computed from it like any other solve.
3. The solve is saved with `source = manual`, the admin's id and the evidence. It counts on the leaderboard the same as an automatic solve.
4. A grant can be revoked, which sets the solve to `revoked` and is logged. Manual grants can be reported like any other solve.
5. For a LeetCode outage, a bulk mode lets an admin grant solves for a list of students at once.

## 8. Risks and failure handling

| Risk | Mitigation |
|---|---|
| LeetCode's endpoint is unofficial and may change, throttle or break | `leetcode-client` is isolated; failures are logged; admins can grant solves manually from proof; requests are one per submission, so load is low |
| LeetCode returns only the last 20 accepted entries | The snapshot job archives IDs every ~5 minutes, so an ID is lost only after more than 20 accepted submissions in that gap. Students must link their account before the contest starts. Admin grants cover anything else |
| A student submits someone else's link | The ID must appear in the submitting student's own linked-account list, so another account's ID will not match |
| Account sharing or someone else solving | Community reports with proof; bio-token ownership; one username per account |
| Traffic spikes at unlock | Cached leaderboard, static problem pages, load test before launch |
| Clock issues | Server time decides unlocks; LeetCode's timestamp decides solves; client countdown is display only |
| Students already solved a problem earlier | Handled by the window rule |
| LeetCode submissions are private | We store only solve records (user, problem, time, ID); no code is displayed. Proof for reports is a URL or screenshot supplied by the reporter |

## 9. Testing approach

- Unit tests for `scoring`: window edges, multiplier boundary (exactly 15 minutes), duplicates, earliest-wins, tie-breaks, disqualification.
- Unit tests for unlock logic with an injected `now`.
- Unit tests for link parsing (the URL forms LeetCode uses).
- Contract tests for `leetcode-client` against recorded responses, with a smoke test against the live endpoint.
- Integration test: simulated contest with fake participants and a fake `leetcode-client`.
- Load test of leaderboard and problem pages at unlock spikes.
- A dry-run contest with a small group before the first public one.

## 10. Build order

1. Foundation: project, database, auth, user profile
2. LeetCode client prototype and username verification (validates the biggest risk first, including whether the recent list exposes submission IDs)
3. Contest, batch and problem model; unlock logic; problem pages
4. Snapshot job, link submission, scoring with multiplier, and leaderboard
5. Admin panel: scheduling, manual grants, rescoring, audit log
6. Post-contest views, reports and admin review
7. Hardening: load test, monitoring, dry-run contest

## 11. Open items

- Snapshot interval and per-user rate limit (default ~5 minutes). Confirmed 15 Oct 2026: the public list exposes `id`, `titleSlug`, `timestamp` and returns 20 entries; recheck in the prototype that this holds
- Final multiplier window and value (defaults: 15 minutes, 1.5x)
- Per-student cooldown between link attempts
- Whether report proof is stored by us (file upload) or only linked
- Retention period for `check_log`
