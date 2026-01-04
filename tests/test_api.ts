/**
 * Tests for the wavespeed.api module.
 */

import * as wavespeed from '../src/index';
import { Client } from '../src/api/client';
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

  test('_submit connection retry', async () => {
    const connectionError = new Error('fetch failed');
    connectionError.name = 'TypeError';

    const mockSuccessResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'req-123' } }),
    };

    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(connectionError)
      .mockResolvedValueOnce(mockSuccessResponse);

    const client = new Client('test-key', { maxConnectionRetries: 1 });
    const [requestId] = await (client as any)._submit('wavespeed-ai/z-image/turbo', { prompt: 'test' });

    expect(requestId).toBe('req-123');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('_submit max connection retries exceeded', async () => {
    const connectionError = new Error('fetch failed');
    connectionError.name = 'TypeError';

    (global.fetch as jest.Mock).mockRejectedValue(connectionError);

    const client = new Client('test-key', { maxConnectionRetries: 1 });

    await expect(
      (client as any)._submit('wavespeed-ai/z-image/turbo', { prompt: 'test' })
    ).rejects.toThrow('Failed to submit prediction after 2 attempts');
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

  test('_getResult http error', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const client = new Client('test-key');

    await expect(
      (client as any)._getResult('req-123')
    ).rejects.toThrow('Failed to get result for task req-123: HTTP 500');
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
        },
      }),
    };
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    // Mock fs module
    const fs = require('fs');
    const path = require('path');
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('fake image data'));
    jest.spyOn(path, 'basename').mockReturnValue('test.png');

    const client = new Client('test-key');
    const url = await client.upload('/fake/path/test.png');

    expect(url).toBe('https://example.com/uploaded.png');
    expect(global.fetch).toHaveBeenCalledTimes(1);
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
    jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('fake image data'));
    jest.spyOn(path, 'basename').mockReturnValue('test.png');

    const client = new Client('test-key');

    await expect(
      client.upload('/fake/path/test.png')
    ).rejects.toThrow('no download_url in response');
  });
});
