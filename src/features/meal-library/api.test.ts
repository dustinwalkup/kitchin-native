import { ApiError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import {
  HOUSEHOLD_TEXT,
  makeMealRow,
  makePostgrestError,
  makePostgrestFetchError,
  makeTagRow,
} from '@/test/factories';

import {
  addTagLinks,
  deleteMeal,
  fetchLibrary,
  mealExists,
  removeImages,
  removeTagLinks,
  runSavePlan,
  signImageUrls,
  updateMeal,
  uploadImage,
  upsertMeal,
  upsertTags,
} from './api';
import type { SavePlan } from './domain';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), storage: { from: jest.fn() } },
}));

beforeEach(() => jest.clearAllMocks());

const METHODS = ['select', 'upsert', 'update', 'delete', 'eq', 'in', 'order', 'range'] as const;

type Method = (typeof METHODS)[number];

interface Response {
  data: unknown;
  error: unknown;
  status: number;
}

/** One request: its table, and each builder method called on it, in order. */
interface Request {
  table: string;
  calls: [Method, ...unknown[]][];
}

// A chainable stub of the query builder (4-test-plan §8.4) for functions that make several
// requests. Each `from` call takes the next response queued for its table and logs its request.
// Every method returns the builder, which resolves to the response when awaited, as postgrest-js's
// builder does.
function stubRequests(queued: Partial<Record<string, Response[]>>): Request[] {
  const queues = new Map(Object.entries(queued).map(([table, list]) => [table, [...(list ?? [])]]));
  const requests: Request[] = [];
  jest.mocked(supabase.from).mockImplementation(((table: string) => {
    const response = queues.get(table)?.shift();
    if (response === undefined) throw new Error(`No response queued for ${table}`);
    const request: Request = { table, calls: [] };
    requests.push(request);
    const builder: Record<string, unknown> = {
      then: (resolve: (r: Response) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(response).then(resolve, reject),
    };
    for (const method of METHODS) {
      builder[method] = (...args: unknown[]) => {
        request.calls.push([method, ...args]);
        return builder;
      };
    }
    return builder;
  }) as never);
  return requests;
}

const ok = (data: unknown = null, status = 200): Response => ({ data, error: null, status });
const forbidden: Response = { data: null, error: makePostgrestError('42501'), status: 403 };

// Each request as its table and first method, such as "library_meals update".
const summary = (requests: Request[]) => requests.map((r) => `${r.table} ${r.calls[0]?.[0]}`);

const HID = 'household-1';
const MEAL_COLUMNS =
  'id, name, description, ingredients, meal_type, image_path, updated_at, library_meal_tags(tag_id)';
const TAG_COLUMNS = 'id, name, name_key';

const NEW_MEAL = {
  id: 'meal-1',
  name: 'Lasagna',
  description: 'Beef and ricotta',
  ingredients: null,
  mealType: 'dinner',
  imagePath: 'household-1/photo.jpg',
} as const;

describe('fetchLibrary', () => {
  const page = <Row>(make: (o: { id: string }) => Row, size: number, offset = 0) =>
    Array.from({ length: size }, (_, i) => make({ id: `row-${offset + i}` }));

  it('U-LAPI-01 selects each table for the household, ordered by id, a page at a time', async () => {
    const meals = [makeMealRow({ library_meal_tags: [{ tag_id: 'tag-1' }] })];
    const tags = [makeTagRow()];
    const requests = stubRequests({ library_meals: [ok(meals)], library_tags: [ok(tags)] });

    await expect(fetchLibrary(HID)).resolves.toEqual({ meals, tags });

    expect(requests).toEqual([
      {
        table: 'library_meals',
        calls: [
          ['select', MEAL_COLUMNS],
          ['eq', 'household_id', HID],
          ['order', 'id'],
          ['range', 0, 999],
        ],
      },
      {
        table: 'library_tags',
        calls: [
          ['select', TAG_COLUMNS],
          ['eq', 'household_id', HID],
          ['order', 'id'],
          ['range', 0, 999],
        ],
      },
    ]);
  });

  it('U-LAPI-01 asks for the next page after a full one, and stops on a short page', async () => {
    const meals = [...page(makeMealRow, 1000), ...page(makeMealRow, 1, 1000)];
    // Exactly one full page: the empty page after it ends the load.
    const tags = page(makeTagRow, 1000);
    const requests = stubRequests({
      library_meals: [ok(meals.slice(0, 1000)), ok(meals.slice(1000))],
      library_tags: [ok(tags), ok([])],
    });

    const library = await fetchLibrary(HID);

    expect(library.meals).toEqual(meals);
    expect(library.tags).toEqual(tags);
    const ranges = (table: string) =>
      requests
        .filter((r) => r.table === table)
        .map((r) => r.calls.find(([method]) => method === 'range'));
    expect(ranges('library_meals')).toEqual([
      ['range', 0, 999],
      ['range', 1000, 1999],
    ]);
    expect(ranges('library_tags')).toEqual([
      ['range', 0, 999],
      ['range', 1000, 1999],
    ]);
  });

  it('U-LAPI-01 requests both tables before either answers', async () => {
    stubRequests({ library_meals: [ok([])], library_tags: [ok([])] });

    const load = fetchLibrary(HID);

    expect(jest.mocked(supabase.from).mock.calls).toEqual([['library_meals'], ['library_tags']]);
    await load;
  });

  it('U-LAPI-01 fails the load when a later page fails, instead of returning part of it', async () => {
    stubRequests({
      library_meals: [ok(page(makeMealRow, 1000)), forbidden],
      library_tags: [ok([])],
    });

    await expect(fetchLibrary(HID)).rejects.toMatchObject({
      category: 'forbidden',
      meta: { table: 'library_meals', operation: 'select' },
    });
  });
});

describe('upsertTags', () => {
  it('U-LAPI-02 sends only the household and name, upserting on the tag key', async () => {
    const stored = [makeTagRow({ id: 'tag-9', name: 'Taco Night' }), makeTagRow()];
    const requests = stubRequests({ library_tags: [ok(stored, 201)] });

    await expect(upsertTags(HID, ['Taco Night', 'dinner'])).resolves.toEqual(stored);

    // toStrictEqual fails on any extra key, such as created_by or name_key.
    expect(requests).toStrictEqual([
      {
        table: 'library_tags',
        calls: [
          [
            'upsert',
            [
              { household_id: HID, name: 'Taco Night' },
              { household_id: HID, name: 'dinner' },
            ],
            { onConflict: 'household_id,name_key' },
          ],
          ['select', TAG_COLUMNS],
        ],
      },
    ]);
  });
});

describe('upsertMeal', () => {
  it('U-LAPI-03 sends exactly the id, household and fields, upserting on id', async () => {
    const requests = stubRequests({ library_meals: [ok(null, 201)] });

    await upsertMeal(HID, NEW_MEAL);

    expect(requests).toStrictEqual([
      {
        table: 'library_meals',
        calls: [
          [
            'upsert',
            {
              id: 'meal-1',
              household_id: HID,
              name: 'Lasagna',
              description: 'Beef and ricotta',
              ingredients: null,
              meal_type: 'dinner',
              image_path: 'household-1/photo.jpg',
            },
            { onConflict: 'id' },
          ],
        ],
      },
    ]);
  });
});

describe('request bodies', () => {
  // The domain's camelCase names aren't columns, so PostgREST would reject them.
  const FORBIDDEN_KEYS = [
    'created_by',
    'updated_by',
    'created_at',
    'updated_at',
    'name_key',
    'mealType',
    'imagePath',
  ];

  it('U-LAPI-04 never carry attribution, timestamps, the tag key or domain field names', async () => {
    const requests = stubRequests({
      library_tags: [ok([makeTagRow({ id: 'tag-9', name: 'Taco Night' })], 201)],
      library_meals: [ok(null, 201), ok([{ id: 'meal-1' }])],
      library_meal_tags: [ok(null, 201)],
    });

    await upsertTags(HID, ['Taco Night']);
    await upsertMeal(HID, NEW_MEAL);
    await updateMeal('meal-1', {
      name: 'Lasagne',
      description: null,
      ingredients: 'Pasta',
      mealType: 'lunch',
      imagePath: null,
    });
    await addTagLinks(HID, 'meal-1', ['tag-1']);

    const bodies = requests
      .flatMap((r) => r.calls)
      .filter(([method]) => method === 'upsert' || method === 'update')
      .flatMap(([, body]) => (Array.isArray(body) ? body : [body]) as object[]);
    expect(bodies).toHaveLength(4);
    for (const body of bodies) {
      expect(Object.keys(body)).toEqual(expect.not.arrayContaining(FORBIDDEN_KEYS));
    }
  });
});

describe('updateMeal', () => {
  it('U-LAPI-05 sends only the changes, by id, and selects the id back', async () => {
    const requests = stubRequests({ library_meals: [ok([{ id: 'meal-1' }])] });

    await expect(updateMeal('meal-1', { description: 'Beef' })).resolves.toBe('updated');

    expect(requests).toStrictEqual([
      {
        table: 'library_meals',
        calls: [
          ['update', { description: 'Beef' }],
          ['eq', 'id', 'meal-1'],
          ['select', 'id'],
        ],
      },
    ]);
  });

  it('U-LAPI-05 sends the meal type and photo as their columns, including none', async () => {
    const requests = stubRequests({
      library_meals: [ok([{ id: 'meal-1' }]), ok([{ id: 'meal-1' }]), ok([{ id: 'meal-1' }])],
    });

    await updateMeal('meal-1', { mealType: 'breakfast' });
    await updateMeal('meal-1', { imagePath: 'household-1/new.jpg', mealType: null });
    await updateMeal('meal-1', {
      name: 'Lasagne',
      description: 'Beef',
      ingredients: null,
      imagePath: null,
    });

    expect(requests.map((r) => r.calls[0])).toStrictEqual([
      ['update', { meal_type: 'breakfast' }],
      ['update', { meal_type: null, image_path: 'household-1/new.jpg' }],
      ['update', { name: 'Lasagne', description: 'Beef', ingredients: null, image_path: null }],
    ]);
  });

  it("U-LAPI-05 returns 'missing' when no row comes back", async () => {
    stubRequests({ library_meals: [ok([])] });

    await expect(updateMeal('meal-1', { description: 'Beef' })).resolves.toBe('missing');
  });

  it('U-LAPI-05 mealExists selects the id by id, and is false when no row comes back', async () => {
    const requests = stubRequests({ library_meals: [ok([{ id: 'meal-1' }]), ok([])] });

    await expect(mealExists('meal-1')).resolves.toBe(true);
    await expect(mealExists('meal-1')).resolves.toBe(false);

    expect(requests[0]).toEqual({
      table: 'library_meals',
      calls: [
        ['select', 'id'],
        ['eq', 'id', 'meal-1'],
      ],
    });
  });
});

describe('tag links', () => {
  it('U-LAPI-06 addTagLinks inserts each pair, ignoring pairs that already exist', async () => {
    const requests = stubRequests({ library_meal_tags: [ok(null, 201)] });

    await addTagLinks(HID, 'meal-1', ['tag-1', 'tag-2']);

    expect(requests).toStrictEqual([
      {
        table: 'library_meal_tags',
        calls: [
          [
            'upsert',
            [
              { household_id: HID, meal_id: 'meal-1', tag_id: 'tag-1' },
              { household_id: HID, meal_id: 'meal-1', tag_id: 'tag-2' },
            ],
            { onConflict: 'meal_id,tag_id', ignoreDuplicates: true },
          ],
        ],
      },
    ]);
  });

  it('U-LAPI-06 removeTagLinks deletes by the meal and the tag IDs', async () => {
    const requests = stubRequests({ library_meal_tags: [ok(null, 204)] });

    await removeTagLinks('meal-1', ['tag-1', 'tag-2']);

    expect(requests).toStrictEqual([
      {
        table: 'library_meal_tags',
        calls: [['delete'], ['eq', 'meal_id', 'meal-1'], ['in', 'tag_id', ['tag-1', 'tag-2']]],
      },
    ]);
  });
});

describe('deleteMeal', () => {
  it('U-LAPI-07 deletes by id, and resolves when no row was deleted', async () => {
    const requests = stubRequests({ library_meals: [ok(null, 204)] });

    await expect(deleteMeal('meal-1')).resolves.toBeUndefined();

    expect(requests).toEqual([
      { table: 'library_meals', calls: [['delete'], ['eq', 'id', 'meal-1']] },
    ]);
  });
});

describe('runSavePlan', () => {
  const TACO_NIGHT = makeTagRow({ id: 'tag-9', name: 'Taco Night' });

  // An edit that does all four steps.
  const EDIT: SavePlan = {
    newTags: ['Taco Night'],
    meal: { kind: 'update', id: 'meal-1', changes: { description: 'Beef' } },
    addTags: [
      { kind: 'existing', id: 'tag-2' },
      { kind: 'new', name: 'Taco Night' },
    ],
    removeTagIds: ['tag-1'],
  };

  const EDIT_RESPONSES = {
    library_tags: [ok([TACO_NIGHT], 201)],
    library_meals: [ok([{ id: 'meal-1' }])],
    library_meal_tags: [ok(null, 201), ok(null, 204)],
  };

  it('U-LAPI-08 writes tags, then the meal, then added links, then removed links', async () => {
    const requests = stubRequests(EDIT_RESPONSES);

    await expect(runSavePlan(HID, EDIT)).resolves.toEqual({
      tags: [TACO_NIGHT],
      addedTagIds: ['tag-2', 'tag-9'],
    });

    expect(summary(requests)).toEqual([
      'library_tags upsert',
      'library_meals update',
      'library_meal_tags upsert',
      'library_meal_tags delete',
    ]);
    // The new tag is linked by the ID the database returned.
    expect(requests[2]?.calls[0]?.[1]).toEqual([
      { household_id: HID, meal_id: 'meal-1', tag_id: 'tag-2' },
      { household_id: HID, meal_id: 'meal-1', tag_id: 'tag-9' },
    ]);
    expect(requests[3]?.calls).toContainEqual(['in', 'tag_id', ['tag-1']]);
  });

  it('U-LAPI-08 links a tag once when the plan names it as new and as existing', async () => {
    const requests = stubRequests(EDIT_RESPONSES);

    // The other member created Taco Night while the form was open, and its chip was then tapped.
    const result = await runSavePlan(HID, {
      ...EDIT,
      addTags: [...EDIT.addTags, { kind: 'existing', id: 'tag-9' }],
    });

    expect(result.addedTagIds).toEqual(['tag-2', 'tag-9']);
    expect(requests[2]?.calls[0]?.[1]).toHaveLength(2);
  });

  it('U-LAPI-08 upserts a new meal with no tags, and skips the tag and link steps', async () => {
    const requests = stubRequests({ library_meals: [ok(null, 201)] });

    await expect(
      runSavePlan(HID, {
        newTags: [],
        meal: { kind: 'upsert', row: NEW_MEAL },
        addTags: [],
        removeTagIds: [],
      }),
    ).resolves.toEqual({ tags: [], addedTagIds: [] });

    expect(summary(requests)).toEqual(['library_meals upsert']);
    expect(requests[0]?.calls[0]?.[1]).toMatchObject({ id: 'meal-1', household_id: HID });
  });

  it.each([
    ['a tags-only edit', { kind: 'check', id: 'meal-1' }],
    ['an update with no changes', { kind: 'update', id: 'meal-1', changes: {} }],
  ] as const)('U-LAPI-08 checks that the meal exists for %s', async (_, meal) => {
    const requests = stubRequests({
      library_meals: [ok([{ id: 'meal-1' }])],
      library_meal_tags: [ok(null, 204)],
    });

    await runSavePlan(HID, { newTags: [], meal, addTags: [], removeTagIds: ['tag-1'] });

    expect(summary(requests)).toEqual(['library_meals select', 'library_meal_tags delete']);
  });

  it.each([
    ['the tags', 'library_tags', 1],
    ['the meal', 'library_meals', 2],
    ['the added links', 'library_meal_tags', 3],
    ['the removed links', 'library_meal_tags', 4],
  ] as const)(
    'U-LAPI-09 stops when %s fail, without making the later requests',
    async (_, table, step) => {
      const responses = [
        ok([TACO_NIGHT], 201),
        ok([{ id: 'meal-1' }]),
        ok(null, 201),
        ok(null, 204),
      ].map((response, i) => (i === step - 1 ? forbidden : response));
      const requests = stubRequests({
        library_tags: [responses[0]!],
        library_meals: [responses[1]!],
        library_meal_tags: [responses[2]!, responses[3]!],
      });

      await expect(runSavePlan(HID, EDIT)).rejects.toMatchObject({
        category: 'forbidden',
        meta: { table },
      });

      expect(requests).toHaveLength(step);
    },
  );

  it("U-LAPI-10 turns 'missing' from the update into not_found, and stops", async () => {
    const requests = stubRequests({ ...EDIT_RESPONSES, library_meals: [ok([])] });

    const error = await runSavePlan(HID, EDIT).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      category: 'not_found',
      meta: { table: 'library_meals', operation: 'update', recordId: 'meal-1' },
    });
    expect(summary(requests)).toEqual(['library_tags upsert', 'library_meals update']);
  });

  it('U-LAPI-10 turns a meal that no longer exists into not_found, and stops', async () => {
    const requests = stubRequests({ library_meals: [ok([])], library_meal_tags: [ok(null, 204)] });

    const error = await runSavePlan(HID, {
      newTags: [],
      meal: { kind: 'check', id: 'meal-1' },
      addTags: [],
      removeTagIds: ['tag-1'],
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      category: 'not_found',
      meta: { table: 'library_meals', operation: 'select', recordId: 'meal-1' },
    });
    expect(summary(requests)).toEqual(['library_meals select']);
  });

  it('U-LAPI-10 throws tag_key_mismatch when no returned key matches a new tag', async () => {
    const requests = stubRequests({
      ...EDIT_RESPONSES,
      library_tags: [ok([{ ...TACO_NIGHT, name_key: 'taco nights' }], 201)],
    });

    const error = await runSavePlan(HID, EDIT).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      category: 'server',
      meta: { table: 'library_tags', operation: 'tag_key_mismatch' },
    });
    expect(JSON.stringify(error)).not.toContain('Taco');
    expect(summary(requests)).toEqual(['library_tags upsert']);
  });
});

