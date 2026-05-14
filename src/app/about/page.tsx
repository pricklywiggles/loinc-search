import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Licensing & attributions — LOINC Search',
  description:
    'Source code license, LOINC attribution, UCUM attribution, and disclaimer.',
};

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold text-gray-900">
        Licensing &amp; attributions
      </h1>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">Source code</h2>
        <p className="mt-2 text-sm text-gray-700">
          The source code for this application is released under the MIT License,
          available in the{' '}
          <a
            href="https://github.com/pricklywiggles/loinc-search/blob/main/LICENSE"
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-gray-900"
          >
            LICENSE
          </a>{' '}
          file. The MIT license applies only to the source code, not to the LOINC or
          UCUM content this application surfaces.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">LOINC attribution</h2>
        <p className="mt-2 text-sm text-gray-700">
          This material contains content from{' '}
          <a
            href="https://loinc.org"
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-gray-900"
          >
            LOINC
          </a>
          . LOINC is copyright &copy; Regenstrief Institute, Inc. and the Logical
          Observation Identifiers Names and Codes (LOINC) Committee and is available
          at no cost under the license at{' '}
          <a
            href="https://loinc.org/license"
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-gray-900"
          >
            loinc.org/license
          </a>
          . LOINC&reg; is a registered United States trademark of Regenstrief
          Institute, Inc.
        </p>
        <p className="mt-3 text-sm text-gray-700">
          Some individual LOINC records carry an additional third-party copyright
          notice. Where those records appear in this application&rsquo;s search or
          lookup results, the per-record notice is rendered alongside the
          record&rsquo;s display name. Use of those records is also subject to the
          third-party copyright owner&rsquo;s terms.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">UCUM attribution</h2>
        <p className="mt-2 text-sm text-gray-700">
          This product includes all or a portion of the UCUM table, UCUM codes, and
          UCUM definitions or is derived from it, subject to a license from
          Regenstrief Institute, Inc. Your use of the UCUM table, UCUM codes, and
          UCUM definitions is also subject to this license, a copy of which is
          available at{' '}
          <a
            href="http://unitsofmeasure.org"
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-gray-900"
          >
            unitsofmeasure.org
          </a>
          . The UCUM table and UCUM codes are copyright &copy; 1995&ndash;2024
          Regenstrief Institute, Inc. and the Unified Codes for Units of Measures
          (UCUM) Organization. All rights reserved. The UCUM table (in all formats),
          UCUM definitions, and specification are provided &ldquo;as is&rdquo;. Any
          express or implied warranties are disclaimed, including, but not limited
          to, the implied warranties of merchantability and fitness for a particular
          purpose.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">Disclaimer</h2>
        <p className="mt-2 text-sm text-gray-700">
          This software and the LOINC content it surfaces are provided &ldquo;as
          is&rdquo;, without warranty of any kind. Do not rely on this software as
          the sole source of clinical or laboratory information. Neither the authors
          of this software nor Regenstrief Institute, Inc. accept liability for any
          omissions or errors.
        </p>
      </section>
    </main>
  );
}
