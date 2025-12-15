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

const prediction = await client.run('wavespeed-ai/z-image/turbo', {
  prompt: 'Cat'
});

console.log(prediction.outputs[0]);  // Output URL
```

Or with TypeScript:

```typescript
import WaveSpeed from 'wavespeed';

const client = new WaveSpeed('your-api-key');

const prediction = await client.run('wavespeed-ai/z-image/turbo', {
  prompt: 'Cat'
});

console.log(prediction.outputs[0]);  // Output URL
```

### Authentication

Set your API key via environment variable (You can get your API key from [https://wavespeed.ai/accesskey](https://wavespeed.ai/accesskey)):

```bash
export WAVESPEED_API_KEY="your-api-key"
```

Or pass it directly:

```javascript
const WaveSpeed = require('wavespeed');

const client = new WaveSpeed('your-api-key');
const prediction = await client.run('wavespeed-ai/z-image/turbo', { prompt: 'Cat' });
```

### Options

```javascript
const prediction = await client.run(
  'wavespeed-ai/z-image/turbo',
  { prompt: 'Cat' },
  {
    timeout: 36000,         // Max wait time in seconds (default: 36000)
    pollInterval: 1,        // Status check interval (default: 1)
    enableSyncMode: false,  // Single request mode, no polling (default: false)
  }
);
```

### Sync Mode

Use `enableSyncMode: true` for a single request that waits for the result (no polling).

> **Note:** Not all models support sync mode. Check the model documentation for availability.

```javascript
const prediction = await client.run(
  'wavespeed-ai/z-image/turbo',
  { prompt: 'Cat' },
  { enableSyncMode: true }
);
```

### Retry Configuration

Configure retries at the client level:

```javascript
const WaveSpeed = require('wavespeed');

const client = new WaveSpeed('your-api-key', {
  maxRetries: 0,            // Task-level retries (default: 0)
  maxConnectionRetries: 3,  // HTTP connection retries (default: 3)
  retryInterval: 1,         // Base delay between retries in seconds (default: 1)
});
```

### Upload Files

Upload images, videos, or audio files:

```javascript
const WaveSpeed = require('wavespeed');

const url = await client.upload('/path/to/image.png');
console.log(url);
```

## Environment Variables

### API Client

| Variable | Description |
|----------|-------------|
| `WAVESPEED_API_KEY` | WaveSpeed API key |

## License

MIT
