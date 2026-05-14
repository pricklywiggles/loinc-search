import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mx-auto mt-12 w-full max-w-4xl border-t border-gray-200 px-4 py-6 text-xs text-gray-500">
      <p>
        This material contains content from{' '}
        <a
          href="https://loinc.org"
          target="_blank"
          rel="noreferrer noopener"
          className="underline hover:text-gray-700"
        >
          LOINC
        </a>
        . LOINC is copyright &copy; Regenstrief Institute, Inc. and the LOINC Committee
        and is available at no cost under the license at{' '}
        <a
          href="https://loinc.org/license"
          target="_blank"
          rel="noreferrer noopener"
          className="underline hover:text-gray-700"
        >
          loinc.org/license
        </a>
        . LOINC&reg; is a registered trademark of Regenstrief Institute, Inc.
      </p>
      <p className="mt-2">
        <Link href="/about" className="underline hover:text-gray-700">
          Licensing &amp; attributions
        </Link>
      </p>
    </footer>
  );
}
