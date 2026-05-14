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
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-900">LOINC Search</h1>
        <p className="mt-1 text-sm text-gray-600">
          Search by name, synonym, or LOINC code. ACTIVE results only — paste a deprecated
          code to redirect to its active replacement.
        </p>
      </header>

      <SearchInput onChange={fetchFor} />

      <section className="mt-6">
        {state.kind === 'idle' && <EmptyState query="" />}
        {state.kind === 'loading' && (
          <p className="text-sm text-gray-500">Searching…</p>
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
