// A stand-in for the realtime part of the Supabase client: `realtime.setAuth`, `channel` and
// `removeChannel` (4-test-plan §8.3). Tests play the server: `emitStatus` answers the join and
// `emitBroadcast` delivers a message. As in supabase-js, removing a channel closes it, and the
// channel reports CLOSED to its own subscribe callback. `calls` records the order of the calls.
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database';

type ChannelState = 'closed' | 'errored' | 'joined' | 'joining' | 'leaving';
type SubscribeStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';
type StatusCallback = (status: SubscribeStatus, err?: Error) => void;

export interface BroadcastMessage {
  type: 'broadcast';
  event: string;
  payload?: unknown;
  [key: string]: unknown;
}

// The state supabase-js leaves the channel in after reporting each status.
const STATE_AFTER: Record<SubscribeStatus, ChannelState> = {
  SUBSCRIBED: 'joined',
  CHANNEL_ERROR: 'errored',
  TIMED_OUT: 'errored',
  CLOSED: 'closed',
};

export class FakeChannel {
  state: ChannelState = 'closed';
  private readonly broadcastListeners: ((message: BroadcastMessage) => void)[] = [];
  private statusCallback: StatusCallback | undefined;

  constructor(
    readonly topic: string,
    readonly options: unknown,
    private readonly calls: string[],
  ) {}

  on(type: string, _filter: { event: string }, callback: (message: BroadcastMessage) => void) {
    if (type === 'broadcast') this.broadcastListeners.push(callback);
    return this;
  }

  subscribe(callback?: StatusCallback) {
    this.calls.push('subscribe');
    this.statusCallback = callback;
    this.state = 'joining';
    return this;
  }

  emitStatus(status: SubscribeStatus) {
    this.state = STATE_AFTER[status];
    this.statusCallback?.(status);
  }

  emitBroadcast(message: BroadcastMessage) {
    for (const listener of this.broadcastListeners) listener(message);
  }
}

export interface FakeRealtime {
  realtime: { setAuth: jest.Mock<Promise<void>, [token?: string | null]> };
  channel: jest.Mock<FakeChannel, [name: string, options?: unknown]>;
  removeChannel: jest.Mock<Promise<'ok'>, [channel: FakeChannel]>;
  /** The same fake, typed as the client that the household channel takes. */
  client: SupabaseClient<Database>;
  calls: string[];
  channels: FakeChannel[];
  /** The most recently created channel. Throws if there isn't one. */
  latest(): FakeChannel;
  /** Clears the calls and channels and restores the default behaviour. */
  reset(): void;
}

export function createFakeRealtime(): FakeRealtime {
  const calls: string[] = [];
  const channels: FakeChannel[] = [];
  const realtime = { setAuth: jest.fn<Promise<void>, [token?: string | null]>() };
  const channel = jest.fn<FakeChannel, [name: string, options?: unknown]>();
  const removeChannel = jest.fn<Promise<'ok'>, [channel: FakeChannel]>();

  function reset() {
    calls.length = 0;
    channels.length = 0;
    realtime.setAuth.mockReset().mockImplementation(async () => {
      calls.push('setAuth');
    });
    channel.mockReset().mockImplementation((name, options) => {
      calls.push('channel');
      const created = new FakeChannel(name, options, calls);
      channels.push(created);
      return created;
    });
    removeChannel.mockReset().mockImplementation(async (removed) => {
      calls.push('removeChannel');
      removed.emitStatus('CLOSED');
      return 'ok';
    });
  }
  reset();

  return {
    realtime,
    channel,
    removeChannel,
    client: { realtime, channel, removeChannel } as unknown as SupabaseClient<Database>,
    calls,
    channels,
    latest() {
      const last = channels.at(-1);
      if (!last) throw new Error('No channel has been created');
      return last;
    },
    reset,
  };
}
