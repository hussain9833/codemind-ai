"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SEARCH_KINDS, type SearchResult } from "@/lib/search";

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounced server search. Results are scoped to the signed-in user on the server.
  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctl.signal });
        if (r.ok) setResults(((await r.json()) as { results: SearchResult[] }).results);
      } catch { /* aborted or offline: keep previous results */ }
      finally { if (!ctl.signal.aborted) setLoading(false); }
    }, query ? 180 : 0);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [query, open]);

  const close = () => { setQuery(""); setIndex(0); onClose(); };

  const go = (i: number) => {
    const r = results[i];
    if (!r) return;
    close();
    if (r.href.startsWith("http")) window.open(r.href, "_blank", "noopener,noreferrer");
    else router.push(r.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(index); }
  };

  return (
    <Dialog open={open} onClose={close} title="Search" align="top" className="max-w-2xl">
      <div onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-border px-5">
          <Search className="size-[18px] text-subtle" aria-hidden />
          <input
            data-autofocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
            placeholder="Search projects, investigations, incidents, pull requests…"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-activedescendant={results[index] ? `sr-${results[index].id}` : undefined}
            className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-subtle"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 border-b border-border px-5 py-2.5">
          {SEARCH_KINDS.map((k) => (
            <Badge key={k.kind} tone="accent">{k.label}</Badge>
          ))}
        </div>
        <ul id="search-results" role="listbox" className="max-h-[22rem] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">{loading ? "Searching…" : query ? `No results for “${query}”. Files, symbols and commits are searched once the selected project is indexed.` : "Type to search projects, files, symbols, investigations and more."}</li>}
          {results.map((r, i) => (
            <li key={r.id} id={`sr-${r.id}`} role="option" aria-selected={i === index}>
              <button
                tabIndex={-1}
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(i)}
                className={cn("flex w-full items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 text-left transition-colors", i === index ? "bg-accent-soft" : "hover:bg-surface-3")}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm">{r.title}</span>
                  {r.subtitle && <span className="block truncate text-xs text-subtle">{r.subtitle}</span>}
                </span>
                <Badge>{r.kind.replace("-", " ")}</Badge>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
