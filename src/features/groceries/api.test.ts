import { ApiError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import {
  HOUSEHOLD_TEXT,
  makePostgrestError,
  makePostgrestFetchError,
  makeRow,
} from '@/test/factories';

import {
  clearCheckedItems,
  deleteItem,
  fetchList,
  insertItem,
  setItemChecked,
  setItemQuantity,
  uncheckAllItems,
  updateItemDetails,
} from './api';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));

beforeEach(() => jest.clearAllMocks());

const METHODS = [
  'select',
  'insert',
  'update',
  'delete',
  'eq',
  'not',
  'order',
  'limit',
  'single',
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

const ITEM = {
  id: 'item-1',
  householdId: 'household-1',
  listId: 'list-1',
  name: 'Milk',
  category: 'dairy',
  quantity: '2 cartons',
} as const;

describe('fetchList', () => {
  it('U-API-01 makes one request for the list with its items embedded', async () => {
    const rows = [makeRow({ id: 'item-1' }), makeRow({ id: 'item-2', name: 'Rice' })];
    const builder = stubQuery({
      data: { id: 'list-1', grocery_items: rows },
      error: null,
      status: 200,
    });

    await expect(fetchList('household-1')).resolves.toEqual({ listId: 'list-1', rows });

    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.from).toHaveBeenCalledWith('grocery_lists');
    expect(builder.select).toHaveBeenCalledWith(
      'id, grocery_items(id, list_id, name, category, quantity, is_checked, checked_at, created_at)',
    );
    expect(builder.eq).toHaveBeenCalledWith('household_id', 'household-1');
    expect(builder.order).toHaveBeenCalledWith('created_at');
    expect(builder.limit).toHaveBeenCalledWith(1);
    expect(builder.single).toHaveBeenCalled();
  });
});

describe('insertItem', () => {
  it('U-API-02 sends exactly the item columns, with no attribution or timestamps', async () => {
    const builder = stubQuery({ data: null, error: null, status: 201 });

    await insertItem(ITEM);

    expect(supabase.from).toHaveBeenCalledWith('grocery_items');
    expect(builder.insert.mock.calls).toStrictEqual([
      [
        {
          id: 'item-1',
          household_id: 'household-1',
          list_id: 'list-1',
          name: 'Milk',
          category: 'dairy',
          quantity: '2 cartons',
        },
      ],
    ]);
  });

  it('U-API-02 keeps the constraint name of a duplicate, which the mutation needs', async () => {
    stubQuery({
      data: null,
      error: makePostgrestError('23505', { constraint: 'grocery_items_one_open_per_name' }),
      status: 409,
    });

    await expect(insertItem(ITEM)).rejects.toMatchObject({
      category: 'conflict_duplicate',
      meta: { constraint: 'grocery_items_one_open_per_name', recordId: 'item-1' },
    });
  });
});

describe('setItemChecked', () => {
  it('U-API-03 sends only is_checked, for that item, and asks for the updated row back', async () => {
    const builder = stubQuery({ data: [{ id: 'item-1' }], error: null, status: 200 });

    await setItemChecked('item-1', true);

    expect(supabase.from).toHaveBeenCalledWith('grocery_items');
    expect(builder.update.mock.calls).toStrictEqual([[{ is_checked: true }]]);
    expect(builder.eq.mock.calls).toEqual([['id', 'item-1']]);
    expect(builder.select).toHaveBeenCalledWith('id');
  });

  it('U-API-03 sends false to uncheck, never a toggle', async () => {
    const builder = stubQuery({ data: [{ id: 'item-1' }], error: null, status: 200 });

    await setItemChecked('item-1', false);

    expect(builder.update.mock.calls).toStrictEqual([[{ is_checked: false }]]);
  });

  it('U-API-03 throws not_found when no row was updated', async () => {
    stubQuery({ data: [], error: null, status: 200 });

    const error = await setItemChecked('item-1', true).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      category: 'not_found',
      meta: { table: 'grocery_items', operation: 'update', recordId: 'item-1' },
    });
  });
});

describe('setItemQuantity', () => {
  it.each([['2 cartons'], [null]])('U-API-04 sends only quantity (%p)', async (quantity) => {
    const builder = stubQuery({ data: [{ id: 'item-1' }], error: null, status: 200 });

    await setItemQuantity('item-1', quantity);

    expect(builder.update.mock.calls).toStrictEqual([[{ quantity }]]);
    expect(builder.eq.mock.calls).toEqual([['id', 'item-1']]);
    expect(builder.select).toHaveBeenCalledWith('id');
  });

  it('U-API-04 throws not_found when no row was updated', async () => {
    stubQuery({ data: [], error: null, status: 200 });

    await expect(setItemQuantity('item-1', '3')).rejects.toMatchObject({
      category: 'not_found',
      meta: { recordId: 'item-1' },
    });
  });
});

