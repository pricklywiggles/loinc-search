import type { LoincStatus } from '@/types/loinc';

const STYLES: Record<LoincStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  TRIAL: 'bg-amber-100 text-amber-900 border-amber-400 ring-1 ring-amber-300',
  DEPRECATED: 'bg-red-100 text-red-900 border-red-300',
  DISCOURAGED: 'bg-gray-200 text-gray-800 border-gray-300',
};

export function StatusBadge({ status }: { status: LoincStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
