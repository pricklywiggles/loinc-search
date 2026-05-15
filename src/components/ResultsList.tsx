import type { SearchResult } from '@/types/loinc';
import { ResultCard } from './ResultCard';

export function ResultsList({
  results,
  onSelect,
}: {
  results: SearchResult[];
  onSelect: (code: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[color:var(--paper-muted)]">
        <span className="font-display text-base normal-case tracking-normal text-[color:var(--brass)]">
          {results.length}
        </span>{' '}
        result{results.length === 1 ? '' : 's'}
      </p>
      <ol className="border-b border-[color:var(--rule)]">
        {results.map((r, i) => (
          <li key={r.loinc_num}>
            <ResultCard result={r} onSelect={onSelect} index={i} />
          </li>
        ))}
      </ol>
    </div>
  );
}
