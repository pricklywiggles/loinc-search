import type { LoincStatus } from '@/types/loinc';

const GLYPH: Record<LoincStatus, string> = {
  ACTIVE: '●',
  TRIAL: '▲',
  DEPRECATED: '■',
  DISCOURAGED: '◆',
};

const COLOR: Record<LoincStatus, string> = {
  ACTIVE: 'text-[color:var(--color-status-active)]',
  TRIAL: 'text-[color:var(--color-status-trial)]',
  DEPRECATED: 'text-[color:var(--color-status-deprecated)]',
  DISCOURAGED: 'text-[color:var(--color-status-discouraged)]',
};

export function StatusBadge({ status }: { status: LoincStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] ${COLOR[status]}`}
    >
      <span aria-hidden className="text-[8px] leading-none">
        {GLYPH[status]}
      </span>
      {status}
    </span>
  );
}
