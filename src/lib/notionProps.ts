// Every Notion property name the OS reads or writes — collected in one
// place so a Notion rename in any DB surfaces as a single import change
// instead of mystery silent failures across the codebase.
//
// IMPORTANT: these strings are not arbitrary — they must MATCH the Notion
// property name exactly, including emojis and the trailing space on
// "Daily Views ". If Aaron renames a property in Notion, update here.
//
// The setup-validation route (/api/health/setup) runs through these on
// boot and fails closed if any are missing.

/** Log DB (NOTION_LOG_DB_ID) — daily habit + journal entries. */
export const LOG = {
  Entry:           "Entry",                          // title
  Workout:         "Workout",                        // checkbox
  NF:              "NF",                             // checkbox
  PostedVideo:     "📹 Posted 1 Video or Reel?",     // checkbox
  Journal:         "✍️ Reflected in Journal?",       // checkbox
  Hours:           "⏳ Hours Worked",                 // number
  Views:           "Daily Views ",                   // number — trailing space!
  Summary:         "🏁 Summary of Day",              // rich_text
  Mindset:         "🧠 Mindset Notes",               // rich_text
  // Auto-populated by Notion on page creation. Read-only.
  DateLogged:      "Date And Time Logged",          // created_time
} as const;

/** Ledger DB (NOTION_LEDGER_DB_ID) — every confirmed transaction. */
export const LEDGER = {
  Name:            "Name",
  Amount:          "Amount",
  Type:            "Transaction Type",
  Category:        "Category",
  Status:          "Status",
  Date:            "Date",
  FromAccount:     "From Account",      // relation → Accounts
  ToAccount:       "To Account",        // relation → Accounts
  Currency:        "Currency",
  FxRate:          "FX Rate (to CAD)",
  BusinessPct:     "Business Use %",
  SplitSave:       "Split Save %",
  SplitSpend:      "Split Spend %",
  SplitTax:        "Split Tax %",
  Notes:           "Notes",
  TaxYear:         "Occurring Tax Year", // relation → Tax Years
} as const;

/** Accounts DB (NOTION_ACCOUNTS_DB_ID) — bank/pot/manual account ledger. */
export const ACCOUNTS = {
  Name:            "Name",
  Type:            "Type",
  Currency:        "Currency",
  CurrentBalance:  "Current Balance (CAD)",      // formula
  ProjectedBalance:"Projected Balance (CAD)",    // formula
  PendingDelta:    "Pending Delta (CAD)",        // formula
  StartingBalance: "Starting Balance (CAD)",
  HideFromDash:    "Hide from Dashboard ✅",     // checkbox
} as const;

/** SV Videos DB (NOTION_SV_VIDEOS_DB_ID) — content pipeline. */
export const VIDEOS = {
  Title:           "Title",
  Status:          "Status",
  Type:            "Type",
  Pillar:          "Content Pillar",
  Platform:        "Platform",
  Slug:            "Slug",
  PublishDate:     "Publish Date",
  Views:           "Views",
} as const;

/** Goals DB (NOTION_GOALS_DB_ID). Looser — Aaron hand-curates. */
export const GOALS = {
  Title:           "Goal",     // sometimes "Name" — both accepted at read time
  Status:          "Status",
  Target:          "Target (CAD)",
  Current:         "Current (CAD)",
  Deadline:        "Deadline",
} as const;

// Re-export everything as a single object for the validator
export const NOTION_PROPS = { LOG, LEDGER, ACCOUNTS, VIDEOS, GOALS } as const;
