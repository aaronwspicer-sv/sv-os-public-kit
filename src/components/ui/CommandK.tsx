"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Sparkles, ArrowRight, CheckSquare, Brain, CreditCard, Package,
} from "lucide-react";
import type { SearchResult } from "@/app/api/search/route";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/ToastProvider";
import { config } from "@/config";
import { buildCommands, type Command } from "@/lib/commands";

type Cmd = Command;

const KIND_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  todo:        CheckSquare,
  memory:      Brain,
  transaction: CreditCard,
  asset:       Package,
};

export function CommandK() {
  const [open, setOpen]               = useState(false);
  const [query, setQuery]             = useState("");
  const [active, setActive]           = useState<Cmd | null>(null);
  const [input, setInput]             = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [hover, setHover]             = useState(0);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching]         = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const toast = useToast();
  const inputRef    = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // One source of truth — shared with the bridge + Alfred.
  const COMMANDS: Cmd[] = buildCommands({ toast });

  // Filter by query
  const filtered = !active
    ? COMMANDS.filter(c => c.label.toLowerCase().includes(query.toLowerCase().trim()))
    : [];

  const showSearch = !active && query.trim().length >= 3 && filtered.length === 0;

  // Debounced live search
  useEffect(() => {
    if (!showSearch) { setSearchResults([]); return; }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const d = await r.json();
        setSearchResults(d.results ?? []);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, showSearch]);

  // Keep hover in range
  useEffect(() => { setHover(0); }, [query]);

  // Global keybind
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Focus on open
  useEffect(() => {
    if (!open) return;
    setTimeout(() => {
      if (active) {
        (active.kind === "textarea" ? textareaRef : inputRef).current?.focus();
      } else {
        inputRef.current?.focus();
      }
    }, 60);
  }, [open, active]);

  const close = useCallback(() => {
    setOpen(false);
    setTimeout(() => {
      setQuery("");
      setActive(null);
      setInput("");
      setHover(0);
    }, 200);
  }, []);

  const runCommand = useCallback((cmd: Cmd) => {
    if (cmd.kind === "navigate" && cmd.href) {
      router.push(cmd.href);
      close();
      return;
    }
    if (cmd.kind === "action" && cmd.run) {
      setSubmitting(true);
      cmd.run()
        .then(() => close())
        .catch((e: any) => toast.error("Command failed", e?.message ?? "Unknown error"))
        .finally(() => setSubmitting(false));
      return;
    }
    setActive(cmd);
    setInput("");
  }, [router, close, toast]);

  const submit = useCallback(async () => {
    if (!active?.onSubmit) return;
    if (!input.trim()) return;
    setSubmitting(true);
    try {
      await active.onSubmit(input.trim());
      close();
    } catch (e: any) {
      toast.error("Command failed", e?.message ?? "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }, [active, input, close, toast]);

  // Arrow nav
  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHover(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHover(h => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[hover];
      if (cmd) runCommand(cmd);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh] px-4"
      style={{ animation: "fade-in 0.2s var(--ease-glide) both" }}
    >
      {/* Backdrop */}
      <button
        onClick={close}
        aria-label="Close command palette"
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
      />

      {/* Palette */}
      <div
        className="relative w-full max-w-[520px] surface-solid rounded-[20px] overflow-hidden"
        style={{ animation: "scale-in 0.24s var(--ease-spring) both" }}
      >
        {/* Header bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-dim">
          {active ? (
            <>
              <active.icon size={15} className="text-accent" />
              <span className="text-[13px] font-600 text-text-1">{active.label}</span>
              {active.hint && <span className="text-[10px] text-text-3">— {active.hint}</span>}
              <button
                onClick={() => { setActive(null); setInput(""); }}
                className="ml-auto text-[10px] text-text-3 hover:text-text-1 transition-colors"
              >
                ← Back
              </button>
            </>
          ) : (
            <>
              <Search size={15} className="text-text-3" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onListKey}
                placeholder="Search commands or data…"
                className="flex-1 bg-transparent border-none outline-none focus:ring-0 text-[14px] text-text-1 placeholder:text-text-3 p-0"
                style={{ boxShadow: "none" }}
              />
              <kbd className="text-[10px] text-text-3 font-mono px-1.5 py-0.5 rounded-[6px] bg-[rgba(255,255,255,0.06)] border border-border-dim">ESC</kbd>
            </>
          )}
        </div>

        {/* Body */}
        {active ? (
          <div className="p-4 flex flex-col gap-3">
            {active.kind === "input" ? (
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") submit(); }}
                placeholder={active.placeholder}
                className="w-full px-3 py-2.5 text-[14px]"
                autoFocus
              />
            ) : (
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
                placeholder={active.placeholder}
                rows={4}
                className="w-full px-3 py-2.5 text-[13px] resize-none"
                autoFocus
              />
            )}
            <div className="flex items-center gap-2 justify-end">
              <span className="text-[10px] text-text-3 mr-auto">
                {active.kind === "textarea" ? "⌘+Enter to submit" : "Enter to submit"}
              </span>
              <button
                onClick={submit}
                disabled={!input.trim() || submitting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[12px] font-600
                  bg-gradient-to-b from-[#3eb0ff] to-[#1D9BF0] text-black
                  shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35),0_2px_8px_rgba(29,155,240,0.35)]
                  hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4),0_4px_14px_rgba(29,155,240,0.5)]
                  disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? "…" : active.submitLabel ?? "Submit"} <ArrowRight size={12} />
              </button>
            </div>
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto p-1.5">
            {showSearch ? (
              searching ? (
                <div className="px-4 py-8 text-center text-[12px] text-text-3">Searching…</div>
              ) : searchResults.length === 0 ? (
                <div className="px-4 py-8 text-center text-[12px] text-text-3 flex flex-col items-center gap-2">
                  <Search size={16} className="text-text-3" />
                  No results for &ldquo;{query}&rdquo;
                </div>
              ) : (
                <>
                  <p className="px-3 py-1 text-[10px] uppercase tracking-widest text-text-3 font-600">Search results</p>
                  {searchResults.map((r, i) => {
                    const Icon = KIND_ICON[r.kind] ?? Search;
                    return (
                      <button
                        key={r.id}
                        onClick={() => { if (r.href) { router.push(r.href); close(); } }}
                        onMouseEnter={() => setHover(i)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-left transition-all duration-150",
                          i === hover ? "bg-[rgba(29,155,240,0.10)] text-text-1" : "text-text-2 hover:bg-[rgba(255,255,255,0.03)]"
                        )}
                      >
                        <Icon size={14} className={i === hover ? "text-accent" : "text-text-3"} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-500 truncate">{r.label}</p>
                          {r.sub && <p className="text-[11px] text-text-3 truncate">{r.sub}</p>}
                        </div>
                        {r.href && <ArrowRight size={12} className="text-text-3" />}
                      </button>
                    );
                  })}
                </>
              )
            ) : filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-text-3 flex flex-col items-center gap-2">
                <Sparkles size={16} className="text-text-3" />
                No matching commands
              </div>
            ) : (
              filtered.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => runCommand(c)}
                  onMouseEnter={() => setHover(i)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-left transition-all duration-150",
                    i === hover ? "bg-[rgba(29,155,240,0.10)] text-text-1" : "text-text-2 hover:bg-[rgba(255,255,255,0.03)]"
                  )}
                >
                  <c.icon size={14} className={i === hover ? "text-accent" : "text-text-3"} />
                  <span className="flex-1 text-[13px] font-500">{c.label}</span>
                  {c.kind === "navigate" && <ArrowRight size={12} className="text-text-3" />}
                </button>
              ))
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border-dim flex items-center gap-3 text-[10px] text-text-3">
          <span><kbd className="font-mono">↑↓</kbd> nav</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
          <span className="ml-auto text-text-3">{config.brand.shortName} Cmd+K</span>
        </div>
      </div>
    </div>
  );
}
