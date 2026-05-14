export function EmptyState({ query }: { query: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
      {query ? (
        <>No results for <span className="font-medium text-gray-700">“{query}”</span>.</>
      ) : (
        'Type a search term or paste a LOINC code (e.g. 98979-8).'
      )}
    </div>
  );
}
