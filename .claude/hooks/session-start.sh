#!/bin/bash
# SessionStart hook — Claude Code on the web.
#
# Two jobs: install dependencies so `npm run typecheck` works immediately, and
# put the project's ground rules in front of the agent before it touches
# anything. CLAUDE.md is loaded automatically, but the rules that actually get
# broken are the ones with consequences outside the repo — a live site, a live
# database — so they are repeated here where they are read first.
set -euo pipefail

# Local runs are a Windows machine with its own npm quirks (npm.cmd); leave them alone.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Install chatter goes to stderr so it stays out of the session context.
npm install --no-audit --no-fund >&2

# stdout IS the session context. Keep it short enough to be read.
cat <<'NOTE'
== Andresen Scholarships — read before changing anything ==

1. Read CLAUDE.md now, and SETUP.md before touching email, DNS or Cloudflare
   config. They record decisions that look like bugs if you don't know them
   (no financial-need section, signatures drawable *or* typed, required fields
   duplicated in apply.html and functions/lib/validation.ts).
2. andresen-scholarships.org is LIVE, and preview shares production's D1 and R2.
   There is no throwaway environment. Prefer a preview deploy for anything
   user-facing, and ask before writing to the database or sending real mail.
3. APPLICATIONS_OPEN is server-side in wrangler.toml and mirrored in
   assets/js/site-config.js. Never flip applicationsOpen on a branch to test —
   it rides a merge into production.
4. Verify before typing: `npm run typecheck`. There is no test suite.
NOTE
