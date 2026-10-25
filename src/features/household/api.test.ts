import { ApiError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { HOUSEHOLD_TEXT, makePostgrestError, makePostgrestFetchError } from '@/test/factories';

import { fetchMemberships, updateWeekStart } from './api';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

interface Builder {
  select: jest.Mock<Builder>;
  eq: jest.Mock<Builder>;
  order: jest.Mock<Builder>;
  limit: jest.Mock<Promise<unknown>>;
}

interface UpdateBuilder {
  update: jest.Mock<UpdateBuilder>;
  eq: jest.Mock<UpdateBuilder>;
  select: jest.Mock<Promise<unknown>>;
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

// The update chain ends at `select`, which asks for the updated rows back.
function stubUpdate(response: { data: unknown; error: unknown; status: number }) {
  const builder: UpdateBuilder = {
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    select: jest.fn(() => Promise.resolve(response)),
  };
  jest.mocked(supabase.from).mockReturnValue(builder as never);
  return builder;
}

const ROW = {
  household_id: 'household-1',
  display_name: 'Member A',
  created_at: '2026-01-01T00:00:00Z',
  household: {
    id: 'household-1',
    name: 'Household One',
    time_zone: 'America/Denver',
    week_start: 'monday',
  },
};

describe('fetchMemberships', () => {
  it("asks for the member's own two oldest memberships, with their households", async () => {
    const builder = stubQuery({ data: [], error: null, status: 200 });

    await fetchMemberships('user-a');

    expect(supabase.from).toHaveBeenCalledWith('household_members');
    expect(builder.select).toHaveBeenCalledWith(
      'household_id, display_name, created_at, household:households(id, name, time_zone, week_start)',
    );
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-a');
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(builder.limit).toHaveBeenCalledWith(2);
  });

  it('U-HH-07 maps each row, keeping the order, with the start of the week', async () => {
    const newer = {
      ...ROW,
      household_id: 'household-2',
      display_name: 'Member B',
      household: {
        id: 'household-2',
        name: 'Household Two',
        time_zone: 'UTC',
        week_start: 'sunday',
      },
    };
    stubQuery({ data: [ROW, newer], error: null, status: 200 });

    await expect(fetchMemberships('user-a')).resolves.toEqual([
      {
        household: {
          id: 'household-1',
          name: 'Household One',
          timeZone: 'America/Denver',
          weekStart: 0,
        },
        displayName: 'Member A',
      },
      {
        household: { id: 'household-2', name: 'Household Two', timeZone: 'UTC', weekStart: 6 },
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

describe('fetchMemberships: the start of the week', () => {
  it('U-HH-07 maps a value this build doesn’t know to null (R48.11)', async () => {
    stubQuery({
      data: [{ ...ROW, household: { ...ROW.household, week_start: 'funday' } }],
      error: null,
      status: 200,
    });

    const [membership] = await fetchMemberships('user-a');

    expect(membership?.household.weekStart).toBeNull();
  });
});

describe('updateWeekStart', () => {
  it('U-HH-08 sends only the day’s name, for the one household (R48.4)', async () => {
    const builder = stubUpdate({ data: [{ id: 'household-1' }], error: null, status: 200 });

    await updateWeekStart('household-1', 6);

    expect(supabase.from).toHaveBeenCalledWith('households');
    expect(builder.update).toHaveBeenCalledWith({ week_start: 'sunday' });
    expect(builder.eq).toHaveBeenCalledWith('id', 'household-1');
    expect(builder.select).toHaveBeenCalledWith('id');
  });

  it('U-HH-09 throws forbidden when no row comes back', async () => {
    stubUpdate({ data: [], error: null, status: 200 });

    await expect(updateWeekStart('household-2', 6)).rejects.toMatchObject({
      category: 'forbidden',
      meta: { table: 'households', operation: 'update' },
    });
  });

  it('U-HH-09 throws a classified ApiError without server text', async () => {
    stubUpdate({ data: null, error: makePostgrestError('23514'), status: 400 });

    const error = await updateWeekStart('household-1', 6).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      category: 'validation',
      meta: { code: '23514', status: 400, table: 'households', operation: 'update' },
    });
    expect(JSON.stringify(error)).not.toContain(HOUSEHOLD_TEXT);
  });
});
