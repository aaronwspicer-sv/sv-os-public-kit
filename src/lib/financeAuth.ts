// requireFinanceAccess() — extends requireOwner() with the Finance Vault check.
// Apply to every API route that touches financial data:
//   /api/flinks/*, /api/notion/ledger, /api/notion/accounts,
//   /api/account-map, /api/manual-assets, /api/wishlist.
import { NextResponse } from "next/server";
import { requireOwner, type RequireOwnerResult } from "@/lib/auth";
import { isVaultUnlocked } from "@/lib/financeVault";

export type RequireFinanceResult =
  | (Extract<RequireOwnerResult, { ok: true }> & { vaultExpiresAt: number })
  | { ok: false; user: null; supabase: null; error: NextResponse };

export async function requireFinanceAccess(): Promise<RequireFinanceResult> {
  const gate = await requireOwner();
  if (!gate.ok) return gate;

  const vault = await isVaultUnlocked(gate.user.id);
  if (!vault.unlocked) {
    return {
      ok: false, user: null, supabase: null,
      error: NextResponse.json(
        { error: "Finance vault locked", code: "vault_locked" },
        { status: 423 }, // 423 Locked — semantically perfect here
      ),
    };
  }

  return { ...gate, vaultExpiresAt: vault.expiresAt! };
}
