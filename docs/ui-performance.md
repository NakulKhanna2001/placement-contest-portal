# NST LC Grind — interface and navigation

## Design

The app is now branded **NST LC Grind**, including its wordmark, favicon, metadata, scheduling placeholder, and Google OAuth consent-screen display name. Existing Google/Neon resource identifiers and the OAuth client credentials are retained.

The visual system uses light neutral surfaces, readable typography, a restrained red action color, and consistent spacing. Following the owner's request for a simpler interface, a compact top menu replaces the desktop sidebar and breadcrumb bar. The tabs use plain labels: **Contests, Results, Account, Admin**. Mobile keeps the same navigation in a compact second row.

The home screen prioritizes sign-in or the next contest. The decorative timer panel, slogans, and duplicate instruction cards have been removed. Rules are available in a native expandable section; linking guidance is a short three-step flow. Account details use a single column, empty results states are concise, and occasional admin tools/activity stay collapsed until needed. The solve-submission form is above the problem list during a live contest. Existing prefetching, loading feedback, skeletons, and data-fetching optimizations are retained.

System fonts eliminate the previous render-blocking Google Fonts CSS import and font downloads. Icons are small inline SVGs. Loading animations use CSS rather than an animation dependency, and respect `prefers-reduced-motion`.

## Navigation changes

- **Non-blocking shell:** root layout renders immediately. Authentication controls stream in their own Suspense boundary, so a cold database does not hold up the entire navigation frame.
- **Route skeletons:** Contests, Account, Admin, Results, and individual result pages have dedicated `loading.tsx` fallbacks. Account skeletons reserve the single-column profile/form layout; admin skeletons reserve the summary and columns.
- **Pending-link feedback:** Next.js `useLinkStatus` drives the loading indicator. The indicator has a 100ms anti-flicker delay; no artificial minimum loading time is imposed.
- **Intent prefetch:** focusing or hovering a non-live tab can prefetch its content. The live Arena retains partial prefetching so cached page data does not become the authority for unlock times.
- **Interruptible navigation:** the persistent frame remains interactive while a screen is loading.
- **Request-local identity reuse:** React `cache()` deduplicates session and user reads during a server render. Roles and user records are never cached across requests.
- **Public metadata cache:** published contest scheduling metadata is cached for 30 seconds and invalidated when an admin creates or publishes a contest. Cached dates are restored after JSON serialization. Drafts and problem identities are excluded from this cache.
- **One admin overview query:** an authorized SQL statement fetches the admin lists in a single consistent snapshot, avoiding six independent remote queries and extra pool handshakes. The SQL predicate checks admin role and the result is not cached globally.
- **Lighter live updates:** the leaderboard polls only its API every 12 seconds. Page refreshes are reserved for actual time boundaries, minute-level reconciliation, and mutations. Hidden tabs pause refresh work.
- **Scoped solve reads:** the Arena fetches only the current participant's solves in the current contest, rather than their entire history.

All solve windows, deadlines, scoring, ownership, and admin authorization remain server-enforced.

## Observed authenticated navigation

Compared production builds in the owner's existing Chrome session against the same live Neon database. These are local observations, not deployment capacity guarantees. The database currently has the configured owner and no scheduled contests.

| Route | Original content ready | Updated content ready |
|---|---:|---:|
| Results (first navigation) | 723ms | 755ms |
| Arena | 2,313ms | 508ms |
| Admin | 3,621ms | 1,084ms |
| Account | 1,227ms | 508ms |
| Results (repeat navigation) | 469ms | 729ms |

The Results difference is within this run's network/cache variability; no improvement is claimed for its data completion time. The meaningful gains were in Arena, Account, and Admin. The updated interface also gives prompt loading feedback while remote data completes.

A prior intermediate pass still had slow admin completion due to opening multiple database connections. That finding led to the single-statement admin overview, rather than relying on skeletons alone to mask latency.

Initial connection/wake-up time and network latency still exist. Use `npm run build` followed by `npm run start -- --hostname localhost` to judge normal navigation; `next dev` compiles routes on demand and does not provide production prefetch behavior. The configured `AUTH_URL=http://localhost:3000` supports the local production server.

## Checks

- **42 Vitest tests pass** after the subsequent no-cron Hobby update, including cache serialization/date restoration, admin-view authorization, submission-triggered archiving, and non-interactive accessible skeleton markup. The retired cron endpoint's test was removed with that feature.
- **8 Playwright checks pass** across desktop and mobile: branded pages/navigation, delayed-request feedback, keyboard access, reduced motion, skeleton layout, and horizontal overflow.
- TypeScript, ESLint, and the production build pass.
- Desktop/mobile screenshots and the skeleton rendering were inspected.
- Authenticated production navigation was exercised against real Postgres. No demo contests or fabricated participant results were inserted.
- Google Cloud branding was saved and reloaded to confirm the new consent-screen name.

Browser screenshots and traces are ignored local artifacts under `test-results/`.
