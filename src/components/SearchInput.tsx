'use client';

import { useEffect, useState } from 'react';

export const LOINC_CODE_RE = /^\d{1,7}-\d$/;

export function SearchInput({
  onChange,
  initial = '',
  debounceMs = 250,
}: {
  onChange: (q: string) => void;
  initial?: string;
  debounceMs?: number;
}) {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    const trimmed = value.trim();
    const id = setTimeout(() => onChange(trimmed), debounceMs);
    return () => clearTimeout(id);
  }, [value, debounceMs, onChange]);

  return (
    <div className="relative">
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search by name, synonym, or LOINC code (e.g. 98979-8)"
        autoFocus
        spellCheck={false}
        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 shadow-sm focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300"
      />
    </div>
  );
}
