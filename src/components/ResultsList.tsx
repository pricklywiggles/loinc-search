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
    <ul className="space-y-2">
      {results.map((r) => (
        <li key={r.loinc_num}>
          <ResultCard result={r} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  );
}
