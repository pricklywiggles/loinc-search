declare module 'pg-copy-streams' {
  import type { Writable, Readable } from 'node:stream';
  import type { Submittable } from 'pg';

  type CopyStreamQuery = Writable & Submittable;
  type CopyToStreamQuery = Readable & Submittable;

  export function from(sql: string): CopyStreamQuery;
  export function to(sql: string): CopyToStreamQuery;
}
