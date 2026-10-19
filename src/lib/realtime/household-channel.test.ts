import { ApiError } from '@/lib/errors';
import { report } from '@/lib/reporting';
import { createFakeRealtime } from '@/test/fake-channel';

import deleteMessage from './__fixtures__/broadcast-delete.json';
import insertMessage from './__fixtures__/broadcast-insert.json';
import { startHouseholdChannel } from './household-channel';

jest.mock('@/lib/reporting', () => ({ report: jest.fn() }));

const HOUSEHOLD_ID = '00000000-0000-4000-8000-000000000001';
const START = new Date('2026-10-19T10:00:00Z').getTime();

const fake = createFakeRealtime();

beforeEach(() => {
  jest.useFakeTimers({ now: START });
  jest.clearAllMocks();
  fake.reset();
});

afterEach(() => jest.useRealTimers());

function start() {
  const deps = {
    supabase: fake.client,
    householdId: HOUSEHOLD_ID,
    onTableChange: jest.fn<void, [string]>(),
    onResubscribed: jest.fn<void, []>(),
    onStatus: jest.fn(),
  };
  return { ...deps, channel: startHouseholdChannel(deps) };
}

/** Starts and lets the join finish. ensureJoined() waits for a join that's in progress. */
async function joined() {
  const started = start();
  await started.channel.ensureJoined();
  return started;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

describe('startHouseholdChannel', () => {
  it('U-CH-01 sets the auth token first, then joins household:<id> as a private channel', async () => {
    const { onStatus } = await joined();

    expect(fake.calls).toEqual(['setAuth', 'channel', 'subscribe']);
    // No token argument, so supabase-js uses the member's current session (R22.1).
    expect(fake.realtime.setAuth).toHaveBeenCalledWith();
    expect(fake.channel).toHaveBeenCalledWith(`household:${HOUSEHOLD_ID}`, {
      config: { private: true },
    });
    expect(onStatus.mock.calls).toEqual([['connecting', START]]);
  });

  it('U-CH-02 marks the first SUBSCRIBED connected without asking for a reload', async () => {
    const { onStatus, onResubscribed } = await joined();
    jest.advanceTimersByTime(300);

    fake.latest().emitStatus('SUBSCRIBED');

    expect(onStatus).toHaveBeenLastCalledWith('connected', START + 300);
    expect(onResubscribed).not.toHaveBeenCalled();
  });

  it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'] as const)(
    'U-CH-03 marks %s disconnected and records when',
    async (status) => {
      const { onStatus } = await joined();
      fake.latest().emitStatus('SUBSCRIBED');
      jest.advanceTimersByTime(1_000);

      fake.latest().emitStatus(status);

      expect(onStatus).toHaveBeenLastCalledWith('disconnected', START + 1_000);
    },
  );

  it('U-CH-03 keeps the time of the first disconnect while supabase-js retries', async () => {
    const { onStatus } = await joined();
    fake.latest().emitStatus('SUBSCRIBED');

    fake.latest().emitStatus('CHANNEL_ERROR');
    jest.advanceTimersByTime(5_000);
    fake.latest().emitStatus('TIMED_OUT');
    fake.latest().emitStatus('CHANNEL_ERROR');

    // The reconnecting pill and the degraded report time the whole outage (R13.4, R26.1).
    expect(onStatus.mock.calls).toEqual([
      ['connecting', START],
      ['connected', START],
      ['disconnected', START],
    ]);
  });

  it('U-CH-04 asks for a reload when SUBSCRIBED follows a disconnect', async () => {
    const { onStatus, onResubscribed } = await joined();
    const channel = fake.latest();

    channel.emitStatus('SUBSCRIBED');
    channel.emitStatus('CHANNEL_ERROR');
    jest.advanceTimersByTime(2_000);
    channel.emitStatus('SUBSCRIBED');

    expect(onResubscribed).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenLastCalledWith('connected', START + 2_000);

    // Another SUBSCRIBED without a disconnect in between missed nothing.
    channel.emitStatus('SUBSCRIBED');
    expect(onResubscribed).toHaveBeenCalledTimes(1);
  });

  it('U-CH-05 re-creates a channel that isn’t joined when the app becomes active', async () => {
    const { channel, onStatus, onResubscribed, onTableChange } = await joined();
    const old = fake.latest();
    old.emitStatus('SUBSCRIBED');
    old.emitStatus('CHANNEL_ERROR');
    fake.calls.length = 0;

    await channel.ensureJoined();

    // The old channel goes first: supabase-js would hand back the one registered for the topic.
    expect(fake.removeChannel).toHaveBeenCalledWith(old);
    expect(fake.calls).toEqual(['removeChannel', 'setAuth', 'channel', 'subscribe']);
    expect(fake.latest()).not.toBe(old);
    expect(fake.latest().topic).toBe(`household:${HOUSEHOLD_ID}`);

    // The old channel's CLOSED and anything else it sends are ignored.
    old.emitStatus('SUBSCRIBED');
    old.emitBroadcast(insertMessage as never);
    expect(onStatus).toHaveBeenLastCalledWith('disconnected', START);
    expect(onTableChange).not.toHaveBeenCalled();

    fake.latest().emitStatus('SUBSCRIBED');
    expect(onResubscribed).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenLastCalledWith('connected', START);
  });

  it.each([
    ['joining', () => {}],
    ['joined', () => fake.latest().emitStatus('SUBSCRIBED')],
  ])('leaves a %s channel alone when the app becomes active', async (_state, prepare) => {
    const { channel } = await joined();
    prepare();

    await channel.ensureJoined();

    expect(fake.removeChannel).not.toHaveBeenCalled();
    expect(fake.channels).toHaveLength(1);
  });

  it('starts one re-creation however often the app becomes active meanwhile', async () => {
    const { channel } = await joined();
    fake.latest().emitStatus('CHANNEL_ERROR');

    await Promise.all([channel.ensureJoined(), channel.ensureJoined(), channel.ensureJoined()]);

    expect(fake.removeChannel).toHaveBeenCalledTimes(1);
    expect(fake.channels).toHaveLength(2);
  });

  it('U-CH-06 stop() removes the channel, and nothing is called afterwards', async () => {
    const { channel, onStatus, onTableChange, onResubscribed } = await joined();
    const current = fake.latest();
    current.emitStatus('SUBSCRIBED');
    const statusCalls = onStatus.mock.calls.length;

    await channel.stop();

    expect(fake.removeChannel).toHaveBeenCalledWith(current);
    // Removing the channel reports CLOSED, which mustn't show the reconnecting pill.
    current.emitStatus('SUBSCRIBED');
    current.emitBroadcast(insertMessage as never);
    expect(onStatus).toHaveBeenCalledTimes(statusCalls);
    expect(onTableChange).not.toHaveBeenCalled();
    expect(onResubscribed).not.toHaveBeenCalled();

    await channel.ensureJoined();
    await channel.stop();
    expect(fake.channels).toHaveLength(1);
    expect(fake.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('U-CH-06 stop() during the join means no channel is created', async () => {
    const auth = deferred();
    fake.realtime.setAuth.mockReturnValueOnce(auth.promise);
    const { channel } = start();

    const stopping = channel.stop();
    auth.resolve();
    await stopping;
    await channel.ensureJoined();

    expect(fake.channel).not.toHaveBeenCalled();
    expect(fake.removeChannel).not.toHaveBeenCalled();
  });

  it('U-CH-06 stop() while re-creating means no new channel is created', async () => {
    const { channel } = await joined();
    fake.latest().emitStatus('CHANNEL_ERROR');

    const rejoining = channel.ensureJoined();
    await channel.stop();
    await rejoining;

    expect(fake.channels).toHaveLength(1);
  });

  it('U-CH-08 passes on the table of captured broadcasts, deletes included (OI-4)', async () => {
    const { onTableChange } = await joined();

    fake.latest().emitBroadcast(insertMessage as never);
    fake.latest().emitBroadcast(deleteMessage as never);

    expect(onTableChange.mock.calls).toEqual([['grocery_items'], ['grocery_items']]);
  });

  it('ignores a broadcast without a table name', async () => {
    const { onTableChange } = await joined();

    fake.latest().emitBroadcast({ type: 'broadcast', event: 'INSERT', payload: {} });
    fake.latest().emitBroadcast({ type: 'broadcast', event: 'INSERT' });
    fake.latest().emitBroadcast({ type: 'broadcast', event: 'INSERT', payload: { table: 7 } });

    expect(onTableChange).not.toHaveBeenCalled();
  });

  it('reports a failed join as disconnected, and tries again when the app becomes active', async () => {
    fake.realtime.setAuth.mockRejectedValueOnce(new Error('no session'));
    const { channel, onStatus, onResubscribed } = start();
    await channel.ensureJoined();

    // Live updates are optional: the app keeps working and reloads instead (R11.6).
    expect(report).toHaveBeenCalledWith(expect.any(ApiError));
    expect(onStatus).toHaveBeenLastCalledWith('disconnected', START);
    expect(fake.channel).not.toHaveBeenCalled();

    await channel.ensureJoined();
    fake.latest().emitStatus('SUBSCRIBED');

    expect(fake.channels).toHaveLength(1);
    expect(onResubscribed).toHaveBeenCalledTimes(1);
  });
});
