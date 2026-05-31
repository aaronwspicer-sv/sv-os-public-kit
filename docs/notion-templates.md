# Notion templates — setup guide

Spicer OS reads and writes most of its data in **Notion**. It expects a set
of databases whose **property names match exactly** — including emojis and
(in two cases) a **trailing space**. If a name is off by one character, the
OS silently can't find the field. The setup health check
(`/api/health/setup`) validates these names against `src/lib/notionProps.ts`.

There are two ways to get the databases:

- **Easiest — duplicate the published templates** (links below once published).
  Click "Duplicate" → it lands in your workspace with every property,
  formula, rollup, and relation intact. Then paste each DB's ID into your
  env (the `npm run init` CLI asks for them).
- **From scratch** — recreate each DB using the schemas below. Doable for the
  simple ones (Log, Goals, Videos), painful for the finance ones (Accounts +
  Ledger have interlocking formulas/rollups/relations). Strongly prefer
  duplicating those two.

---

## For the kit owner — how to publish these as templates

(One-time, ~20 min. The Notion API can't do this — it's a UI action.)

For **each** database below:

1. Open the database in Notion → ⋯ menu → **Duplicate** (makes a copy you'll
   share, so your real data is never exposed).
2. In the duplicate, **delete every row** (select all → delete). Keep the
   structure, drop the data.
3. Scrub anything personal left in property defaults or views.
4. ⋯ menu → **Connect to** → make sure it's NOT connected to your private
   integration token (the template should be standalone).
5. Top-right **Share → Publish** → enable **"Allow duplicate as template."**
6. Copy the public link. That's the "Duplicate to workspace" link buyers use.
7. Paste all the links into the setup page / README template-links section.

**Finance pair note:** Accounts ↔ Ledger reference each other via relations.
Duplicate **both together** (select both in the sidebar → duplicate) so Notion
rewires the relations to the copies. Duplicating them separately breaks the
links.

---

## Critical: exact property names

These are the names the code keys on. Copy them character-for-character.

- `Daily Views ` — **trailing space** (Log DB)
- `Progress ` — **trailing space** (Goals DB)
- Emoji names in Log: `⏳ Hours Worked`, `🏁 Summary of Day`,
  `✍️ Reflected in Journal?`, `🧠 Mindset Notes`, `📹 Posted 1 Video or Reel?`
- `Hide from Dashboard ✅` (Accounts DB)

---

## Log  (`NOTION_LOG_DB_ID`)

Daily habit + journal entry. One row per day; the title is the YYYY-MM-DD date.

| Property | Type | Notes |
|---|---|---|
| `Entry` | title | the day's date as `YYYY-MM-DD` |
| `Workout` | checkbox | |
| `NF` | checkbox | |
| `📹 Posted 1 Video or Reel?` | checkbox | |
| `✍️ Reflected in Journal?` | checkbox | |
| `⏳ Hours Worked` | number | |
| `Daily Views ` | number | **trailing space** |
| `🏁 Summary of Day` | rich_text | |
| `🧠 Mindset Notes` | rich_text | |
| `Images (optional)` | files | optional |
| `Date And Time Logged` | created_time | auto |

## Goals  (`NOTION_GOALS_DB_ID`)

| Property | Type | Notes |
|---|---|---|
| `Goal` | title | |
| `Status` | status | Not started, In progress, Funded, Achieved |
| `Priority Level` | select | High, Medium, Low |
| `Target (CAD)` | number | |
| `Due Date` | date | |
| `Pot/Account` | relation → Accounts | |
| `Current (CAD)` | rollup | max of Accounts `Current Balance (CAD)` via `Pot/Account` |
| `Progress ` | formula | **trailing space** — Current ÷ Target |
| `Remaining (CAD)` | formula | Target − Current |

## SV Videos  (`NOTION_SV_VIDEOS_DB_ID`)

| Property | Type | Notes |
|---|---|---|
| `Title` | title | |
| `Status` | select | Idea, Packaged, Scripted, Filmed, Editing, Live |
| `Type` | select | Long Form, Short Form Clip, Standalone Short |
| `Content Pillar` | select | Journey, Process, Proof, Lessons |
| `Platform` | multi_select | YouTube, TikTok, IG Reels, YT Shorts |
| `Effort Level` | select | High, Medium, Low |
| `Slug` | rich_text | |
| `Publish Date` | date | |
| `Views` | number | |
| `Final Video` | url | |
| `Thumbnail` | url | |
| `Notes` | rich_text | |
| `Notion Page URL` | rich_text | |
| `Parent Video` | relation (self) | |
| `Short Form Clips` | relation (self) | |

