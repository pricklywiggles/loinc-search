import type { LookupResult } from '@/types/loinc';
import { StatusBadge } from './StatusBadge';

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="border-t border-[color:var(--rule)] pt-3">
      <dt className="text-[10px] font-medium uppercase tracking-[0.2em] text-[color:var(--paper-muted)]">
        {label}
      </dt>
      <dd
        className={`mt-1.5 text-[color:var(--paper-bright)] ${
          mono ? 'font-mono text-sm' : 'text-base'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export function SingleResultView({ result }: { result: LookupResult }) {
  return (
    <article className="animate-rise">
      {result.deprecated_alias && (
        <aside className="mb-8 border-l-2 border-[color:var(--ochre)] pl-4 py-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--ochre)]">
            Redirected from deprecated code
          </p>
          <p className="mt-1.5 text-base text-[color:var(--paper-bright)]">
            <span className="font-mono text-[color:var(--paper-muted)]">
              {result.deprecated_alias.source_code}
            </span>{' '}
            <span className="text-[color:var(--paper)]">
              is no longer maintained. The active replacement is
            </span>{' '}
            <span className="font-mono text-[color:var(--brass)]">
              {result.loinc_num}
            </span>
            .
          </p>
          {result.deprecated_alias.comment && (
            <p className="mt-2 text-sm text-[color:var(--paper-muted)]">
              {result.deprecated_alias.comment}
            </p>
          )}
        </aside>
      )}

      {result.status === 'TRIAL' && (
        <aside className="mb-8 border-l-2 border-[color:var(--ochre)] pl-4 py-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--ochre)]">
            Trial code
          </p>
          <p className="mt-1.5 text-base text-[color:var(--paper-bright)]">
            Under evaluation — may change before becoming active.
          </p>
        </aside>
      )}

      <div className="flex items-center justify-between gap-4">
        <span className="font-mono text-xl text-[color:var(--brass)] tabular-nums">
          {result.loinc_num}
        </span>
        <StatusBadge status={result.status} />
      </div>

      <h1 className="font-display-tight mt-3 text-3xl md:text-5xl leading-[1] text-[color:var(--paper-bright)]">
        {result.long_common_name ?? result.component}
      </h1>
      {result.shortname && (
        <p className="mt-3 text-base text-[color:var(--paper-muted)]">
          {result.shortname}
        </p>
      )}

      {result.definition && (
        <blockquote className="my-10 border-l-2 border-[color:var(--brass)] pl-6 md:pl-8 md:ml-4">
          <p className="text-lg md:text-xl leading-relaxed text-[color:var(--paper)]">
            {result.definition}
          </p>
        </blockquote>
      )}

      <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-5 md:grid-cols-3">
        <Field label="Component" value={result.component} />
        <Field label="Property" value={result.property} />
        <Field label="Time aspect" value={result.time_aspct} />
        <Field label="System" value={result.system} />
        <Field label="Scale" value={result.scale_typ} />
        <Field label="Method" value={result.method_typ} />
        <Field label="Class" value={result.class} />
        <Field label="Example units" value={result.example_units} />
        <Field label="UCUM units" value={result.ucum_units} mono />
        <Field label="First released" value={result.version_first_released} />
        <Field label="Last changed" value={result.version_last_changed} />
      </dl>

      {result.consumer_names.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--paper-muted)]">
            Also known as
          </h2>
          <ul className="mt-3 flex flex-wrap gap-x-2 gap-y-2">
            {result.consumer_names.map((n) => (
              <li
                key={n}
                className="rounded-sm border border-[color:var(--rule-strong)] px-2.5 py-1 text-sm text-[color:var(--paper-bright)]"
              >
                {n}
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.related_names && (
        <section className="mt-10">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--paper-muted)]">
            Related names
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[color:var(--paper)]">
            {result.related_names}
          </p>
        </section>
      )}

      {result.external_copyright_notice && (
        <section className="mt-12 border-t border-[color:var(--rule)] pt-6">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--paper-muted)]">
            Third-party copyright
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--paper)]">
            {result.external_copyright_notice}
          </p>
          <p className="mt-2 text-xs text-[color:var(--paper-muted)]">
            Use of this record is subject to the third-party copyright
            owner&rsquo;s terms.
          </p>
        </section>
      )}
    </article>
  );
}
