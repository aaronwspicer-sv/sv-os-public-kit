"use client";
// Settings panel for Alfred's long-term memory. Browse, search, add, delete.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Brain, Trash2, Plus, Search } from "lucide-react";

interface Memory {
  id: string;
  kind: string;
  content: string;
  importance: number;
  tag: string | null;
  created_at: string;
  last_recalled_at: string | null;
  recall_count: number;
}

const KIND_STYLE: Record<string, { label: string; color: string }> = {
  explicit:              { label: "explicit",  color: "#1d9bf0" },
  conversation_summary:  { label: "auto",      color: "#a78bfa" },
  pattern:               { label: "pattern",   color: "#fbbf24" },
  fact:                  { label: "fact",      color: "#34d399" },
};

export function AlfredMemories() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [newText, setNewText]   = useState("");
  const [adding, setAdding]     = useState(false);
  const [showAdd, setShowAdd]   = useState(false);

  async function refresh(q?: string) {
    const url = q ? `/api/alfred/memories?q=${encodeURIComponent(q)}` : "/api/alfred/memories";
    const r = await fetch(url);
    const d = await r.json();
    setMemories(d.memories ?? []);
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    const t = setTimeout(() => { refresh(search || undefined); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  async function add() {
    const content = newText.trim();
    if (!content) return;
    setAdding(true);
    try {
      const r = await fetch("/api/alfred/memories", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (r.ok) {
        setNewText("");
        setShowAdd(false);
        await refresh(search || undefined);
      }
    } finally { setAdding(false); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this memory permanently?")) return;
    await fetch(`/api/alfred/memories?id=${id}`, { method: "DELETE" });
    await refresh(search || undefined);
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-[12px] bg-[rgba(167,139,250,0.10)] border border-[rgba(167,139,250,0.22)] flex items-center justify-center flex-shrink-0">
          <Brain size={18} className="text-[#a78bfa]" />
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-600 text-text-1">Alfred's long-term memory</p>
          <p className="text-[11px] text-text-3 mt-0.5">
            What Alfred remembers about you across sessions. He saves these automatically when you share something durable, or manually via the <span className="font-mono text-text-2">remember</span> tool.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(s => !s)}
          className="text-text-3 hover:text-text-1 p-1.5"
          title="Add a memory"
        ><Plus size={14} /></button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search memories…"
          className="w-full pl-7 pr-3 py-1.5 text-[12px]"
        />
      </div>

      {/* Add box */}
      {showAdd && (
        <div className="flex flex-col gap-2 p-3 rounded-[10px] bg-[rgba(255,255,255,0.03)] border border-border-dim">
          <textarea
            value={newText}
            onChange={e => setNewText(e.target.value)}
            rows={3}
            placeholder="Write a fact about you Alfred should remember…"
            className="w-full px-2 py-1.5 text-[12px] resize-y"
          />
          <Button variant="primary" onClick={add} loading={adding} disabled={!newText.trim()}>
            Save memory
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-[11px] text-text-3 italic">Loading…</p>
      ) : memories.length === 0 ? (
        <p className="text-[11px] text-text-3 italic">
          {search ? "No matches." : "No memories yet. Alfred will start saving them as you chat."}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-[480px] overflow-y-auto">
          {memories.map(m => {
            const style = KIND_STYLE[m.kind] ?? { label: m.kind, color: "#94a3b8" };
            return (
              <div key={m.id} className="flex items-start gap-2 p-2.5 rounded-[10px] bg-[rgba(255,255,255,0.03)] border border-border-dim">
                <div className="flex flex-col items-center gap-1 mt-0.5">
                  <span className="text-[8px] font-700 uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ color: style.color, background: `${style.color}1a`, border: `1px solid ${style.color}33` }}>
                    {style.label}
                  </span>
                  <span className="text-[9px] text-text-3 font-mono">i{m.importance}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-text-1 leading-snug">{m.content}</p>
                  <p className="text-[9px] text-text-3 mt-1">
                    {new Date(m.created_at).toLocaleDateString()}
                    {m.tag && <> · <span className="text-text-2">{m.tag}</span></>}
                    {m.recall_count > 0 && <> · recalled {m.recall_count}×</>}
                  </p>
                </div>
                <button onClick={() => remove(m.id)} className="text-text-3 hover:text-danger p-1">
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
