// Currency formatting — config-driven so the OS displays the owner's
// currency symbol (default CAD → "$"; EUR → "€"; GBP → "£"; JPY → "¥"; etc).
//
// Uses Intl currency formatting with `narrowSymbol` so CAD/USD render as a
// bare "$" (matching the original hardcoded display) while other currencies
// get their proper symbol. Display only — the Notion ledger "Currency"
// select values + FX logic stay literal "CAD"/"USD" (those are data, not
// presentation).
import { config } from "@/config";

interface MoneyOpts {
  /** Decimal places (default 2). */
  decimals?: number;
  /** Prefix with +/- (e.g. "+$50", "-$20"). Default false → "-" only. */
  signed?: boolean;
}

export function formatMoney(amount: number, opts: MoneyOpts = {}): string {
  const decimals = opts.decimals ?? 2;
  const formatted = new Intl.NumberFormat(config.locale.locale, {
    style: "currency",
    currency: config.locale.currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(amount));

  if (opts.signed) {
    const sign = amount < 0 ? "-" : amount > 0 ? "+" : "";
    return sign + formatted;
  }
  return amount < 0 ? `-${formatted}` : formatted;
}

/** Just the currency symbol for the configured currency ("$", "€", "£", "¥"…).
 *  For compact custom formats like "$5.0k" where Intl's full formatter
 *  doesn't fit. */
export function currencySymbol(): string {
  const parts = new Intl.NumberFormat(config.locale.locale, {
    style: "currency",
    currency: config.locale.currency,
    currencyDisplay: "narrowSymbol",
  }).formatToParts(0);
  return parts.find(p => p.type === "currency")?.value ?? "$";
}
