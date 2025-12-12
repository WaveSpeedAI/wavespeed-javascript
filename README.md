<div align="center">
  <a href="https://wavespeed.ai" target="_blank" rel="noopener noreferrer">
    <img src="https://raw.githubusercontent.com/WaveSpeedAI/waverless/main/docs/images/wavespeed-dark-logo.png" alt="WaveSpeedAI logo" width="200"/>
  </a>

  <h1>WaveSpeedAI JavaScript SDK</h1>

  <p>
    <strong>Official JavaScript/TypeScript SDK for the WaveSpeedAI inference platform</strong>
  </p>

  <p>
    <a href="https://wavespeed.ai" target="_blank" rel="noopener noreferrer">🌐 Visit wavespeed.ai</a> •
    <a href="https://wavespeed.ai/docs">📖 Documentation</a> •
    <a href="https://github.com/WaveSpeedAI/wavespeed-javascript/issues">💬 Issues</a>
  </p>
</div>

---

## Installation

```bash
npm install wavespeed
```

## API Client

Run WaveSpeed AI models with a simple API:

```javascript
const WaveSpeed = require('wavespeed');

const client = new WaveSpeed('your-api-key');

client.run('wavespeed-ai/z-image/turbo', { prompt: 'Cat' })
  .then(prediction => {
    console.log(prediction.outputs[0]); // Output URL
  })
  .catch(console.error);
```

Or with TypeScript:

```typescript
import WaveSpeed from 'wavespeed';

const client = new WaveSpeed('your-api-key');

const prediction = await client.run('wavespeed-ai/z-image/turbo', {
  prompt: 'Cat'
});

console.log(prediction.outputs[0]); // Output URL
```

### Authentication

Set your API key via environment variable (You can get your API key from [https://wavespeed.ai/accesskey](https://wavespeed.ai/accesskey)):

```bash
export WAVESPEED_API_KEY="your-api-key"
```

Or pass it directly:

```javascript
const client = new WaveSpeed('your-api-key');
```

### Options

```javascript
const client = new WaveSpeed('your-api-key', {
  timeout: 36000,      // Max wait time in seconds (default: 36000)
  pollInterval: 1,     // Status check interval (default: 1)
});

const prediction = await client.run('wavespeed-ai/z-image/turbo', {
  prompt: 'Cat'
}, {
  timeout: 300,        // Override timeout for this request
  pollInterval: 2,     // Override poll interval for this request
  enableSyncMode: false, // Single request mode, no polling (default: false)
});
```

### Sync Mode

Use `enableSyncMode: true` for a single request that waits for the result (no polling).

> **Note:** Not all models support sync mode. Check the model documentation for availability.

```javascript
const prediction = await client.run('wavespeed-ai/z-image/turbo', {
  prompt: 'Cat'
}, {
  enableSyncMode: true
});
```

### Retry Configuration

Configure retries at the client level:

```javascript
const client = new WaveSpeed('your-api-key', {
  maxRetries: 0,            // Task-level retries (default: 0)
  maxConnectionRetries: 3,  // HTTP connection retries (default: 3)
  retryInterval: 1,         // Base delay between retries in seconds (default: 1)
});
```

### Upload Files

Upload images, videos, or audio files:

```javascript
client.upload('/path/to/image.png')
  .then(url => console.log(url))
  .catch(console.error);
```

## API Reference

### WaveSpeed Client

```typescript
new WaveSpeed(apiKey?: string, options?: {
  baseUrl?: string,
  pollInterval?: number,
  timeout?: number
})
```

#### Parameters:
- `apiKey` (string): Your WaveSpeed API key
- `options` (object, optional):
  - `baseUrl` (string): API base URL without path (default: `https://api.wavespeed.ai`)
  - `pollInterval` (number): Poll interval in seconds (default: 1)
  - `timeout` (number): Overall wait timeout in seconds (default: 36000)

### Methods

#### run

```typescript
run(modelId: string, input: Record<string, any>, options?: { pollInterval?: number; timeout?: number }): Promise<Prediction>
```

Run a model and wait for completion.

#### create

```typescript
create(modelId: string, input: Record<string, any>): Promise<Prediction>
```

Create a prediction without waiting for completion.

#### upload

```typescript
upload(filePath: string): Promise<string>
```

Upload a file and get a download URL.

### Prediction

```typescript
prediction.id        // Unique prediction ID
prediction.status    // Status: processing, completed, failed
prediction.outputs   // Array of output URLs
prediction.error     // Error message if failed
```

## Environment Variables

### API Client

| Variable | Description |
|----------|-------------|
| `WAVESPEED_API_KEY` | WaveSpeed API key |
| `WAVESPEED_BASE_URL` | API base URL without path (default: `https://api.wavespeed.ai`) |
| `WAVESPEED_POLL_INTERVAL` | Poll interval seconds for `run` (default: `1`) |
| `WAVESPEED_TIMEOUT` | Overall wait timeout seconds for `run` (default: `36000`)

## License

MIT
