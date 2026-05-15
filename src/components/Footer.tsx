import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mx-auto mt-24 w-full max-w-3xl border-t border-[color:var(--rule)] px-6 py-8 text-[11px] leading-relaxed text-[color:var(--paper-muted)]">
      <p>
        Material from{' '}
        <a
          href="https://loinc.org"
          target="_blank"
          rel="noreferrer noopener"
          className="text-[color:var(--paper)] underline decoration-[color:var(--rule-strong)] underline-offset-4 transition-colors hover:decoration-[color:var(--brass)] hover:text-[color:var(--brass-soft)]"
        >
          LOINC
        </a>
        . LOINC is copyright &copy; Regenstrief Institute, Inc. and the LOINC
        Committee and is available at no cost under the license at{' '}
        <a
          href="https://loinc.org/license"
          target="_blank"
          rel="noreferrer noopener"
          className="text-[color:var(--paper)] underline decoration-[color:var(--rule-strong)] underline-offset-4 transition-colors hover:decoration-[color:var(--brass)] hover:text-[color:var(--brass-soft)]"
        >
          loinc.org/license
        </a>
        . LOINC&reg; is a registered trademark of Regenstrief Institute, Inc.
      </p>
      <p className="mt-3">
        <Link
          href="/about"
          className="text-[color:var(--paper)] underline decoration-[color:var(--rule-strong)] underline-offset-4 transition-colors hover:decoration-[color:var(--brass)] hover:text-[color:var(--brass-soft)]"
        >
          Licensing &amp; attributions
        </Link>
      </p>
    </footer>
  );
}
