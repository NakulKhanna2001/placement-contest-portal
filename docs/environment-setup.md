# Connected environment

Configured on 2026-10-15 using the owner's authenticated Google Cloud and Neon browser sessions.

## Resources

| Resource | Configuration |
|---|---|
| Production URL | `https://nst-lc-grind.vercel.app` |
| Vercel project / plan | `nst-lc-grind` / Hobby |
| Vercel function region | `iad1`, near Neon |
| Scheduled jobs | None; verification and archiving are submission-triggered |
| Google Cloud project | `placement-contest-portal` — dedicated to this application |
| OAuth app | NST LC Grind (updated for the new branding) |
| OAuth client | Placement Contest Portal — Local Web; Web application |
| OAuth audience | External, **Testing**, with the owner added as a test user |
| JavaScript origins | `http://localhost:3000`, `https://nst-lc-grind.vercel.app` |
| Callbacks | `http://localhost:3000/api/auth/callback/google`, `https://nst-lc-grind.vercel.app/api/auth/callback/google` |
| Neon project | `placement-contest-portal` (`dark-rain-32903119`) |
| Neon plan / region | Free / AWS US East 1 (N. Virginia) |
| PostgreSQL version | 18 |
| Branch / database | `production` / `placement_contest_portal` |
| Connection | TLS-enabled pooled connection in `.env.local` |

No existing application's cloud project or database was repurposed. No Google Cloud billing/free-trial upgrade or paid Neon upgrade was enabled.

## Access decision

Initial access was owner-only. The owner subsequently approved **all Google accounts as students**, with additional administrators to be appointed explicitly later. The current application configuration is:

- `ALLOW_ALL_GOOGLE_ACCOUNTS=true`: any verified Google account may sign in.
- `ADMIN_EMAILS`: only the owner's address for now; comma-separated additional addresses are supported.
- `ALLOWED_EMAILS` / `ALLOWED_EMAIL_DOMAIN`: retained as optional restricted-mode settings, ignored as restrictions while public mode is enabled.
- `SUPPORT_EMAIL`: the public support contact used by the privacy and participation pages.

Google must verify the email address, and only the configured Google provider is accepted. Everyone outside `ADMIN_EMAILS` gets the `student` role; public login does not grant administrative access. To add admins later, update the exact email list in Vercel, redeploy, and have those accounts sign in again.

The original restricted model is still supported by disabling public mode and setting the domain/email allowlist. Public access also requires Google OAuth's External audience to be published; the app's home, privacy (`/privacy`), and participation (`/terms`) pages supply the Branding URLs.

## Credential handling

The database URL, Google client ID/secret, `AUTH_SECRET`, and access settings live in private `.env.local` locally and Vercel's project environment variables for deployment. The local file is ignored and has permissions `0600`; `.vercelignore` also excludes it from deployment uploads. Local `AUTH_URL` remains `http://localhost:3000`; Vercel uses `https://nst-lc-grind.vercel.app`. Secret values are not recorded in documentation, tests, or Git. The old cron secret is no longer used.

The canonical production domain uses the app's Google access policy. Preview and deployment-specific URLs retain Vercel protection. Vercel secrets are write-only when marked sensitive, so the production configuration was synchronized privately from the known-working local credentials rather than printing or exporting their values.

## Verified against real services

Production checks completed on 2026-10-16 at **https://nst-lc-grind.vercel.app**:

- Vercel reports the production deployment **Ready**, plan **Hobby**, with an empty cron-definition list.
- The home page and results page return HTTP 200 without requiring Vercel authentication.
- `/api/auth/providers` advertises the production Google callback, and the callback is saved in Google Cloud alongside localhost.
- A real Google sign-in completed on the public domain. The session contains the owner as an authenticated admin; the admin reports API returns HTTP 200.
- The same admin API returns HTTP 401 anonymously, and the removed cron endpoint returns HTTP 404.
- GitHub Actions passes the 42-test suite, type checking, lint, production dependency audit, build, and 8 browser checks for the no-cron source update.

Earlier local/database setup checks:

- The contest-editing release applies migration `0001`, adding a revision counter for stale-edit protection. A private pre-migration backup was taken; existing contest content and schedules are preserved.

- `npm run db:migrate` applied the initial migration to the dedicated Neon database.
- Direct Postgres verification confirmed all ten application tables and one migration record.
- Completed the real Google account chooser and basic profile/email consent flow.
- Google redirected to `/account`, and the portal persisted the owner as an `admin` in Postgres.
- The session endpoint returned an authenticated session with a numeric portal ID and admin role.
- Authenticated `GET /api/admin/reports` returned HTTP 200 and a report list.
- An anonymous request to that same endpoint returned HTTP 401.
- The authenticated account page rendered the owner's profile and LeetCode-linking form.

## Start locally

```bash
npm run build
npm run start -- --hostname localhost
```

Use **http://localhost:3000**, matching the registered callback exactly. Google users can visit `/account`; configured administrators can also visit `/admin`.

The UI/performance update replaced the local development server with the optimized production build. If port 3000 is already serving this app, use it instead of starting a second process. For editing, stop that server and use `npm run dev`.

## Before opening student access

- Confirm the External Google audience is published and test a non-admin Google account; it must remain a student.
- Run the preview load check and volunteer contest against the deployed app.
- Ask students to submit accepted links promptly. There is no periodic polling to rescue submissions that disappear from LeetCode's latest 20 before they have ever been archived.

The link deadline remains contest end plus grace. Existing archived records remain available. The legacy `next_snapshot_at` database column is unused and retained only to avoid an unnecessary schema migration.
