# Problem visibility and demo verification

## Reported issue

On 2026-10-16, contest 1 had one batch and four stored problems. Its scheduled window was 09:30–10:30 UTC (15:00–16:00 IST), with links accepted until 16:10 IST. It had ended when the issue was reported, and no solves had been recorded.

The results page previously displayed only solve records. With zero solves, none of the problem links appeared. The stored contest and problems were intact.

## Changes

- Completed-contest results now include the full problem set, original windows, difficulties, and links for practice, even if nobody solved a problem.
- Upcoming/live results pages offer an **Open contest** link. Future questions remain gated; opening a results URL does not bypass release times.
- Contest schedules, windows, deadlines, and acceptance times display in the viewer's local timezone. SSR uses an explicit UTC fallback, and the UTC instant remains in each time element's tooltip and `datetime` attribute.
- Live leaderboard rows and request-error state are scoped to the current contest, so switching contests cannot briefly show the previous standings or an old failure notice.

## Live demo

Created through the authenticated admin API at the owner's request:

- **Contest 2:** Demo Practice — NST LC Grind
- **Date:** 16 October 2026
- **Window:** 17:24–18:24 IST / 11:54–12:54 UTC
- **Link deadline:** 18:34 IST / 13:04 UTC
- **Problems:** Two Sum, Palindrome Number, 3Sum, Merge k Sorted Lists
- **Format:** one hourly batch, normal scoring and ownership rules

The live page was checked after unlock: all four problem links and the submission form were visible. One deliberately nonexistent submission ID was sent to the hosted checker; it returned `422 / not_found`, confirming the real lookup/rejection path without awarding points. No synthetic students, accepted submissions, or manual demo scores were inserted into the production database. The original contest was not edited.

Live positive scoring must use a real accepted LeetCode submission made during this window by an eligible linked account. A valid early Easy earns 3 points; after 17:39 IST it earns 2. An old acceptance from an earlier contest does not count in this demo.

## Isolated scoring/standings demo

`tests/e2e/demo-contest.test.ts` creates a separate in-memory Postgres database with three simulated participants and a fake LeetCode adapter. It verifies unlocks, early/base points, on-submit archiving, late links during an upstream outage, duplicates, ownership, window rejection, and the link deadline.

Expected and verified standings:

| Rank | Simulated participant | Points | Hard solves |
|---|---|---:|---:|
| 1 | Demo C | 18 | 1 |
| 2 | Demo A | 15 | 1 |
| 3 | Demo B | 9.5 | 0 |

These are test-fixture scores, not live production results. The existing 50-student, three-batch simulation also continues to pass.

## Coverage

The suite now has **80 unit/integration checks**, including actual results-page rendering against an in-memory database, timezone rendering, live-board update/failure behavior, and contest-switch isolation. Additional browser, build, and production checks are recorded with the release.