describe('updateItemDetails', () => {
  it('sends only the fields it was given, for that item, and asks for the updated row back', async () => {
    const builder = stubQuery({ data: [{ id: 'item-1' }], error: null, status: 200 });

    await updateItemDetails('item-1', { name: 'Oat milk', category: 'beverages' });

    expect(supabase.from).toHaveBeenCalledWith('grocery_items');
    expect(builder.update.mock.calls).toStrictEqual([
      [{ name: 'Oat milk', category: 'beverages' }],
    ]);
    expect(builder.eq.mock.calls).toEqual([['id', 'item-1']]);
    expect(builder.select).toHaveBeenCalledWith('id');
  });

  it('sends a cleared quantity as null', async () => {
    const builder = stubQuery({ data: [{ id: 'item-1' }], error: null, status: 200 });

    await updateItemDetails('item-1', { quantity: null });

    expect(builder.update.mock.calls).toStrictEqual([[{ quantity: null }]]);
  });

  it('throws not_found when no row was updated, because another device deleted it', async () => {
    stubQuery({ data: [], error: null, status: 200 });

    await expect(updateItemDetails('item-1', { name: 'Rice' })).rejects.toMatchObject({
      category: 'not_found',
      meta: { table: 'grocery_items', operation: 'update', recordId: 'item-1' },
    });
  });

  it('keeps the constraint name of a duplicate open name, which the mutation needs', async () => {
    stubQuery({
      data: null,
      error: makePostgrestError('23505', { constraint: 'grocery_items_one_open_per_name' }),
      status: 409,
    });

    await expect(updateItemDetails('item-1', { name: 'Milk' })).rejects.toMatchObject({
      category: 'conflict_duplicate',
      meta: { constraint: 'grocery_items_one_open_per_name', recordId: 'item-1' },
    });
  });
});

describe('deleteItem', () => {
  it('U-API-05 deletes that item', async () => {
    const builder = stubQuery({ data: null, error: null, status: 204 });

    await deleteItem('item-1');

    expect(supabase.from).toHaveBeenCalledWith('grocery_items');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq.mock.calls).toEqual([['id', 'item-1']]);
  });

  it('U-API-05 resolves when no row was deleted, because the item is already gone', async () => {
    stubQuery({ data: null, error: null, status: 204 });

    await expect(deleteItem('item-1')).resolves.toBeUndefined();
  });
});

describe('clearCheckedItems', () => {
  it('U-API-06 deletes the checked items on that list, and returns their ids', async () => {
    const builder = stubQuery({
      data: [{ id: 'item-1' }, { id: 'item-2' }],
      error: null,
      status: 200,
    });

    await expect(clearCheckedItems('list-1')).resolves.toEqual(['item-1', 'item-2']);

    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.from).toHaveBeenCalledWith('grocery_items');
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq.mock.calls).toEqual([
      ['list_id', 'list-1'],
      ['is_checked', true],
    ]);
    expect(builder.select).toHaveBeenCalledWith('id');
  });

  it('U-API-06 returns no ids when nothing was checked', async () => {
    stubQuery({ data: [], error: null, status: 200 });

    await expect(clearCheckedItems('list-1')).resolves.toEqual([]);
  });
});

describe('uncheckAllItems', () => {
  it('U-API-08 unchecks the checked items on that list except those to keep, and returns their ids', async () => {
    const builder = stubQuery({ data: [{ id: 'item-1' }], error: null, status: 200 });

    await expect(uncheckAllItems('list-1', ['item-2', 'item-3'])).resolves.toEqual(['item-1']);

    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.from).toHaveBeenCalledWith('grocery_items');
    expect(builder.update.mock.calls).toStrictEqual([[{ is_checked: false }]]);
    expect(builder.eq.mock.calls).toEqual([
      ['list_id', 'list-1'],
      ['is_checked', true],
    ]);
    expect(builder.not).toHaveBeenCalledWith('id', 'in', '(item-2,item-3)');
    expect(builder.select).toHaveBeenCalledWith('id');
  });

  it('U-API-08 sends no id filter when there is nothing to keep', async () => {
    const builder = stubQuery({ data: [], error: null, status: 200 });

    await expect(uncheckAllItems('list-1', [])).resolves.toEqual([]);

    expect(builder.not).not.toHaveBeenCalled();
  });
});

describe('failures', () => {
  it.each([
    ['fetchList', () => fetchList('household-1'), 'grocery_lists', 'select'],
    ['insertItem', () => insertItem(ITEM), 'grocery_items', 'insert'],
    ['setItemChecked', () => setItemChecked('item-1', true), 'grocery_items', 'update'],
    ['setItemQuantity', () => setItemQuantity('item-1', null), 'grocery_items', 'update'],
    [
      'updateItemDetails',
      () => updateItemDetails('item-1', { name: 'Rice' }),
      'grocery_items',
      'update',
    ],
    ['deleteItem', () => deleteItem('item-1'), 'grocery_items', 'delete'],
    ['clearCheckedItems', () => clearCheckedItems('list-1'), 'grocery_items', 'delete'],
    ['uncheckAllItems', () => uncheckAllItems('list-1', []), 'grocery_items', 'update'],
  ])(
    'U-API-07 %s throws an ApiError with its table and operation, and no server text',
    async (_, call, table, operation) => {
      stubQuery({ data: null, error: makePostgrestError('42501'), status: 403 });

      const error = await call().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        category: 'forbidden',
        meta: { code: '42501', status: 403, table, operation },
      });
      const { message, stack } = error as ApiError;
      expect([message, stack, JSON.stringify(error)].join('\n')).not.toContain(HOUSEHOLD_TEXT);
    },
  );

  it('U-API-07 classifies a failed request as network', async () => {
    const offline = makePostgrestFetchError(new TypeError('Network request failed'));
    stubQuery({ data: null, error: offline, status: 0 });

    await expect(setItemChecked('item-1', true)).rejects.toMatchObject({
      category: 'network',
      meta: { table: 'grocery_items', operation: 'update' },
    });
  });
});
