import type { IsoDate } from '@/lib/calendar';
import { ApiError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import {
  HOUSEHOLD_TEXT,
  makeEntryRow,
  makePostgrestError,
  makePostgrestFetchError,
} from '@/test/factories';

import { clearEntry, fetchRecentLibraryMealIds, fetchWeek, saveEntry } from './api';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

beforeEach(() => jest.clearAllMocks());

const METHODS = [
  'select',
  'upsert',
  'delete',
  'eq',
  'gte',
  'lte',
  'not',
  'order',
  'limit',
] as const;

type Builder = Record<(typeof METHODS)[number], jest.Mock> & PromiseLike<unknown>;

// A chainable stub of the query builder (4-test-plan §8.4). Every method returns the builder, which
// resolves to the response when awaited, as postgrest-js's builder does.
function stubQuery(response: { data: unknown; error: unknown; status: number }): Builder {
  const then: Builder['then'] = (resolve, reject) =>
    Promise.resolve(response).then(resolve, reject);
  const methods = Object.fromEntries(METHODS.map((method) => [method, jest.fn(() => builder)]));
  const builder = { ...methods, then } as Builder;
  jest.mocked(supabase.from).mockReturnValue(builder as never);
  return builder;
}

const SLOT = {
  householdId: 'household-1',
  date: '2026-10-22' as IsoDate,
  mealType: 'dinner',
} as const;

describe('fetchWeek', () => {
  it("U-MAPI-01 selects the entry columns for the household's dates in the week", async () => {
    const rows = [makeEntryRow({ id: 'entry-1' }), makeEntryRow({ id: 'entry-2' })];
    const builder = stubQuery({ data: rows, error: null, status: 200 });

    await expect(
      fetchWeek('household-1', '2026-10-19' as IsoDate, '2026-10-25' as IsoDate),
    ).resolves.toEqual(rows);

    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.from).toHaveBeenCalledWith('meal_entries');
    expect(builder.select).toHaveBeenCalledWith(
      'id, meal_date, meal_type, body, library_meal_id, updated_at',
    );
    expect(builder.eq.mock.calls).toEqual([['household_id', 'household-1']]);
    expect(builder.gte.mock.calls).toEqual([['meal_date', '2026-10-19']]);
    expect(builder.lte.mock.calls).toEqual([['meal_date', '2026-10-25']]);
  });
});

describe('saveEntry', () => {
  it('U-MAPI-02 upserts exactly the slot key, body and link, on the slot key', async () => {
    const builder = stubQuery({ data: null, error: null, status: 201 });

    await saveEntry({ ...SLOT, body: 'Tacos', libraryMealId: 'meal-3' });

    expect(supabase.from).toHaveBeenCalledWith('meal_entries');
    // toStrictEqual fails on any extra key, such as id, created_by or updated_at.
    expect(builder.upsert.mock.calls).toStrictEqual([
      [
        {
          household_id: 'household-1',
          meal_date: '2026-10-22',
          meal_type: 'dinner',
          body: 'Tacos',
          library_meal_id: 'meal-3',
        },
        { onConflict: 'household_id,meal_date,meal_type' },
      ],
    ]);
  });

  it('U-MAPI-02 sends a null link for typed text, so an edit clears an old one (DD-R10)', async () => {
    const builder = stubQuery({ data: null, error: null, status: 201 });

    await saveEntry({ ...SLOT, body: 'Leftovers', libraryMealId: null });

    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Leftovers', library_meal_id: null }),
      { onConflict: 'household_id,meal_date,meal_type' },
    );
  });
});

