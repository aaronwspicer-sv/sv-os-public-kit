import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { isVaultUnlocked } from "@/lib/financeVault";

// GET /api/finance/status — { unlocked, expiresAt } so the client can
// gate the UI without making finance API calls that would 423
export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user } = gate;

  const v = await isVaultUnlocked(user.id);
  return NextResponse.json(v);
}
