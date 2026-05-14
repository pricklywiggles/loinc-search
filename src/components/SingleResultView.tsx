import type { LookupResult } from '@/types/loinc';
import { StatusBadge } from './StatusBadge';

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value}</dd>
    </div>
  );
}

export function SingleResultView({ result }: { result: LookupResult }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-6">
      {result.deprecated_alias && (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong className="font-semibold">Showing target of deprecated code.</strong>{' '}
          You looked up{' '}
          <span className="font-mono">{result.deprecated_alias.source_code}</span>; the
          active replacement is <span className="font-mono">{result.loinc_num}</span>.
          {result.deprecated_alias.comment && (
            <span className="block mt-1 text-amber-800">
              Note: {result.deprecated_alias.comment}
            </span>
          )}
        </div>
      )}

      {result.status === 'TRIAL' && (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong className="font-semibold">TRIAL</strong> — this code is under evaluation and
          may change before becoming ACTIVE.
        </div>
      )}

      <header className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-lg text-gray-900">{result.loinc_num}</span>
        <StatusBadge status={result.status} />
      </header>

      <h1 className="mt-2 text-2xl font-semibold text-gray-900">
        {result.long_common_name ?? result.component}
      </h1>
      {result.shortname && <p className="mt-1 text-gray-600">{result.shortname}</p>}

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
        <Field label="Component" value={result.component} />
        <Field label="Property" value={result.property} />
        <Field label="Time aspect" value={result.time_aspct} />
        <Field label="System" value={result.system} />
        <Field label="Scale" value={result.scale_typ} />
        <Field label="Method" value={result.method_typ} />
        <Field label="Class" value={result.class} />
        <Field label="Example units" value={result.example_units} />
        <Field label="UCUM units" value={result.ucum_units} />
        <Field label="First released" value={result.version_first_released} />
        <Field label="Last changed" value={result.version_last_changed} />
      </dl>

      {result.definition && (
        <div className="mt-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
            Definition
          </h2>
          <p className="mt-1 text-sm text-gray-900">{result.definition}</p>
        </div>
      )}

      {result.consumer_names.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
            Consumer names
          </h2>
          <ul className="mt-1 flex flex-wrap gap-2">
            {result.consumer_names.map((n) => (
              <li
                key={n}
                className="rounded bg-gray-100 px-2 py-0.5 text-sm text-gray-700"
              >
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.related_names && (
        <div className="mt-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
            Related names
          </h2>
          <p className="mt-1 text-sm text-gray-700">{result.related_names}</p>
        </div>
      )}

      {result.external_copyright_notice && (
        <div className="mt-6 rounded border border-gray-200 bg-gray-50 px-4 py-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Third-party copyright
          </h2>
          <p className="mt-1 text-sm text-gray-700">
            {result.external_copyright_notice}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Use of this record is subject to the third-party copyright owner&rsquo;s terms.
          </p>
        </div>
      )}
    </article>
  );
}
