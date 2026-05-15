import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Licensing & attributions — LOINC Search',
  description:
    'Source code license, LOINC attribution, UCUM attribution, and disclaimer.',
};

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-2xl md:text-3xl leading-tight text-[color:var(--paper-bright)]">
      {children}
    </h2>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 text-[15px] leading-[1.75] text-[color:var(--paper)]">
      {children}
    </p>
  );
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-[color:var(--paper-bright)] underline decoration-[color:var(--rule-strong)] underline-offset-4 transition-colors hover:decoration-[color:var(--brass)] hover:text-[color:var(--brass-soft)]"
    >
      {children}
    </a>
  );
}

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 pt-14 md:pt-20 pb-16">
      <Link
        href="/"
        className="font-display text-sm font-medium text-[color:var(--paper-muted)] hover:text-[color:var(--brass-soft)]"
      >
        ← back to search
      </Link>

      <header className="mt-12 md:mt-16">
        <p className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--paper-muted)]">
          Colophon &amp; notices
        </p>
        <h1 className="font-display-tight mt-4 text-5xl md:text-7xl leading-[0.95] text-[color:var(--paper-bright)]">
          Licensing &amp;
          <br />
          <span className="text-[color:var(--brass)]">attributions</span>
        </h1>
      </header>

      <section className="mt-14">
        <SectionHead>Source code</SectionHead>
        <Paragraph>
          The source code for this application is released under the MIT
          License, available in the{' '}
          <ExternalLink href="https://github.com/pricklywiggles/loinc-search/blob/main/LICENSE">
            LICENSE
          </ExternalLink>{' '}
          file. The MIT license applies only to the source code, not to the
          LOINC or UCUM content this application surfaces.
        </Paragraph>
      </section>

      <section className="mt-12">
        <SectionHead>LOINC</SectionHead>
        <Paragraph>
          This material contains content from{' '}
          <ExternalLink href="https://loinc.org">LOINC</ExternalLink>. LOINC is
          copyright &copy; Regenstrief Institute, Inc. and the Logical
          Observation Identifiers Names and Codes (LOINC) Committee and is
          available at no cost under the license at{' '}
          <ExternalLink href="https://loinc.org/license">
            loinc.org/license
          </ExternalLink>
          . LOINC&reg; is a registered United States trademark of Regenstrief
          Institute, Inc.
        </Paragraph>
        <Paragraph>
          Some individual LOINC records carry an additional third-party
          copyright notice. Where those records appear in this
          application&rsquo;s search or lookup results, the per-record notice
          is rendered alongside the record&rsquo;s display name. Use of those
          records is also subject to the third-party copyright owner&rsquo;s
          terms.
        </Paragraph>
      </section>

      <section className="mt-12">
        <SectionHead>UCUM</SectionHead>
        <Paragraph>
          This product includes all or a portion of the UCUM table, UCUM codes,
          and UCUM definitions or is derived from it, subject to a license from
          Regenstrief Institute, Inc. Your use of the UCUM table, UCUM codes,
          and UCUM definitions is also subject to this license, a copy of which
          is available at{' '}
          <ExternalLink href="http://unitsofmeasure.org">
            unitsofmeasure.org
          </ExternalLink>
          . The UCUM table and UCUM codes are copyright &copy; 1995&ndash;2024
          Regenstrief Institute, Inc. and the Unified Codes for Units of
          Measures (UCUM) Organization. All rights reserved. The UCUM table (in
          all formats), UCUM definitions, and specification are provided
          &ldquo;as is&rdquo;. Any express or implied warranties are
          disclaimed, including, but not limited to, the implied warranties of
          merchantability and fitness for a particular purpose.
        </Paragraph>
      </section>

      <section className="mt-12 border-t border-[color:var(--rule)] pt-8">
        <SectionHead>Disclaimer</SectionHead>
        <Paragraph>
          This software and the LOINC content it surfaces are provided
          &ldquo;as is&rdquo;, without warranty of any kind. Do not rely on
          this software as the sole source of clinical or laboratory
          information. Neither the authors of this software nor Regenstrief
          Institute, Inc. accept liability for any omissions or errors.
        </Paragraph>
      </section>
    </main>
  );
}
