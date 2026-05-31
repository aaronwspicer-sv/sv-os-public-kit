"use client";
// Editor for the SV-GPT skill = Alfred's identity. Versioned in the DB —
// every save creates a new version, can browse history + revert.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Brain, History, RotateCcw } from "lucide-react";

interface SkillRow {
  id: string;
  version: number;
  content: string;
  created_at: string;
  edited_by: string | null;
}

export function SvGptEditor() {
  const [active, setActive]   = useState<SkillRow | null>(null);
  const [history, setHistory] = useState<SkillRow[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [status, setStatus]   = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  async function refresh() {
    const r = await fetch("/api/alfred/skill");
    const d = await r.json();
    setActive(d.active);
    setHistory(d.history ?? []);
    setContent(d.active?.content ?? "");
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  async function save() {
    setSaving(true); setError(null); setStatus(null);
    try {
      const r = await fetch("/api/alfred/skill", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) { setError(d.error ?? "Failed"); return; }
      setStatus(`✓ Saved v${d.version}`);
      await refresh();
      setTimeout(() => setStatus(null), 2500);
    } finally {
      setSaving(false);
    }
  }

  function revertTo(row: SkillRow) {
    if (!confirm(`Load v${row.version} into the editor? (You still need to Save to make it active.)`)) return;
    setContent(row.content);
    setShowHistory(false);
  }

  const dirty = active && content !== active.content;
  const charCount = content.length;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-[12px] bg-[rgba(167,139,250,0.10)] border border-[rgba(167,139,250,0.22)] flex items-center justify-center flex-shrink-0">
          <Brain size={18} className="text-[#a78bfa]" />
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-600 text-text-1">SV-GPT — Alfred's brain</p>
          <p className="text-[11px] text-text-3 mt-0.5">
            The skill that defines who Alfred is — your second brain. Edit anytime;
            Alfred reads the latest version on every new turn. Every save creates a new version.
          </p>
        </div>
        <button
          onClick={() => setShowHistory(s => !s)}
          className="text-text-3 hover:text-text-1 p-1.5"
          title="History"
        ><History size={14} /></button>
      </div>

      {loading ? (
        <p className="text-[11px] text-text-3 italic">Loading skill…</p>
      ) : (
        <>
          <div className="flex items-center justify-between text-[10px] text-text-3">
            <span>Active: <b className="text-text-1">v{active?.version ?? "—"}</b> · {active ? new Date(active.created_at).toLocaleDateString() : "never"}</span>
            <span>{charCount.toLocaleString()} / 50,000 chars</span>
          </div>

          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={20}
            spellCheck={false}
            className="w-full px-3 py-2.5 text-[12px] font-mono leading-[1.5] resize-y min-h-[300px]"
            placeholder="# SV-GPT — Your Second Brain&#10;&#10;Who you are, what you're building, how to think about you…"
          />

          {error && <p className="text-[11px] text-danger">{error}</p>}

          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={save} loading={saving} disabled={!dirty} className="flex-1">
              {dirty ? "Save new version" : "No changes"}
            </Button>
            {dirty && (
              <Button variant="outline" onClick={() => setContent(active?.content ?? "")}>
                <RotateCcw size={13} /> Reset
              </Button>
            )}
          </div>

          {status && <p className="text-[11px] text-success text-center">{status}</p>}

          {showHistory && (
            <div className="flex flex-col gap-1.5 pt-2 border-t border-border-dim">
              <p className="text-[10px] uppercase tracking-[0.14em] text-text-3 font-600">Version history</p>
              {history.length === 0 && <p className="text-[11px] text-text-3 italic">None yet.</p>}
              {history.map(h => (
                <div key={h.id} className="flex items-center gap-2 p-2 rounded-[8px] bg-[rgba(255,255,255,0.03)] border border-border-dim">
                  <span className="text-[11px] font-700 text-text-1 w-8">v{h.version}</span>
                  <span className="flex-1 text-[10px] text-text-3 truncate">
                    {new Date(h.created_at).toLocaleString()} · {h.edited_by ?? "—"} · {h.content.length.toLocaleString()} chars
                  </span>
                  <button onClick={() => revertTo(h)} className="text-[10px] font-600 text-accent hover:underline">Load</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
