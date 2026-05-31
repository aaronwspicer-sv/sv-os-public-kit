"use client";
// Settings panel: register + manage passkeys.
import { useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Fingerprint, Trash2, CheckCircle2 } from "lucide-react";

interface PassKey {
  id: string;
  device_label: string | null;
  backed_up: boolean;
  created_at: string;
  last_used_at: string | null;
}

export function PasskeySetup() {
  const [keys, setKeys]       = useState<PassKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding]   = useState(false);
  const [label, setLabel]     = useState("");
  const [error, setError]     = useState("");
  const [saved, setSaved]     = useState(false);

  async function refresh() {
    const r = await fetch("/api/auth/passkey");
    const d = await r.json();
    setKeys(d.passkeys ?? []);
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  async function add() {
    setError(""); setSaved(false); setAdding(true);
    try {
      const optsRes = await fetch("/api/auth/passkey/register-options", { method: "POST" });
      if (!optsRes.ok) { setError("Couldn't start registration"); return; }
      const options = await optsRes.json();

      // Browser prompts Touch ID / Face ID / Chromebook unlock / security key here
      const att = await startRegistration({ optionsJSON: options });

      const verRes = await fetch("/api/auth/passkey/register-verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: att, label: label.trim() || undefined }),
      });
      const verData = await verRes.json();
      if (!verRes.ok || !verData.ok) {
        setError(verData.error ?? "Registration failed");
        return;
      }
      setSaved(true);
      setLabel("");
      await refresh();
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      // User-cancelled or unsupported
      const msg = String(e?.message ?? e ?? "");
      if (/NotAllowedError|cancel/i.test(msg)) setError("Cancelled");
      else if (/NotSupportedError|secure context/i.test(msg)) setError("This device doesn't support passkeys");
      else setError(msg || "Registration failed");
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this passkey? You won't be able to use this device for biometric login until you re-add it.")) return;
    await fetch(`/api/auth/passkey?id=${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-[12px] bg-[rgba(167,139,250,0.10)] border border-[rgba(167,139,250,0.22)] flex items-center justify-center flex-shrink-0">
          <Fingerprint size={18} className="text-[#a78bfa]" />
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-600 text-text-1">Passkeys / Biometrics</p>
          <p className="text-[11px] text-text-3 mt-0.5">
            Touch ID, Face ID, Windows Hello, Chromebook unlock, or a hardware security key.
            Phishing-proof — use instead of typing your TOTP code. TOTP stays as backup.
          </p>
        </div>
      </div>

      {/* Add new */}
      <div className="flex flex-col gap-2 p-3 rounded-[12px] bg-[rgba(255,255,255,0.03)] border border-border-dim">
        <label className="text-[11px] font-600 text-text-2">Add this device</label>
        <div className="flex gap-2">
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Auto-detected from browser…"
            maxLength={40}
            className="flex-1 px-3 py-2 text-[12px]"
          />
          <Button variant="primary" onClick={add} loading={adding}>
            {saved ? "✓ Added" : "Register"}
          </Button>
        </div>
        {error && <p className="text-[11px] text-danger">{error}</p>}
        <p className="text-[10px] text-text-3">
          You'll be prompted for your fingerprint, face, or device PIN. Repeat on each device
          you want to use (iPhone, Mac, Chromebook).
        </p>
      </div>

      {/* Existing keys */}
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-600 text-text-2 uppercase tracking-[0.14em]">Registered</p>
        {loading ? (
          <p className="text-[11px] text-text-3 italic">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-[11px] text-text-3 italic">No passkeys yet. Add one above.</p>
        ) : (
          keys.map(k => (
            <div key={k.id} className="flex items-center gap-3 p-3 rounded-[10px] bg-[rgba(255,255,255,0.03)] border border-border-dim">
              <CheckCircle2 size={14} className="text-success flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-600 text-text-1 truncate">{k.device_label ?? "Unknown device"}</p>
                <p className="text-[10px] text-text-3">
                  Added {new Date(k.created_at).toLocaleDateString()}
                  {k.last_used_at ? ` · last used ${new Date(k.last_used_at).toLocaleDateString()}` : ""}
                  {k.backed_up ? " · cloud-backed" : " · device-bound"}
                </p>
              </div>
              <button onClick={() => remove(k.id)} className="text-text-3 hover:text-danger p-1.5">
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