describe('fetchRecentLibraryMealIds', () => {
  it("selects the household's linked entries, newest change first, capped at 40", async () => {
    const builder = stubQuery({
      data: [{ library_meal_id: 'meal-2' }, { library_meal_id: 'meal-1' }],
      error: null,
      status: 200,
    });

    await expect(fetchRecentLibraryMealIds('household-1')).resolves.toEqual(['meal-2', 'meal-1']);

    expect(supabase.from).toHaveBeenCalledWith('meal_entries');
    expect(builder.select).toHaveBeenCalledWith('library_meal_id');
    expect(builder.eq.mock.calls).toEqual([['household_id', 'household-1']]);
    expect(builder.not.mock.calls).toEqual([['library_meal_id', 'is', null]]);
    expect(builder.order.mock.calls).toEqual([['updated_at', { ascending: false }]]);
    expect(builder.limit.mock.calls).toEqual([[40]]);
  });

  it('keeps repeats in order and drops a null link', async () => {
    stubQuery({
      data: [
        { library_meal_id: 'meal-1' },
        { library_meal_id: null },
        { library_meal_id: 'meal-2' },
        { library_meal_id: 'meal-1' },
      ],
      error: null,
      status: 200,
    });

    await expect(fetchRecentLibraryMealIds('household-1')).resolves.toEqual([
      'meal-1',
      'meal-2',
      'meal-1',
    ]);
  });
});

describe('clearEntry', () => {
  it('U-MAPI-03 deletes by all three slot key columns', async () => {
    const builder = stubQuery({ data: null, error: null, status: 204 });

    await clearEntry(SLOT);

    expect(supabase.from).toHaveBeenCalledWith('meal_entries');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq.mock.calls).toEqual([
      ['household_id', 'household-1'],
      ['meal_date', '2026-10-22'],
      ['meal_type', 'dinner'],
    ]);
  });

  it('U-MAPI-04 resolves when no row was deleted, because the slot is already empty', async () => {
    stubQuery({ data: null, error: null, status: 204 });

    await expect(clearEntry(SLOT)).resolves.toBeUndefined();
  });
});

describe('failures', () => {
  const CALLS = [
    [
      'fetchWeek',
      () => fetchWeek('household-1', '2026-10-19' as IsoDate, '2026-10-25' as IsoDate),
      'select',
    ],
    ['saveEntry', () => saveEntry({ ...SLOT, body: 'Tacos', libraryMealId: null }), 'upsert'],
    ['clearEntry', () => clearEntry(SLOT), 'delete'],
    ['fetchRecentLibraryMealIds', () => fetchRecentLibraryMealIds('household-1'), 'select'],
  ] as const;

  it.each(CALLS)(
    'U-MAPI-05 %s throws an ApiError with its table and operation, and no server text',
    async (_, call, operation) => {
      stubQuery({ data: null, error: makePostgrestError('42501'), status: 403 });

      const error = await call().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        category: 'forbidden',
        meta: { code: '42501', status: 403, table: 'meal_entries', operation },
      });
      const { message, stack } = error as ApiError;
      expect([message, stack, JSON.stringify(error)].join('\n')).not.toContain(HOUSEHOLD_TEXT);
    },
  );

  it('U-MAPI-05 drops the meal text from a CHECK error', async () => {
    stubQuery({
      data: null,
      error: {
        code: '23514',
        message: 'new row for relation "meal_entries" violates check constraint near "Tacos "',
        details: 'Failing row contains (entry-1, household-1, 2026-10-22, dinner, Tacos ).',
        hint: 'Trim "Tacos ".',
      },
      status: 400,
    });

    const error = await saveEntry({ ...SLOT, body: 'Tacos ', libraryMealId: null }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      category: 'validation',
      meta: { code: '23514', table: 'meal_entries', operation: 'upsert' },
    });
    const { message, stack } = error as ApiError;
    expect([message, stack, JSON.stringify(error)].join('\n')).not.toContain('Tacos');
  });

  it('U-MAPI-05 classifies a failed request as network', async () => {
    const offline = makePostgrestFetchError(new TypeError('Network request failed'));
    stubQuery({ data: null, error: offline, status: 0 });

    await expect(saveEntry({ ...SLOT, body: 'Tacos', libraryMealId: null })).rejects.toMatchObject({
      category: 'network',
      meta: { table: 'meal_entries', operation: 'upsert' },
    });
  });
});
