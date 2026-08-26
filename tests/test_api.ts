/**
 * Tests for the wavespeed.api module.
 */

import * as wavespeed from '../src/index';
import { Client, WavespeedSyncTimeoutException } from '../src/api/client';
import { api as apiConfig } from '../src/config';

// Mock fetch globally
global.fetch = jest.fn();

describe('Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('init with api key', () => {
    const client = new Client('test-key');
    expect(client['apiKey']).toBe('test-key');
    expect(client['baseUrl']).toBe('https://api.wavespeed.ai');
  });

  test('init with custom base url', () => {
    const client = new Client('test-key', { baseUrl: 'https://custom.api.com/' });
    expect(client['baseUrl']).toBe('https://custom.api.com');
  });

  test('init from config', () => {
    const originalKey = apiConfig.apiKey;
    apiConfig.apiKey = 'config-key';

    const client = new Client();
    expect(client['apiKey']).toBe('config-key');

    apiConfig.apiKey = originalKey;
  });

  test('_getHeaders raises without api key', () => {
    const client = new Client();
    (client as any).apiKey = undefined;

    expect(() => {
      (client as any)._getHeaders();
    }).toThrow('API key is required');
  });

  test('_getHeaders returns auth header', () => {
    const client = new Client('test-key');
    const headers = (client as any)._getHeaders();

    expect(headers['Authorization']).toBe('Bearer test-key');
    expect(headers['Content-Type']).toBe('application/json');
  });

  test('_getHeaders includes client attribution headers', () => {
    const client = new Client('test-key');
    const headers = (client as any)._getHeaders();

    expect(headers['X-Client-Name']).toBe('wavespeed-js');
    expect(headers['X-Client-Version']).toMatch(/^\d+\.\d+\.\d+/);
    expect(['darwin', 'linux', 'windows']).toContain(headers['X-Client-OS']);
  });

  test('clientName option overrides default', () => {
    const client = new Client('test-key', { clientName: 'my-wrapper' });
    const headers = (client as any)._getHeaders();

    expect(client.clientName).toBe('my-wrapper');
    expect(headers['X-Client-Name']).toBe('my-wrapper');
  });

  test('WAVESPEED_CLIENT_NAME env var wins over clientName option', () => {
    const original = process.env.WAVESPEED_CLIENT_NAME;
    process.env.WAVESPEED_CLIENT_NAME = 'env-channel';

    try {
      const client = new Client('test-key', { clientName: 'my-wrapper' });
      const headers = (client as any)._getHeaders();

      expect(client.clientName).toBe('env-channel');
      expect(headers['X-Client-Name']).toBe('env-channel');
    } finally {
      if (original === undefined) {
        delete process.env.WAVESPEED_CLIENT_NAME;
      } else {
        process.env.WAVESPEED_CLIENT_NAME = original;
      }
    }
  });

  test('_submit success', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'req-123' } }),
    };
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const client = new Client('test-key');
    const [requestId, result] = await (client as any)._submit(
      'wavespeed-ai/z-image/turbo',
      { prompt: 'test' }
    );

    expect(requestId).toBe('req-123');
    expect(result).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('_submit failure', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    };
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const client = new Client('test-key');

    await expect(
      (client as any)._submit('wavespeed-ai/z-image/turbo', { prompt: 'test' })
    ).rejects.toThrow('HTTP 500');
  });

  test('_getResult success', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        data: { status: 'completed', outputs: ['https://example.com/out.png'] }
      }),
    };
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const client = new Client('test-key');
    const result = await (client as any)._getResult('req-123');

    expect(result.data.status).toBe('completed');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('run success', async () => {
    const mockSubmitResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'req-123' } }),
    };
    const mockGetResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        data: { status: 'completed', outputs: ['https://example.com/out.png'] }
      }),
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockSubmitResponse)
      .mockResolvedValueOnce(mockGetResponse);

    const client = new Client('test-key');
    const result = await client.run('wavespeed-ai/z-image/turbo', { prompt: 'test' });

    expect(result.outputs).toEqual(['https://example.com/out.png']);
  });

  test('run failure', async () => {
    const mockSubmitResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'req-123' } }),
    };
    const mockGetResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        data: { status: 'failed', error: 'Model error' }
      }),
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockSubmitResponse)
      .mockResolvedValueOnce(mockGetResponse);

    const client = new Client('test-key');

    await expect(
      client.run('wavespeed-ai/z-image/turbo', { prompt: 'test' })
    ).rejects.toThrow('Model error');
  });

  test('run treats cancelled status as terminal failure', async () => {
    const mockSubmitResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'req-123' } }),
    };
    const mockGetResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        data: { status: 'cancelled', error: 'Task was cancelled by user' }
      }),
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockSubmitResponse)
      .mockResolvedValueOnce(mockGetResponse);

    const client = new Client('test-key');

    await expect(
      client.run('wavespeed-ai/z-image/turbo', { prompt: 'test' })
    ).rejects.toThrow('Task was cancelled by user');
    // Polling must stop at the terminal status: submit + one result GET only.
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('run treats timeout status as terminal failure', async () => {
    const mockSubmitResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'req-123' } }),
    };
    const mockGetResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        data: { status: 'timeout', error: 'Task execution timed out' }
      }),
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockSubmitResponse)
      .mockResolvedValueOnce(mockGetResponse);

    const client = new Client('test-key');

    await expect(
      client.run('wavespeed-ai/z-image/turbo', { prompt: 'test' })
    ).rejects.toThrow('Task execution timed out');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('run treats deleted status as terminal failure', async () => {
    const mockSubmitResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'req-123' } }),
    };
    const mockGetResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        data: { status: 'deleted', error: 'Task was deleted' }
      }),
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockSubmitResponse)
      .mockResolvedValueOnce(mockGetResponse);

    const client = new Client('test-key');

    await expect(
      client.run('wavespeed-ai/z-image/turbo', { prompt: 'test' })
    ).rejects.toThrow('Task was deleted');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('run timeout', async () => {
    const mockSubmitResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'req-123' } }),
    };
    const mockGetResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        data: { status: 'pending' }
      }),
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockSubmitResponse)
      .mockResolvedValue(mockGetResponse);

    const client = new Client('test-key');

    await expect(
      client.run('wavespeed-ai/z-image/turbo', { prompt: 'test' }, { timeout: 0.1 })
    ).rejects.toThrow('timed out');
  });

  test('run sync mode success', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          status: 'completed',
          outputs: ['https://example.com/out.png']
        }
      }),
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const client = new Client('test-key');
    const result = await client.run(
      'wavespeed-ai/z-image/turbo',
      { prompt: 'test' },
      { enableSyncMode: true }
    );

    expect(result.outputs).toEqual(['https://example.com/out.png']);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('run sync mode failure', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          status: 'failed',
          error: 'Model error',
          id: 'req-456'
        }
      }),
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const client = new Client('test-key');

    await expect(
      client.run('wavespeed-ai/z-image/turbo', { prompt: 'test' }, { enableSyncMode: true })
    ).rejects.toThrow('Prediction failed (task_id: req-456): Model error');
  });

  test('run sync mode timeout raises queryable error', async () => {
    const resultUrl = 'https://api.wavespeed.ai/api/v3/predictions/req-timeout/result';
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: 'req-timeout',
          status: 'processing',
          code: 5004,
          error: 'Sync mode timed out after 90 seconds. The prediction is still processing asynchronously.',
        }
      }),
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const client = new Client('test-key');

    await expect(
      client.run('wavespeed-ai/z-image/turbo', { prompt: 'test' }, { enableSyncMode: true, maxRetries: 1 })
    ).rejects.toThrow(WavespeedSyncTimeoutException);
    await expect(
      client.run('wavespeed-ai/z-image/turbo', { prompt: 'test' }, { enableSyncMode: true })
    ).rejects.toThrow(resultUrl);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('runNoThrow sync mode timeout returns processing detail', async () => {
    const resultUrl = 'https://api.wavespeed.ai/api/v3/predictions/req-timeout/result';
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: 'req-timeout',
          status: 'processing',
          code: 5004,
          error: 'Sync mode timed out after 90 seconds. The prediction is still processing asynchronously.',
        }
      }),
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const client = new Client('test-key');
    const result = await client.runNoThrow(
      'wavespeed-ai/z-image/turbo',
      { prompt: 'test' },
      { enableSyncMode: true }
    );

    expect(result.outputs).toBeNull();
    expect(result.detail.status).toBe('processing');
    expect(result.detail.taskId).toBe('req-timeout');
    expect(result.detail.resultUrl).toBe(resultUrl);
    expect(result.detail.error).toBeInstanceOf(WavespeedSyncTimeoutException);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('_submit no request id', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: {} }),
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const client = new Client('test-key');

    await expect(
      (client as any)._submit('wavespeed-ai/z-image/turbo', { prompt: 'test' })
    ).rejects.toThrow('No request ID in response');
  });

  test('_submit connection error is not retried', async () => {
    const connectionError = new Error('fetch failed');
    connectionError.name = 'TypeError';

    (global.fetch as jest.Mock).mockRejectedValue(connectionError);

    const client = new Client('test-key', { maxConnectionRetries: 5 });

    await expect(
      (client as any)._submit('wavespeed-ai/z-image/turbo', { prompt: 'test' })
    ).rejects.toThrow('will not retry the POST');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('_submit abort covers the total timeout, not the connect timeout', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'req-123' } }),
    };
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    try {
      const client = new Client('test-key', { connectionTimeout: 10, timeout: 1800 });
      const [requestId] = await (client as any)._submit(
        'wavespeed-ai/z-image/turbo',
        { prompt: 'test' }
      );

      expect(requestId).toBe('req-123');
      // The abort timer must be scheduled for the full request window (sync
      // mode holds the connection open), not capped at the connect timeout.
      const abortDelays = setTimeoutSpy.mock.calls.map((call) => call[1]);
      expect(abortDelays).toContain(1800 * 1000);
      expect(abortDelays).not.toContain(10 * 1000);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  test('task retries do not repeat an ambiguous submission', async () => {
    const connectionError = new Error('fetch failed');
    connectionError.name = 'TypeError';

    (global.fetch as jest.Mock).mockRejectedValue(connectionError);

    const client = new Client('test-key', { maxRetries: 3 });

    await expect(
      client.run('wavespeed-ai/z-image/turbo', { prompt: 'test' })
    ).rejects.toThrow('will not retry the POST');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('_getResult connection retry', async () => {
    const connectionError = new Error('fetch failed');
    connectionError.name = 'AbortError';

    const mockSuccessResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: { status: 'completed', outputs: [] } }),
    };

    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(connectionError)
      .mockResolvedValueOnce(mockSuccessResponse);

    const client = new Client('test-key', { maxConnectionRetries: 1 });
    const result = await (client as any)._getResult('req-123');

    expect(result.data.status).toBe('completed');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('_getResult max connection retries exceeded', async () => {
    const connectionError = new Error('fetch failed');
    connectionError.name = 'TypeError';

    (global.fetch as jest.Mock).mockRejectedValue(connectionError);

    const client = new Client('test-key', { maxConnectionRetries: 1 });

    await expect(
      (client as any)._getResult('req-123')
    ).rejects.toThrow('Failed to get result for task req-123 after 2 attempts');
  });

  test('_getResult http error (non-retryable status) fails immediately', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const client = new Client('test-key');

    await expect(
      (client as any)._getResult('req-123')
    ).rejects.toThrow('Failed to get result for task req-123: HTTP 404');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('_getResult retries 5xx and succeeds', async () => {
    const mockErrorResponse = {
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    };
    const mockSuccessResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: { status: 'completed', outputs: ['out'] } }),
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockErrorResponse)
      .mockResolvedValueOnce(mockSuccessResponse);

    const client = new Client('test-key', { maxConnectionRetries: 2, retryInterval: 0.01 });
    const result = await (client as any)._getResult('req-123');

    expect(result.data.status).toBe('completed');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('_getResult retries 429 and exhausts retries', async () => {
    const mockResponse = {
      ok: false,
      status: 429,
      text: async () => 'Too Many Requests',
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const client = new Client('test-key', { maxConnectionRetries: 1, retryInterval: 0.01 });

    await expect(
      (client as any)._getResult('req-123')
    ).rejects.toThrow('Failed to get result for task req-123: HTTP 429');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('_isRetryableError for timeout', () => {
    const client = new Client('test-key');
    const timeoutError = new Error('Request timeout');

    expect((client as any)._isRetryableError(timeoutError)).toBe(true);
  });

  test('_isRetryableError for 5xx', () => {
    const client = new Client('test-key');
    const serverError = new Error('HTTP 500');

    expect((client as any)._isRetryableError(serverError)).toBe(true);
  });

  test('_isRetryableError for 429', () => {
    const client = new Client('test-key');
    const rateLimitError = new Error('HTTP 429');

    expect((client as any)._isRetryableError(rateLimitError)).toBe(true);
  });

  test('run with task retry', async () => {
    const mockSubmitResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'req-123' } }),
    };
    const mockErrorResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: { status: 'failed', error: 'HTTP 500' } }),
    };
    const mockSuccessResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: { status: 'completed', outputs: ['url'] } }),
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockSubmitResponse)
      .mockResolvedValueOnce(mockErrorResponse)
      .mockResolvedValueOnce(mockSubmitResponse)
      .mockResolvedValueOnce(mockSuccessResponse);

    const client = new Client('test-key', { maxRetries: 1 });
    const result = await client.run('wavespeed-ai/z-image/turbo', { prompt: 'test' });

    expect(result.outputs).toEqual(['url']);
  });
});

