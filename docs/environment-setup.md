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

The owner explicitly chose **“Only my account”** for initial access. The private environment therefore has:

- `ALLOWED_EMAILS`: the owner's exact Google email address.
- `ADMIN_EMAILS`: the same address.
- `ALLOWED_EMAIL_DOMAIN`: empty, so student-domain access remains closed.

An email being listed in `ADMIN_EMAILS` alone does **not** allow sign-in. It must also satisfy the domain or explicit-email access policy. Other Gmail accounts are not admitted.

The original college-domain model is still supported. When the college domain is supplied, set `ALLOWED_EMAIL_DOMAIN` to the exact domain; keep or remove the explicit owner exception as desired. OAuth is also in Testing mode: add intended test users there, or complete the appropriate Google publishing setup before opening access to students.

## Credential handling

The database URL, Google client ID/secret, `AUTH_SECRET`, and access settings live in private `.env.local` locally and Vercel's project environment variables for deployment. The local file is ignored and has permissions `0600`; `.vercelignore` also excludes it from deployment uploads. Local `AUTH_URL` remains `http://localhost:3000`; Vercel uses `https://nst-lc-grind.vercel.app`. Secret values are not recorded in documentation, tests, or Git. The old cron secret is no longer used.

The canonical production domain uses the app's Google access policy. Preview and deployment-specific URLs retain Vercel protection. Vercel secrets are write-only when marked sensitive, so the production configuration was synchronized privately from the known-working local credentials rather than printing or exporting their values.

## Verified against real services

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

Use **http://localhost:3000**, matching the registered callback exactly. Sign in with the configured owner account, then visit `/admin` or `/account`.

The UI/performance update replaced the local development server with the optimized production build. If port 3000 is already serving this app, use it instead of starting a second process. For editing, stop that server and use `npm run dev`.

## Before opening student access

- Supply the college domain or intended email allowlist and adjust Google audience/publishing settings.
- Run the preview load check and volunteer contest against the deployed app.
- Ask students to submit accepted links promptly. There is no periodic polling to rescue submissions that disappear from LeetCode's latest 20 before they have ever been archived.

The link deadline remains contest end plus grace. Existing archived records remain available. The legacy `next_snapshot_at` database column is unused and retained only to avoid an unnecessary schema migration.
