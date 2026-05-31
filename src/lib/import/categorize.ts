// Lightweight merchant → category guesser. Used to populate
// suggested_category at import time so the inbox isn't all blank.
// Aaron always confirms in /finances → exact category written to Notion.

const RULES: { rx: RegExp; cat: string }[] = [
  // Groceries
  { rx: /loblaw|metro|sobeys|no frills|food basics|farm boy|fortinos|costco|wal[- ]?mart/i, cat: "Food" },
  // Restaurants / fast food
  { rx: /tim hortons|starbucks|mcdonald|a&w|wendy|subway|chipotle|swiss chalet|harvey|skip[- ]?the[- ]?dishes|uber eats|doordash/i, cat: "Food" },
  // Transit
  { rx: /presto|ttc|uber|lyft|gas|petro|esso|shell|husky|circle k/i, cat: "Transit" },
  // Subscriptions / software
  { rx: /spotify|netflix|disney|prime video|crave|youtube premium|apple\.com\/bill|icloud/i, cat: "Subscriptions" },
  { rx: /openai|anthropic|cursor\.so|github|vercel|supabase|notion|figma|adobe|microsoft|google.*workspace/i, cat: "Software" },
  // Income signals
  { rx: /payroll|salary|deposit.*from|interac.*deposit|e-?transfer.*from|stripe.*payout|paypal.*payout/i, cat: "Other Income" },
  { rx: /ugc|brand deal|sponsorship/i, cat: "UGC Payout" },
  // Gear / props
  { rx: /amazon|amzn|bestbuy|apple store|bh photo|adorama|sweetwater/i, cat: "Gear" },
  // Banking moves
  { rx: /transfer|tfsa|rrsp|wealthsimple|interac e-transfer.*to|payment.*credit card/i, cat: "Bank Move" },
  // Donations
  { rx: /donat|charity|gofundme/i, cat: "Donation" },
];

export function suggestCategory(description: string, amount: number): string {
  const d = description.toLowerCase();
  for (const r of RULES) if (r.rx.test(d)) return r.cat;
  // Default by sign
  return amount > 0 ? "Other Income" : "Other Personal";
}
