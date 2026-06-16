# Spicer OS

A personal life operating system with an AI agent at the center. Habits,
finances, content pipeline, calendar, goals — and **Alfred**, an AI that has
real access to all of it and can act on your behalf.

Built by [Aaron Spicer](https://www.spicervisions.online) and shared as a
self-host kit: bring your own keys, run your own copy, own your data.

> **This is the self-host kit.** Everything runs on *your* infrastructure
> (your Supabase, your Notion, your OpenAI key). Nothing phones home.

---

## What's inside

- **Alfred** — an AI agent with 42 tools across the whole OS. Chat + voice +
  vision, long-term vector memory, prompt-injection defenses, a kill switch.
- **Autonomous Alfred** *(opt-in, off by default)* — Alfred runs daily passes
  that quietly reshuffle your day, note patterns, and draft content from what
  you build. Tiered + reversible: small internal actions run free, anything
  outbound waits for your one-tap approval, and it can never move money. Every
  action is logged with an undo at `/d/activity`.
- **Daily log** — habits, hours, journal, streaks; morning brief + evening
  recap emails.
- **Finances** — bank-CSV import → categorize → a Notion ledger, behind a
  separate PIN+2FA+passkey "finance vault."
- **Content pipeline** — 7-stage video production synced to Notion.
- **Calendar, goals, timeline, year stats** — the rest of the dashboard.
- **Security** — Supabase auth + owner allowlist, TOTP, WebAuthn passkeys,
  PIN, strict CSP, audit log, intrusion digest.
- **Observability** — Sentry, cron health-checks, a `/d/settings/health` page.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · Supabase ·
Notion · OpenAI · Resend · Sentry · Vercel.

---

## Setup (~30 min)

You'll need free accounts: **Supabase**, **Notion**, **OpenAI**, **Resend**,
and a **Vercel** account to deploy.

### 1. Configure

```bash
npm install
npm run init        # interactive — writes .env.local, generates all secrets
```

`npm run init` asks for your identity/brand/locale/features + API keys and
**auto-generates every secret** (encryption keys, cron secret, VAPID push
keypair). Re-runnable; `--defaults` for non-interactive.

### 2. Database

In the Supabase SQL editor, paste and run **`supabase/setup.sql`** — one file
that creates every table. (It's safe to re-run.)

### 3. Notion

Duplicate the database templates into your workspace and paste their IDs into
your env. See **[docs/notion-templates.md](docs/notion-templates.md)** for the
exact databases, property names, and links.

### 4. Allowlist

Set `OWNER_EMAIL=you@example.com` in your env — that's the only account that
can log in (this is what gates the whole app to you). `npm run init` sets it
for you. No code editing needed; for multiple addresses use
`OWNER_EMAILS=a@x.com,b@y.com`.

### 5. Run / deploy

```bash
npm run dev         # local at http://localhost:3000
```

To deploy: push to a repo, import into Vercel, paste the same env vars, and
set the two cron jobs (already declared in `vercel.json`). First login runs
an in-app wizard that walks you through PIN / 2FA / passkey / push and lets
you customize Alfred.

### Verify

Open `/d/settings/health` — it checks every env var, Supabase table, and
Notion property name, and shows cron status. Green = you're good.

---

## Configuration

Everything owner-specific lives in env (read through `src/config.ts`):
identity, brand, timezone, currency, and feature toggles
(`NEXT_PUBLIC_FEATURE_JAYS`, `…_TAX_YEAR`, `…_WORKOUT`, `…_FINANCE_VAULT`).
See `.env.local.example` for the full list. Works in any timezone/currency,
not just Toronto/CAD.

## Scripts

| Command | What |
|---|---|
| `npm run dev` | local dev server |
| `npm run init` | interactive setup → `.env.local` |
| `npm run backup` | dump all Supabase tables + Notion DBs to `./backups/` |
| `npm test` | unit tests |
| `npm run test:contract` | verify Notion property names against live DBs |

## Customizing Alfred

Alfred's personality + knowledge live in an editable "SV-GPT skill" (Settings,
or the onboarding wizard). Replace the placeholder with your own — that's what
makes Alfred *yours* instead of a generic chatbot.

---

## License

Single-seat, personal-use. You may run and modify it for yourself; you may not
resell or redistribute it. See [LICENSE](LICENSE). No warranty.

## Credits

Built in public by Aaron Spicer · [spicervisions.online](https://www.spicervisions.online)
