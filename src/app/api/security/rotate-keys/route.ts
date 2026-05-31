import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { encryptToken, decryptToken, ciphertextVersion } from "@/lib/crypto";
import { encryptFinanceToken, decryptFinanceToken, isFinanceEncrypted, activeFinanceCiphertextPrefix } from "@/lib/financeCrypto";

// POST /api/security/rotate-keys
// Re-encrypts every encrypted row in Supabase with the current ACTIVE_KEY_VERSION.
// Used after rotating ENCRYPTION_KEY — call this once, then you can safely
// retire the old key env var.
//
// Tables touched (encrypted columns):
//   bank_items.secret_enc  (post-Plaid; finance key)
//   user_totp.secret_enc        (main key)
//
// Safe to re-run — skips rows already at the active version.
export async function POST() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const active = process.env.ACTIVE_KEY_VERSION ?? "1";
  let migrated = 0;
  let skipped = 0;
  const failures: string[] = [];

  // ── bank_items — encrypted with the FINANCE key (separate from main) ──
  const { data: items } = await supabase
    .from("bank_items")
    .select("id, secret_enc")
    .eq("user_id", user.id);

  const financePrefix = activeFinanceCiphertextPrefix(); // e.g. "f1"
  for (const item of items ?? []) {
    if (isFinanceEncrypted(item.secret_enc) &&
        item.secret_enc.startsWith(financePrefix + ":")) {
      skipped++;
      continue;
    }
    try {
      const plain = decryptFinanceToken(item.secret_enc);
      const reencrypted = encryptFinanceToken(plain);
      await supabase
        .from("bank_items")
        .update({ secret_enc: reencrypted })
        .eq("id", item.id)
        .eq("user_id", user.id);
      migrated++;
    } catch (e: any) {
      failures.push(`bank_items#${item.id}: ${e?.message}`);
    }
  }

  // ── user_totp ─────────────────────────────────────────────
  const { data: totp } = await supabase
    .from("user_totp")
    .select("user_id, secret_enc")
    .eq("user_id", user.id)
    .maybeSingle();

  if (totp?.secret_enc) {
    if (ciphertextVersion(totp.secret_enc) === active) { skipped++; }
    else {
      try {
        const plain = decryptToken(totp.secret_enc);
        const reencrypted = encryptToken(plain);
        await supabase
          .from("user_totp")
          .update({ secret_enc: reencrypted })
          .eq("user_id", user.id);
        migrated++;
      } catch (e: any) {
        failures.push(`user_totp: ${e?.message}`);
      }
    }
  }

  await supabase.from("audit_log").insert({
    user_id: user.id,
    action: "key_rotation",
    metadata: { activeVersion: active, migrated, skipped, failures: failures.length },
  });

  return NextResponse.json({ ok: true, activeVersion: active, migrated, skipped, failures });
}
