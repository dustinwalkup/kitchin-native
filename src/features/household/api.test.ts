import { ApiError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { HOUSEHOLD_TEXT, makePostgrestError, makePostgrestFetchError } from '@/test/factories';

import { fetchMemberships } from './api';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

interface Builder {
  select: jest.Mock<Builder>;
  eq: jest.Mock<Builder>;
  order: jest.Mock<Builder>;
  limit: jest.Mock<Promise<unknown>>;
}

// A small chainable stub of the query builder (4-test-plan §8.4). The chain ends at `limit`.
function stubQuery(response: { data: unknown; error: unknown; status: number }) {
  const builder: Builder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => Promise.resolve(response)),
  };
  jest.mocked(supabase.from).mockReturnValue(builder as never);
  return builder;
}

const ROW = {
  household_id: 'household-1',
  display_name: 'Member A',
  created_at: '2026-01-01T00:00:00Z',
  household: { id: 'household-1', name: 'Household One', time_zone: 'America/Denver' },
};

describe('fetchMemberships', () => {
  it("asks for the member's own two oldest memberships, with their households", async () => {
    const builder = stubQuery({ data: [], error: null, status: 200 });

    await fetchMemberships('user-a');

    expect(supabase.from).toHaveBeenCalledWith('household_members');
    expect(builder.select).toHaveBeenCalledWith(
      'household_id, display_name, created_at, household:households(id, name, time_zone)',
    );
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-a');
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(builder.limit).toHaveBeenCalledWith(2);
  });

  it('maps each row, keeping the order', async () => {
    const newer = {
      ...ROW,
      household_id: 'household-2',
      display_name: 'Member B',
      household: { id: 'household-2', name: 'Household Two', time_zone: 'UTC' },
    };
    stubQuery({ data: [ROW, newer], error: null, status: 200 });

    await expect(fetchMemberships('user-a')).resolves.toEqual([
      {
        household: { id: 'household-1', name: 'Household One', timeZone: 'America/Denver' },
        displayName: 'Member A',
      },
      {
        household: { id: 'household-2', name: 'Household Two', timeZone: 'UTC' },
        displayName: 'Member B',
      },
    ]);
  });

  it('throws a classified ApiError that carries the response status', async () => {
    stubQuery({ data: null, error: makePostgrestError('42501'), status: 403 });

    const error = await fetchMemberships('user-a').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      category: 'forbidden',
      meta: { code: '42501', status: 403, table: 'household_members', operation: 'select' },
    });
    expect(JSON.stringify(error)).not.toContain(HOUSEHOLD_TEXT);
  });

  it('classifies a failed request as network', async () => {
    const offline = makePostgrestFetchError(new TypeError('Network request failed'));
    stubQuery({ data: null, error: offline, status: 0 });

    await expect(fetchMemberships('user-a')).rejects.toMatchObject({ category: 'network' });
  });
});
