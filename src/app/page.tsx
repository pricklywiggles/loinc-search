'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ResultsList } from '@/components/ResultsList';
import { SearchInput, LOINC_CODE_RE } from '@/components/SearchInput';
import { SingleResultView } from '@/components/SingleResultView';
import type { LookupResult, SearchResult } from '@/types/loinc';

type UnitFilter = { unit: string; applied: boolean };

type State =
  | { kind: 'idle' }
  | { kind: 'loading'; query: string }
  | {
      kind: 'list';
      query: string;
      results: SearchResult[];
      unitFilter?: UnitFilter;
    }
  | { kind: 'single'; query: string; result: LookupResult }
  | { kind: 'empty'; query: string; unitFilter?: UnitFilter }
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
      // `unit` is read straight from the URL — no UI affords editing it, but
      // a manually-appended ?unit=ng/mL still threads through to the API and
      // shows up in the filter chip below results.
      const currentUrl = new URL(window.location.href);
      const unit = currentUrl.searchParams.get('unit')?.trim() ?? '';
      if (trimmed) currentUrl.searchParams.set('q', trimmed);
      else currentUrl.searchParams.delete('q');
      window.history.replaceState(null, '', currentUrl);

      if (!trimmed) {
        setState({ kind: 'idle' });
        return;
      }
      const myId = ++reqId.current;
      setState({ kind: 'loading', query: trimmed });

      const isCode = LOINC_CODE_RE.test(trimmed);
      const params = new URLSearchParams({ q: trimmed });
      // Codes resolve via /api/loinc which has no unit-aware variant; sending
      // the hint there would be silently dropped, so we just skip it.
      if (unit && !isCode) params.set('unit', unit);
      const endpoint = isCode
        ? `/api/loinc?code=${encodeURIComponent(trimmed)}`
        : `/api/search?${params.toString()}`;

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
            const data = (await res.json()) as {
              results: SearchResult[];
              unitFilterApplied?: boolean;
            };
            if (myId !== reqId.current) return;
            const unitFilter: UnitFilter | undefined =
              unit && data.unitFilterApplied !== undefined
                ? { unit, applied: data.unitFilterApplied }
                : undefined;
            setState(
              data.results.length === 0
                ? { kind: 'empty', query: trimmed, unitFilter }
                : {
                    kind: 'list',
                    query: trimmed,
                    results: data.results,
                    unitFilter,
                  }
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
        {(state.kind === 'list' || state.kind === 'empty') &&
          state.unitFilter && (
            <p className="mb-4 flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-[color:var(--paper-muted)]">
              <span>Unit filter</span>
              <span className="rounded-full border border-[color:var(--rule-strong)] px-2 py-0.5 normal-case tracking-normal text-[color:var(--paper-bright)]">
                {state.unitFilter.unit}
              </span>
              {!state.unitFilter.applied && (
                <span className="normal-case tracking-normal text-[color:var(--paper-muted)]">
                  — no matches, showing unfiltered
                </span>
              )}
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
