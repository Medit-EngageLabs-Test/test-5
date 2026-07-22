import { BoardRealtimeService } from './board-realtime';

/**
 * Captures the handlers `BoardRealtimeService`'s constructor registers on its `HubConnection`
 * (`.on(eventName, handler)`/`.onreconnected(handler)`) instead of letting the real
 * `@microsoft/signalr` client attempt a network connection in a unit test — this is what lets
 * these tests drive the service's own event-wiring logic directly, the way the real hub would.
 */
const handlers = new Map<string, (...args: unknown[]) => void>();
let reconnectedHandler: (() => void) | undefined;
let startCallCount = 0;
let startBehavior: () => Promise<void> = () => Promise.resolve();

vi.mock('@microsoft/signalr', () => {
  class FakeHubConnectionBuilder {
    withUrl(): this {
      return this;
    }

    withAutomaticReconnect(): this {
      return this;
    }

    build() {
      return {
        on: (eventName: string, handler: (...args: unknown[]) => void) => {
          handlers.set(eventName, handler);
        },
        onreconnected: (handler: () => void) => {
          reconnectedHandler = handler;
        },
        start: () => {
          startCallCount++;
          return startBehavior();
        },
      };
    }
  }

  return { HubConnectionBuilder: FakeHubConnectionBuilder };
});

/** Flushes the microtask queue enough times for the constructor's `void this.connect()` to settle. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('BoardRealtimeService', () => {
  beforeEach(() => {
    handlers.clear();
    reconnectedHandler = undefined;
    startCallCount = 0;
    startBehavior = () => Promise.resolve();
    vi.useRealTimers();
  });

  it('si connette una volta e riallinea la board alla prima connessione riuscita', async () => {
    const service = new BoardRealtimeService();
    const realigned = vi.fn();
    service.realigned$.subscribe(realigned);

    await flush();

    expect(startCallCount).toBe(1);
    expect(realigned).toHaveBeenCalledTimes(1);
  });

  it('un fallimento della prima connessione viene ritentato (non delegato ad Automatic Reconnect)', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    startBehavior = () => {
      attempts++;
      return attempts === 1 ? Promise.reject(new Error('offline')) : Promise.resolve();
    };

    new BoardRealtimeService();
    await vi.advanceTimersByTimeAsync(0);
    expect(startCallCount).toBe(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(startCallCount).toBe(2);
    vi.useRealTimers();
  });

  it('onreconnected riallinea la board', async () => {
    const service = new BoardRealtimeService();
    await flush();
    const realigned = vi.fn();
    service.realigned$.subscribe(realigned);

    reconnectedHandler?.();

    expect(realigned).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['TaskCreated', 'taskCreated$', ['t-1'], { taskId: 't-1' }] as const,
    ['TaskUpdated', 'taskUpdated$', ['t-1'], { taskId: 't-1' }] as const,
    ['TaskMoved', 'taskMoved$', ['t-1'], { taskId: 't-1' }] as const,
    ['TaskDeleted', 'taskDeleted$', ['t-1'], { taskId: 't-1' }] as const,
    ['CommentAdded', 'commentAdded$', ['t-1', 'c-1'], { taskId: 't-1', commentId: 'c-1' }] as const,
    [
      'CommentUpdated',
      'commentUpdated$',
      ['t-1', 'c-1'],
      { taskId: 't-1', commentId: 'c-1' },
    ] as const,
    [
      'CommentDeleted',
      'commentDeleted$',
      ['t-1', 'c-1'],
      { taskId: 't-1', commentId: 'c-1' },
    ] as const,
    [
      'AttachmentAdded',
      'attachmentAdded$',
      ['t-1', 'a-1'],
      { taskId: 't-1', attachmentId: 'a-1' },
    ] as const,
    [
      'AttachmentRemoved',
      'attachmentRemoved$',
      ['t-1', 'a-1'],
      { taskId: 't-1', attachmentId: 'a-1' },
    ] as const,
  ])(
    'un evento hub %s emette il payload atteso su %s',
    async (hubEventName, observableName, hubArgs, expectedPayload) => {
      const service = new BoardRealtimeService();
      await flush();

      const received: unknown[] = [];
      (
        service[observableName as keyof BoardRealtimeService] as {
          subscribe: (cb: (v: unknown) => void) => void;
        }
      ).subscribe((value) => received.push(value));

      handlers.get(hubEventName)?.(...hubArgs);

      expect(received).toEqual([expectedPayload]);
    },
  );
});