## Accounts  (`NOTION_ACCOUNTS_DB_ID`)  ⚠️ formula-heavy — duplicate, don't rebuild

Bank / pot / manual accounts. Balances are computed from the Ledger via rollups.

| Property | Type | Notes |
|---|---|---|
| `Name` | title | |
| `Type` | select | Bank, Other, Pot |
| `Currency` | select | CAD, USD |
| `Starting Balance (CAD)` | number | opening balance |
| `Hide from Dashboard ✅` | checkbox | filter flag (OS only shows unchecked) |
| `Current Balance (CAD)` | formula | Starting + Inflow + Transfer In − Outflow − Transfer Out |
| `Projected Balance (CAD)` | formula | Current ± pending |
| `Pending Delta (CAD)` | formula | Pending In − Pending Out |
| `Is Zero?` | formula | helper |
| `Ledger From Account` | relation → Ledger | the reverse side of Ledger `From Account` |
| `Ledger To Account` | relation → Ledger | the reverse side of Ledger `To Account` |
| `Inflow (CAD)` / `Income In (Cleared)` | rollup | sum of Ledger inflow helper via `Ledger To Account` |
| `Outflow (CAD)` / `Expense Out (Cleared)` | rollup | sum of Ledger outflow helper via `Ledger From Account` |
| `Transfer In (Cleared)` | rollup | via `Ledger To Account` |
| `Transfer Out (Cleared)` | rollup | via `Ledger From Account` |
| `Pending In (CAD)` / `Pending Out (CAD)` | rollup | pending helpers |

## Ledger  (`NOTION_LEDGER_DB_ID`)  ⚠️ formula-heavy — duplicate, don't rebuild

Every transaction. The OS writes here when you confirm a bank-CSV row.

| Property | Type | Notes |
|---|---|---|
| `Name` | title | merchant / description |
| `Amount` | number | positive magnitude |
| `Transaction Type` | select | Tax Payment, Transfer, Expense, Income |
| `Category` | select | Bank Move, Pot Move, Other, Props, Subscriptions, Gear, Software, Other Income, Client, UGC Payout, Transit, Fun, Food, Other Personal, Personal Drawing, reimbursed, Investments, Interest, refund, Donation, adjustment |
| `Status` | select | Cleared, Pending |
| `Date` | date | |
| `Currency` | select | CAD, USD |
| `FX Rate (to CAD)` | number | set when Currency = USD |
| `Business Use %` | number | 0–1 |
| `Split Save %` / `Split Spend %` / `Split Tax %` | number | 0–1 budget split |
| `From Account` | relation → Accounts | money leaves this (Expense/Transfer) |
| `To Account` | relation → Accounts | money lands here (Income/Transfer) |
| `Occurring Tax Year` | relation → Tax Years | optional (Canadian tax feature) |
| `Notes` | rich_text | |
| `Receipt / Proof` | files | |
| `Amount CAD` | formula | Amount × FX (or Amount if CAD) |
| `Deductible CAD` | formula | Amount CAD × Business Use % when Expense |
| `Income/Expense CAD (helper)` | formula | type-split helpers |
| `Inflow/Outflow/Transfer In/Transfer Out CAD (Cleared helper)` | formula | feed the Accounts rollups |
| `Pending Inflow/Outflow CAD` | formula | feed pending rollups |
| `Save/Spend/Tax Amount (CAD)` | formula | split amounts |

## Tax Years  (`NOTION_TAX_YEARS_DB_ID`)  — optional

Only needed if `NEXT_PUBLIC_FEATURE_TAX_YEAR=true` (Canadian tax-year tagging).
A simple DB keyed by year (title = the year, e.g. `2026`), related to Ledger
via `Occurring Tax Year`. Skip entirely if the feature is off.

## Workout  (`NOTION_WORKOUT_DB_ID`)  — optional

Only needed if `NEXT_PUBLIC_FEATURE_WORKOUT=true`. Not required for the core
OS. (Not documented in detail here — it's a personal training log; create a
simple DB or leave the feature off.)
