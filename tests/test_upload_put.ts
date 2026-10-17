/**
 * upload(): the file PUT goes through node:http(s) with a socket idle
 * (read) timeout. Uses a real local HTTP server, no fetch mock.
 */

import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';
import { Client } from '../src/api/client';

type PutHandler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

let server: http.Server;
let baseUrl: string;
let putHandler: PutHandler;
let ticketSizes: number[];
const sockets = new Set<any>();
let dir: string;

function makeFile(name: string, bytes: Buffer): string {
  const f = path.join(dir, name);
  fs.writeFileSync(f, bytes);
  return f;
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-upload-'));
  server = http.createServer((req, res) => {
    if (req.method === 'POST') {
      let b = '';
      req.on('data', (d) => (b += d));
      req.on('end', () => {
        ticketSizes.push(JSON.parse(b).size);
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            code: 200,
            data: {
              download_url: 'https://cdn.example/file.bin',
              upload: {
                method: 'PUT',
                url: `${baseUrl}/put`,
                headers: { 'Content-Type': 'application/octet-stream', 'X-Custom': 'abc' },
              },
            },
          })
        );
      });
      return;
    }
    putHandler(req, res);
  });
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  sockets.forEach((s) => s.destroy());
  await new Promise((r) => server.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  ticketSizes = [];
});

describe('upload PUT (node:http)', () => {
  test('normal PUT: same headers, exact bytes, returns download_url', async () => {
    const bytes = Buffer.from(Array.from({ length: 300000 }, (_, i) => i % 251));
    const file = makeFile('data.bin', bytes);
    let got: Buffer[] = [];
    let headers: http.IncomingHttpHeaders = {};
    putHandler = (req, res) => {
      headers = req.headers;
      req.on('data', (c) => got.push(c));
      req.on('end', () => res.end('ok'));
    };
    const url = await new Client('k', { baseUrl }).upload(file);
    expect(url).toBe('https://cdn.example/file.bin');
    expect(Buffer.concat(got).equals(bytes)).toBe(true);
    expect(headers['content-type']).toBe('application/octet-stream');
    expect(headers['x-custom']).toBe('abc');
    expect(headers['content-length']).toBe(String(bytes.length));
    expect(headers['transfer-encoding']).toBeUndefined();
    expect(headers['authorization']).toBeUndefined();
    expect(ticketSizes).toEqual([bytes.length]);
  });

  test('slow but progressing upload exceeds readTimeout in total time and succeeds', async () => {
    // Larger than the loopback socket buffers so the client keeps writing for
    // the whole transfer (~5s at ~6MB/s) with readTimeout = 3s.
    const size = 32 * 1024 * 1024;
    const file = makeFile('big.bin', Buffer.alloc(size, 7));
    let received = 0;
    putHandler = (req, res) => {
      req.on('data', (c) => {
        received += c.length;
        req.pause();
        setTimeout(() => req.resume(), 10);
      });
      req.on('end', () => res.end('ok'));
    };
    const start = Date.now();
    await new Client('k', { baseUrl, readTimeout: 3 }).upload(file);
    expect(Date.now() - start).toBeGreaterThan(3000);
    expect(received).toBe(size);
  }, 60000);

  test('server that stops reading fails after ~readTimeout with a timeout error', async () => {
    const file = makeFile('stall.bin', Buffer.alloc(8 * 1024 * 1024, 1));
    putHandler = (req) => {
      req.pause(); // never reads, never responds
    };
    const start = Date.now();
    await expect(new Client('k', { baseUrl, readTimeout: 1 }).upload(file)).rejects.toThrow(
      'Upload timed out: no progress for 1 seconds'
    );
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(900);
    expect(elapsed).toBeLessThan(5000);
  }, 20000);

  test('server that reads everything but never responds fails after ~readTimeout', async () => {
    const file = makeFile('small.bin', Buffer.from('hello'));
    putHandler = (req) => {
      req.resume();
    };
    await expect(new Client('k', { baseUrl, readTimeout: 1 }).upload(file)).rejects.toThrow(
      'no progress for 1 seconds'
    );
  }, 20000);

  test('explicit timeout is a total deadline even while progressing', async () => {
    const file = makeFile('big2.bin', Buffer.alloc(4 * 1024 * 1024, 7));
    putHandler = (req, res) => {
      req.on('data', () => {
        req.pause();
        setTimeout(() => req.resume(), 40);
      });
      req.on('end', () => res.end('ok'));
    };
    // ticket timer is min(connectionTimeout, timeout); PUT total deadline = timeout
    await expect(
      new Client('k', { baseUrl, readTimeout: 60 }).upload(file, { timeout: 1 })
    ).rejects.toThrow('Upload timed out after 1 seconds');
  }, 20000);

  test('explicit timeout does not abort a quick upload', async () => {
    const file = makeFile('quick.bin', Buffer.from('hi'));
    putHandler = (req, res) => {
      req.resume();
      req.on('end', () => res.end('ok'));
    };
    await expect(
      new Client('k', { baseUrl }).upload(file, { timeout: 30 })
    ).resolves.toBe('https://cdn.example/file.bin');
  });

  test('HTTP error status from the PUT keeps the same error message', async () => {
    const file = makeFile('err.bin', Buffer.from('hello'));
    putHandler = (req, res) => {
      req.resume();
      req.on('end', () => {
        res.statusCode = 403;
        res.end('SignatureDoesNotMatch');
      });
    };
    await expect(new Client('k', { baseUrl }).upload(file)).rejects.toThrow(
      'Failed to upload file: HTTP 403: SignatureDoesNotMatch'
    );
  });

  test('ticket request uses the 120s readTimeout by default', async () => {
    const file = makeFile('t.bin', Buffer.from('x'));
    putHandler = (req, res) => {
      req.resume();
      req.on('end', () => res.end('ok'));
    };
    const spy = jest.spyOn(global, 'setTimeout');
    try {
      await new Client('k', { baseUrl }).upload(file);
      const delays = spy.mock.calls
        .filter(([fn]) => String(fn).includes('abort'))
        .map(([, ms]) => ms);
      expect(delays).toEqual([120000]);
      spy.mockClear();
      await new Client('k', { baseUrl }).upload(file, { timeout: 300 });
      const d2 = spy.mock.calls
        .filter(([fn]) => String(fn).includes('abort'))
        .map(([, ms]) => ms);
      expect(d2).toEqual([10000]);
    } finally {
      spy.mockRestore();
    }
  });
});
