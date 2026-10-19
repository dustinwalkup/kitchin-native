import { createCoalescer, MAX_WAIT_MS, QUIET_MS } from './coalescer';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

/** A coalescer whose flushes are recorded with the fake clock's time. */
function setup() {
  const flushes: { at: number; tables: readonly string[] }[] = [];
  const coalescer = createCoalescer((tables) => flushes.push({ at: jest.now(), tables }));
  return { coalescer, flushes, start: jest.now() };
}

describe('createCoalescer', () => {
  it('uses the design §3.6 timings', () => {
    expect(QUIET_MS).toBe(150);
    expect(MAX_WAIT_MS).toBe(500);
  });

  it('flushes a single event once it has been quiet for 150 ms', () => {
    const { coalescer, flushes, start } = setup();

    coalescer.add('grocery_items');
    jest.advanceTimersByTime(149);
    expect(flushes).toHaveLength(0);

    jest.advanceTimersByTime(1);
    expect(flushes).toEqual([{ at: start + 150, tables: ['grocery_items'] }]);
  });

  it('U-COA-01 flushes 20 events within 150 ms once', () => {
    const { coalescer, flushes, start } = setup();

    // One every 7 ms, so the last arrives at 133 ms.
    for (let i = 0; i < 20; i++) {
      if (i > 0) jest.advanceTimersByTime(7);
      coalescer.add('grocery_items');
    }
    jest.advanceTimersByTime(149);
    expect(flushes).toHaveLength(0);

    jest.advanceTimersByTime(1);
    jest.advanceTimersByTime(5_000);
    expect(flushes).toEqual([{ at: start + 133 + 150, tables: ['grocery_items'] }]);
  });

  it('U-COA-02 flushes a continuous stream (an event every 100 ms) at least every 500 ms', () => {
    const { coalescer, flushes, start } = setup();

    // Two seconds of events, the quiet time never elapsing between them.
    for (let elapsed = 0; elapsed <= 2_000; elapsed += 100) {
      if (elapsed > 0) jest.advanceTimersByTime(100);
      coalescer.add('grocery_items');
    }
    const streamEnd = jest.now();
    jest.advanceTimersByTime(QUIET_MS);

    const times = [start, ...flushes.map((flush) => flush.at)];
    const gaps = times.slice(1).map((at, i) => at - times[i]);
    expect(flushes.length).toBeGreaterThanOrEqual(4);
    gaps.forEach((gap) => expect(gap).toBeLessThanOrEqual(MAX_WAIT_MS));
    // The last event still flushes once the stream stops.
    expect(flushes.at(-1)?.at).toBe(streamEnd + QUIET_MS);
    flushes.forEach((flush) => expect(flush.tables).toEqual(['grocery_items']));
  });

  it('U-COA-03 lists each table once per flush, in the order they first arrived', () => {
    const { coalescer, flushes } = setup();

    for (let i = 0; i < 10; i++) {
      coalescer.add('grocery_lists');
      coalescer.add('grocery_items');
      jest.advanceTimersByTime(10);
    }
    jest.advanceTimersByTime(QUIET_MS);
    expect(flushes.map((flush) => flush.tables)).toEqual([['grocery_lists', 'grocery_items']]);

    // The next burst starts empty, so a table that already flushed appears again.
    coalescer.add('grocery_items');
    coalescer.add('grocery_items');
    jest.advanceTimersByTime(QUIET_MS);
    expect(flushes.map((flush) => flush.tables)).toEqual([
      ['grocery_lists', 'grocery_items'],
      ['grocery_items'],
    ]);
  });

  it('restarts the 500 ms limit with the first event after a flush', () => {
    const { coalescer, flushes, start } = setup();

    coalescer.add('grocery_items');
    jest.advanceTimersByTime(QUIET_MS);
    // A burst at 450 ms gets its full quiet time. A limit left over from the first burst would
    // cut it short at 500 ms.
    jest.advanceTimersByTime(300);
    coalescer.add('grocery_items');
    jest.advanceTimersByTime(QUIET_MS);

    expect(flushes.map((flush) => flush.at)).toEqual([start + 150, start + 600]);
  });

  it('U-COA-04 flushes nothing after stop(), including events still waiting', () => {
    const { coalescer, flushes } = setup();

    coalescer.add('grocery_items');
    jest.advanceTimersByTime(100);
    coalescer.stop();
    coalescer.add('grocery_lists');
    jest.advanceTimersByTime(5_000);

    expect(flushes).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('keeps working after a flush that throws', () => {
    const flush = jest.fn().mockImplementationOnce(() => {
      throw new Error('handler failed');
    });
    const coalescer = createCoalescer(flush);

    coalescer.add('grocery_items');
    expect(() => jest.advanceTimersByTime(QUIET_MS)).toThrow('handler failed');
    coalescer.add('grocery_lists');
    jest.advanceTimersByTime(QUIET_MS);

    expect(flush).toHaveBeenLastCalledWith(['grocery_lists']);
    expect(flush).toHaveBeenCalledTimes(2);
  });
});
