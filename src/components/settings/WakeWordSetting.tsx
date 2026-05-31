"use client";
// Settings toggle + phrase config for the wake-word listener.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Ear, Plus, Trash2 } from "lucide-react";
import { DEFAULT_PHRASES } from "@/components/alfred/WakeWord";

const ENABLE_KEY = "alfred_wake_enabled";
const PHRASE_KEY = "alfred_wake_phrase";

function broadcast() { try { window.dispatchEvent(new Event("alfred:wake-config")); } catch {} }

export function WakeWordSetting() {
  const [enabled, setEnabled] = useState(false);
  const [phrases, setPhrases] = useState<string[]>(DEFAULT_PHRASES);
  const [draft, setDraft]     = useState("");
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    try { setEnabled(localStorage.getItem(ENABLE_KEY) === "1"); } catch {}
    try {
      const raw = localStorage.getItem(PHRASE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p) && p.every(s => typeof s === "string")) setPhrases(p);
      }
    } catch {}
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  function save(next: { enabled?: boolean; phrases?: string[] }) {
    if (next.enabled != null) {
      setEnabled(next.enabled);
      try { localStorage.setItem(ENABLE_KEY, next.enabled ? "1" : "0"); } catch {}
    }
    if (next.phrases != null) {
      setPhrases(next.phrases);
      try { localStorage.setItem(PHRASE_KEY, JSON.stringify(next.phrases)); } catch {}
    }
    broadcast();
  }

  function addPhrase() {
    const v = draft.trim().toLowerCase();
    if (!v || phrases.includes(v)) return;
    save({ phrases: [...phrases, v] });
    setDraft("");
  }

  function removePhrase(p: string) {
    save({ phrases: phrases.filter(x => x !== p) });
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-[12px] bg-[rgba(167,139,250,0.10)] border border-[rgba(167,139,250,0.22)] flex items-center justify-center flex-shrink-0">
          <Ear size={18} className="text-[#a78bfa]" />
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-600 text-text-1">Wake word (always listening)</p>
          <p className="text-[11px] text-text-3 mt-0.5">
            When on, the browser listens for your wake phrase and auto-opens Alfred voice mode. Uses your browser's built-in speech recognition (Chrome/Edge/Safari only). Battery cost is real — leave off when not using.
          </p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-[11px] font-600 text-text-2">{enabled ? "On" : "Off"}</span>
          <input
            type="checkbox"
            checked={enabled}
            disabled={!supported}
            onChange={e => save({ enabled: e.target.checked })}
            className="w-4 h-4 accent-accent"
          />
        </label>
      </div>

      {supported === false && (
        <p className="text-[11px] text-warning">
          ⚠ Your browser doesn't support continuous speech recognition. Try Chrome, Edge, or Safari.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-[10px] uppercase tracking-[0.14em] text-text-3 font-600">Phrases (any match opens voice)</p>
        <div className="flex flex-wrap gap-1.5">
          {phrases.map(p => (
            <span key={p} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(167,139,250,0.10)] border border-[rgba(167,139,250,0.22)] text-[11px] text-text-1">
              "{p}"
              <button onClick={() => removePhrase(p)} className="text-text-3 hover:text-danger">
                <Trash2 size={10} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addPhrase(); } }}
            placeholder='Add a phrase (e.g. "yo alfred")'
            className="flex-1 px-3 py-1.5 text-[12px]"
          />
          <Button variant="outline" onClick={addPhrase} disabled={!draft.trim()}>
            <Plus size={12} /> Add
          </Button>
        </div>
        <p className="text-[10px] text-text-3 italic">
          Tip: include words you'd actually say naturally. Two-word phrases work better than one (less false-positives).
        </p>
      </div>
    </Card>
  );
}
