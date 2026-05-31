'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ResultsList } from '@/components/ResultsList';
import { SearchInput, LOINC_CODE_RE } from '@/components/SearchInput';
import { SingleResultView } from '@/components/SingleResultView';
import type { LookupResult, SearchResult } from '@/types/loinc';

type State =
  | { kind: 'idle' }
  | { kind: 'loading'; query: string }
  | { kind: 'list'; query: string; results: SearchResult[] }
  | { kind: 'single'; query: string; result: LookupResult }
  | { kind: 'empty'; query: string }
  | { kind: 'error'; query: string; message: string };

const DEBOUNCE_MS = 250;

export default function Home() {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const reqId = useRef(0);

  // Seed from ?q= on first client mount. A useState initializer would cause a
  // hydration mismatch (server renders with '', client would render with the
  // URL value). useSyncExternalStore is the canonical hook for external state
  // but is overkill for a one-time read.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q') ?? '';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (q) setQuery(q);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    const id = setTimeout(() => {
      const url = new URL(window.location.href);
      if (trimmed) url.searchParams.set('q', trimmed);
      else url.searchParams.delete('q');
      window.history.replaceState(null, '', url);

      if (!trimmed) {
        setState({ kind: 'idle' });
        return;
      }
      const myId = ++reqId.current;
      setState({ kind: 'loading', query: trimmed });

      const isCode = LOINC_CODE_RE.test(trimmed);
      const endpoint = isCode
        ? `/api/loinc?code=${encodeURIComponent(trimmed)}`
        : `/api/search?q=${encodeURIComponent(trimmed)}`;

      fetch(endpoint)
        .then(async (res) => {
          if (myId !== reqId.current) return;
          if (isCode && res.status === 404) {
            setState({ kind: 'empty', query: trimmed });
            return;
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          if (isCode) {
            const data = (await res.json()) as LookupResult;
            if (myId !== reqId.current) return;
            setState({ kind: 'single', query: trimmed, result: data });
          } else {
            const data = (await res.json()) as { results: SearchResult[] };
            if (myId !== reqId.current) return;
            setState(
              data.results.length === 0
                ? { kind: 'empty', query: trimmed }
                : { kind: 'list', query: trimmed, results: data.results }
            );
          }
        })
        .catch((e: unknown) => {
          if (myId !== reqId.current) return;
          setState({
            kind: 'error',
            query: trimmed,
            message: e instanceof Error ? e.message : 'Unknown error',
          });
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const handleSelect = useCallback((code: string) => {
    setQuery(code);
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 pt-14 md:pt-20 pb-16">
      <header className="mb-16 md:mb-24 flex items-baseline gap-2.5">
        <span aria-hidden className="text-[color:var(--brass)] text-xs">
          ❖
        </span>
        <span className="font-display text-base leading-none text-[color:var(--paper-bright)]">
          LOINC
          <span className="font-medium text-[color:var(--paper-muted)]"> / search</span>
        </span>
      </header>

      <section>
        <h1 className="font-display-tight text-5xl md:text-6xl leading-[0.92] text-[color:var(--paper-bright)]">
          LOINC code
          <span className="text-[color:var(--brass)]"> search</span>
        </h1>
        <p className="mt-6 max-w-xl text-sm leading-relaxed text-[color:var(--paper-muted)]">
          Search the codebook by name, synonym, or LOINC number. Active records
          only — deprecated codes redirect to their current replacement.
        </p>
      </section>

      <div className="mt-12 md:mt-16">
        <SearchInput value={query} onValueChange={setQuery} />
      </div>

      <section className="mt-12 md:mt-16">
        {state.kind === 'loading' && (
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-[color:var(--paper-muted)]">
            Searching
            <span aria-hidden className="inline-flex gap-1">
              <span
                className="animate-blink h-1 w-1 rounded-full bg-[color:var(--brass)]"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="animate-blink h-1 w-1 rounded-full bg-[color:var(--brass)]"
                style={{ animationDelay: '180ms' }}
              />
              <span
                className="animate-blink h-1 w-1 rounded-full bg-[color:var(--brass)]"
                style={{ animationDelay: '360ms' }}
              />
            </span>
          </p>
        )}
        {state.kind === 'empty' && <EmptyState query={state.query} />}
        {state.kind === 'error' && <ErrorState message={state.message} />}
        {state.kind === 'list' && (
          <ResultsList results={state.results} onSelect={handleSelect} />
        )}
        {state.kind === 'single' && <SingleResultView result={state.result} />}
      </section>
    </main>
  );
}
