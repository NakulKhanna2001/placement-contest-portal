# Agent instructions

Start with [`HANDOFF.md`](HANDOFF.md). It has the current state, settled decisions, pitfalls and the next step.

- Spec: `docs/superpowers/specs/2026-10-15-weekly-contest-portal-design.md`
- Plan: `docs/superpowers/plans/2026-10-15-weekly-contest-portal.md` (start at Task 1)
- Work test-first, one commit per task. Do not change settled decisions without asking the owner.
- Never commit secrets or `.env*` files.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
