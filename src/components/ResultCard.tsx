import type { SearchResult } from '@/types/loinc';
import { StatusBadge } from './StatusBadge';

export function ResultCard({
  result,
  onSelect,
}: {
  result: SearchResult;
  onSelect: (code: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(result.loinc_num)}
      className="w-full rounded-lg border border-gray-200 bg-white p-4 text-left transition hover:border-gray-400 hover:shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-sm text-gray-700">{result.loinc_num}</span>
        <StatusBadge status={result.status} />
      </div>
      <h3 className="mt-1 text-base font-semibold text-gray-900">
        {result.long_common_name ?? result.component}
      </h3>
      {result.shortname && (
        <p className="mt-1 text-sm text-gray-600">{result.shortname}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>System: {result.system || '—'}</span>
        {result.example_units && <span>Units: {result.example_units}</span>}
        {result.ucum_units && <span>UCUM: {result.ucum_units}</span>}
      </div>
      {result.external_copyright_notice && (
        <p className="mt-2 line-clamp-2 text-xs text-gray-500 italic">
          {result.external_copyright_notice}
        </p>
      )}
    </button>
  );
}
