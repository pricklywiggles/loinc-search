import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  sql: vi.fn(),
}));

import { sql } from '@/lib/db';
import { GET as loincGET } from './route';

const mockSql = vi.mocked(sql);

function req(path: string): Request {
  return new Request(`http://test.local${path}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/loinc batch path', () => {
  it('issues exactly one DB query for a batch of codes', async () => {
    mockSql.mockResolvedValue([] as unknown as never);
    const res = await loincGET(
      req('/api/loinc?code=98979-8&code=1234-5&code=5678-9')
    );
    expect(res.status).toBe(200);
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it('issues exactly one DB query for the single-input path too', async () => {
    mockSql.mockResolvedValue([] as unknown as never);
    await loincGET(req('/api/loinc?code=98979-8'));
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it('skips the DB entirely when every code is invalid', async () => {
    mockSql.mockResolvedValue([] as unknown as never);
    const res = await loincGET(req('/api/loinc?code=bad&code=alsobad'));
    expect(res.status).toBe(200);
    expect(mockSql).not.toHaveBeenCalled();
  });
});
