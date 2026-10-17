/**
 * Timeout semantics: no default overall cap; bounded per-request abort timers.
 */

import { Client, WavespeedTimeoutException } from '../src/api/client';

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

const json = (body: any, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});
const submitOk = json({ data: { id: 'task-1' } });
const processing = json({ data: { status: 'processing' } });
const completed = json({ data: { status: 'completed', outputs: ['u'] } });

function abortDelays(spy: jest.SpyInstance): number[] {
  // Only the AbortController timers (not poll sleeps) are of interest: the
  // abort callbacks are the ones that reference `abort`.
  return spy.mock.calls
    .filter(([fn]) => String(fn).includes('abort'))
    .map(([, ms]) => ms as number);
}

describe('timeouts', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('no default overall cap: task still processing after 36000s completes', async () => {
    const client = new Client('k');
    expect(client.timeout).toBeUndefined();
    let polls = 0;
    mockFetch.mockImplementation(async (url: string, init: any) => {
      if (init.method === 'POST') return submitOk;
      polls++;
      return polls <= 40000 ? processing : completed;
    });
    const p = client.run('m/x', {}, { pollInterval: 1 });
    await jest.advanceTimersByTimeAsync(40001 * 1000);
    await expect(p).resolves.toEqual(expect.anything());
    expect(polls).toBeGreaterThan(36000);
  }, 60000);

  test('explicit timeout still bounds the wait (run throws, runNoThrow reports WavespeedTimeoutException)', async () => {
    const client = new Client('k');
    mockFetch.mockImplementation(async (url: string, init: any) =>
      init.method === 'POST' ? submitOk : processing
    );
    const p = client.run('m/x', {}, { timeout: 5, pollInterval: 1 });
    const assertion = expect(p).rejects.toThrow('Prediction timed out after 5 seconds');
    await jest.advanceTimersByTimeAsync(10 * 1000);
    await assertion;

    const q = client.runNoThrow('m/x', {}, { timeout: 5, pollInterval: 1 });
    await jest.advanceTimersByTimeAsync(10 * 1000);
    const res = await q;
    expect(res.detail.error).toBeInstanceOf(WavespeedTimeoutException);
  });

  test('async submit and result GET abort timers default to 120s', async () => {
    const spy = jest.spyOn(global, 'setTimeout');
    const client = new Client('k');
    mockFetch.mockImplementation(async (url: string, init: any) =>
      init.method === 'POST' ? submitOk : completed
    );
    await client.run('m/x', {});
    expect(abortDelays(spy)).toEqual([120000, 120000]);
  });

  test('client readTimeout option overrides the default', async () => {
    const spy = jest.spyOn(global, 'setTimeout');
    const client = new Client('k', { readTimeout: 30 });
    mockFetch.mockImplementation(async (url: string, init: any) =>
      init.method === 'POST' ? submitOk : completed
    );
    await client.run('m/x', {});
    expect(abortDelays(spy)).toEqual([30000, 30000]);
  });

  test('sync-mode submit has no abort timer by default, explicit timeout otherwise', async () => {
    const spy = jest.spyOn(global, 'setTimeout');
    const client = new Client('k');
    mockFetch.mockResolvedValue(json({ data: { status: 'completed', outputs: ['u'] } }));
    await client.run('m/x', {}, { enableSyncMode: true });
    expect(abortDelays(spy)).toEqual([]);

    spy.mockClear();
    await client.run('m/x', {}, { enableSyncMode: true, timeout: 77 });
    expect(abortDelays(spy)).toEqual([77000]);
  });

  test('explicit timeout keeps per-request limits as before', async () => {
    const spy = jest.spyOn(global, 'setTimeout');
    const client = new Client('k');
    mockFetch.mockImplementation(async (url: string, init: any) =>
      init.method === 'POST' ? submitOk : completed
    );
    await client.run('m/x', {}, { timeout: 600 });
    // submit: explicit timeout; GET: min(connectionTimeout 10, timeout)
    expect(abortDelays(spy)).toEqual([600000, 10000]);
  });

  test('result GET still retries after a 502 then succeeds; submit is single-shot', async () => {
    const client = new Client('k', { retryInterval: 0.001 });
    let gets = 0;
    let posts = 0;
    mockFetch.mockImplementation(async (url: string, init: any) => {
      if (init.method === 'POST') {
        posts++;
        return submitOk;
      }
      gets++;
      return gets === 1 ? json({ error: 'bad gateway' }, 502) : completed;
    });
    const p = client.run('m/x', {});
    await jest.advanceTimersByTimeAsync(5000);
    await expect(p).resolves.toBeDefined();
    expect(gets).toBe(2);
    expect(posts).toBe(1);

    mockFetch.mockReset();
    mockFetch.mockRejectedValue(new Error('network down'));
    await expect(client.run('m/x', {})).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
