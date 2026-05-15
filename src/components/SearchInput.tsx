'use client';

import { useEffect, useRef, useState } from 'react';

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const trimmed = value.trim();
    const id = setTimeout(() => onChange(trimmed), debounceMs);
    return () => clearTimeout(id);
  }, [value, debounceMs, onChange]);

  return (
    <div className="flex items-center gap-3 rounded-full border border-[color:var(--rule-strong)] bg-[color:var(--ink-raised)] pl-6 pr-3 py-3 md:py-4 transition-colors duration-200 focus-within:border-[color:var(--brass)]">
      <SearchGlyph />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        spellCheck={false}
        aria-label="Search LOINC by name, synonym, or code"
        className="min-w-0 flex-1 border-0 bg-transparent py-1 text-lg md:text-xl text-[color:var(--paper-bright)] caret-[color:var(--brass)] focus:outline-none focus-visible:outline-none focus:ring-0"
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setValue('');
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--rule-strong)] text-[color:var(--paper-muted)] transition-colors duration-150 hover:border-[color:var(--brass)] hover:text-[color:var(--brass)] focus-visible:border-[color:var(--brass)] focus-visible:text-[color:var(--brass)] focus-visible:outline-none"
        >
          <ClearGlyph />
        </button>
      )}
    </div>
  );
}

function SearchGlyph() {
  return (
    <svg
      aria-hidden
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-[color:var(--brass)]"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <line x1="20" y1="20" x2="15.5" y2="15.5" />
    </svg>
  );
}

function ClearGlyph() {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}
