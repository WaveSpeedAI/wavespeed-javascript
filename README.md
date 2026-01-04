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
import wavespeed from 'wavespeed';

const output = await wavespeed.run(
  "wavespeed-ai/z-image/turbo",
  { prompt: "Cat" }
);

console.log(output["outputs"][0]);  // Output URL
```

### Authentication

Set your API key via environment variable (You can get your API key from [https://wavespeed.ai/accesskey](https://wavespeed.ai/accesskey)):

```bash
export WAVESPEED_API_KEY="your-api-key"
```

Or pass it directly:

```javascript
import { Client } from 'wavespeed';

const client = new Client("your-api-key");
const output = await client.run("wavespeed-ai/z-image/turbo", { prompt: "Cat" });
```

### Options

```javascript
const output = await wavespeed.run(
  "wavespeed-ai/z-image/turbo",
  { prompt: "Cat" },
  {
    timeout: 36000.0,       // Max wait time in seconds (default: 36000.0)
    pollInterval: 1.0,      // Status check interval (default: 1.0)
    enableSyncMode: false,  // Single request mode, no polling (default: false)
  }
);
```

### Sync Mode

Use `enableSyncMode: true` for a single request that waits for the result (no polling).

> **Note:** Not all models support sync mode. Check the model documentation for availability.

```javascript
const output = await wavespeed.run(
  "wavespeed-ai/z-image/turbo",
  { prompt: "Cat" },
  { enableSyncMode: true }
);
```

### Retry Configuration

Configure retries at the client level:

```javascript
import { Client } from 'wavespeed';

const client = new Client("your-api-key", {
  maxRetries: 0,            // Task-level retries (default: 0)
  maxConnectionRetries: 5,  // HTTP connection retries (default: 5)
  retryInterval: 1.0,       // Base delay between retries in seconds (default: 1.0)
});
```

### Upload Files

Upload images, videos, or audio files:

```javascript
import wavespeed from 'wavespeed';

const url = await wavespeed.upload("/path/to/image.png");
console.log(url);
```

## Running Tests

```bash
# Run all tests
npm test

# Run a single test file
npm test -- tests/test_api.ts

# Run a specific test
npm test -- tests/test_api.ts -t "run success"
```

## Environment Variables

### API Client

| Variable | Description |
|----------|-------------|
| `WAVESPEED_API_KEY` | WaveSpeed API key |

## License

MIT