describe('failures', () => {
  const CALLS = [
    ['fetchLibrary (meals)', 'library_meals', 'select', () => fetchLibrary(HID)],
    ['fetchLibrary (tags)', 'library_tags', 'select', () => fetchLibrary(HID)],
    ['upsertTags', 'library_tags', 'upsert', () => upsertTags(HID, ['Taco Night'])],
    ['upsertMeal', 'library_meals', 'upsert', () => upsertMeal(HID, NEW_MEAL)],
    ['updateMeal', 'library_meals', 'update', () => updateMeal('meal-1', { name: 'Lasagne' })],
    ['mealExists', 'library_meals', 'select', () => mealExists('meal-1')],
    ['addTagLinks', 'library_meal_tags', 'upsert', () => addTagLinks(HID, 'meal-1', ['tag-1'])],
    ['removeTagLinks', 'library_meal_tags', 'delete', () => removeTagLinks('meal-1', ['tag-1'])],
    ['deleteMeal', 'library_meals', 'delete', () => deleteMeal('meal-1')],
  ] as const;

  it.each(CALLS)(
    'U-LAPI-11 %s throws an ApiError with its table and operation, and no server text',
    async (_, table, operation, call) => {
      // The failing table answers with an error; any other answers with nothing.
      const tables = ['library_meals', 'library_tags', 'library_meal_tags'];
      stubRequests(Object.fromEntries(tables.map((t) => [t, [t === table ? forbidden : ok([])]])));

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

  it('U-LAPI-11 keeps the CHECK constraint name and drops the meal text', async () => {
    stubRequests({
      library_meals: [
        {
          data: null,
          error: {
            code: '23514',
            message:
              'new row for relation "library_meals" violates check constraint "library_meals_name_check" near "Lasagna "',
            details: 'Failing row contains (meal-1, household-1, Lasagna , Beef and ricotta).',
            hint: 'Trim "Lasagna ".',
          },
          status: 400,
        },
      ],
    });

    const error = await upsertMeal(HID, { ...NEW_MEAL, name: 'Lasagna ' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      category: 'validation',
      meta: {
        code: '23514',
        constraint: 'library_meals_name_check',
        table: 'library_meals',
        operation: 'upsert',
      },
    });
    const { message, stack, meta } = error as ApiError;
    expect([message, stack, JSON.stringify(meta), JSON.stringify(error)].join('\n')).not.toContain(
      'Lasagna',
    );
  });

  it('U-LAPI-11 classifies a failed request as network', async () => {
    const offline = makePostgrestFetchError(new TypeError('Network request failed'));
    stubRequests({ library_meals: [{ data: null, error: offline, status: 0 }] });

    await expect(upsertMeal(HID, NEW_MEAL)).rejects.toMatchObject({
      category: 'network',
      meta: { table: 'library_meals', operation: 'upsert' },
    });
  });
});

describe('photos', () => {
  const PATH = 'household-1/photo.jpg';
  const URI = 'file:///photo.jpg';
  const BYTES = new ArrayBuffer(8);
  const bucket = { upload: jest.fn(), remove: jest.fn(), createSignedUrls: jest.fn() };
  const fetchMock = jest.fn();
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    jest.mocked(supabase.storage.from).mockReturnValue(bucket as never);
    fetchMock.mockResolvedValue({ arrayBuffer: () => Promise.resolve(BYTES) });
    globalThis.fetch = fetchMock;
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  // A Storage error as storage-js returns it, with household text in the message, which must
  // never survive classification.
  const storageError = (fields: object = {}) => ({
    message: `Upload of "${HOUSEHOLD_TEXT}" failed`,
    ...fields,
  });

  describe('uploadImage', () => {
    it('reads the prepared photo and uploads its bytes as a JPEG, never overwriting', async () => {
      bucket.upload.mockResolvedValue({ data: { path: PATH }, error: null });

      await expect(uploadImage(PATH, URI)).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledWith(URI);
      expect(supabase.storage.from).toHaveBeenCalledWith('meal-images');
      expect(bucket.upload).toHaveBeenCalledWith(PATH, BYTES, {
        contentType: 'image/jpeg',
        upsert: false,
      });
    });

    it.each([
      ['a 409', { status: 409 }],
      ['a 409 as text', { statusCode: '409' }],
      ['"Duplicate"', { statusCode: '400', message: 'Duplicate' }],
      ['"already exists"', { status: 400, message: 'The resource already exists' }],
    ])('DD46 counts %s, an upload already there from an earlier try, as success', async (_, e) => {
      bucket.upload.mockResolvedValue({ data: null, error: storageError(e) });

      await expect(uploadImage(PATH, URI)).resolves.toBeUndefined();
    });

    it.each([
      ['the file cannot be read', () => fetchMock.mockRejectedValue(new Error(`No ${URI}`))],
      [
        'its bytes cannot be read',
        () => fetchMock.mockResolvedValue({ arrayBuffer: () => Promise.reject(new Error(URI)) }),
      ],
    ])('fails without uploading when %s, naming no file', async (_, arrange) => {
      arrange();

      const error = await uploadImage(PATH, URI).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        category: 'server',
        meta: { table: 'meal-images', operation: 'read_local_image' },
      });
      expect(JSON.stringify(error)).not.toContain('photo.jpg');
      expect(bucket.upload).not.toHaveBeenCalled();
    });

    it.each([
      ['a failed connection', { message: 'Network request failed' }, 'network', undefined],
      ['a 403', { status: 403 }, 'forbidden', 403],
      ['a 403 as text', { statusCode: '403' }, 'forbidden', 403],
      ['a 413', { statusCode: '413' }, 'server', 413],
      ['an error with no status', {}, 'server', undefined],
      ['an error with a status that is not a number', { statusCode: 'oops' }, 'server', undefined],
    ])(
      'classifies %s by its shape alone, with no server text',
      async (_, fields, category, status) => {
        bucket.upload.mockResolvedValue({ data: null, error: storageError(fields) });

        const error = await uploadImage(PATH, URI).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({
          category,
          meta: { table: 'meal-images', operation: 'upload' },
        });
        expect((error as ApiError).meta.status).toBe(status);
        const { message, stack } = error as ApiError;
        expect([message, stack, JSON.stringify(error)].join('\n')).not.toContain(HOUSEHOLD_TEXT);
      },
    );
  });

  describe('removeImages', () => {
    it('removes the photos from the bucket', async () => {
      bucket.remove.mockResolvedValue({ data: [], error: null });

      await expect(removeImages([PATH, 'household-1/other.jpg'])).resolves.toBeUndefined();

      expect(supabase.storage.from).toHaveBeenCalledWith('meal-images');
      expect(bucket.remove).toHaveBeenCalledWith([PATH, 'household-1/other.jpg']);
    });

    it('sends nothing for no photos', async () => {
      await removeImages([]);

      expect(supabase.storage.from).not.toHaveBeenCalled();
    });

    it('throws an ApiError with no server text when Storage fails', async () => {
      bucket.remove.mockResolvedValue({ data: null, error: storageError({ status: 403 }) });

      const error = await removeImages([PATH]).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        category: 'forbidden',
        meta: { table: 'meal-images', operation: 'remove', status: 403 },
      });
      expect(JSON.stringify(error)).not.toContain(HOUSEHOLD_TEXT);
    });
  });

  describe('signImageUrls', () => {
    it('signs every photo in one request, for an hour, by key', async () => {
      bucket.createSignedUrls.mockResolvedValue({
        data: [
          { path: PATH, signedUrl: 'https://storage.test/a?token=1', error: null },
          { path: 'household-1/b.jpg', signedUrl: 'https://storage.test/b?token=2', error: null },
        ],
        error: null,
      });

      await expect(signImageUrls([PATH, 'household-1/b.jpg'])).resolves.toEqual({
        [PATH]: 'https://storage.test/a?token=1',
        'household-1/b.jpg': 'https://storage.test/b?token=2',
      });

      expect(supabase.storage.from).toHaveBeenCalledWith('meal-images');
      expect(bucket.createSignedUrls).toHaveBeenCalledTimes(1);
      expect(bucket.createSignedUrls).toHaveBeenCalledWith([PATH, 'household-1/b.jpg'], 3600);
    });

    it("leaves out a photo Storage couldn't sign", async () => {
      bucket.createSignedUrls.mockResolvedValue({
        data: [
          { path: PATH, signedUrl: 'https://storage.test/a', error: null },
          {
            path: 'household-1/gone.jpg',
            signedUrl: '',
            error: 'Either the object does not exist',
          },
          { path: 'household-1/blank.jpg', signedUrl: '', error: null },
          { path: null, signedUrl: 'https://storage.test/orphan', error: null },
        ],
        error: null,
      });

      await expect(
        signImageUrls([PATH, 'household-1/gone.jpg', 'household-1/blank.jpg']),
      ).resolves.toEqual({ [PATH]: 'https://storage.test/a' });
    });

    it('sends nothing for no photos', async () => {
      await expect(signImageUrls([])).resolves.toEqual({});

      expect(supabase.storage.from).not.toHaveBeenCalled();
    });

    it('throws an ApiError with no server text when Storage fails', async () => {
      bucket.createSignedUrls.mockResolvedValue({
        data: null,
        error: storageError({ message: 'Network request failed' }),
      });

      await expect(signImageUrls([PATH])).rejects.toMatchObject({
        category: 'network',
        meta: { table: 'meal-images', operation: 'sign' },
      });
    });
  });
});
