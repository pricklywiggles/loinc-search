import type { SearchResult } from '@/types/loinc';
import { StatusBadge } from './StatusBadge';

export function ResultCard({
  result,
  onSelect,
  index = 0,
}: {
  result: SearchResult;
  onSelect: (code: string) => void;
  index?: number;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(result.loinc_num)}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
      className="animate-rise group relative block w-full border-t border-[color:var(--rule)] py-5 text-left transition-colors duration-200 ease-out hover:border-[color:var(--brass)] focus:border-[color:var(--brass)] focus:outline-none"
    >
      <div className="flex items-baseline justify-between gap-6">
        <span className="font-mono text-base text-[color:var(--paper-muted)] tabular-nums transition-colors duration-200 group-hover:text-[color:var(--brass)] group-focus:text-[color:var(--brass)]">
          {result.loinc_num}
        </span>
        <span className="flex items-center gap-3">
          <StatusBadge status={result.status} />
          <span
            aria-hidden
            className="text-[color:var(--brass)] opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus:opacity-100"
          >
            →
          </span>
        </span>
      </div>
      <h3 className="font-display mt-1.5 text-lg md:text-xl leading-tight text-[color:var(--paper-bright)]">
        {result.long_common_name ?? result.component}
      </h3>
      {result.shortname && (
        <p className="mt-1 text-sm text-[color:var(--paper-muted)]">
          {result.shortname}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] uppercase tracking-[0.14em] text-[color:var(--paper-muted)]">
        <span>
          <span className="text-[color:var(--paper-muted)]/70">system</span>{' '}
          <span className="text-[color:var(--paper)]">
            {result.system || '—'}
          </span>
        </span>
        {result.example_units && (
          <span>
            <span className="text-[color:var(--paper-muted)]/70">units</span>{' '}
            <span className="text-[color:var(--paper)]">
              {result.example_units}
            </span>
          </span>
        )}
        {result.ucum_units && (
          <span>
            <span className="text-[color:var(--paper-muted)]/70">ucum</span>{' '}
            <span className="font-mono normal-case tracking-normal text-[color:var(--paper)]">
              {result.ucum_units}
            </span>
          </span>
        )}
      </div>
      {result.external_copyright_notice && (
        <p className="mt-2 line-clamp-2 text-xs text-[color:var(--paper-muted)]">
          {result.external_copyright_notice}
        </p>
      )}
    </button>
  );
}
