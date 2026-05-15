'use client';

import { useCallback, useRef, useState } from 'react';
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

export default function Home() {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const reqId = useRef(0);

  const fetchFor = useCallback(async (query: string) => {
    if (!query) {
      setState({ kind: 'idle' });
      return;
    }
    const myId = ++reqId.current;
    setState({ kind: 'loading', query });

    try {
      if (LOINC_CODE_RE.test(query)) {
        const res = await fetch(`/api/loinc?code=${encodeURIComponent(query)}`);
        if (myId !== reqId.current) return;
        if (res.status === 404) {
          setState({ kind: 'empty', query });
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as LookupResult;
        setState({ kind: 'single', query, result: data });
        return;
      }

      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (myId !== reqId.current) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SearchResult[];
      if (data.length === 0) {
        setState({ kind: 'empty', query });
      } else {
        setState({ kind: 'list', query, results: data });
      }
    } catch (e) {
      if (myId !== reqId.current) return;
      setState({
        kind: 'error',
        query,
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    }
  }, []);

  const handleSelect = useCallback(
    (code: string) => {
      void fetchFor(code);
    },
    [fetchFor]
  );

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
        <SearchInput onChange={fetchFor} />
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