describe('Module level run', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('run uses default client', async () => {
    const originalKey = apiConfig.apiKey;
    apiConfig.apiKey = 'config-key';

    const mockSubmitResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'req-123' } }),
    };
    const mockGetResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        data: { status: 'completed', outputs: ['https://example.com/out.png'] }
      }),
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockSubmitResponse)
      .mockResolvedValueOnce(mockGetResponse);

    const result = await wavespeed.run('wavespeed-ai/z-image/turbo', { prompt: 'test' });
    expect(result.outputs).toEqual(['https://example.com/out.png']);

    apiConfig.apiKey = originalKey;
  });
});

describe('Upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  test('upload file path', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        message: 'success',
        data: {
          type: 'image',
          download_url: 'https://example.com/uploaded.png',
          filename: 'test.png',
          size: 1024,
          upload: {
            method: 'PUT',
            url: 'https://storage.example.com/upload',
            headers: { 'Content-Type': 'image/png' },
            expires_at: '2026-08-11T06:00:00Z',
          },
        },
      }),
    };
    const mockUploadResponse = { ok: true, status: 200 };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(mockResponse)
      .mockResolvedValueOnce(mockUploadResponse);

    // Mock fs module
    const fs = require('fs');
    const path = require('path');
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'statSync').mockReturnValue({ size: 15 } as any);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('fake image data'));
    jest.spyOn(path, 'basename').mockReturnValue('test.png');

    const client = new Client('test-key');
    const url = await client.upload('/fake/path/test.png');

    expect(url).toBe('https://example.com/uploaded.png');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.wavespeed.ai/api/v3/media/uploads',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ filename: 'test.png', size: 15, content_type: 'image/png' }),
      })
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://storage.example.com/upload',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
      })
    );
    const uploadHeaders = (global.fetch as jest.Mock).mock.calls[1][1].headers;
    expect(uploadHeaders.Authorization).toBeUndefined();
  });

  test('upload raises without api key', async () => {
    const client = new Client();
    (client as any).apiKey = undefined;

    await expect(
      client.upload('/some/file.png')
    ).rejects.toThrow('API key is required');
  });

  test('upload file not found', async () => {
    const client = new Client('test-key');

    await expect(
      client.upload('/nonexistent/path/to/file.png')
    ).rejects.toThrow('File not found');
  });

  test('upload http error', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    };
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    // Mock fs module
    const fs = require('fs');
    const path = require('path');
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'statSync').mockReturnValue({ size: 15 } as any);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('fake image data'));
    jest.spyOn(path, 'basename').mockReturnValue('test.png');

    const client = new Client('test-key');

    await expect(
      client.upload('/fake/path/test.png')
    ).rejects.toThrow('HTTP 500');
  });

  test('upload api error', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        code: 500,
        message: 'Upload failed: invalid file type',
      }),
    };
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    // Mock fs module
    const fs = require('fs');
    const path = require('path');
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'statSync').mockReturnValue({ size: 15 } as any);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('fake image data'));
    jest.spyOn(path, 'basename').mockReturnValue('test.png');

    const client = new Client('test-key');

    await expect(
      client.upload('/fake/path/test.png')
    ).rejects.toThrow('invalid file type');
  });

  test('upload missing download_url', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        message: 'success',
        data: {},
      }),
    };
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    // Mock fs module
    const fs = require('fs');
    const path = require('path');
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'statSync').mockReturnValue({ size: 15 } as any);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('fake image data'));
    jest.spyOn(path, 'basename').mockReturnValue('test.png');

    const client = new Client('test-key');

    await expect(
      client.upload('/fake/path/test.png')
    ).rejects.toThrow('no download_url in response');
  });
});
