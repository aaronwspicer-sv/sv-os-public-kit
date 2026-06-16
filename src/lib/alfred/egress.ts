// The egress wall (Phase 3). Every payload that could leave the boundary — an
// outbound message, a public post, even a push digest — passes through here
// first. It redacts credentials/account numbers/tokens that never belong in
// outbound text, and redacts a configurable set of sensitive terms regardless
// of context. Built BEFORE any outbound capability exists, so Phase 4's red
// tools are gated by a wall that already works (and is tested).
//
// This mirrors the finance vault's read-gating onto the WRITE/SEND path: the
// vault stops sensitive data being read; this stops it being sent.
import { config } from "@/config";

export interface EgressScan {
  /** false when something that must NEVER be sent was found (credentials, etc.).
   *  Callers should block the send and surface `reasons` for human review. */
  ok: boolean;
  /** The text with all matches replaced by [redacted:<label>]. */
  redacted: string;
  /** Human-readable list of what was caught. */
  reasons: string[];
}

// Patterns that must never leave the boundary. A hit forces ok=false.
const HARD_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bsk-[A-Za-z0-9]{16,}\b/g,                 label: "api-key" },
  { re: /\b(?:rk|pk)_[A-Za-z0-9]{16,}\b/g,          label: "api-key" },
  { re: /\beyJ[A-Za-z0-9._-]{20,}\b/g,              label: "jwt" },
  { re: /\bBearer\s+[A-Za-z0-9._-]{16,}\b/gi,       label: "bearer-token" },
  { re: /\b(?:\d[ -]?){13,19}\b/g,                  label: "account-or-card-number" },
  { re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g, label: "private-key" },
];

/** Sensitive terms redacted on the outbound path regardless of vault state.
 *  Defaults to finance signal; callers can extend per-call (e.g. the owner's
 *  personal terms). Case-insensitive, word-boundary matched. */
function defaultSensitiveTerms(): string[] {
  return ["net worth", "account balance", "routing number", "account number", "SIN"];
}

function redactTerm(text: string, term: string): { text: string; hit: boolean } {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "gi");
  let hit = false;
  const out = text.replace(re, () => { hit = true; return "[redacted:sensitive]"; });
  return { text: out, hit };
}

export function scanEgress(
  text: string,
  opts: { extraTerms?: string[] } = {},
): EgressScan {
  let redacted = String(text ?? "");
  const reasons: string[] = [];
  let ok = true;

  for (const { re, label } of HARD_PATTERNS) {
    if (re.test(redacted)) {
      ok = false;
      reasons.push(label);
    }
    redacted = redacted.replace(re, `[redacted:${label}]`);
  }

  const terms = [...defaultSensitiveTerms(), ...(opts.extraTerms ?? [])];
  for (const term of terms) {
    const r = redactTerm(redacted, term);
    redacted = r.text;
    if (r.hit) reasons.push(`sensitive-term:${term}`);
  }

  return { ok, redacted, reasons: [...new Set(reasons)] };
}

/** Convenience for non-blocking channels (e.g. push to the owner's own device):
 *  always returns the redacted text, never throws. */
export function redactForEgress(text: string, extraTerms?: string[]): string {
  return scanEgress(text, { extraTerms }).redacted;
}

// Surface the owner's name terms as a hook for callers that want to also guard
// personal identifiers; kept here so the wall has one home.
export function ownerSensitiveTerms(): string[] {
  // Conservative defaults — extend as needed. Not the owner's public brand name.
  return [config.owner.fullName].filter(Boolean);
}
