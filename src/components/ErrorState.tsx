export function ErrorState({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="border-t-2 border-[color:var(--brick)] pt-4 pb-4"
    >
      <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--brick)]">
        Error
      </p>
      <p className="font-display mt-1.5 text-lg text-[color:var(--paper-bright)]">
        {message}
      </p>
    </div>
  );
}
