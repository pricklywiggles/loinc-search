export function EmptyState({ query }: { query: string }) {
  return (
    <p className="font-display text-xl md:text-2xl text-[color:var(--paper-muted)]">
      Nothing matches{' '}
      <span className="text-[color:var(--paper-bright)]">
        &ldquo;{query}&rdquo;
      </span>
      .
    </p>
  );
}
